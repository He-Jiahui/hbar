use napi::{Error, Result};
use napi_derive::napi;

#[cfg(windows)]
mod memory_priority;

fn failure(message: impl Into<String>) -> Error {
    Error::from_reason(message.into())
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::mem::{size_of, zeroed};
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{GetLastError, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
        JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
        PROCESS_TERMINATE,
    };

    fn os_error(action: &str) -> Error {
        failure(format!("{action} failed (Windows error {})", unsafe {
            GetLastError()
        }))
    }

    fn owned_parent(pid: u32) -> Result<()> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(os_error("Process ownership query"));
        }
        let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
        let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut found = unsafe { Process32FirstW(snapshot.as_raw_handle(), &mut entry) };
        while found != 0 {
            if entry.th32ProcessID == pid {
                return if entry.th32ParentProcessID == std::process::id() {
                    Ok(())
                } else {
                    Err(failure(
                        "Process tree target is not a direct child of its owner",
                    ))
                };
            }
            found = unsafe { Process32NextW(snapshot.as_raw_handle(), &mut entry) };
        }
        Err(failure("Process tree target has exited"))
    }

    pub fn enter() -> Result<()> {
        Ok(())
    }
    pub fn terminate_self() -> Result<()> {
        Ok(())
    }
    pub fn ready(pid: u32) -> Result<bool> {
        owned_parent(pid)?;
        Ok(true)
    }

    pub struct Group {
        job: Option<OwnedHandle>,
    }
    impl Group {
        pub fn new(pid: u32) -> Result<Self> {
            if pid == 0 || pid == std::process::id() {
                return Err(failure("Invalid process tree target"));
            }
            let process = unsafe {
                OpenProcess(
                    PROCESS_SET_QUOTA | PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    pid,
                )
            };
            if process.is_null() {
                return Err(os_error("Owned process open"));
            }
            let process = unsafe { OwnedHandle::from_raw_handle(process) };
            owned_parent(pid)?;
            let mut code = 0;
            if unsafe { GetExitCodeProcess(process.as_raw_handle(), &mut code) } == 0 {
                return Err(os_error("Owned process state"));
            }
            if code != 259 {
                return Err(failure("Process tree target has exited"));
            }
            let job = unsafe { CreateJobObjectW(null(), null()) };
            if job.is_null() {
                return Err(os_error("Owned job creation"));
            }
            let job = unsafe { OwnedHandle::from_raw_handle(job) };
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if unsafe {
                SetInformationJobObject(
                    job.as_raw_handle(),
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            } == 0
            {
                return Err(os_error("Owned job lifecycle setup"));
            }
            if unsafe { AssignProcessToJobObject(job.as_raw_handle(), process.as_raw_handle()) }
                == 0
            {
                return Err(os_error("Owned process assignment"));
            }
            Ok(Self { job: Some(job) })
        }
        pub fn active(&self) -> Result<u32> {
            let Some(job) = &self.job else {
                return Ok(0);
            };
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { zeroed() };
            if unsafe {
                QueryInformationJobObject(
                    job.as_raw_handle(),
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut _,
                    size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    null_mut(),
                )
            } == 0
            {
                return Err(os_error("Owned job exit query"));
            }
            Ok(info.ActiveProcesses)
        }
        pub fn terminate(&self) -> Result<()> {
            if let Some(job) = &self.job {
                if self.active()? != 0
                    && unsafe { TerminateJobObject(job.as_raw_handle(), 76) } == 0
                {
                    return Err(os_error("Owned job termination"));
                }
            }
            Ok(())
        }
        pub fn close(&mut self) -> Result<()> {
            if self.active()? != 0 {
                return Err(failure("Owned process tree exit is unconfirmed"));
            }
            self.job.take();
            Ok(())
        }
    }
}

#[cfg(unix)]
mod platform {
    use super::*;
    struct Identity {
        parent: u32,
        group: u32,
        birth: String,
    }

    #[cfg(target_os = "linux")]
    fn identity(pid: u32) -> Result<Option<Identity>> {
        let data = match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(failure(format!("Process identity query failed: {error}"))),
        };
        let end = data
            .rfind(')')
            .ok_or_else(|| failure("Invalid process identity"))?;
        let fields: Vec<&str> = data[end + 1..].split_whitespace().collect();
        let number = |index: usize| -> Result<u32> {
            fields
                .get(index)
                .ok_or_else(|| failure("Incomplete process identity"))?
                .parse()
                .map_err(|_| failure("Invalid process identity field"))
        };
        Ok(Some(Identity {
            parent: number(1)?,
            group: number(2)?,
            birth: fields
                .get(19)
                .ok_or_else(|| failure("Missing process birth identity"))?
                .to_string(),
        }))
    }
    #[cfg(target_os = "macos")]
    fn identity(pid: u32) -> Result<Option<Identity>> {
        // ABI: Apple xnu bsd/sys/proc_info.h, proc_bsdinfo / PROC_PIDTBSDINFO.
        #[repr(C)]
        struct BsdInfo {
            flags: u32,
            status: u32,
            xstatus: u32,
            pid: u32,
            parent: u32,
            uid: u32,
            gid: u32,
            ruid: u32,
            rgid: u32,
            svuid: u32,
            svgid: u32,
            reserved: u32,
            comm: [u8; 16],
            name: [u8; 32],
            files: u32,
            group: u32,
            jobs: u32,
            device: u32,
            device_group: u32,
            nice: i32,
            birth_sec: u64,
            birth_usec: u64,
        }
        #[link(name = "proc")]
        extern "C" {
            fn proc_pidinfo(
                pid: i32,
                flavor: i32,
                arg: u64,
                buffer: *mut libc::c_void,
                size: i32,
            ) -> i32;
        }
        let mut info: BsdInfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<BsdInfo>();
        let result =
            unsafe { proc_pidinfo(pid as i32, 3, 0, &mut info as *mut _ as *mut _, size as i32) };
        if result == 0 && unsafe { libc::kill(pid as i32, 0) } != 0 {
            return Ok(None);
        }
        if result != size as i32 {
            return Err(failure("Process identity query failed"));
        }
        Ok(Some(Identity {
            parent: info.parent,
            group: info.group,
            birth: format!("{}:{}", info.birth_sec, info.birth_usec),
        }))
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    fn identity(_pid: u32) -> Result<Option<Identity>> {
        Err(failure(
            "Process tree identity is unavailable on this platform",
        ))
    }

    pub fn enter() -> Result<()> {
        if unsafe { libc::getpgrp() } == unsafe { libc::getpid() } {
            return Ok(());
        }
        if unsafe { libc::setsid() } < 0 {
            return Err(failure(format!(
                "Owned process session setup failed: {}",
                std::io::Error::last_os_error()
            )));
        }
        Ok(())
    }
    pub fn terminate_self() -> Result<()> {
        let pid = unsafe { libc::getpid() };
        if unsafe { libc::getpgrp() } != pid {
            return Err(failure("Runtime process does not own its group"));
        }
        if unsafe { libc::kill(-pid, libc::SIGKILL) } != 0 {
            return Err(failure("Owned process group exit failed"));
        }
        Ok(())
    }
    pub fn ready(pid: u32) -> Result<bool> {
        let info =
            identity(pid)?.ok_or_else(|| failure("Owned process exited before group setup"))?;
        if info.parent != std::process::id() {
            return Err(failure(
                "Process tree target is not a direct child of its owner",
            ));
        }
        Ok(info.group == pid)
    }
    pub struct Group {
        pid: u32,
        birth: String,
        closed: bool,
    }
    impl Group {
        pub fn new(pid: u32) -> Result<Self> {
            if pid == 0 || pid == std::process::id() || !ready(pid)? {
                return Err(failure("Invalid owned process group"));
            }
            let info =
                identity(pid)?.ok_or_else(|| failure("Owned process exited during group setup"))?;
            Ok(Self {
                pid,
                birth: info.birth,
                closed: false,
            })
        }
        pub fn active(&self) -> Result<u32> {
            if self.closed {
                return Ok(0);
            }
            if let Some(info) = identity(self.pid)? {
                if info.birth != self.birth {
                    return Ok(0);
                }
                if info.group != self.pid {
                    return Err(failure("Owned process group identity changed"));
                }
            }
            if unsafe { libc::kill(-(self.pid as i32), 0) } == 0 {
                return Ok(1);
            }
            if std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                Ok(0)
            } else {
                Err(failure("Owned process group exit cannot be queried"))
            }
        }
        pub fn terminate(&self) -> Result<()> {
            if self.active()? != 0
                && unsafe { libc::kill(-(self.pid as i32), libc::SIGKILL) } != 0
                && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
            {
                return Err(failure("Owned process group termination failed"));
            }
            Ok(())
        }
        pub fn close(&mut self) -> Result<()> {
            if self.active()? != 0 {
                return Err(failure("Owned process tree exit is unconfirmed"));
            }
            self.closed = true;
            Ok(())
        }
    }
    impl Drop for Group {
        fn drop(&mut self) {
            let _ = self.terminate();
        }
    }
}

#[napi]
pub fn enter_runtime_process_group() -> Result<()> {
    platform::enter()
}
#[napi]
pub fn terminate_runtime_process_group() -> Result<()> {
    platform::terminate_self()
}
#[napi]
pub fn runtime_process_group_ready(pid: u32) -> Result<bool> {
    platform::ready(pid)
}
#[napi]
pub struct RuntimeProcessTree {
    inner: platform::Group,
}
#[napi]
impl RuntimeProcessTree {
    #[napi(constructor)]
    pub fn new(pid: u32) -> Result<Self> {
        Ok(Self {
            inner: platform::Group::new(pid)?,
        })
    }
    #[napi]
    pub fn active(&self) -> Result<u32> {
        self.inner.active()
    }
    #[napi]
    pub fn terminate(&self) -> Result<()> {
        self.inner.terminate()
    }
    #[napi]
    pub fn close(&mut self) -> Result<()> {
        self.inner.close()
    }
}
