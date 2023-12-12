pub type IWindowsMediaLibrarySharingDevice = *mut ::core::ffi::c_void;
pub type IWindowsMediaLibrarySharingDeviceProperties = *mut ::core::ffi::c_void;
pub type IWindowsMediaLibrarySharingDeviceProperty = *mut ::core::ffi::c_void;
pub type IWindowsMediaLibrarySharingDevices = *mut ::core::ffi::c_void;
pub type IWindowsMediaLibrarySharingServices = *mut ::core::ffi::c_void;
#[doc = "*Required features: `\"Win32_Media_LibrarySharingServices\"`*"]
pub const WindowsMediaLibrarySharingServices: ::windows_sys::core::GUID = ::windows_sys::core::GUID::from_u128(0xad581b00_7b64_4e59_a38d_d2c5bf51ddb3);
#[doc = "*Required features: `\"Win32_Media_LibrarySharingServices\"`*"]
pub type WindowsMediaLibrarySharingDeviceAuthorizationStatus = i32;
#[doc = "*Required features: `\"Win32_Media_LibrarySharingServices\"`*"]
pub const DEVICE_AUTHORIZATION_UNKNOWN: WindowsMediaLibrarySharingDeviceAuthorizationStatus = 0i32;
#[doc = "*Required features: `\"Win32_Media_LibrarySharingServices\"`*"]
pub const DEVICE_AUTHORIZATION_ALLOWED: WindowsMediaLibrarySharingDeviceAuthorizationStatus = 1i32;
#[doc = "*Required features: `\"Win32_Media_LibrarySharingServices\"`*"]
pub const DEVICE_AUTHORIZATION_DENIED: WindowsMediaLibrarySharingDeviceAuthorizationStatus = 2i32;
