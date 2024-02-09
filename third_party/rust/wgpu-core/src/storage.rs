use std::ops;
use std::sync::Arc;

use wgt::Backend;

use crate::id::Id;
use crate::resource::Resource;
use crate::{Epoch, Index};

/// An entry in a `Storage::map` table.
#[derive(Debug)]
pub(crate) enum Element<T> {
    /// There are no live ids with this index.
    Vacant,

    /// There is one live id with this index, allocated at the given
    /// epoch.
    Occupied(Arc<T>, Epoch),

    /// Like `Occupied`, but an error occurred when creating the
    /// resource.
    ///
    /// The given `String` is the resource's descriptor label.
    Error(Epoch, String),
}

#[derive(Clone, Debug)]
pub(crate) struct InvalidId;

/// A table of `T` values indexed by the id type `I`.
///
/// The table is represented as a vector indexed by the ids' index
/// values, so you should use an id allocator like `IdentityManager`
/// that keeps the index values dense and close to zero.
#[derive(Debug)]
pub struct Storage<T>
where
    T: Resource,
{
    pub(crate) map: Vec<Element<T>>,
    kind: &'static str,
}

impl<T> ops::Index<Id<T::Marker>> for Storage<T>
where
    T: Resource,
{
    type Output = Arc<T>;
    fn index(&self, id: Id<T::Marker>) -> &Arc<T> {
        self.get(id).unwrap()
    }
}
impl<T> Storage<T>
where
    T: Resource,
{
    pub(crate) fn new() -> Self {
        Self {
            map: Vec::new(),
            kind: T::TYPE,
        }
    }
}

impl<T> Storage<T>
where
    T: Resource,
{
    #[allow(dead_code)]
    pub(crate) fn contains(&self, id: Id<T::Marker>) -> bool {
        let (index, epoch, _) = id.unzip();
        match self.map.get(index as usize) {
            Some(&Element::Vacant) => false,
            Some(&Element::Occupied(_, storage_epoch) | &Element::Error(storage_epoch, _)) => {
                storage_epoch == epoch
            }
            None => false,
        }
    }

    /// Attempts to get a reference to an item behind a potentially invalid ID.
    ///
    /// Returns [`None`] if there is an epoch mismatch, or the entry is empty.
    ///
    /// This function is primarily intended for the `as_hal` family of functions
    /// where you may need to fallibly get a object backed by an id that could
    /// be in a different hub.
    pub(crate) fn try_get(&self, id: Id<T::Marker>) -> Result<Option<&Arc<T>>, InvalidId> {
        let (index, epoch, _) = id.unzip();
        let (result, storage_epoch) = match self.map.get(index as usize) {
            Some(&Element::Occupied(ref v, epoch)) => (Ok(Some(v)), epoch),
            Some(&Element::Vacant) => return Ok(None),
            Some(&Element::Error(epoch, ..)) => (Err(InvalidId), epoch),
            None => return Err(InvalidId),
        };
        assert_eq!(
            epoch, storage_epoch,
            "{}[{:?}] is no longer alive",
            self.kind, id
        );
        result
    }

    /// Get a reference to an item behind a potentially invalid ID.
    /// Panics if there is an epoch mismatch, or the entry is empty.
    pub(crate) fn get(&self, id: Id<T::Marker>) -> Result<&Arc<T>, InvalidId> {
        let (index, epoch, _) = id.unzip();
        let (result, storage_epoch) = match self.map.get(index as usize) {
            Some(&Element::Occupied(ref v, epoch)) => (Ok(v), epoch),
            Some(&Element::Vacant) => panic!("{}[{:?}] does not exist", self.kind, id),
            Some(&Element::Error(epoch, ..)) => (Err(InvalidId), epoch),
            None => return Err(InvalidId),
        };
        assert_eq!(
            epoch, storage_epoch,
            "{}[{:?}] is no longer alive",
            self.kind, id
        );
        result
    }

    /// Get an owned reference to an item behind a potentially invalid ID.
    /// Panics if there is an epoch mismatch, or the entry is empty.
    pub(crate) fn get_owned(&self, id: Id<T::Marker>) -> Result<Arc<T>, InvalidId> {
        Ok(Arc::clone(self.get(id)?))
    }

    pub(crate) fn label_for_invalid_id(&self, id: Id<T::Marker>) -> &str {
        let (index, _, _) = id.unzip();
        match self.map.get(index as usize) {
            Some(Element::Error(_, label)) => label,
            _ => "",
        }
    }

    fn insert_impl(&mut self, index: usize, epoch: Epoch, element: Element<T>) {
        if index >= self.map.len() {
            self.map.resize_with(index + 1, || Element::Vacant);
        }
        match std::mem::replace(&mut self.map[index], element) {
            Element::Vacant => {}
            Element::Occupied(_, storage_epoch) => {
                assert_ne!(
                    epoch,
                    storage_epoch,
                    "Index {index:?} of {} is already occupied",
                    T::TYPE
                );
            }
            Element::Error(storage_epoch, _) => {
                assert_ne!(
                    epoch,
                    storage_epoch,
                    "Index {index:?} of {} is already occupied with Error",
                    T::TYPE
                );
            }
        }
    }

    pub(crate) fn insert(&mut self, id: Id<T::Marker>, value: Arc<T>) {
        log::trace!("User is inserting {}{:?}", T::TYPE, id);
        let (index, epoch, _backend) = id.unzip();
        self.insert_impl(index as usize, epoch, Element::Occupied(value, epoch))
    }

    pub(crate) fn insert_error(&mut self, id: Id<T::Marker>, label: &str) {
        log::trace!("User is inserting as error {}{:?}", T::TYPE, id);
        let (index, epoch, _) = id.unzip();
        self.insert_impl(
            index as usize,
            epoch,
            Element::Error(epoch, label.to_string()),
        )
    }

    pub(crate) fn replace_with_error(&mut self, id: Id<T::Marker>) -> Result<Arc<T>, InvalidId> {
        let (index, epoch, _) = id.unzip();
        match std::mem::replace(
            &mut self.map[index as usize],
            Element::Error(epoch, String::new()),
        ) {
            Element::Vacant => panic!("Cannot access vacant resource"),
            Element::Occupied(value, storage_epoch) => {
                assert_eq!(epoch, storage_epoch);
                Ok(value)
            }
            _ => Err(InvalidId),
        }
    }

    pub(crate) fn force_replace(&mut self, id: Id<T::Marker>, value: T) {
        log::trace!("User is replacing {}{:?}", T::TYPE, id);
        let (index, epoch, _) = id.unzip();
        self.map[index as usize] = Element::Occupied(Arc::new(value), epoch);
    }

    pub(crate) fn remove(&mut self, id: Id<T::Marker>) -> Option<Arc<T>> {
        log::trace!("User is removing {}{:?}", T::TYPE, id);
        let (index, epoch, _) = id.unzip();
        match std::mem::replace(&mut self.map[index as usize], Element::Vacant) {
            Element::Occupied(value, storage_epoch) => {
                assert_eq!(epoch, storage_epoch);
                Some(value)
            }
            Element::Error(..) => None,
            Element::Vacant => panic!("Cannot remove a vacant resource"),
        }
    }

    pub(crate) fn iter(&self, backend: Backend) -> impl Iterator<Item = (Id<T::Marker>, &Arc<T>)> {
        self.map
            .iter()
            .enumerate()
            .filter_map(move |(index, x)| match *x {
                Element::Occupied(ref value, storage_epoch) => {
                    Some((Id::zip(index as Index, storage_epoch, backend), value))
                }
                _ => None,
            })
    }

    pub(crate) fn kind(&self) -> &str {
        self.kind
    }

    pub(crate) fn len(&self) -> usize {
        self.map.len()
    }
}
