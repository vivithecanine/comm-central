/* automatically generated by rust-bindgen */

pub const THREAD_EXTENDED_POLICY: u32 = 1;
pub const THREAD_TIME_CONSTRAINT_POLICY: u32 = 2;
pub const THREAD_PRECEDENCE_POLICY: u32 = 3;
pub type __darwin_natural_t = ::std::os::raw::c_uint;
pub type __darwin_mach_port_name_t = __darwin_natural_t;
pub type __darwin_mach_port_t = __darwin_mach_port_name_t;
pub type boolean_t = ::std::os::raw::c_uint;
pub type natural_t = __darwin_natural_t;
pub type integer_t = ::std::os::raw::c_int;
pub type mach_port_t = __darwin_mach_port_t;
pub type thread_t = mach_port_t;
pub type thread_policy_flavor_t = natural_t;
pub type thread_policy_t = *mut integer_t;
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct thread_extended_policy {
    pub timeshare: boolean_t,
}
pub type thread_extended_policy_data_t = thread_extended_policy;
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct thread_time_constraint_policy {
    pub period: u32,
    pub computation: u32,
    pub constraint: u32,
    pub preemptible: boolean_t,
}
pub type thread_time_constraint_policy_data_t = thread_time_constraint_policy;
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct thread_precedence_policy {
    pub importance: integer_t,
}
pub type thread_precedence_policy_data_t = thread_precedence_policy;
