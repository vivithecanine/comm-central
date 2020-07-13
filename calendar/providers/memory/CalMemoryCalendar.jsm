/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalMemoryCalendar"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var cICL = Ci.calIChangeLog;

function CalMemoryCalendar() {
  this.initProviderBase();
  this.initMemoryCalendar();
}
var calMemoryCalendarClassID = Components.ID("{bda0dd7f-0a2f-4fcf-ba08-5517e6fbf133}");
var calMemoryCalendarInterfaces = [
  Ci.calICalendar,
  Ci.calISchedulingSupport,
  Ci.calIOfflineStorage,
  Ci.calISyncWriteCalendar,
  Ci.calICalendarProvider,
];
CalMemoryCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,

  QueryInterface: ChromeUtils.generateQI([
    "calICalendar",
    "calISchedulingSupport",
    "calIOfflineStorage",
    "calISyncWriteCalendar",
    "calICalendarProvider",
    "nsIClassInfo",
  ]),
  classID: calMemoryCalendarClassID,
  contractID: "@mozilla.org/calendar/calendar;1?type=memory",
  classDescription: "Calendar Memory Provider",
  interfaces: calMemoryCalendarInterfaces,

  mItems: null,
  mOfflineFlags: null,
  mObservers: null,
  mMetaData: null,

  initMemoryCalendar() {
    this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
    this.mItems = {};
    this.mOfflineFlags = {};
    this.mMetaData = new Map();
  },

  //
  // calICalendarProvider interface
  //
  get prefChromeOverlay() {
    return null;
  },

  get displayName() {
    return cal.l10n.getCalString("memoryName");
  },

  createCalendar() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  deleteCalendar(calendar, listener) {
    calendar = calendar.wrappedJSObject;
    calendar.mItems = {};
    calendar.mMetaData = new Map();

    try {
      listener.onDeleteCalendar(calendar, Cr.NS_OK, null);
    } catch (ex) {
      // Don't bail out if the listener fails
    }
  },

  mRelaxedMode: undefined,
  get relaxedMode() {
    if (this.mRelaxedMode === undefined) {
      this.mRelaxedMode = this.getProperty("relaxedMode");
    }
    return this.mRelaxedMode;
  },

  //
  // calICalendar interface
  //

  getProperty(aName) {
    switch (aName) {
      case "cache.supported":
      case "requiresNetwork":
        return false;
      case "capabilities.priority.supported":
        return true;
      case "removemodes":
        return ["delete"];
    }
    return this.__proto__.__proto__.getProperty.apply(this, arguments);
  },

  // readonly attribute AUTF8String type;
  get type() {
    return "memory";
  },

  // void addItem( in calIItemBase aItem, in calIOperationListener aListener );
  addItem(aItem, aListener) {
    let newItem = aItem.clone();
    return this.adoptItem(newItem, aListener);
  },

  // void adoptItem( in calIItemBase aItem, in calIOperationListener aListener );
  adoptItem(aItem, aListener) {
    if (this.readOnly) {
      throw Ci.calIErrors.CAL_IS_READONLY;
    }
    if (aItem.id == null && aItem.isMutable) {
      aItem.id = cal.getUUID();
    }

    if (aItem.id == null) {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.ADD,
        aItem.id,
        "Can't set ID on non-mutable item to addItem"
      );
      return;
    }

    // Lines below are commented because of the offline bug 380060, the
    // memory calendar cannot assume that a new item should not have an ID.
    // calCachedCalendar could send over an item with an id.

    /*
        if (this.mItems[aItem.id] != null) {
            if (this.relaxedMode) {
                // we possibly want to interact with the user before deleting
                delete this.mItems[aItem.id];
            } else {
                this.notifyOperationComplete(aListener,
                                             Ci.calIErrors.DUPLICATE_ID,
                                             Ci.calIOperationListener.ADD,
                                             aItem.id,
                                             "ID already exists for addItem");
                return;
            }
        }
        */

    let parentItem = aItem.parentItem;
    if (parentItem != aItem) {
      parentItem = parentItem.clone();
      parentItem.recurrenceInfo.modifyException(aItem, true);
    }
    parentItem.calendar = this.superCalendar;

    parentItem.makeImmutable();
    this.mItems[aItem.id] = parentItem;

    // notify the listener
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.ADD,
      aItem.id,
      aItem
    );
    // notify observers
    this.mObservers.notify("onAddItem", [aItem]);
  },

  // void modifyItem( in calIItemBase aNewItem, in calIItemBase aOldItem, in calIOperationListener aListener );
  modifyItem(aNewItem, aOldItem, aListener) {
    if (this.readOnly) {
      throw Ci.calIErrors.CAL_IS_READONLY;
    }
    if (!aNewItem) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    let self = this;
    function reportError(errStr, errId) {
      self.notifyOperationComplete(
        aListener,
        errId ? errId : Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.MODIFY,
        aNewItem.id,
        errStr
      );
      return null;
    }

    if (!aNewItem.id) {
      // this is definitely an error
      return reportError(null, "ID for modifyItem item is null");
    }

    let modifiedItem = aNewItem.parentItem.clone();
    if (aNewItem.parentItem != aNewItem) {
      modifiedItem.recurrenceInfo.modifyException(aNewItem, false);
    }

    // If no old item was passed, then we should overwrite in any case.
    // Pick up the old item from our items array and use this as an old item
    // later on.
    if (!aOldItem) {
      aOldItem = this.mItems[aNewItem.id];
    }

    if (this.relaxedMode) {
      // We've already filled in the old item above, if this doesn't exist
      // then just take the current item as its old version
      if (!aOldItem) {
        aOldItem = modifiedItem;
      }
      aOldItem = aOldItem.parentItem;
    } else if (!this.relaxedMode) {
      if (!aOldItem || !this.mItems[aNewItem.id]) {
        // no old item found?  should be using addItem, then.
        return reportError(
          "ID for modifyItem doesn't exist, is null, or is from different calendar"
        );
      }

      // do the old and new items match?
      if (aOldItem.id != modifiedItem.id) {
        return reportError("item ID mismatch between old and new items");
      }

      aOldItem = aOldItem.parentItem;
      let storedOldItem = this.mItems[aOldItem.id];

      // compareItems is not suitable here. See bug 418805.
      // Cannot compare here due to bug 380060
      if (!cal.item.compareContent(storedOldItem, aOldItem)) {
        return reportError(
          "old item mismatch in modifyItem. storedId:" +
            storedOldItem.icalComponent +
            " old item:" +
            aOldItem.icalComponent
        );
      }
      // offline bug

      if (aOldItem.generation != storedOldItem.generation) {
        return reportError("generation mismatch in modifyItem");
      }

      if (aOldItem.generation == modifiedItem.generation) {
        // has been cloned and modified
        // Only take care of incrementing the generation if relaxed mode is
        // off. Users of relaxed mode need to take care of this themselves.
        modifiedItem.generation += 1;
      }
    }

    modifiedItem.makeImmutable();
    this.mItems[modifiedItem.id] = modifiedItem;

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      modifiedItem.id,
      modifiedItem
    );

    // notify observers
    this.mObservers.notify("onModifyItem", [modifiedItem, aOldItem]);
    return null;
  },

  // void deleteItem( in calIItemBase aItem, in calIOperationListener aListener );
  deleteItem(aItem, aListener) {
    if (this.readOnly) {
      this.notifyOperationComplete(
        aListener,
        Ci.calIErrors.CAL_IS_READONLY,
        Ci.calIOperationListener.DELETE,
        aItem.id,
        "Calendar is readonly"
      );
      return;
    }
    if (aItem.id == null) {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.DELETE,
        aItem.id,
        "ID is null in deleteItem"
      );
      return;
    }

    let oldItem;
    if (this.relaxedMode) {
      oldItem = aItem;
    } else {
      oldItem = this.mItems[aItem.id];
      if (oldItem.generation != aItem.generation) {
        this.notifyOperationComplete(
          aListener,
          Cr.NS_ERROR_FAILURE,
          Ci.calIOperationListener.DELETE,
          aItem.id,
          "generation mismatch in deleteItem"
        );
        return;
      }
    }

    delete this.mItems[aItem.id];
    this.mMetaData.delete(aItem.id);

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.DELETE,
      aItem.id,
      aItem
    );
    // notify observers
    this.mObservers.notify("onDeleteItem", [oldItem]);
  },

  // void getItem( in string id, in calIOperationListener aListener );
  getItem(aId, aListener) {
    if (!aListener) {
      return;
    }

    if (aId == null || this.mItems[aId] == null) {
      // querying by id is a valid use case, even if no item is returned:
      this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, aId, null);
      return;
    }

    let item = this.mItems[aId];
    let iid = null;

    if (cal.item.isEvent(item)) {
      iid = Ci.calIEvent;
    } else if (cal.item.isToDo(item)) {
      iid = Ci.calITodo;
    } else {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.GET,
        aId,
        "Can't deduce item type based on QI"
      );
      return;
    }

    aListener.onGetResult(this.superCalendar, Cr.NS_OK, iid, null, [item]);

    this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, aId, null);
  },

  // void getItems( in unsigned long aItemFilter, in unsigned long aCount,
  //                in calIDateTime aRangeStart, in calIDateTime aRangeEnd,
  //                in calIOperationListener aListener );
  getItems(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener) {
    cal.postPone(() => {
      this.getItems_(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener);
    });
  },
  getItems_(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener) {
    if (!aListener) {
      return;
    }

    const calICalendar = Ci.calICalendar;

    let itemsFound = [];

    //
    // filters
    //

    let wantUnrespondedInvitations =
      (aItemFilter & calICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION) != 0;
    let superCal;
    try {
      superCal = this.superCalendar.QueryInterface(Ci.calISchedulingSupport);
    } catch (exc) {
      wantUnrespondedInvitations = false;
    }
    function checkUnrespondedInvitation(item) {
      let att = superCal.getInvitedAttendee(item);
      return att && att.participationStatus == "NEEDS-ACTION";
    }

    // item base type
    let wantEvents = (aItemFilter & calICalendar.ITEM_FILTER_TYPE_EVENT) != 0;
    let wantTodos = (aItemFilter & calICalendar.ITEM_FILTER_TYPE_TODO) != 0;
    if (!wantEvents && !wantTodos) {
      // bail.
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.GET,
        null,
        "Bad aItemFilter passed to getItems"
      );
      return;
    }

    // completed?
    let itemCompletedFilter = (aItemFilter & calICalendar.ITEM_FILTER_COMPLETED_YES) != 0;
    let itemNotCompletedFilter = (aItemFilter & calICalendar.ITEM_FILTER_COMPLETED_NO) != 0;
    function checkCompleted(item) {
      item.QueryInterface(Ci.calITodo);
      return item.isCompleted ? itemCompletedFilter : itemNotCompletedFilter;
    }

    // return occurrences?
    let itemReturnOccurrences = (aItemFilter & calICalendar.ITEM_FILTER_CLASS_OCCURRENCES) != 0;

    // figure out the return interface type
    let typeIID = null;
    if (itemReturnOccurrences) {
      typeIID = Ci.calIItemBase;
    } else if (wantEvents && wantTodos) {
      typeIID = Ci.calIItemBase;
    } else if (wantEvents) {
      typeIID = Ci.calIEvent;
    } else if (wantTodos) {
      typeIID = Ci.calITodo;
    }

    aRangeStart = cal.dtz.ensureDateTime(aRangeStart);
    aRangeEnd = cal.dtz.ensureDateTime(aRangeEnd);
    let startTime = -0x7ffffffffffffdff;
    if (aRangeStart) {
      startTime = aRangeStart.nativeTime;
    }

    let requestedFlag = 0;
    if ((aItemFilter & calICalendar.ITEM_FILTER_OFFLINE_CREATED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_CREATED_RECORD;
    } else if ((aItemFilter & calICalendar.ITEM_FILTER_OFFLINE_MODIFIED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
    } else if ((aItemFilter & calICalendar.ITEM_FILTER_OFFLINE_DELETED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_DELETED_RECORD;
    }

    let matchOffline = function(itemFlag, reqFlag) {
      // Same as storage calendar sql query. For comparison:
      // reqFlag is :offline_journal (parameter),
      // itemFlag is offline_journal (field value)
      // ...
      // AND (:offline_journal IS NULL
      // AND  (offline_journal IS NULL
      //  OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
      //  OR offline_journal == :offline_journal

      return (
        (!reqFlag && (!itemFlag || itemFlag != cICL.OFFLINE_FLAG_DELETED_RECORD)) ||
        itemFlag == reqFlag
      );
    };

    cal.iterate.forEach(
      this.mItems,
      ([id, item]) => {
        let isEvent_ = cal.item.isEvent(item);
        if (isEvent_) {
          if (!wantEvents) {
            return cal.iterate.forEach.CONTINUE;
          }
        } else if (!wantTodos) {
          return cal.iterate.forEach.CONTINUE;
        }

        let hasItemFlag = item.id in this.mOfflineFlags;
        let itemFlag = hasItemFlag ? this.mOfflineFlags[item.id] : 0;

        // If the offline flag doesn't match, skip the item
        if (!matchOffline(itemFlag, requestedFlag)) {
          return cal.iterate.forEach.CONTINUE;
        }

        if (itemReturnOccurrences && item.recurrenceInfo) {
          if (item.recurrenceInfo.recurrenceEndDate < startTime) {
            return cal.iterate.forEach.CONTINUE;
          }

          let startDate = aRangeStart;
          if (!aRangeStart && cal.item.isToDo(item)) {
            startDate = item.entryDate;
          }
          let occurrences = item.recurrenceInfo.getOccurrences(
            startDate,
            aRangeEnd,
            aCount ? aCount - itemsFound.length : 0
          );
          if (wantUnrespondedInvitations) {
            occurrences = occurrences.filter(checkUnrespondedInvitation);
          }
          if (!isEvent_) {
            occurrences = occurrences.filter(checkCompleted);
          }
          itemsFound = itemsFound.concat(occurrences);
        } else if (
          (!wantUnrespondedInvitations || checkUnrespondedInvitation(item)) &&
          (isEvent_ || checkCompleted(item)) &&
          cal.item.checkIfInRange(item, aRangeStart, aRangeEnd)
        ) {
          // This needs fixing for recurring items, e.g. DTSTART of parent may occur before aRangeStart.
          // This will be changed with bug 416975.
          itemsFound.push(item);
        }
        if (aCount && itemsFound.length >= aCount) {
          return cal.iterate.forEach.BREAK;
        }
        return cal.iterate.forEach.CONTINUE;
      },
      () => {
        aListener.onGetResult(this.superCalendar, Cr.NS_OK, typeIID, null, itemsFound);
        this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
      }
    );
  },

  //
  // calIOfflineStorage interface
  //
  addOfflineItem(aItem, aListener) {
    this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_CREATED_RECORD;
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.ADD,
      aItem.id,
      aItem
    );
  },

  modifyOfflineItem(aItem, aListener) {
    let oldFlag = this.mOfflineFlags[aItem.id];
    if (
      oldFlag != cICL.OFFLINE_FLAG_CREATED_RECORD &&
      oldFlag != cICL.OFFLINE_FLAG_DELETED_RECORD
    ) {
      this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
    }

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      aItem.id,
      aItem
    );
  },

  deleteOfflineItem(aItem, aListener) {
    let oldFlag = this.mOfflineFlags[aItem.id];
    if (oldFlag == cICL.OFFLINE_FLAG_CREATED_RECORD) {
      delete this.mItems[aItem.id];
      delete this.mOfflineFlags[aItem.id];
    } else {
      this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_DELETED_RECORD;
    }

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.DELETE,
      aItem.id,
      aItem
    );
    // notify observers
    this.observers.notify("onDeleteItem", [aItem]);
  },

  getItemOfflineFlag(aItem, aListener) {
    let flag = aItem && aItem.id in this.mOfflineFlags ? this.mOfflineFlags[aItem.id] : null;
    this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, flag);
  },

  resetItemOfflineFlag(aItem, aListener) {
    delete this.mOfflineFlags[aItem.id];
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      aItem.id,
      aItem
    );
  },

  //
  // calISyncWriteCalendar interface
  //
  setMetaData(id, value) {
    this.mMetaData.set(id, value);
  },
  deleteMetaData(id) {
    this.mMetaData.delete(id);
  },
  getMetaData(id) {
    return this.mMetaData.get(id);
  },
  getAllMetaDataIds() {
    return [...this.mMetaData.keys()];
  },
  getAllMetaDataValues() {
    return [...this.mMetaData.values()];
  },
};
