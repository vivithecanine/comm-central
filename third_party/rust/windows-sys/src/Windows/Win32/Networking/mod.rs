#[cfg(feature = "Win32_Networking_ActiveDirectory")]
pub mod ActiveDirectory;
#[cfg(feature = "Win32_Networking_BackgroundIntelligentTransferService")]
pub mod BackgroundIntelligentTransferService;
#[cfg(feature = "Win32_Networking_Clustering")]
pub mod Clustering;
#[cfg(feature = "Win32_Networking_HttpServer")]
pub mod HttpServer;
#[cfg(feature = "Win32_Networking_Ldap")]
pub mod Ldap;
#[cfg(feature = "Win32_Networking_NetworkListManager")]
pub mod NetworkListManager;
#[cfg(feature = "Win32_Networking_RemoteDifferentialCompression")]
pub mod RemoteDifferentialCompression;
#[cfg(feature = "Win32_Networking_WebSocket")]
pub mod WebSocket;
#[cfg(feature = "Win32_Networking_WinHttp")]
pub mod WinHttp;
#[cfg(feature = "Win32_Networking_WinInet")]
pub mod WinInet;
#[cfg(feature = "Win32_Networking_WinSock")]
pub mod WinSock;
#[cfg(feature = "Win32_Networking_WindowsWebServices")]
pub mod WindowsWebServices;
