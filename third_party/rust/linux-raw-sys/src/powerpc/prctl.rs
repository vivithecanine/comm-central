/* automatically generated by rust-bindgen 0.66.1 */

pub type __s8 = crate::ctypes::c_schar;
pub type __u8 = crate::ctypes::c_uchar;
pub type __s16 = crate::ctypes::c_short;
pub type __u16 = crate::ctypes::c_ushort;
pub type __s32 = crate::ctypes::c_int;
pub type __u32 = crate::ctypes::c_uint;
pub type __s64 = crate::ctypes::c_longlong;
pub type __u64 = crate::ctypes::c_ulonglong;
pub type __kernel_key_t = crate::ctypes::c_int;
pub type __kernel_mqd_t = crate::ctypes::c_int;
pub type __kernel_ipc_pid_t = crate::ctypes::c_short;
pub type __kernel_long_t = crate::ctypes::c_long;
pub type __kernel_ulong_t = crate::ctypes::c_ulong;
pub type __kernel_ino_t = __kernel_ulong_t;
pub type __kernel_mode_t = crate::ctypes::c_uint;
pub type __kernel_pid_t = crate::ctypes::c_int;
pub type __kernel_uid_t = crate::ctypes::c_uint;
pub type __kernel_gid_t = crate::ctypes::c_uint;
pub type __kernel_suseconds_t = __kernel_long_t;
pub type __kernel_daddr_t = crate::ctypes::c_int;
pub type __kernel_uid32_t = crate::ctypes::c_uint;
pub type __kernel_gid32_t = crate::ctypes::c_uint;
pub type __kernel_old_uid_t = __kernel_uid_t;
pub type __kernel_old_gid_t = __kernel_gid_t;
pub type __kernel_old_dev_t = crate::ctypes::c_uint;
pub type __kernel_size_t = crate::ctypes::c_uint;
pub type __kernel_ssize_t = crate::ctypes::c_int;
pub type __kernel_ptrdiff_t = crate::ctypes::c_int;
pub type __kernel_off_t = __kernel_long_t;
pub type __kernel_loff_t = crate::ctypes::c_longlong;
pub type __kernel_old_time_t = __kernel_long_t;
pub type __kernel_time_t = __kernel_long_t;
pub type __kernel_time64_t = crate::ctypes::c_longlong;
pub type __kernel_clock_t = __kernel_long_t;
pub type __kernel_timer_t = crate::ctypes::c_int;
pub type __kernel_clockid_t = crate::ctypes::c_int;
pub type __kernel_caddr_t = *mut crate::ctypes::c_char;
pub type __kernel_uid16_t = crate::ctypes::c_ushort;
pub type __kernel_gid16_t = crate::ctypes::c_ushort;
pub type __le16 = __u16;
pub type __be16 = __u16;
pub type __le32 = __u32;
pub type __be32 = __u32;
pub type __le64 = __u64;
pub type __be64 = __u64;
pub type __sum16 = __u16;
pub type __wsum = __u32;
pub type __poll_t = crate::ctypes::c_uint;
#[repr(C)]
#[repr(align(16))]
#[derive(Debug, Copy, Clone)]
pub struct __vector128 {
pub u: [__u32; 4usize],
}
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct prctl_mm_map {
pub start_code: __u64,
pub end_code: __u64,
pub start_data: __u64,
pub end_data: __u64,
pub start_brk: __u64,
pub brk: __u64,
pub start_stack: __u64,
pub arg_start: __u64,
pub arg_end: __u64,
pub env_start: __u64,
pub env_end: __u64,
pub auxv: *mut __u64,
pub auxv_size: __u32,
pub exe_fd: __u32,
}
pub const PR_SET_PDEATHSIG: u32 = 1;
pub const PR_GET_PDEATHSIG: u32 = 2;
pub const PR_GET_DUMPABLE: u32 = 3;
pub const PR_SET_DUMPABLE: u32 = 4;
pub const PR_GET_UNALIGN: u32 = 5;
pub const PR_SET_UNALIGN: u32 = 6;
pub const PR_UNALIGN_NOPRINT: u32 = 1;
pub const PR_UNALIGN_SIGBUS: u32 = 2;
pub const PR_GET_KEEPCAPS: u32 = 7;
pub const PR_SET_KEEPCAPS: u32 = 8;
pub const PR_GET_FPEMU: u32 = 9;
pub const PR_SET_FPEMU: u32 = 10;
pub const PR_FPEMU_NOPRINT: u32 = 1;
pub const PR_FPEMU_SIGFPE: u32 = 2;
pub const PR_GET_FPEXC: u32 = 11;
pub const PR_SET_FPEXC: u32 = 12;
pub const PR_FP_EXC_SW_ENABLE: u32 = 128;
pub const PR_FP_EXC_DIV: u32 = 65536;
pub const PR_FP_EXC_OVF: u32 = 131072;
pub const PR_FP_EXC_UND: u32 = 262144;
pub const PR_FP_EXC_RES: u32 = 524288;
pub const PR_FP_EXC_INV: u32 = 1048576;
pub const PR_FP_EXC_DISABLED: u32 = 0;
pub const PR_FP_EXC_NONRECOV: u32 = 1;
pub const PR_FP_EXC_ASYNC: u32 = 2;
pub const PR_FP_EXC_PRECISE: u32 = 3;
pub const PR_GET_TIMING: u32 = 13;
pub const PR_SET_TIMING: u32 = 14;
pub const PR_TIMING_STATISTICAL: u32 = 0;
pub const PR_TIMING_TIMESTAMP: u32 = 1;
pub const PR_SET_NAME: u32 = 15;
pub const PR_GET_NAME: u32 = 16;
pub const PR_GET_ENDIAN: u32 = 19;
pub const PR_SET_ENDIAN: u32 = 20;
pub const PR_ENDIAN_BIG: u32 = 0;
pub const PR_ENDIAN_LITTLE: u32 = 1;
pub const PR_ENDIAN_PPC_LITTLE: u32 = 2;
pub const PR_GET_SECCOMP: u32 = 21;
pub const PR_SET_SECCOMP: u32 = 22;
pub const PR_CAPBSET_READ: u32 = 23;
pub const PR_CAPBSET_DROP: u32 = 24;
pub const PR_GET_TSC: u32 = 25;
pub const PR_SET_TSC: u32 = 26;
pub const PR_TSC_ENABLE: u32 = 1;
pub const PR_TSC_SIGSEGV: u32 = 2;
pub const PR_GET_SECUREBITS: u32 = 27;
pub const PR_SET_SECUREBITS: u32 = 28;
pub const PR_SET_TIMERSLACK: u32 = 29;
pub const PR_GET_TIMERSLACK: u32 = 30;
pub const PR_TASK_PERF_EVENTS_DISABLE: u32 = 31;
pub const PR_TASK_PERF_EVENTS_ENABLE: u32 = 32;
pub const PR_MCE_KILL: u32 = 33;
pub const PR_MCE_KILL_CLEAR: u32 = 0;
pub const PR_MCE_KILL_SET: u32 = 1;
pub const PR_MCE_KILL_LATE: u32 = 0;
pub const PR_MCE_KILL_EARLY: u32 = 1;
pub const PR_MCE_KILL_DEFAULT: u32 = 2;
pub const PR_MCE_KILL_GET: u32 = 34;
pub const PR_SET_MM: u32 = 35;
pub const PR_SET_MM_START_CODE: u32 = 1;
pub const PR_SET_MM_END_CODE: u32 = 2;
pub const PR_SET_MM_START_DATA: u32 = 3;
pub const PR_SET_MM_END_DATA: u32 = 4;
pub const PR_SET_MM_START_STACK: u32 = 5;
pub const PR_SET_MM_START_BRK: u32 = 6;
pub const PR_SET_MM_BRK: u32 = 7;
pub const PR_SET_MM_ARG_START: u32 = 8;
pub const PR_SET_MM_ARG_END: u32 = 9;
pub const PR_SET_MM_ENV_START: u32 = 10;
pub const PR_SET_MM_ENV_END: u32 = 11;
pub const PR_SET_MM_AUXV: u32 = 12;
pub const PR_SET_MM_EXE_FILE: u32 = 13;
pub const PR_SET_MM_MAP: u32 = 14;
pub const PR_SET_MM_MAP_SIZE: u32 = 15;
pub const PR_SET_PTRACER: u32 = 1499557217;
pub const PR_SET_CHILD_SUBREAPER: u32 = 36;
pub const PR_GET_CHILD_SUBREAPER: u32 = 37;
pub const PR_SET_NO_NEW_PRIVS: u32 = 38;
pub const PR_GET_NO_NEW_PRIVS: u32 = 39;
pub const PR_GET_TID_ADDRESS: u32 = 40;
pub const PR_SET_THP_DISABLE: u32 = 41;
pub const PR_GET_THP_DISABLE: u32 = 42;
pub const PR_MPX_ENABLE_MANAGEMENT: u32 = 43;
pub const PR_MPX_DISABLE_MANAGEMENT: u32 = 44;
pub const PR_SET_FP_MODE: u32 = 45;
pub const PR_GET_FP_MODE: u32 = 46;
pub const PR_FP_MODE_FR: u32 = 1;
pub const PR_FP_MODE_FRE: u32 = 2;
pub const PR_CAP_AMBIENT: u32 = 47;
pub const PR_CAP_AMBIENT_IS_SET: u32 = 1;
pub const PR_CAP_AMBIENT_RAISE: u32 = 2;
pub const PR_CAP_AMBIENT_LOWER: u32 = 3;
pub const PR_CAP_AMBIENT_CLEAR_ALL: u32 = 4;
pub const PR_SVE_SET_VL: u32 = 50;
pub const PR_SVE_SET_VL_ONEXEC: u32 = 262144;
pub const PR_SVE_GET_VL: u32 = 51;
pub const PR_SVE_VL_LEN_MASK: u32 = 65535;
pub const PR_SVE_VL_INHERIT: u32 = 131072;
pub const PR_GET_SPECULATION_CTRL: u32 = 52;
pub const PR_SET_SPECULATION_CTRL: u32 = 53;
pub const PR_SPEC_STORE_BYPASS: u32 = 0;
pub const PR_SPEC_INDIRECT_BRANCH: u32 = 1;
pub const PR_SPEC_L1D_FLUSH: u32 = 2;
pub const PR_SPEC_NOT_AFFECTED: u32 = 0;
pub const PR_SPEC_PRCTL: u32 = 1;
pub const PR_SPEC_ENABLE: u32 = 2;
pub const PR_SPEC_DISABLE: u32 = 4;
pub const PR_SPEC_FORCE_DISABLE: u32 = 8;
pub const PR_SPEC_DISABLE_NOEXEC: u32 = 16;
pub const PR_PAC_RESET_KEYS: u32 = 54;
pub const PR_PAC_APIAKEY: u32 = 1;
pub const PR_PAC_APIBKEY: u32 = 2;
pub const PR_PAC_APDAKEY: u32 = 4;
pub const PR_PAC_APDBKEY: u32 = 8;
pub const PR_PAC_APGAKEY: u32 = 16;
pub const PR_SET_TAGGED_ADDR_CTRL: u32 = 55;
pub const PR_GET_TAGGED_ADDR_CTRL: u32 = 56;
pub const PR_TAGGED_ADDR_ENABLE: u32 = 1;
pub const PR_MTE_TCF_NONE: u32 = 0;
pub const PR_MTE_TCF_SYNC: u32 = 2;
pub const PR_MTE_TCF_ASYNC: u32 = 4;
pub const PR_MTE_TCF_MASK: u32 = 6;
pub const PR_MTE_TAG_SHIFT: u32 = 3;
pub const PR_MTE_TAG_MASK: u32 = 524280;
pub const PR_MTE_TCF_SHIFT: u32 = 1;
pub const PR_SET_IO_FLUSHER: u32 = 57;
pub const PR_GET_IO_FLUSHER: u32 = 58;
pub const PR_SET_SYSCALL_USER_DISPATCH: u32 = 59;
pub const PR_SYS_DISPATCH_OFF: u32 = 0;
pub const PR_SYS_DISPATCH_ON: u32 = 1;
pub const SYSCALL_DISPATCH_FILTER_ALLOW: u32 = 0;
pub const SYSCALL_DISPATCH_FILTER_BLOCK: u32 = 1;
pub const PR_PAC_SET_ENABLED_KEYS: u32 = 60;
pub const PR_PAC_GET_ENABLED_KEYS: u32 = 61;
pub const PR_SCHED_CORE: u32 = 62;
pub const PR_SCHED_CORE_GET: u32 = 0;
pub const PR_SCHED_CORE_CREATE: u32 = 1;
pub const PR_SCHED_CORE_SHARE_TO: u32 = 2;
pub const PR_SCHED_CORE_SHARE_FROM: u32 = 3;
pub const PR_SCHED_CORE_MAX: u32 = 4;
pub const PR_SCHED_CORE_SCOPE_THREAD: u32 = 0;
pub const PR_SCHED_CORE_SCOPE_THREAD_GROUP: u32 = 1;
pub const PR_SCHED_CORE_SCOPE_PROCESS_GROUP: u32 = 2;
pub const PR_SME_SET_VL: u32 = 63;
pub const PR_SME_SET_VL_ONEXEC: u32 = 262144;
pub const PR_SME_GET_VL: u32 = 64;
pub const PR_SME_VL_LEN_MASK: u32 = 65535;
pub const PR_SME_VL_INHERIT: u32 = 131072;
pub const PR_SET_MDWE: u32 = 65;
pub const PR_MDWE_REFUSE_EXEC_GAIN: u32 = 1;
pub const PR_GET_MDWE: u32 = 66;
pub const PR_SET_VMA: u32 = 1398164801;
pub const PR_SET_VMA_ANON_NAME: u32 = 0;
