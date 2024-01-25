#[cfg(feature = "Win32_Foundation")]
::windows_targets::link!("cscapi.dll" "system" #[doc = "Required features: `\"Win32_Foundation\"`"] fn OfflineFilesEnable(benable : super::super::Foundation:: BOOL, pbrebootrequired : *mut super::super::Foundation:: BOOL) -> u32);
#[cfg(feature = "Win32_Foundation")]
::windows_targets::link!("cscapi.dll" "system" #[doc = "Required features: `\"Win32_Foundation\"`"] fn OfflineFilesQueryStatus(pbactive : *mut super::super::Foundation:: BOOL, pbenabled : *mut super::super::Foundation:: BOOL) -> u32);
#[cfg(feature = "Win32_Foundation")]
::windows_targets::link!("cscapi.dll" "system" #[doc = "Required features: `\"Win32_Foundation\"`"] fn OfflineFilesQueryStatusEx(pbactive : *mut super::super::Foundation:: BOOL, pbenabled : *mut super::super::Foundation:: BOOL, pbavailable : *mut super::super::Foundation:: BOOL) -> u32);
::windows_targets::link!("cscapi.dll" "system" fn OfflineFilesStart() -> u32);
pub type IEnumOfflineFilesItems = *mut ::core::ffi::c_void;
pub type IEnumOfflineFilesSettings = *mut ::core::ffi::c_void;
pub type IOfflineFilesCache = *mut ::core::ffi::c_void;
pub type IOfflineFilesCache2 = *mut ::core::ffi::c_void;
pub type IOfflineFilesChangeInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesConnectionInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesDirectoryItem = *mut ::core::ffi::c_void;
pub type IOfflineFilesDirtyInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesErrorInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesEvents = *mut ::core::ffi::c_void;
pub type IOfflineFilesEvents2 = *mut ::core::ffi::c_void;
pub type IOfflineFilesEvents3 = *mut ::core::ffi::c_void;
pub type IOfflineFilesEvents4 = *mut ::core::ffi::c_void;
pub type IOfflineFilesEventsFilter = *mut ::core::ffi::c_void;
pub type IOfflineFilesFileItem = *mut ::core::ffi::c_void;
pub type IOfflineFilesFileSysInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesGhostInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesItem = *mut ::core::ffi::c_void;
pub type IOfflineFilesItemContainer = *mut ::core::ffi::c_void;
pub type IOfflineFilesItemFilter = *mut ::core::ffi::c_void;
pub type IOfflineFilesPinInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesPinInfo2 = *mut ::core::ffi::c_void;
pub type IOfflineFilesProgress = *mut ::core::ffi::c_void;
pub type IOfflineFilesServerItem = *mut ::core::ffi::c_void;
pub type IOfflineFilesSetting = *mut ::core::ffi::c_void;
pub type IOfflineFilesShareInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesShareItem = *mut ::core::ffi::c_void;
pub type IOfflineFilesSimpleProgress = *mut ::core::ffi::c_void;
pub type IOfflineFilesSuspend = *mut ::core::ffi::c_void;
pub type IOfflineFilesSuspendInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesSyncConflictHandler = *mut ::core::ffi::c_void;
pub type IOfflineFilesSyncErrorInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesSyncErrorItemInfo = *mut ::core::ffi::c_void;
pub type IOfflineFilesSyncProgress = *mut ::core::ffi::c_void;
pub type IOfflineFilesTransparentCacheInfo = *mut ::core::ffi::c_void;
pub const OFFLINEFILES_CACHING_MODE_AUTO_DOC: OFFLINEFILES_CACHING_MODE = 3i32;
pub const OFFLINEFILES_CACHING_MODE_AUTO_PROGANDDOC: OFFLINEFILES_CACHING_MODE = 4i32;
pub const OFFLINEFILES_CACHING_MODE_MANUAL: OFFLINEFILES_CACHING_MODE = 2i32;
pub const OFFLINEFILES_CACHING_MODE_NOCACHING: OFFLINEFILES_CACHING_MODE = 1i32;
pub const OFFLINEFILES_CACHING_MODE_NONE: OFFLINEFILES_CACHING_MODE = 0i32;
pub const OFFLINEFILES_CHANGES_LOCAL_ATTRIBUTES: u32 = 2u32;
pub const OFFLINEFILES_CHANGES_LOCAL_SIZE: u32 = 1u32;
pub const OFFLINEFILES_CHANGES_LOCAL_TIME: u32 = 4u32;
pub const OFFLINEFILES_CHANGES_NONE: u32 = 0u32;
pub const OFFLINEFILES_CHANGES_REMOTE_ATTRIBUTES: u32 = 16u32;
pub const OFFLINEFILES_CHANGES_REMOTE_SIZE: u32 = 8u32;
pub const OFFLINEFILES_CHANGES_REMOTE_TIME: u32 = 32u32;
pub const OFFLINEFILES_COMPARE_EQ: OFFLINEFILES_COMPARE = 0i32;
pub const OFFLINEFILES_COMPARE_GT: OFFLINEFILES_COMPARE = 3i32;
pub const OFFLINEFILES_COMPARE_GTE: OFFLINEFILES_COMPARE = 5i32;
pub const OFFLINEFILES_COMPARE_LT: OFFLINEFILES_COMPARE = 2i32;
pub const OFFLINEFILES_COMPARE_LTE: OFFLINEFILES_COMPARE = 4i32;
pub const OFFLINEFILES_COMPARE_NEQ: OFFLINEFILES_COMPARE = 1i32;
pub const OFFLINEFILES_CONNECT_STATE_OFFLINE: OFFLINEFILES_CONNECT_STATE = 1i32;
pub const OFFLINEFILES_CONNECT_STATE_ONLINE: OFFLINEFILES_CONNECT_STATE = 2i32;
pub const OFFLINEFILES_CONNECT_STATE_PARTLY_TRANSPARENTLY_CACHED: OFFLINEFILES_CONNECT_STATE = 4i32;
pub const OFFLINEFILES_CONNECT_STATE_TRANSPARENTLY_CACHED: OFFLINEFILES_CONNECT_STATE = 3i32;
pub const OFFLINEFILES_CONNECT_STATE_UNKNOWN: OFFLINEFILES_CONNECT_STATE = 0i32;
pub const OFFLINEFILES_DELETE_FLAG_ADMIN: u32 = 2147483648u32;
pub const OFFLINEFILES_DELETE_FLAG_DELMODIFIED: u32 = 4u32;
pub const OFFLINEFILES_DELETE_FLAG_NOAUTOCACHED: u32 = 1u32;
pub const OFFLINEFILES_DELETE_FLAG_NOPINNED: u32 = 2u32;
pub const OFFLINEFILES_ENCRYPTION_CONTROL_FLAG_ASYNCPROGRESS: u32 = 1024u32;
pub const OFFLINEFILES_ENCRYPTION_CONTROL_FLAG_BACKGROUND: u32 = 65536u32;
pub const OFFLINEFILES_ENCRYPTION_CONTROL_FLAG_CONSOLE: u32 = 4096u32;
pub const OFFLINEFILES_ENCRYPTION_CONTROL_FLAG_INTERACTIVE: u32 = 2048u32;
pub const OFFLINEFILES_ENCRYPTION_CONTROL_FLAG_LOWPRIORITY: u32 = 512u32;
pub const OFFLINEFILES_ENUM_FLAT: u32 = 1u32;
pub const OFFLINEFILES_ENUM_FLAT_FILESONLY: u32 = 2u32;
pub const OFFLINEFILES_EVENT_BACKGROUNDSYNCBEGIN: OFFLINEFILES_EVENTS = 11i32;
pub const OFFLINEFILES_EVENT_BACKGROUNDSYNCEND: OFFLINEFILES_EVENTS = 12i32;
pub const OFFLINEFILES_EVENT_CACHEEVICTBEGIN: OFFLINEFILES_EVENTS = 29i32;
pub const OFFLINEFILES_EVENT_CACHEEVICTEND: OFFLINEFILES_EVENTS = 30i32;
pub const OFFLINEFILES_EVENT_CACHEISCORRUPTED: OFFLINEFILES_EVENTS = 2i32;
pub const OFFLINEFILES_EVENT_CACHEISFULL: OFFLINEFILES_EVENTS = 1i32;
pub const OFFLINEFILES_EVENT_CACHEMOVED: OFFLINEFILES_EVENTS = 0i32;
pub const OFFLINEFILES_EVENT_DATALOST: OFFLINEFILES_EVENTS = 25i32;
pub const OFFLINEFILES_EVENT_ENABLED: OFFLINEFILES_EVENTS = 3i32;
pub const OFFLINEFILES_EVENT_ENCRYPTIONCHANGED: OFFLINEFILES_EVENTS = 4i32;
pub const OFFLINEFILES_EVENT_ITEMADDEDTOCACHE: OFFLINEFILES_EVENTS = 22i32;
pub const OFFLINEFILES_EVENT_ITEMAVAILABLEOFFLINE: OFFLINEFILES_EVENTS = 17i32;
pub const OFFLINEFILES_EVENT_ITEMDELETEDFROMCACHE: OFFLINEFILES_EVENTS = 23i32;
pub const OFFLINEFILES_EVENT_ITEMDISCONNECTED: OFFLINEFILES_EVENTS = 15i32;
pub const OFFLINEFILES_EVENT_ITEMMODIFIED: OFFLINEFILES_EVENTS = 21i32;
pub const OFFLINEFILES_EVENT_ITEMNOTAVAILABLEOFFLINE: OFFLINEFILES_EVENTS = 18i32;
pub const OFFLINEFILES_EVENT_ITEMNOTPINNED: OFFLINEFILES_EVENTS = 20i32;
pub const OFFLINEFILES_EVENT_ITEMPINNED: OFFLINEFILES_EVENTS = 19i32;
pub const OFFLINEFILES_EVENT_ITEMRECONNECTBEGIN: OFFLINEFILES_EVENTS = 27i32;
pub const OFFLINEFILES_EVENT_ITEMRECONNECTED: OFFLINEFILES_EVENTS = 16i32;
pub const OFFLINEFILES_EVENT_ITEMRECONNECTEND: OFFLINEFILES_EVENTS = 28i32;
pub const OFFLINEFILES_EVENT_ITEMRENAMED: OFFLINEFILES_EVENTS = 24i32;
pub const OFFLINEFILES_EVENT_NETTRANSPORTARRIVED: OFFLINEFILES_EVENTS = 13i32;
pub const OFFLINEFILES_EVENT_NONETTRANSPORTS: OFFLINEFILES_EVENTS = 14i32;
pub const OFFLINEFILES_EVENT_PING: OFFLINEFILES_EVENTS = 26i32;
pub const OFFLINEFILES_EVENT_POLICYCHANGEDETECTED: OFFLINEFILES_EVENTS = 31i32;
pub const OFFLINEFILES_EVENT_PREFERENCECHANGEDETECTED: OFFLINEFILES_EVENTS = 32i32;
pub const OFFLINEFILES_EVENT_PREFETCHCLOSEHANDLEBEGIN: OFFLINEFILES_EVENTS = 37i32;
pub const OFFLINEFILES_EVENT_PREFETCHCLOSEHANDLEEND: OFFLINEFILES_EVENTS = 38i32;
pub const OFFLINEFILES_EVENT_PREFETCHFILEBEGIN: OFFLINEFILES_EVENTS = 35i32;
pub const OFFLINEFILES_EVENT_PREFETCHFILEEND: OFFLINEFILES_EVENTS = 36i32;
pub const OFFLINEFILES_EVENT_SETTINGSCHANGESAPPLIED: OFFLINEFILES_EVENTS = 33i32;
pub const OFFLINEFILES_EVENT_SYNCBEGIN: OFFLINEFILES_EVENTS = 5i32;
pub const OFFLINEFILES_EVENT_SYNCCONFLICTRECADDED: OFFLINEFILES_EVENTS = 7i32;
pub const OFFLINEFILES_EVENT_SYNCCONFLICTRECREMOVED: OFFLINEFILES_EVENTS = 9i32;
pub const OFFLINEFILES_EVENT_SYNCCONFLICTRECUPDATED: OFFLINEFILES_EVENTS = 8i32;
pub const OFFLINEFILES_EVENT_SYNCEND: OFFLINEFILES_EVENTS = 10i32;
pub const OFFLINEFILES_EVENT_SYNCFILERESULT: OFFLINEFILES_EVENTS = 6i32;
pub const OFFLINEFILES_EVENT_TRANSPARENTCACHEITEMNOTIFY: OFFLINEFILES_EVENTS = 34i32;
pub const OFFLINEFILES_ITEM_COPY_LOCAL: OFFLINEFILES_ITEM_COPY = 0i32;
pub const OFFLINEFILES_ITEM_COPY_ORIGINAL: OFFLINEFILES_ITEM_COPY = 2i32;
pub const OFFLINEFILES_ITEM_COPY_REMOTE: OFFLINEFILES_ITEM_COPY = 1i32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_CREATED: u32 = 8u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_DELETED: u32 = 16u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_DIRECTORY: u32 = 256u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_DIRTY: u32 = 32u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_FILE: u32 = 128u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_GHOST: u32 = 8192u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_GUEST_ANYACCESS: u32 = 33554432u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_GUEST_READ: u32 = 16777216u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_GUEST_WRITE: u32 = 8388608u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_MODIFIED: u32 = 4u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_MODIFIED_ATTRIBUTES: u32 = 2u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_MODIFIED_DATA: u32 = 1u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_OFFLINE: u32 = 32768u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_ONLINE: u32 = 65536u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_OTHER_ANYACCESS: u32 = 4194304u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_OTHER_READ: u32 = 2097152u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_OTHER_WRITE: u32 = 1048576u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_PINNED: u32 = 4096u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_PINNED_COMPUTER: u32 = 2048u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_PINNED_OTHERS: u32 = 1024u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_PINNED_USER: u32 = 512u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_SPARSE: u32 = 64u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_SUSPENDED: u32 = 16384u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_USER_ANYACCESS: u32 = 524288u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_USER_READ: u32 = 262144u32;
pub const OFFLINEFILES_ITEM_FILTER_FLAG_USER_WRITE: u32 = 131072u32;
pub const OFFLINEFILES_ITEM_QUERY_ADMIN: u32 = 2147483648u32;
pub const OFFLINEFILES_ITEM_QUERY_ATTEMPT_TRANSITIONONLINE: u32 = 32u32;
pub const OFFLINEFILES_ITEM_QUERY_CONNECTIONSTATE: u32 = 2u32;
pub const OFFLINEFILES_ITEM_QUERY_INCLUDETRANSPARENTCACHE: u32 = 16u32;
pub const OFFLINEFILES_ITEM_QUERY_LOCALDIRTYBYTECOUNT: u32 = 4u32;
pub const OFFLINEFILES_ITEM_QUERY_REMOTEDIRTYBYTECOUNT: u32 = 8u32;
pub const OFFLINEFILES_ITEM_QUERY_REMOTEINFO: u32 = 1u32;
pub const OFFLINEFILES_ITEM_TIME_CREATION: OFFLINEFILES_ITEM_TIME = 0i32;
pub const OFFLINEFILES_ITEM_TIME_LASTACCESS: OFFLINEFILES_ITEM_TIME = 1i32;
pub const OFFLINEFILES_ITEM_TIME_LASTWRITE: OFFLINEFILES_ITEM_TIME = 2i32;
pub const OFFLINEFILES_ITEM_TYPE_DIRECTORY: OFFLINEFILES_ITEM_TYPE = 1i32;
pub const OFFLINEFILES_ITEM_TYPE_FILE: OFFLINEFILES_ITEM_TYPE = 0i32;
pub const OFFLINEFILES_ITEM_TYPE_SERVER: OFFLINEFILES_ITEM_TYPE = 3i32;
pub const OFFLINEFILES_ITEM_TYPE_SHARE: OFFLINEFILES_ITEM_TYPE = 2i32;
pub const OFFLINEFILES_NUM_EVENTS: OFFLINEFILES_EVENTS = 39i32;
pub const OFFLINEFILES_OFFLINE_REASON_CONNECTION_ERROR: OFFLINEFILES_OFFLINE_REASON = 4i32;
pub const OFFLINEFILES_OFFLINE_REASON_CONNECTION_FORCED: OFFLINEFILES_OFFLINE_REASON = 2i32;
pub const OFFLINEFILES_OFFLINE_REASON_CONNECTION_SLOW: OFFLINEFILES_OFFLINE_REASON = 3i32;
pub const OFFLINEFILES_OFFLINE_REASON_ITEM_SUSPENDED: OFFLINEFILES_OFFLINE_REASON = 6i32;
pub const OFFLINEFILES_OFFLINE_REASON_ITEM_VERSION_CONFLICT: OFFLINEFILES_OFFLINE_REASON = 5i32;
pub const OFFLINEFILES_OFFLINE_REASON_NOT_APPLICABLE: OFFLINEFILES_OFFLINE_REASON = 1i32;
pub const OFFLINEFILES_OFFLINE_REASON_UNKNOWN: OFFLINEFILES_OFFLINE_REASON = 0i32;
pub const OFFLINEFILES_OP_ABORT: OFFLINEFILES_OP_RESPONSE = 2i32;
pub const OFFLINEFILES_OP_CONTINUE: OFFLINEFILES_OP_RESPONSE = 0i32;
pub const OFFLINEFILES_OP_RETRY: OFFLINEFILES_OP_RESPONSE = 1i32;
pub const OFFLINEFILES_PATHFILTER_CHILD: OFFLINEFILES_PATHFILTER_MATCH = 1i32;
pub const OFFLINEFILES_PATHFILTER_DESCENDENT: OFFLINEFILES_PATHFILTER_MATCH = 2i32;
pub const OFFLINEFILES_PATHFILTER_SELF: OFFLINEFILES_PATHFILTER_MATCH = 0i32;
pub const OFFLINEFILES_PATHFILTER_SELFORCHILD: OFFLINEFILES_PATHFILTER_MATCH = 3i32;
pub const OFFLINEFILES_PATHFILTER_SELFORDESCENDENT: OFFLINEFILES_PATHFILTER_MATCH = 4i32;
pub const OFFLINEFILES_PINLINKTARGETS_ALWAYS: u32 = 2u32;
pub const OFFLINEFILES_PINLINKTARGETS_EXPLICIT: u32 = 1u32;
pub const OFFLINEFILES_PINLINKTARGETS_NEVER: u32 = 0u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_ASYNCPROGRESS: u32 = 1024u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_BACKGROUND: u32 = 65536u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_CONSOLE: u32 = 4096u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_FILL: u32 = 1u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_FORALL: u32 = 128u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_FORREDIR: u32 = 256u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_FORUSER: u32 = 32u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_FORUSER_POLICY: u32 = 64u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_INTERACTIVE: u32 = 2048u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_LOWPRIORITY: u32 = 512u32;
pub const OFFLINEFILES_PIN_CONTROL_FLAG_PINLINKTARGETS: u32 = 16u32;
pub const OFFLINEFILES_SETTING_PinLinkTargets: ::windows_sys::core::PCWSTR = ::windows_sys::core::w!("LinkTargetCaching");
pub const OFFLINEFILES_SETTING_SCOPE_COMPUTER: u32 = 2u32;
pub const OFFLINEFILES_SETTING_SCOPE_USER: u32 = 1u32;
pub const OFFLINEFILES_SETTING_VALUE_2DIM_ARRAY_BSTR_BSTR: OFFLINEFILES_SETTING_VALUE_TYPE = 4i32;
pub const OFFLINEFILES_SETTING_VALUE_2DIM_ARRAY_BSTR_UI4: OFFLINEFILES_SETTING_VALUE_TYPE = 3i32;
pub const OFFLINEFILES_SETTING_VALUE_BSTR: OFFLINEFILES_SETTING_VALUE_TYPE = 1i32;
pub const OFFLINEFILES_SETTING_VALUE_BSTR_DBLNULTERM: OFFLINEFILES_SETTING_VALUE_TYPE = 2i32;
pub const OFFLINEFILES_SETTING_VALUE_UI4: OFFLINEFILES_SETTING_VALUE_TYPE = 0i32;
pub const OFFLINEFILES_SYNC_CONFLICT_ABORT: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 7i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_KEEPALLCHANGES: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 3i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_KEEPLATEST: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 4i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_KEEPLOCAL: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 1i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_KEEPREMOTE: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 2i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_LOG: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 5i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_NONE: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 0i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_NUMCODES: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 8i32;
pub const OFFLINEFILES_SYNC_CONFLICT_RESOLVE_SKIP: OFFLINEFILES_SYNC_CONFLICT_RESOLVE = 6i32;
pub const OFFLINEFILES_SYNC_CONTROL_CR_DEFAULT: u32 = 0u32;
pub const OFFLINEFILES_SYNC_CONTROL_CR_KEEPLATEST: u32 = 805306368u32;
pub const OFFLINEFILES_SYNC_CONTROL_CR_KEEPLOCAL: u32 = 268435456u32;
pub const OFFLINEFILES_SYNC_CONTROL_CR_KEEPREMOTE: u32 = 536870912u32;
pub const OFFLINEFILES_SYNC_CONTROL_CR_MASK: u32 = 4026531840u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_ASYNCPROGRESS: u32 = 1024u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_BACKGROUND: u32 = 65536u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_CONSOLE: u32 = 4096u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_FILLSPARSE: u32 = 1u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_INTERACTIVE: u32 = 2048u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_LOWPRIORITY: u32 = 512u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_NONEWFILESOUT: u32 = 131072u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINFORALL: u32 = 128u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINFORREDIR: u32 = 256u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINFORUSER: u32 = 32u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINFORUSER_POLICY: u32 = 64u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINLINKTARGETS: u32 = 16u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_PINNEWFILES: u32 = 8u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_SKIPSUSPENDEDDIRS: u32 = 8192u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_SYNCIN: u32 = 2u32;
pub const OFFLINEFILES_SYNC_CONTROL_FLAG_SYNCOUT: u32 = 4u32;
pub const OFFLINEFILES_SYNC_ITEM_CHANGE_ATTRIBUTES: u32 = 8u32;
pub const OFFLINEFILES_SYNC_ITEM_CHANGE_CHANGETIME: u32 = 1u32;
pub const OFFLINEFILES_SYNC_ITEM_CHANGE_FILESIZE: u32 = 4u32;
pub const OFFLINEFILES_SYNC_ITEM_CHANGE_NONE: u32 = 0u32;
pub const OFFLINEFILES_SYNC_ITEM_CHANGE_WRITETIME: u32 = 2u32;
pub const OFFLINEFILES_SYNC_OPERATION_CREATE_COPY_ON_CLIENT: OFFLINEFILES_SYNC_OPERATION = 1i32;
pub const OFFLINEFILES_SYNC_OPERATION_CREATE_COPY_ON_SERVER: OFFLINEFILES_SYNC_OPERATION = 0i32;
pub const OFFLINEFILES_SYNC_OPERATION_DELETE_CLIENT_COPY: OFFLINEFILES_SYNC_OPERATION = 5i32;
pub const OFFLINEFILES_SYNC_OPERATION_DELETE_SERVER_COPY: OFFLINEFILES_SYNC_OPERATION = 4i32;
pub const OFFLINEFILES_SYNC_OPERATION_PIN: OFFLINEFILES_SYNC_OPERATION = 6i32;
pub const OFFLINEFILES_SYNC_OPERATION_PREPARE: OFFLINEFILES_SYNC_OPERATION = 7i32;
pub const OFFLINEFILES_SYNC_OPERATION_SYNC_TO_CLIENT: OFFLINEFILES_SYNC_OPERATION = 3i32;
pub const OFFLINEFILES_SYNC_OPERATION_SYNC_TO_SERVER: OFFLINEFILES_SYNC_OPERATION = 2i32;
pub const OFFLINEFILES_SYNC_STATE_DeletedOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 37i32;
pub const OFFLINEFILES_SYNC_STATE_DeletedOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 35i32;
pub const OFFLINEFILES_SYNC_STATE_DeletedOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 36i32;
pub const OFFLINEFILES_SYNC_STATE_DeletedOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 34i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnClient: OFFLINEFILES_SYNC_STATE = 42i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnClient_ChangedOnServer: OFFLINEFILES_SYNC_STATE = 28i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnClient_DeletedOnServer: OFFLINEFILES_SYNC_STATE = 29i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 27i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 26i32;
pub const OFFLINEFILES_SYNC_STATE_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 47i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_DeletedOnServer: OFFLINEFILES_SYNC_STATE = 25i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 24i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 21i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 23i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 22i32;
pub const OFFLINEFILES_SYNC_STATE_DirCreatedOnClient_NoServerCopy: OFFLINEFILES_SYNC_STATE = 20i32;
pub const OFFLINEFILES_SYNC_STATE_DirDeletedOnServer: OFFLINEFILES_SYNC_STATE = 49i32;
pub const OFFLINEFILES_SYNC_STATE_DirOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 4i32;
pub const OFFLINEFILES_SYNC_STATE_DirOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 3i32;
pub const OFFLINEFILES_SYNC_STATE_DirOnClient_NoServerCopy: OFFLINEFILES_SYNC_STATE = 5i32;
pub const OFFLINEFILES_SYNC_STATE_DirRenamedOnClient: OFFLINEFILES_SYNC_STATE = 43i32;
pub const OFFLINEFILES_SYNC_STATE_DirRenamedOnServer: OFFLINEFILES_SYNC_STATE = 48i32;
pub const OFFLINEFILES_SYNC_STATE_DirSparseOnClient: OFFLINEFILES_SYNC_STATE = 41i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnClient: OFFLINEFILES_SYNC_STATE = 39i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnClient_ChangedOnServer: OFFLINEFILES_SYNC_STATE = 12i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnClient_DeletedOnServer: OFFLINEFILES_SYNC_STATE = 15i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 14i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 13i32;
pub const OFFLINEFILES_SYNC_STATE_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 44i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_DeletedOnServer: OFFLINEFILES_SYNC_STATE = 11i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 8i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 10i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 7i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 9i32;
pub const OFFLINEFILES_SYNC_STATE_FileCreatedOnClient_NoServerCopy: OFFLINEFILES_SYNC_STATE = 6i32;
pub const OFFLINEFILES_SYNC_STATE_FileDeletedOnServer: OFFLINEFILES_SYNC_STATE = 46i32;
pub const OFFLINEFILES_SYNC_STATE_FileOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 1i32;
pub const OFFLINEFILES_SYNC_STATE_FileOnClient_NoServerCopy: OFFLINEFILES_SYNC_STATE = 2i32;
pub const OFFLINEFILES_SYNC_STATE_FileRenamedOnClient: OFFLINEFILES_SYNC_STATE = 40i32;
pub const OFFLINEFILES_SYNC_STATE_FileRenamedOnServer: OFFLINEFILES_SYNC_STATE = 45i32;
pub const OFFLINEFILES_SYNC_STATE_FileReplacedAndDeletedOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 53i32;
pub const OFFLINEFILES_SYNC_STATE_FileReplacedAndDeletedOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 52i32;
pub const OFFLINEFILES_SYNC_STATE_FileReplacedAndDeletedOnClient_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 51i32;
pub const OFFLINEFILES_SYNC_STATE_FileReplacedAndDeletedOnClient_FileOnServer: OFFLINEFILES_SYNC_STATE = 50i32;
pub const OFFLINEFILES_SYNC_STATE_FileSparseOnClient: OFFLINEFILES_SYNC_STATE = 38i32;
pub const OFFLINEFILES_SYNC_STATE_FileSparseOnClient_ChangedOnServer: OFFLINEFILES_SYNC_STATE = 16i32;
pub const OFFLINEFILES_SYNC_STATE_FileSparseOnClient_DeletedOnServer: OFFLINEFILES_SYNC_STATE = 17i32;
pub const OFFLINEFILES_SYNC_STATE_FileSparseOnClient_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 19i32;
pub const OFFLINEFILES_SYNC_STATE_FileSparseOnClient_DirOnServer: OFFLINEFILES_SYNC_STATE = 18i32;
pub const OFFLINEFILES_SYNC_STATE_LOCAL_KNOWN: u32 = 1u32;
pub const OFFLINEFILES_SYNC_STATE_NUMSTATES: OFFLINEFILES_SYNC_STATE = 54i32;
pub const OFFLINEFILES_SYNC_STATE_NoClientCopy_DirChangedOnServer: OFFLINEFILES_SYNC_STATE = 33i32;
pub const OFFLINEFILES_SYNC_STATE_NoClientCopy_DirOnServer: OFFLINEFILES_SYNC_STATE = 31i32;
pub const OFFLINEFILES_SYNC_STATE_NoClientCopy_FileChangedOnServer: OFFLINEFILES_SYNC_STATE = 32i32;
pub const OFFLINEFILES_SYNC_STATE_NoClientCopy_FileOnServer: OFFLINEFILES_SYNC_STATE = 30i32;
pub const OFFLINEFILES_SYNC_STATE_REMOTE_KNOWN: u32 = 2u32;
pub const OFFLINEFILES_SYNC_STATE_Stable: OFFLINEFILES_SYNC_STATE = 0i32;
pub const OFFLINEFILES_TRANSITION_FLAG_CONSOLE: u32 = 2u32;
pub const OFFLINEFILES_TRANSITION_FLAG_INTERACTIVE: u32 = 1u32;
pub const OfflineFilesCache: ::windows_sys::core::GUID = ::windows_sys::core::GUID::from_u128(0x48c6be7c_3871_43cc_b46f_1449a1bb2ff3);
pub const OfflineFilesSetting: ::windows_sys::core::GUID = ::windows_sys::core::GUID::from_u128(0xfd3659e9_a920_4123_ad64_7fc76c7aacdf);
pub type OFFLINEFILES_CACHING_MODE = i32;
pub type OFFLINEFILES_COMPARE = i32;
pub type OFFLINEFILES_CONNECT_STATE = i32;
pub type OFFLINEFILES_EVENTS = i32;
pub type OFFLINEFILES_ITEM_COPY = i32;
pub type OFFLINEFILES_ITEM_TIME = i32;
pub type OFFLINEFILES_ITEM_TYPE = i32;
pub type OFFLINEFILES_OFFLINE_REASON = i32;
pub type OFFLINEFILES_OP_RESPONSE = i32;
pub type OFFLINEFILES_PATHFILTER_MATCH = i32;
pub type OFFLINEFILES_SETTING_VALUE_TYPE = i32;
pub type OFFLINEFILES_SYNC_CONFLICT_RESOLVE = i32;
pub type OFFLINEFILES_SYNC_OPERATION = i32;
pub type OFFLINEFILES_SYNC_STATE = i32;
