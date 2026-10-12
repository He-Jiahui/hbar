//! AppContainer child processes with an explicit inherited-handle list and a
//! kill-on-close Job Object. Root ACL grants in this unit are scoped to roots
//! passed by the caller and restored when the owned process is released.

use crate::{HbarPermissionProfile, SandboxedProcessHandle};
use napi_derive::napi;
use std::collections::HashMap;
use std::io;
use std::mem::{size_of, zeroed};
use std::net::{TcpListener, UdpSocket};
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, HANDLE, INVALID_HANDLE_VALUE, STILL_ACTIVE,
    WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::Authorization::REVOKE_ACCESS;
use windows_sys::Win32::Security::Authorization::{
    GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
    GRANT_ACCESS, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile,
};
use windows_sys::Win32::Security::{
    CONTAINER_INHERIT_ACE, DACL_SECURITY_INFORMATION, OBJECT_INHERIT_ACE, SECURITY_ATTRIBUTES,
    SECURITY_CAPABILITIES, SID_AND_ATTRIBUTES,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, FILE_ATTRIBUTE_NORMAL, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ,
    FILE_GENERIC_WRITE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::Environment::{FreeEnvironmentStringsW, GetEnvironmentStringsW};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Pipes::{CreatePipe, PeekNamedPipe};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, GetExitCodeProcess, InitializeProcThreadAttributeList, ResumeThread,
    UpdateProcThreadAttribute, WaitForSingleObject, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT,
    EXTENDED_STARTUPINFO_PRESENT, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, STARTF_USESTDHANDLES, STARTUPINFOEXW,
};

const MAX_OUTPUT_CHUNK: usize = 64 * 1024;

#[napi(object)]
#[derive(Clone)]
pub struct SandboxProbeCapabilities {
    pub available: bool,
    pub filesystem: bool,
    pub network: bool,
    pub process_tree: bool,
    pub reason: Option<String>,
}

struct RootAclLease {
    path: Vec<u16>,
    sid: Vec<u8>,
}
unsafe impl Send for RootAclLease {}
impl RootAclLease {
    unsafe fn grant(path: &str, sid: *mut core::ffi::c_void, access: u32) -> io::Result<Self> {
        let canonical = std::fs::canonicalize(path)?;
        if !canonical.is_dir() || std::fs::read_dir(&canonical)?.next().is_some() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "native root grants currently require an empty existing directory",
            ));
        }
        let path = canonical.to_string_lossy().into_owned();
        let wide_path = wide(&path);
        let (mut owner, mut group, mut old_dacl, mut sacl, mut descriptor) =
            (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
        let result = GetNamedSecurityInfoW(
            wide_path.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut old_dacl,
            &mut sacl,
            &mut descriptor,
        );
        if result != 0 {
            return Err(io::Error::from_raw_os_error(result as i32));
        }
        if old_dacl.is_null() {
            LocalFree(descriptor);
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "refusing to lease a null DACL",
            ));
        }
        let sid_len = windows_sys::Win32::Security::GetLengthSid(sid) as usize;
        if sid_len == 0 {
            LocalFree(descriptor);
            return Err(io::Error::last_os_error());
        }
        let mut sid_copy = vec![0u8; sid_len];
        if windows_sys::Win32::Security::CopySid(sid_len as u32, sid_copy.as_mut_ptr().cast(), sid)
            == 0
        {
            LocalFree(descriptor);
            return Err(io::Error::last_os_error());
        }
        let trustee = TRUSTEE_W {
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid.cast(),
            ..Default::default()
        };
        let entry = EXPLICIT_ACCESS_W {
            grfAccessPermissions: access,
            grfAccessMode: GRANT_ACCESS,
            grfInheritance: CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE,
            Trustee: trustee,
        };
        let mut new_dacl = null_mut();
        let result = SetEntriesInAclW(1, &entry, old_dacl, &mut new_dacl);
        if result != 0 {
            LocalFree(descriptor);
            return Err(io::Error::from_raw_os_error(result as i32));
        }
        let result = SetNamedSecurityInfoW(
            wide_path.as_ptr() as *mut u16,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            new_dacl,
            null_mut(),
        );
        if result != 0 {
            LocalFree(new_dacl.cast());
            LocalFree(descriptor);
            return Err(io::Error::from_raw_os_error(result as i32));
        }
        LocalFree(new_dacl.cast());
        LocalFree(descriptor);
        Ok(Self {
            path: wide_path,
            sid: sid_copy,
        })
    }
}
impl Drop for RootAclLease {
    fn drop(&mut self) {
        unsafe {
            let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
                (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
            let result = GetNamedSecurityInfoW(
                self.path.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                &mut owner,
                &mut group,
                &mut dacl,
                &mut sacl,
                &mut descriptor,
            );
            if result == 0 && !dacl.is_null() {
                let trustee = TRUSTEE_W {
                    TrusteeForm: TRUSTEE_IS_SID,
                    TrusteeType: TRUSTEE_IS_UNKNOWN,
                    ptstrName: self.sid.as_ptr() as *mut u16,
                    ..Default::default()
                };
                let entry = EXPLICIT_ACCESS_W {
                    grfAccessPermissions: 0,
                    grfAccessMode: REVOKE_ACCESS,
                    grfInheritance: CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE,
                    Trustee: trustee,
                };
                let mut cleaned = null_mut();
                if SetEntriesInAclW(1, &entry, dacl, &mut cleaned) == 0 {
                    let _ = SetNamedSecurityInfoW(
                        self.path.as_ptr() as *mut u16,
                        SE_FILE_OBJECT,
                        DACL_SECURITY_INFORMATION,
                        null_mut(),
                        null_mut(),
                        cleaned,
                        null_mut(),
                    );
                    LocalFree(cleaned.cast());
                }
            }
            if !descriptor.is_null() {
                LocalFree(descriptor);
            }
        }
    }
}

struct Child {
    process: HANDLE,
    thread: HANDLE,
    job: HANDLE,
    stdout: HANDLE,
    stderr: HANDLE,
    root_exit_code: Option<i32>,
    termination_sent: bool,
    _profile: AppContainerProfile,
    _leases: Vec<RootAclLease>,
}
unsafe impl Send for Child {}
impl Drop for Child {
    fn drop(&mut self) {
        unsafe {
            if !self.job.is_null() {
                CloseHandle(self.job);
            }
            for handle in [self.process, self.thread, self.stdout, self.stderr] {
                if !handle.is_null() && handle != INVALID_HANDLE_VALUE {
                    CloseHandle(handle);
                }
            }
        }
    }
}
struct AppContainerProfile {
    name: Vec<u16>,
    sid: *mut core::ffi::c_void,
}
unsafe impl Send for AppContainerProfile {}
impl Drop for AppContainerProfile {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteAppContainerProfile(self.name.as_ptr());
            if !self.sid.is_null() {
                LocalFree(self.sid);
            }
        }
    }
}
struct AppContainerCapabilities {
    groups: Vec<*mut *mut core::ffi::c_void>,
    group_counts: Vec<u32>,
    capability_arrays: Vec<*mut *mut core::ffi::c_void>,
    capability_counts: Vec<u32>,
    attributes: Vec<SID_AND_ATTRIBUTES>,
}
impl AppContainerCapabilities {
    fn network(enabled: bool) -> io::Result<Self> {
        let mut owned = Self {
            groups: Vec::new(),
            group_counts: Vec::new(),
            capability_arrays: Vec::new(),
            capability_counts: Vec::new(),
            attributes: Vec::new(),
        };
        if !enabled {
            return Ok(owned);
        }
        for name in ["internetClient", "privateNetworkClientServer"] {
            let name_wide = wide(name);
            let (mut groups, mut group_count, mut capabilities, mut capability_count) =
                (null_mut(), 0, null_mut(), 0);
            if unsafe {
                windows_sys::Win32::Security::DeriveCapabilitySidsFromName(
                    name_wide.as_ptr(),
                    &mut groups,
                    &mut group_count,
                    &mut capabilities,
                    &mut capability_count,
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
            if capabilities.is_null() || capability_count != 1 {
                unsafe {
                    free_sid_array(groups, group_count);
                    free_sid_array(capabilities, capability_count);
                }
                return Err(io::Error::new(
                    io::ErrorKind::Unsupported,
                    "Windows did not resolve the requested AppContainer network capability",
                ));
            }
            let sid = unsafe { *capabilities };
            owned.attributes.push(SID_AND_ATTRIBUTES {
                Sid: sid,
                Attributes: 0x0000_0004,
            });
            owned.groups.push(groups);
            owned.group_counts.push(group_count);
            owned.capability_arrays.push(capabilities);
            owned.capability_counts.push(capability_count);
        }
        Ok(owned)
    }
}
unsafe fn free_sid_array(array: *mut *mut core::ffi::c_void, count: u32) {
    if array.is_null() {
        return;
    }
    for index in 0..count {
        LocalFree(*array.add(index as usize));
    }
    LocalFree(array.cast());
}
impl Drop for AppContainerCapabilities {
    fn drop(&mut self) {
        unsafe {
            for (array, count) in self.groups.iter().zip(&self.group_counts) {
                free_sid_array(*array, *count);
            }
            for (array, count) in self.capability_arrays.iter().zip(&self.capability_counts) {
                free_sid_array(*array, *count);
            }
        }
    }
}
static CHILDREN: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
fn children() -> &'static Mutex<HashMap<String, Child>> {
    CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
fn quote_arg(value: &str) -> String {
    if !value.is_empty() && !value.chars().any(|ch| ch.is_whitespace() || ch == '"') {
        return value.to_owned();
    }
    let mut out = String::from("\"");
    let mut slashes = 0;
    for ch in value.chars() {
        if ch == '\\' {
            slashes += 1;
        } else if ch == '"' {
            out.push_str(&"\\".repeat(slashes * 2 + 1));
            out.push(ch);
            slashes = 0;
        } else {
            out.push_str(&"\\".repeat(slashes));
            slashes = 0;
            out.push(ch);
        }
    }
    out.push_str(&"\\".repeat(slashes * 2));
    out.push('"');
    out
}
fn environment_block(overrides: &HashMap<String, String>) -> io::Result<Vec<u16>> {
    let mut entries = Vec::<Vec<u16>>::new();
    let environment = unsafe { GetEnvironmentStringsW() };
    if environment.is_null() {
        return Err(io::Error::last_os_error());
    }
    let mut cursor = environment;
    unsafe {
        while *cursor != 0 {
            let start = cursor;
            while *cursor != 0 {
                cursor = cursor.add(1);
            }
            let entry =
                std::slice::from_raw_parts(start, cursor.offset_from(start) as usize).to_vec();
            let separator = entry.iter().position(|unit| *unit == '=' as u16);
            let is_drive_current_directory = separator == Some(0);
            let safe_names = [
                "PATH",
                "PATHEXT",
                "SYSTEMROOT",
                "WINDIR",
                "COMSPEC",
                "TEMP",
                "TMP",
                "SYSTEMDRIVE",
                "USERPROFILE",
                "HOMEDRIVE",
                "HOMEPATH",
                "APPDATA",
                "LOCALAPPDATA",
                "PROGRAMDATA",
                "PROGRAMFILES",
                "PROGRAMFILES(X86)",
                "COMMONPROGRAMFILES",
                "COMMONPROGRAMFILES(X86)",
                "COMMONPROGRAMW6432",
                "OS",
                "PROCESSOR_ARCHITECTURE",
                "PROCESSOR_IDENTIFIER",
                "PROCESSOR_LEVEL",
                "PROCESSOR_REVISION",
                "NUMBER_OF_PROCESSORS",
                "PSMODULEPATH",
                "PUBLIC",
                "ALLUSERSPROFILE",
                "COMPUTERNAME",
                "USERDOMAIN",
                "USERDOMAIN_ROAMINGPROFILE",
            ];
            if is_drive_current_directory
                || separator.is_some_and(|position| {
                    let name = String::from_utf16_lossy(&entry[..position]);
                    safe_names
                        .iter()
                        .any(|allowed| name.eq_ignore_ascii_case(allowed))
                })
            {
                entries.push(entry);
            }
            cursor = cursor.add(1);
        }
        if FreeEnvironmentStringsW(environment) == 0 {
            return Err(io::Error::last_os_error());
        }
    }
    for (name, value) in overrides {
        if name.is_empty()
            || name.contains('=')
            || name.contains('\0')
            || value.contains('\0')
            || matches!(
                name.to_ascii_uppercase().as_str(),
                "PATH"
                    | "PATHEXT"
                    | "SYSTEMROOT"
                    | "WINDIR"
                    | "COMSPEC"
                    | "NODE_OPTIONS"
                    | "BASH_ENV"
                    | "ENV"
            )
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "unsafe environment override",
            ));
        }
        entries.retain(|entry| {
            let separator = environment_name_end(entry);
            !String::from_utf16_lossy(&entry[..separator]).eq_ignore_ascii_case(name)
        });
        let mut entry = name.encode_utf16().collect::<Vec<_>>();
        entry.push('=' as u16);
        entry.extend(value.encode_utf16());
        entries.push(entry);
    }
    entries.sort_by(|left, right| {
        let left_name = environment_name_end(left);
        let right_name = environment_name_end(right);
        String::from_utf16_lossy(&left[..left_name])
            .to_ascii_uppercase()
            .cmp(&String::from_utf16_lossy(&right[..right_name]).to_ascii_uppercase())
    });
    let mut block = Vec::new();
    for entry in entries {
        block.extend(entry);
        block.push(0);
    }
    block.push(0);
    Ok(block)
}
fn environment_name_end(entry: &[u16]) -> usize {
    let separator = entry
        .iter()
        .position(|unit| *unit == '=' as u16)
        .unwrap_or(entry.len());
    if separator == 0 {
        entry
            .iter()
            .enumerate()
            .skip(1)
            .find_map(|(index, unit)| (*unit == '=' as u16).then_some(index))
            .unwrap_or(separator)
    } else {
        separator
    }
}
fn create_profile() -> io::Result<AppContainerProfile> {
    let name = wide(&format!("hbar.node.{}", uuid::Uuid::new_v4().simple()));
    let mut sid = null_mut();
    let result = unsafe {
        CreateAppContainerProfile(
            name.as_ptr(),
            name.as_ptr(),
            name.as_ptr(),
            null(),
            0,
            &mut sid,
        )
    };
    if result < 0 {
        return Err(io::Error::from_raw_os_error(result));
    }
    Ok(AppContainerProfile { name, sid })
}
unsafe fn make_pipe() -> io::Result<(HANDLE, HANDLE)> {
    let security = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: null_mut(),
        bInheritHandle: 1,
    };
    let (mut read, mut write) = (null_mut(), null_mut());
    if CreatePipe(&mut read, &mut write, &security, 0) == 0 {
        return Err(io::Error::last_os_error());
    }
    if windows_sys::Win32::Foundation::SetHandleInformation(read, 1, 0) == 0 {
        CloseHandle(read);
        CloseHandle(write);
        return Err(io::Error::last_os_error());
    }
    Ok((read, write))
}
unsafe fn spawn_inner(
    profile: &HbarPermissionProfile,
    argv: &[String],
    cwd: &str,
) -> io::Result<SandboxedProcessHandle> {
    if argv.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "argv must not be empty",
        ));
    }
    let app_container = create_profile().map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("create AppContainer profile: {error}"),
        )
    })?;
    let app_sid = app_container.sid;
    let capabilities = AppContainerCapabilities::network(profile.network_enabled)?;
    let environment = environment_block(&profile.env_overrides)?;
    let mut leases = Vec::new();
    let mut roots = HashMap::<String, bool>::new();
    for path in &profile.readable_roots {
        roots.insert(path.clone(), false);
    }
    for path in &profile.writable_roots {
        roots.insert(path.clone(), true);
    }
    for (path, writable) in roots {
        let rights = FILE_GENERIC_READ
            | FILE_GENERIC_EXECUTE
            | if writable { FILE_GENERIC_WRITE } else { 0 };
        leases.push(
            RootAclLease::grant(&path, app_sid, rights).map_err(|error| {
                io::Error::new(error.kind(), format!("lease root ACL {path}: {error}"))
            })?,
        );
    }
    let (stdout_read, stdout_write) = make_pipe()?;
    let (stderr_read, stderr_write) = match make_pipe() {
        Ok(pipe) => pipe,
        Err(error) => {
            CloseHandle(stdout_read);
            CloseHandle(stdout_write);
            return Err(error);
        }
    };
    let null_device = wide("NUL");
    let stdin_handle = CreateFileW(
        null_device.as_ptr(),
        FILE_GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        null(),
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        null_mut(),
    );
    if stdin_handle == INVALID_HANDLE_VALUE {
        CloseHandle(stdout_read);
        CloseHandle(stdout_write);
        CloseHandle(stderr_read);
        CloseHandle(stderr_write);
        return Err(io::Error::last_os_error());
    }
    if windows_sys::Win32::Foundation::SetHandleInformation(stdin_handle, 1, 1) == 0 {
        let error = io::Error::last_os_error();
        CloseHandle(stdin_handle);
        CloseHandle(stdout_read);
        CloseHandle(stdout_write);
        CloseHandle(stderr_read);
        CloseHandle(stderr_write);
        return Err(error);
    }
    let mut attribute_bytes = 0usize;
    let _ = InitializeProcThreadAttributeList(null_mut(), 2, 0, &mut attribute_bytes);
    if attribute_bytes == 0 {
        let error = io::Error::last_os_error();
        CloseHandle(stdin_handle);
        for handle in [stdout_read, stdout_write, stderr_read, stderr_write] {
            CloseHandle(handle);
        }
        return Err(error);
    }
    let mut attribute_storage = vec![0u8; attribute_bytes];
    let attributes = attribute_storage.as_mut_ptr().cast();
    if InitializeProcThreadAttributeList(attributes, 2, 0, &mut attribute_bytes) == 0 {
        let error = io::Error::last_os_error();
        CloseHandle(stdin_handle);
        for handle in [stdout_read, stdout_write, stderr_read, stderr_write] {
            CloseHandle(handle);
        }
        return Err(error);
    }
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = stdin_handle;
    startup.StartupInfo.hStdOutput = stdout_write;
    startup.StartupInfo.hStdError = stderr_write;
    startup.lpAttributeList = attributes;
    let security = SECURITY_CAPABILITIES {
        AppContainerSid: app_sid,
        Capabilities: if capabilities.attributes.is_empty() {
            null_mut::<SID_AND_ATTRIBUTES>()
        } else {
            capabilities.attributes.as_ptr() as *mut SID_AND_ATTRIBUTES
        },
        CapabilityCount: capabilities.attributes.len() as u32,
        Reserved: 0,
    };
    let inherited = [stdin_handle, stdout_write, stderr_write];
    if UpdateProcThreadAttribute(
        attributes,
        0,
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
        (&security as *const SECURITY_CAPABILITIES).cast(),
        size_of::<SECURITY_CAPABILITIES>(),
        null_mut(),
        null(),
    ) == 0
        || UpdateProcThreadAttribute(
            attributes,
            0,
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
            inherited.as_ptr().cast(),
            size_of_val(&inherited),
            null_mut(),
            null(),
        ) == 0
    {
        windows_sys::Win32::System::Threading::DeleteProcThreadAttributeList(attributes);
        CloseHandle(stdin_handle);
        CloseHandle(stdout_read);
        CloseHandle(stdout_write);
        CloseHandle(stderr_read);
        CloseHandle(stderr_write);
        return Err(io::Error::new(
            io::Error::last_os_error().kind(),
            format!("update process attributes: {}", io::Error::last_os_error()),
        ));
    }
    let mut command = wide(
        &argv
            .iter()
            .map(|arg| quote_arg(arg))
            .collect::<Vec<_>>()
            .join(" "),
    );
    let cwd = wide(cwd);
    let mut process_info: PROCESS_INFORMATION = zeroed();
    let created = CreateProcessW(
        null(),
        command.as_mut_ptr(),
        null(),
        null(),
        1,
        CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
        environment.as_ptr().cast(),
        cwd.as_ptr(),
        (&startup as *const STARTUPINFOEXW).cast(),
        &mut process_info,
    );
    let creation_error = if created == 0 { GetLastError() } else { 0 };
    windows_sys::Win32::System::Threading::DeleteProcThreadAttributeList(attributes);
    CloseHandle(stdin_handle);
    for handle in [stdout_write, stderr_write] {
        CloseHandle(handle);
    }
    if created == 0 {
        for handle in [stdout_read, stderr_read] {
            CloseHandle(handle);
        }
        return Err(io::Error::other(format!(
            "create AppContainer process failed with Win32 error {creation_error}"
        )));
    }
    let job = CreateJobObjectW(null(), null());
    if job.is_null() {
        windows_sys::Win32::System::Threading::TerminateProcess(process_info.hProcess, 1);
        CloseHandle(process_info.hThread);
        CloseHandle(process_info.hProcess);
        for handle in [stdout_read, stderr_read] {
            CloseHandle(handle);
        }
        return Err(io::Error::last_os_error());
    }
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if SetInformationJobObject(
        job,
        JobObjectExtendedLimitInformation,
        (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
        size_of_val(&limits) as u32,
    ) == 0
        || AssignProcessToJobObject(job, process_info.hProcess) == 0
    {
        TerminateJobObject(job, 1);
        CloseHandle(job);
        CloseHandle(process_info.hThread);
        CloseHandle(process_info.hProcess);
        for handle in [stdout_read, stderr_read] {
            CloseHandle(handle);
        }
        return Err(io::Error::last_os_error());
    }
    if ResumeThread(process_info.hThread) == u32::MAX {
        TerminateJobObject(job, 1);
        CloseHandle(job);
        CloseHandle(process_info.hThread);
        CloseHandle(process_info.hProcess);
        for handle in [stdout_read, stderr_read] {
            CloseHandle(handle);
        }
        return Err(io::Error::last_os_error());
    }
    let handle_id = uuid::Uuid::new_v4().to_string();
    let pid = process_info.dwProcessId;
    children()
        .lock()
        .map_err(|_| io::Error::other("process registry is poisoned"))?
        .insert(
            handle_id.clone(),
            Child {
                process: process_info.hProcess,
                thread: process_info.hThread,
                job,
                stdout: stdout_read,
                stderr: stderr_read,
                root_exit_code: None,
                termination_sent: false,
                _profile: app_container,
                _leases: leases,
            },
        );
    Ok(SandboxedProcessHandle { pid, handle_id })
}

pub async fn spawn_sandboxed_impl(
    profile: HbarPermissionProfile,
    argv: Vec<String>,
    cwd: String,
) -> napi::Result<SandboxedProcessHandle> {
    unsafe { spawn_inner(&profile, &argv, &cwd) }
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi(object)]
pub struct ProcessPoll {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}
unsafe fn read_available(handle: HANDLE) -> io::Result<String> {
    if handle.is_null() {
        return Ok(String::new());
    }
    let mut available = 0u32;
    if PeekNamedPipe(
        handle,
        null_mut(),
        0,
        null_mut(),
        &mut available,
        null_mut(),
    ) == 0
    {
        let code = GetLastError();
        if code == 109 {
            return Ok(String::new());
        }
        return Err(io::Error::from_raw_os_error(code as i32));
    }
    let count = (available as usize).min(MAX_OUTPUT_CHUNK);
    if count == 0 {
        return Ok(String::new());
    }
    let mut bytes = vec![0u8; count];
    let mut read = 0u32;
    if ReadFile(
        handle,
        bytes.as_mut_ptr(),
        count as u32,
        &mut read,
        null_mut(),
    ) == 0
    {
        return Err(io::Error::last_os_error());
    }
    bytes.truncate(read as usize);
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
fn poll_native(handle_id: &str) -> io::Result<ProcessPoll> {
    let mut registry = children()
        .lock()
        .map_err(|_| io::Error::other("process registry is poisoned"))?;
    let child = registry
        .get_mut(handle_id)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "unknown sandbox process"))?;
    let stdout = unsafe { read_available(child.stdout) }?;
    let stderr = unsafe { read_available(child.stderr) }?;
    let wait = unsafe { WaitForSingleObject(child.process, 0) };
    if wait == WAIT_OBJECT_0 && child.root_exit_code.is_none() {
        let mut code = STILL_ACTIVE as u32;
        if unsafe { GetExitCodeProcess(child.process, &mut code) } == 0 {
            return Err(io::Error::last_os_error());
        }
        child.root_exit_code = Some(code as i32);
    } else if wait == WAIT_TIMEOUT {
    } else if wait != WAIT_OBJECT_0 {
        return Err(io::Error::last_os_error());
    }

    let active_processes = unsafe {
        let mut accounting: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = zeroed();
        if QueryInformationJobObject(
            child.job,
            JobObjectBasicAccountingInformation,
            (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
            size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
            null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        accounting.ActiveProcesses
    };
    if child.root_exit_code.is_some() && active_processes > 0 && !child.termination_sent {
        if unsafe { TerminateJobObject(child.job, 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        child.termination_sent = true;
    }
    let exit_code = child
        .root_exit_code
        .filter(|_| active_processes == 0 && stdout.is_empty() && stderr.is_empty());
    if exit_code.is_some() {
        registry.remove(handle_id);
    }
    Ok(ProcessPoll {
        stdout,
        stderr,
        exit_code,
    })
}
#[napi]
pub fn poll_sandboxed(handle_id: String) -> napi::Result<ProcessPoll> {
    poll_native(&handle_id).map_err(|error| napi::Error::from_reason(error.to_string()))
}
#[napi]
pub fn terminate_sandboxed(handle_id: String) -> napi::Result<()> {
    let registry = children()
        .lock()
        .map_err(|_| napi::Error::from_reason("process registry is poisoned"))?;
    let child = registry
        .get(&handle_id)
        .ok_or_else(|| napi::Error::from_reason("process registry is poisoned"))?;
    if unsafe { TerminateJobObject(child.job, 1) } == 0 {
        return Err(napi::Error::from_reason(
            io::Error::last_os_error().to_string(),
        ));
    }
    Ok(())
}

fn ps_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace("'", "''"))
}

fn run_probe(
    profile: &HbarPermissionProfile,
    argv: Vec<String>,
    cwd: &str,
    timeout: Duration,
) -> io::Result<(i32, String, String)> {
    let child = unsafe { spawn_inner(profile, &argv, cwd) }?;
    let deadline = Instant::now() + timeout;
    let (mut stdout, mut stderr) = (String::new(), String::new());
    loop {
        let result = poll_native(&child.handle_id)?;
        stdout.push_str(&result.stdout);
        stderr.push_str(&result.stderr);
        if let Some(code) = result.exit_code {
            if result.stdout.is_empty() && result.stderr.is_empty() {
                return Ok((code, stdout, stderr));
            }
        }
        if Instant::now() >= deadline {
            {
                let registry = children()
                    .lock()
                    .map_err(|_| io::Error::other("process registry is poisoned"))?;
                if let Some(process) = registry.get(&child.handle_id) {
                    if unsafe { TerminateJobObject(process.job, 1) } == 0 {
                        return Err(io::Error::other(format!(
                            "probe timeout and Job Object termination failed: {}",
                            io::Error::last_os_error()
                        )));
                    }
                }
            }
            let cleanup_deadline = Instant::now() + Duration::from_secs(3);
            while Instant::now() < cleanup_deadline {
                if poll_native(&child.handle_id).is_err() {
                    break;
                }
                if !children()
                    .lock()
                    .map_err(|_| io::Error::other("process registry is poisoned"))?
                    .contains_key(&child.handle_id)
                {
                    break;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
            if children()
                .lock()
                .map_err(|_| io::Error::other("process registry is poisoned"))?
                .contains_key(&child.handle_id)
            {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "probe timed out and its process/ACL lease did not clean up",
                ));
            }
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "AppContainer capability probe timed out",
            ));
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}

fn probe_uncached() -> SandboxProbeCapabilities {
    let mut result = SandboxProbeCapabilities {
        available: false,
        filesystem: false,
        network: false,
        process_tree: false,
        reason: None,
    };
    let data_root = std::env::temp_dir().join(format!(
        "hbar-appcontainer-probe-{}",
        uuid::Uuid::new_v4().simple()
    ));
    let mut created_root = false;
    let setup = (|| -> io::Result<(PathBuf, PathBuf, PathBuf, PathBuf)> {
        std::fs::create_dir(&data_root)?;
        created_root = true;
        let fs_root = data_root.join("filesystem");
        let network_root = data_root.join("network");
        let network_enabled_root = data_root.join("network-enabled");
        std::fs::create_dir(&fs_root)?;
        std::fs::create_dir(&network_root)?;
        std::fs::create_dir(&network_enabled_root)?;
        let sentinel = data_root.join("protected-sentinel.txt");
        std::fs::write(&sentinel, "hbar-protected-sentinel")?;
        Ok((fs_root, network_root, network_enabled_root, sentinel))
    })();
    let Ok((fs_root, network_root, network_enabled_root, sentinel)) = setup else {
        result.reason = Some("Could not create private Windows sandbox probe paths".to_owned());
        if created_root && std::fs::remove_dir_all(&data_root).is_err() {
            result.reason = Some("Probe setup failed and its private Windows sandbox directory could not be cleaned up".to_owned());
        }
        return result;
    };
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_owned());
    let powershell = PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    let make_profile = |root: &Path, network_enabled| HbarPermissionProfile {
        workspace_root: root.to_string_lossy().into_owned(),
        writable_roots: vec![root.to_string_lossy().into_owned()],
        readable_roots: vec![root.to_string_lossy().into_owned()],
        network_enabled,
        env_overrides: HashMap::new(),
        level: crate::SandboxLevel::Unelevated,
    };
    let writable = fs_root.join("write-check.txt");
    let filesystem_script = format!(
        "$ErrorActionPreference='Stop'; Set-Content -LiteralPath {} -Value 'hbar-write-ok' -NoNewline; Write-Output 'hbar-probe-output'; try {{ $value=Get-Content -LiteralPath {} -Raw; if ($value -eq 'hbar-protected-sentinel') {{ exit 41 }} else {{ exit 42 }} }} catch {{ exit 0 }}",
        ps_quote(&writable), ps_quote(&sentinel)
    );
    let fs_test = run_probe(
        &make_profile(&fs_root, false),
        vec![
            powershell.to_string_lossy().into_owned(),
            "-NoLogo".into(),
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-Command".into(),
            filesystem_script,
        ],
        &fs_root.to_string_lossy(),
        Duration::from_secs(8),
    );
    if let Ok((code, stdout, _)) = fs_test {
        result.filesystem = code == 0
            && stdout.contains("hbar-probe-output")
            && std::fs::read_to_string(&writable).is_ok_and(|value| value == "hbar-write-ok");
    }

    let host_ip = UdpSocket::bind(("0.0.0.0", 0))
        .and_then(|socket| {
            socket.connect(("192.0.2.1", 9))?;
            socket.local_addr().map(|address| address.ip())
        })
        .ok();
    let network_listener = host_ip
        .map(|ip| TcpListener::bind((ip, 0)))
        .unwrap_or_else(|| Err(io::Error::other("could not determine local IPv4 address")));
    let network_test = network_listener.and_then(|listener| {
        let address = listener.local_addr()?;
        listener.set_nonblocking(true)?;
        let script = format!(
            "$ErrorActionPreference='Stop'; $client=[System.Net.Sockets.TcpClient]::new(); try {{ $task=$client.ConnectAsync('{}', {}); if (!$task.Wait(1500)) {{ Write-Output 'hbar-network-denied:timeout'; exit 45 }}; $task.GetAwaiter().GetResult(); Write-Output 'hbar-network-denied:connected'; exit 41 }} catch [System.Net.Sockets.SocketException] {{ if ($_.Exception.SocketErrorCode -eq [System.Net.Sockets.SocketError]::AccessDenied) {{ Write-Output 'hbar-network-denied:AccessDenied'; exit 0 }}; Write-Output ('hbar-network-denied:' + $_.Exception.SocketErrorCode); exit 43 }} catch {{ Write-Output 'hbar-network-denied:unexpected'; exit 44 }}",
            address.ip(), address.port()
        );
        let outcome = run_probe(
            &make_profile(&network_root, false),
            vec![powershell.to_string_lossy().into_owned(), "-NoLogo".into(), "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(), script],
            &network_root.to_string_lossy(),
            Duration::from_secs(5),
        )?;
        Ok((outcome, listener))
    });
    let network_denied = match network_test {
        Ok(((0, stdout, _), listener)) if stdout.contains("hbar-network-denied:AccessDenied") => {
            let deadline = Instant::now() + Duration::from_millis(250);
            let mut accepted = false;
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok(_) => {
                        accepted = true;
                        break;
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10))
                    }
                    Err(_) => {
                        accepted = true;
                        break;
                    }
                }
            }
            !accepted
        }
        Ok(((code, stdout, stderr), _)) => {
            result.reason = Some(format!(
                "The no-network AppContainer probe expected AccessDenied; exit={code}, stdout={}, stderr={}",
                stdout.chars().take(120).collect::<String>(),
                stderr.chars().take(180).collect::<String>()
            ));
            false
        }
        Err(error) => {
            result.reason = Some(format!("The no-network AppContainer probe failed: {error}"));
            false
        }
    };
    let network_enabled_listener = host_ip
        .map(|ip| TcpListener::bind((ip, 0)))
        .unwrap_or_else(|| Err(io::Error::other("could not determine local IPv4 address")));
    let network_enabled_test = network_enabled_listener.and_then(|listener| {
        listener.set_nonblocking(true)?;
        let address = listener.local_addr()?;
        let accept = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(4);
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        use std::io::Read;
                        if stream.set_read_timeout(Some(Duration::from_secs(2))).is_err() {
                            return false;
                        }
                        let mut payload = [0u8; 25];
                        return stream.read_exact(&mut payload).is_ok()
                            && &payload == b"hbar-network-handshake-ok";
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(10)),
                    Err(_) => return false,
                }
            }
            false
        });
        let script = format!(
            "$ErrorActionPreference='Stop'; $client=[System.Net.Sockets.TcpClient]::new(); try {{ $task=$client.ConnectAsync('{}', {}); if (!$task.Wait(1500)) {{ exit 45 }}; $task.GetAwaiter().GetResult(); $bytes=[System.Text.Encoding]::ASCII.GetBytes('hbar-network-handshake-ok'); $client.GetStream().Write($bytes,0,$bytes.Length); Write-Output 'hbar-network-allowed:handshake-sent'; exit 0 }} catch {{ Write-Output 'hbar-network-allowed:failed'; exit 46 }}",
            address.ip(), address.port()
        );
        let process = run_probe(
            &make_profile(&network_enabled_root, true),
            vec![powershell.to_string_lossy().into_owned(), "-NoLogo".into(), "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(), script],
            &network_enabled_root.to_string_lossy(),
            Duration::from_secs(5),
        );
        let handshake_received = accept.join().unwrap_or(false);
        Ok((process, handshake_received))
    });
    let network_enabled = matches!(
        &network_enabled_test,
        Ok((Ok((0, stdout, _)), true)) if stdout.contains("hbar-network-allowed:handshake-sent")
    );
    result.network = network_denied && network_enabled;
    if !network_denied && result.reason.is_none() {
        result.reason = Some(
            "The no-network AppContainer probe did not produce an expected AccessDenied result"
                .to_owned(),
        );
    } else if !network_enabled {
        let detail = match network_enabled_test {
            Ok((Ok((code, stdout, stderr)), handshake)) => format!(
                "exit={code}, handshake={handshake}, stdout={}, stderr={}",
                stdout.chars().take(120).collect::<String>(),
                stderr.chars().take(180).collect::<String>()
            ),
            Ok((Err(error), handshake)) => format!("process error={error}, handshake={handshake}"),
            Err(error) => format!("listener error={error}"),
        };
        result.reason = Some(format!(
            "The network-enabled AppContainer probe did not complete a host listener handshake: {detail}"
        ));
    }

    let cleanup = std::fs::remove_dir_all(&data_root);
    if cleanup.is_err() {
        result.reason =
            Some("Could not clean up the private Windows sandbox probe directory".to_owned());
        result.filesystem = false;
        result.network = false;
    }
    result.process_tree = filesystem_has_job_support();
    result.available = result.filesystem && result.network && result.process_tree;
    if !result.available && result.reason.is_none() {
        result.reason =
            Some("A real AppContainer filesystem, network, or Job Object probe failed".to_owned());
    }
    result
}

fn filesystem_has_job_support() -> bool {
    let data_root = std::env::temp_dir().join(format!(
        "hbar-appcontainer-job-probe-{}",
        uuid::Uuid::new_v4().simple()
    ));
    if std::fs::create_dir(&data_root).is_err() {
        return false;
    }
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_owned());
    let powershell = PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    let profile = HbarPermissionProfile {
        workspace_root: data_root.to_string_lossy().into_owned(),
        writable_roots: vec![data_root.to_string_lossy().into_owned()],
        readable_roots: vec![data_root.to_string_lossy().into_owned()],
        network_enabled: false,
        env_overrides: HashMap::new(),
        level: crate::SandboxLevel::Unelevated,
    };
    let spawned = unsafe {
        spawn_inner(
            &profile,
            &[
                powershell.to_string_lossy().into_owned(),
                "-NoLogo".into(),
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-Command".into(),
                "Start-Sleep -Seconds 30".into(),
            ],
            &data_root.to_string_lossy(),
        )
    };
    let success = if let Ok(child) = spawned {
        let registry = children();
        let terminated = registry
            .lock()
            .ok()
            .and_then(|items| {
                items
                    .get(&child.handle_id)
                    .map(|item| unsafe { TerminateJobObject(item.job, 1) != 0 })
            })
            .unwrap_or(false);
        if terminated {
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                if let Ok(status) = poll_native(&child.handle_id) {
                    if status.exit_code.is_some()
                        && status.stdout.is_empty()
                        && status.stderr.is_empty()
                    {
                        break true;
                    }
                }
                if Instant::now() >= deadline {
                    break false;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        } else {
            false
        }
    } else {
        false
    };
    success && std::fs::remove_dir_all(&data_root).is_ok()
}

static PROBE_RESULT: OnceLock<SandboxProbeCapabilities> = OnceLock::new();
pub fn probe_confinement() -> SandboxProbeCapabilities {
    PROBE_RESULT.get_or_init(probe_uncached).clone()
}
