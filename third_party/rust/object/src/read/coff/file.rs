use alloc::vec::Vec;
use core::fmt::Debug;

use crate::read::{
    self, Architecture, Export, FileFlags, Import, NoDynamicRelocationIterator, Object, ObjectKind,
    ObjectSection, ReadError, ReadRef, Result, SectionIndex, SymbolIndex,
};
use crate::{pe, LittleEndian as LE, Pod};

use super::{
    CoffComdat, CoffComdatIterator, CoffSection, CoffSectionIterator, CoffSegment,
    CoffSegmentIterator, CoffSymbol, CoffSymbolIterator, CoffSymbolTable, ImageSymbol,
    SectionTable, SymbolTable,
};

/// The common parts of `PeFile` and `CoffFile`.
#[derive(Debug)]
pub(crate) struct CoffCommon<'data, R: ReadRef<'data>, Coff: CoffHeader = pe::ImageFileHeader> {
    pub(crate) sections: SectionTable<'data>,
    pub(crate) symbols: SymbolTable<'data, R, Coff>,
    pub(crate) image_base: u64,
}

/// A COFF bigobj object file with 32-bit section numbers.
pub type CoffBigFile<'data, R = &'data [u8]> = CoffFile<'data, R, pe::AnonObjectHeaderBigobj>;

/// A COFF object file.
#[derive(Debug)]
pub struct CoffFile<'data, R: ReadRef<'data> = &'data [u8], Coff: CoffHeader = pe::ImageFileHeader>
{
    pub(super) header: &'data Coff,
    pub(super) common: CoffCommon<'data, R, Coff>,
    pub(super) data: R,
}

impl<'data, R: ReadRef<'data>, Coff: CoffHeader> CoffFile<'data, R, Coff> {
    /// Parse the raw COFF file data.
    pub fn parse(data: R) -> Result<Self> {
        let mut offset = 0;
        let header = Coff::parse(data, &mut offset)?;
        let sections = header.sections(data, offset)?;
        let symbols = header.symbols(data)?;

        Ok(CoffFile {
            header,
            common: CoffCommon {
                sections,
                symbols,
                image_base: 0,
            },
            data,
        })
    }
}

impl<'data, R: ReadRef<'data>, Coff: CoffHeader> read::private::Sealed
    for CoffFile<'data, R, Coff>
{
}

impl<'data, 'file, R, Coff> Object<'data, 'file> for CoffFile<'data, R, Coff>
where
    'data: 'file,
    R: 'file + ReadRef<'data>,
    Coff: CoffHeader,
{
    type Segment = CoffSegment<'data, 'file, R, Coff>;
    type SegmentIterator = CoffSegmentIterator<'data, 'file, R, Coff>;
    type Section = CoffSection<'data, 'file, R, Coff>;
    type SectionIterator = CoffSectionIterator<'data, 'file, R, Coff>;
    type Comdat = CoffComdat<'data, 'file, R, Coff>;
    type ComdatIterator = CoffComdatIterator<'data, 'file, R, Coff>;
    type Symbol = CoffSymbol<'data, 'file, R, Coff>;
    type SymbolIterator = CoffSymbolIterator<'data, 'file, R, Coff>;
    type SymbolTable = CoffSymbolTable<'data, 'file, R, Coff>;
    type DynamicRelocationIterator = NoDynamicRelocationIterator;

    fn architecture(&self) -> Architecture {
        match self.header.machine() {
            pe::IMAGE_FILE_MACHINE_ARMNT => Architecture::Arm,
            pe::IMAGE_FILE_MACHINE_ARM64 => Architecture::Aarch64,
            pe::IMAGE_FILE_MACHINE_I386 => Architecture::I386,
            pe::IMAGE_FILE_MACHINE_AMD64 => Architecture::X86_64,
            _ => Architecture::Unknown,
        }
    }

    #[inline]
    fn is_little_endian(&self) -> bool {
        true
    }

    #[inline]
    fn is_64(&self) -> bool {
        // Windows COFF is always 32-bit, even for 64-bit architectures. This could be confusing.
        false
    }

    fn kind(&self) -> ObjectKind {
        ObjectKind::Relocatable
    }

    fn segments(&'file self) -> CoffSegmentIterator<'data, 'file, R, Coff> {
        CoffSegmentIterator {
            file: self,
            iter: self.common.sections.iter(),
        }
    }

    fn section_by_name_bytes(
        &'file self,
        section_name: &[u8],
    ) -> Option<CoffSection<'data, 'file, R, Coff>> {
        self.sections()
            .find(|section| section.name_bytes() == Ok(section_name))
    }

    fn section_by_index(
        &'file self,
        index: SectionIndex,
    ) -> Result<CoffSection<'data, 'file, R, Coff>> {
        let section = self.common.sections.section(index.0)?;
        Ok(CoffSection {
            file: self,
            index,
            section,
        })
    }

    fn sections(&'file self) -> CoffSectionIterator<'data, 'file, R, Coff> {
        CoffSectionIterator {
            file: self,
            iter: self.common.sections.iter().enumerate(),
        }
    }

    fn comdats(&'file self) -> CoffComdatIterator<'data, 'file, R, Coff> {
        CoffComdatIterator {
            file: self,
            index: 0,
        }
    }

    fn symbol_by_index(
        &'file self,
        index: SymbolIndex,
    ) -> Result<CoffSymbol<'data, 'file, R, Coff>> {
        let symbol = self.common.symbols.symbol(index.0)?;
        Ok(CoffSymbol {
            file: &self.common,
            index,
            symbol,
        })
    }

    fn symbols(&'file self) -> CoffSymbolIterator<'data, 'file, R, Coff> {
        CoffSymbolIterator {
            file: &self.common,
            index: 0,
        }
    }

    #[inline]
    fn symbol_table(&'file self) -> Option<CoffSymbolTable<'data, 'file, R, Coff>> {
        Some(CoffSymbolTable { file: &self.common })
    }

    fn dynamic_symbols(&'file self) -> CoffSymbolIterator<'data, 'file, R, Coff> {
        CoffSymbolIterator {
            file: &self.common,
            // Hack: don't return any.
            index: self.common.symbols.len(),
        }
    }

    #[inline]
    fn dynamic_symbol_table(&'file self) -> Option<CoffSymbolTable<'data, 'file, R, Coff>> {
        None
    }

    #[inline]
    fn dynamic_relocations(&'file self) -> Option<NoDynamicRelocationIterator> {
        None
    }

    #[inline]
    fn imports(&self) -> Result<Vec<Import<'data>>> {
        // TODO: this could return undefined symbols, but not needed yet.
        Ok(Vec::new())
    }

    #[inline]
    fn exports(&self) -> Result<Vec<Export<'data>>> {
        // TODO: this could return global symbols, but not needed yet.
        Ok(Vec::new())
    }

    fn has_debug_symbols(&self) -> bool {
        self.section_by_name(".debug_info").is_some()
    }

    fn relative_address_base(&self) -> u64 {
        0
    }

    #[inline]
    fn entry(&self) -> u64 {
        0
    }

    fn flags(&self) -> FileFlags {
        FileFlags::Coff {
            characteristics: self.header.characteristics(),
        }
    }
}

/// Read the `class_id` field from an anon object header.
///
/// This can be used to determine the format of the header.
pub fn anon_object_class_id<'data, R: ReadRef<'data>>(data: R) -> Result<pe::ClsId> {
    let header = data
        .read_at::<pe::AnonObjectHeader>(0)
        .read_error("Invalid anon object header size or alignment")?;
    Ok(header.class_id)
}

/// A trait for generic access to `ImageFileHeader` and `AnonObjectHeaderBigobj`.
#[allow(missing_docs)]
pub trait CoffHeader: Debug + Pod {
    type ImageSymbol: ImageSymbol;
    type ImageSymbolBytes: Debug + Pod;

    /// Return true if this type is `AnonObjectHeaderBigobj`.
    ///
    /// This is a property of the type, not a value in the header data.
    fn is_type_bigobj() -> bool;

    fn machine(&self) -> u16;
    fn number_of_sections(&self) -> u32;
    fn pointer_to_symbol_table(&self) -> u32;
    fn number_of_symbols(&self) -> u32;
    fn characteristics(&self) -> u16;

    /// Read the file header.
    ///
    /// `data` must be the entire file data.
    /// `offset` must be the file header offset. It is updated to point after the optional header,
    /// which is where the section headers are located.
    fn parse<'data, R: ReadRef<'data>>(data: R, offset: &mut u64) -> read::Result<&'data Self>;

    /// Read the section table.
    ///
    /// `data` must be the entire file data.
    /// `offset` must be after the optional file header.
    #[inline]
    fn sections<'data, R: ReadRef<'data>>(
        &self,
        data: R,
        offset: u64,
    ) -> read::Result<SectionTable<'data>> {
        SectionTable::parse(self, data, offset)
    }

    /// Read the symbol table and string table.
    ///
    /// `data` must be the entire file data.
    #[inline]
    fn symbols<'data, R: ReadRef<'data>>(
        &self,
        data: R,
    ) -> read::Result<SymbolTable<'data, R, Self>> {
        SymbolTable::parse(self, data)
    }
}

impl CoffHeader for pe::ImageFileHeader {
    type ImageSymbol = pe::ImageSymbol;
    type ImageSymbolBytes = pe::ImageSymbolBytes;

    fn is_type_bigobj() -> bool {
        false
    }

    fn machine(&self) -> u16 {
        self.machine.get(LE)
    }

    fn number_of_sections(&self) -> u32 {
        self.number_of_sections.get(LE).into()
    }

    fn pointer_to_symbol_table(&self) -> u32 {
        self.pointer_to_symbol_table.get(LE)
    }

    fn number_of_symbols(&self) -> u32 {
        self.number_of_symbols.get(LE)
    }

    fn characteristics(&self) -> u16 {
        self.characteristics.get(LE)
    }

    fn parse<'data, R: ReadRef<'data>>(data: R, offset: &mut u64) -> read::Result<&'data Self> {
        let header = data
            .read::<pe::ImageFileHeader>(offset)
            .read_error("Invalid COFF file header size or alignment")?;

        // Skip over the optional header.
        *offset = offset
            .checked_add(header.size_of_optional_header.get(LE).into())
            .read_error("Invalid COFF optional header size")?;

        // TODO: maybe validate that the machine is known?
        Ok(header)
    }
}

impl CoffHeader for pe::AnonObjectHeaderBigobj {
    type ImageSymbol = pe::ImageSymbolEx;
    type ImageSymbolBytes = pe::ImageSymbolExBytes;

    fn is_type_bigobj() -> bool {
        true
    }

    fn machine(&self) -> u16 {
        self.machine.get(LE)
    }

    fn number_of_sections(&self) -> u32 {
        self.number_of_sections.get(LE)
    }

    fn pointer_to_symbol_table(&self) -> u32 {
        self.pointer_to_symbol_table.get(LE)
    }

    fn number_of_symbols(&self) -> u32 {
        self.number_of_symbols.get(LE)
    }

    fn characteristics(&self) -> u16 {
        0
    }

    fn parse<'data, R: ReadRef<'data>>(data: R, offset: &mut u64) -> read::Result<&'data Self> {
        let header = data
            .read::<pe::AnonObjectHeaderBigobj>(offset)
            .read_error("Invalid COFF bigobj file header size or alignment")?;

        if header.sig1.get(LE) != pe::IMAGE_FILE_MACHINE_UNKNOWN
            || header.sig2.get(LE) != 0xffff
            || header.version.get(LE) < 2
            || header.class_id != pe::ANON_OBJECT_HEADER_BIGOBJ_CLASS_ID
        {
            return Err(read::Error("Invalid COFF bigobj header values"));
        }

        // TODO: maybe validate that the machine is known?
        Ok(header)
    }
}
