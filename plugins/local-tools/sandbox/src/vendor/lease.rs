//! Bounded, per-launch filesystem ACL leases and their crash journal.
//!
//! The journal root is supplied by the trusted host as a separate N-API argument. It is
//! deliberately not part of the permission profile that describes A's requested roots.

use crate::HbarPermissionProfile;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_TREE_ENTRIES: usize = 8192;
const MAX_TREE_DEPTH: usize = 64;
const MAX_JOURNAL_BYTES: u64 = 4 * 1024 * 1024;
const MAX_JOURNAL_RECORDS: usize = 512;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LeaseEntry {
    path: PathBuf,
    allow: u32,
    deny: u32,
    inherit: bool,
    protect: bool,
    was_protected: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct LeaseRecord {
    version: u32,
    app_container_name: String,
    job_name: String,
    sid: Vec<u8>,
    entries: Vec<LeaseEntry>,
}

pub struct FilesystemLease {
    journal_path: PathBuf,
    app_container_name: String,
    sid: Vec<u8>,
    entries: Vec<LeaseEntry>,
}

impl FilesystemLease {
    /// Validate and journal the complete ACL mutation plan before applying any ACE.
    pub unsafe fn acquire(
        profile: &HbarPermissionProfile,
        journal_root: &Path,
        app_container_name: String,
        job_name: String,
        app_sid: *mut core::ffi::c_void,
    ) -> io::Result<Self> {
        let mut entries = build_plan(profile)?;
        let sid = copy_sid(app_sid)?;
        let root = fs::canonicalize(journal_root)?;
        if !root.is_dir() || entries.iter().any(|entry| entry.path.starts_with(&root)) {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "lease journal must be an existing directory outside every authorized root",
            ));
        }
        let journal_was_protected = dacl_is_protected(&root)?;
        entries.push(LeaseEntry {
            path: root.clone(),
            allow: 0,
            deny: windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS,
            inherit: true,
            protect: true,
            was_protected: journal_was_protected,
        });
        recover_dead_leases(&root)?;
        let journal_path = root.join(format!("{}.json", Uuid::new_v4().simple()));
        let record = LeaseRecord {
            version: 1,
            app_container_name,
            job_name,
            sid: sid.clone(),
            entries: entries.clone(),
        };
        write_record(&journal_path, &record)?;
        let mut lease = Self {
            journal_path,
            app_container_name: record.app_container_name.clone(),
            sid,
            entries,
        };
        for entry in &lease.entries {
            if let Err(error) = apply_entry(entry, &lease.sid) {
                let cleanup = lease.release();
                return match cleanup {
                    Ok(()) => Err(error),
                    Err(cleanup_error) => Err(io::Error::other(format!(
                        "ACL lease failed ({error}) and rollback is incomplete ({cleanup_error})"
                    ))),
                };
            }
        }
        Ok(lease)
    }

    pub fn release(&mut self) -> io::Result<()> {
        let mut first_error = None;
        for entry in &self.entries {
            if let Err(error) = remove_sid_aces(&entry.path, &self.sid) {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
        if let Some(error) = first_error {
            return Err(error);
        }
        for entry in &self.entries {
            if entry.protect && !entry.was_protected {
                set_dacl_protected(&entry.path, false)?;
            }
        }
        delete_profile(&self.app_container_name)?;
        match fs::remove_file(&self.journal_path) {
            Ok(()) => sync_directory(self.journal_path.parent().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "journal has no parent")
            })?),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}

impl Drop for FilesystemLease {
    fn drop(&mut self) {
        let _ = self.release();
    }
}

/// Recover leases left behind by a crashed host. A named Job exists only while it has a
/// handle; a live job with processes retains its lease. A missing or empty job is dead.
pub fn recover_dead_leases(journal_root: &Path) -> io::Result<usize> {
    let root = fs::canonicalize(journal_root)?;
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "journal root is not a directory",
        ));
    }
    let mut recovered = 0;
    let items = fs::read_dir(&root)?.collect::<io::Result<Vec<_>>>()?;
    if items.len() > MAX_JOURNAL_RECORDS {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "lease journal record count exceeds recovery bound",
        ));
    }
    for item in items {
        let path = item.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        let metadata = item.metadata()?;
        if !metadata.is_file() || metadata.len() > MAX_JOURNAL_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid or oversized lease journal",
            ));
        }
        let record: LeaseRecord = serde_json::from_slice(&fs::read(&path)?).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("invalid lease journal: {error}"),
            )
        })?;
        validate_record(&record)?;
        if job_is_live(&record.job_name)? {
            continue;
        }
        for entry in &record.entries {
            remove_sid_aces(&entry.path, &record.sid)?;
        }
        for entry in &record.entries {
            if entry.protect && !entry.was_protected {
                set_dacl_protected(&entry.path, false)?;
            }
        }
        delete_profile(&record.app_container_name)?;
        fs::remove_file(&path)?;
        sync_directory(&root)?;
        recovered += 1;
    }
    Ok(recovered)
}

fn build_plan(profile: &HbarPermissionProfile) -> io::Result<Vec<LeaseEntry>> {
    if profile.readable_roots.len() + profile.writable_roots.len() > 64 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "too many ACL roots",
        ));
    }
    let mut roots = BTreeMap::<PathBuf, bool>::new();
    for path in &profile.readable_roots {
        roots.insert(canonical_existing(path)?, false);
    }
    for path in &profile.writable_roots {
        roots.insert(canonical_existing(path)?, true);
    }
    let mut entries = BTreeMap::<PathBuf, LeaseEntry>::new();
    for (root, writable) in &roots {
        let mut paths = Vec::new();
        collect_tree(root, 0, &mut paths)?;
        for (path, is_directory) in paths {
            let entry = entries.entry(path.clone()).or_insert(LeaseEntry {
                path,
                allow: 0,
                deny: 0,
                inherit: is_directory,
                protect: false,
                was_protected: false,
            });
            entry.allow |= windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_READ
                | windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_EXECUTE
                | if *writable {
                    windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE
                } else {
                    0
                };
            entry.inherit |= is_directory;
            if entries.len() > MAX_TREE_ENTRIES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "ACL lease exceeds total traversal bound",
                ));
            }
        }
    }
    for (paths, deny) in [
        (
            profile.protected_paths.as_deref().unwrap_or(&[]),
            windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS,
        ),
        (
            profile.read_only_paths.as_deref().unwrap_or(&[]),
            windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE
                & !(windows_sys::Win32::Storage::FileSystem::READ_CONTROL
                    | windows_sys::Win32::Storage::FileSystem::SYNCHRONIZE),
        ),
    ] {
        for raw in paths {
            let target = canonical_existing(raw)?;
            if !roots.keys().any(|root| target.starts_with(root)) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "protected/read-only path is outside authorized roots",
                ));
            }
            let mut subtree = Vec::new();
            collect_tree(&target, 0, &mut subtree)?;
            for (path, is_directory) in subtree {
                let entry = entries.get_mut(&path).ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "protected path is not within a leased root",
                    )
                })?;
                entry.deny |= deny;
                entry.allow &= !deny;
                entry.inherit |= is_directory;
                entry.protect = true;
                if entries.len() > MAX_TREE_ENTRIES {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "ACL lease exceeds total traversal bound",
                    ));
                }
            }
        }
    }
    for entry in entries.values_mut().filter(|entry| entry.protect) {
        entry.was_protected = dacl_is_protected(&entry.path)?;
    }
    Ok(entries.into_values().collect())
}

fn canonical_existing(path: &str) -> io::Result<PathBuf> {
    if path.trim().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "empty ACL path",
        ));
    }
    let original_metadata = fs::symlink_metadata(path)?;
    if is_reparse_point(&original_metadata) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "reparse points cannot be ACL lease roots",
        ));
    }
    let canonical = fs::canonicalize(path)?;
    let metadata = fs::symlink_metadata(&canonical)?;
    if is_reparse_point(&metadata) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "reparse points cannot be ACL lease roots",
        ));
    }
    Ok(canonical)
}

fn collect_tree(root: &Path, depth: usize, output: &mut Vec<(PathBuf, bool)>) -> io::Result<()> {
    if depth > MAX_TREE_DEPTH || output.len() >= MAX_TREE_ENTRIES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ACL lease tree exceeds traversal bounds",
        ));
    }
    let metadata = fs::symlink_metadata(root)?;
    if is_reparse_point(&metadata) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "reparse points cannot be traversed for an ACL lease",
        ));
    }
    let is_directory = metadata.is_dir();
    output.push((root.to_owned(), is_directory));
    if is_directory {
        let mut children = fs::read_dir(root)?
            .map(|item| item.map(|entry| entry.path()))
            .collect::<io::Result<Vec<_>>>()?;
        children.sort();
        for child in children {
            collect_tree(&child, depth + 1, output)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes()
        & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT
        != 0
}

#[cfg(not(windows))]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn write_record(path: &Path, record: &LeaseRecord) -> io::Result<()> {
    let bytes = serde_json::to_vec(record).map_err(io::Error::other)?;
    if bytes.len() as u64 > MAX_JOURNAL_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ACL lease journal exceeds size limit",
        ));
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    sync_directory(
        path.parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "journal has no parent"))?,
    )
}

fn sync_directory(path: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::ptr::{null, null_mut};
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FlushFileBuffers, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE,
            FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
        };
        let wide: Vec<u16> = path
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let handle = unsafe {
            CreateFileW(
                wide.as_ptr(),
                windows_sys::Win32::Foundation::GENERIC_READ
                    | windows_sys::Win32::Foundation::GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        let result = unsafe { FlushFileBuffers(handle) };
        let error = if result == 0 {
            Some(io::Error::last_os_error())
        } else {
            None
        };
        unsafe {
            CloseHandle(handle);
        }
        error.map_or(Ok(()), Err)
    }
    #[cfg(not(windows))]
    {
        std::fs::File::open(path)?.sync_all()
    }
}

fn validate_record(record: &LeaseRecord) -> io::Result<()> {
    if record.version != 1
        || record.sid.is_empty()
        || record.sid.len() > 68
        || record.app_container_name.len() > 256
        || record.job_name.len() > 256
        || record.entries.is_empty()
        || record.entries.len() > MAX_TREE_ENTRIES + 1
        || record.entries.iter().any(|entry| !entry.path.is_absolute())
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "lease journal fields exceed supported bounds",
        ));
    }
    let sid = record.sid.as_ptr().cast_mut().cast();
    if unsafe { windows_sys::Win32::Security::IsValidSid(sid) } == 0
        || unsafe { windows_sys::Win32::Security::GetLengthSid(sid) } as usize != record.sid.len()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "lease journal contains an invalid SID",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn job_is_live(job_name: &str) -> io::Result<bool> {
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::System::JobObjects::OpenJobObjectW;
    let name: Vec<u16> = job_name.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let job = OpenJobObjectW(
            windows_sys::Win32::System::SystemServices::JOB_OBJECT_QUERY,
            0,
            name.as_ptr(),
        );
        if job.is_null() {
            let error = GetLastError();
            return if error == 2 {
                Ok(false)
            } else {
                Err(io::Error::from_raw_os_error(error as i32))
            };
        }
        windows_sys::Win32::Foundation::CloseHandle(job);
        Ok(true)
    }
}

#[cfg(not(windows))]
fn job_is_live(_job_name: &str) -> io::Result<bool> {
    Ok(false)
}

#[cfg(windows)]
unsafe fn copy_sid(sid: *mut core::ffi::c_void) -> io::Result<Vec<u8>> {
    use windows_sys::Win32::Security::{CopySid, GetLengthSid};
    let length = GetLengthSid(sid) as usize;
    if length == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut bytes = vec![0; length];
    if CopySid(length as u32, bytes.as_mut_ptr().cast(), sid) == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(bytes)
}

#[cfg(windows)]
fn delete_profile(name: &str) -> io::Result<()> {
    let wide = crate::vendor::spawn::wide(name);
    let result = unsafe {
        windows_sys::Win32::Security::Isolation::DeleteAppContainerProfile(wide.as_ptr())
    };
    if result >= 0 || result == 0x8007_0002u32 as i32 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(result))
    }
}

#[cfg(windows)]
fn dacl_is_protected(path: &Path) -> io::Result<bool> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Security::Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT};
    use windows_sys::Win32::Security::{
        GetSecurityDescriptorControl, DACL_SECURITY_INFORMATION, SE_DACL_PROTECTED,
    };
    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
        (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
    let result = unsafe {
        GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut dacl,
            &mut sacl,
            &mut descriptor,
        )
    };
    if result != 0 {
        return Err(io::Error::from_raw_os_error(result as i32));
    }
    let (mut control, mut revision) = (0u16, 0u32);
    let success = unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) };
    unsafe {
        windows_sys::Win32::Foundation::LocalFree(descriptor);
    }
    if success == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(control & SE_DACL_PROTECTED != 0)
}

#[cfg(windows)]
fn set_dacl_protected(path: &Path, protect: bool) -> io::Result<()> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Security::Authorization::{
        GetNamedSecurityInfoW, SetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
        UNPROTECTED_DACL_SECURITY_INFORMATION,
    };
    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
        (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
    let result = unsafe {
        GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut dacl,
            &mut sacl,
            &mut descriptor,
        )
    };
    if result != 0 {
        return Err(io::Error::from_raw_os_error(result as i32));
    }
    if dacl.is_null() {
        unsafe {
            windows_sys::Win32::Foundation::LocalFree(descriptor);
        }
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "refusing to change protection on a null DACL",
        ));
    }
    let flag = DACL_SECURITY_INFORMATION
        | if protect {
            PROTECTED_DACL_SECURITY_INFORMATION
        } else {
            UNPROTECTED_DACL_SECURITY_INFORMATION
        };
    let result = unsafe {
        SetNamedSecurityInfoW(
            wide.as_ptr() as *mut u16,
            SE_FILE_OBJECT,
            flag,
            null_mut(),
            null_mut(),
            dacl,
            null_mut(),
        )
    };
    unsafe {
        windows_sys::Win32::Foundation::LocalFree(descriptor);
    }
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(result as i32))
    }
}

#[cfg(not(windows))]
fn dacl_is_protected(_path: &Path) -> io::Result<bool> {
    Ok(false)
}

#[cfg(not(windows))]
fn set_dacl_protected(_path: &Path, _protect: bool) -> io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
fn delete_profile(_name: &str) -> io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
unsafe fn copy_sid(_sid: *mut core::ffi::c_void) -> io::Result<Vec<u8>> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows ACLs are unavailable",
    ))
}

#[cfg(windows)]
fn apply_entry(entry: &LeaseEntry, sid: &[u8]) -> io::Result<()> {
    if entry.protect && !entry.was_protected {
        set_dacl_protected(&entry.path, true)?;
        // Writable ancestors can already have propagated this launch's ACE. Isolate the
        // narrowed subtree before adding only the rights its own policy allows.
        remove_sid_aces(&entry.path, sid)?;
    }
    if entry.allow != 0 {
        set_sid_ace(&entry.path, sid, entry.allow, false, entry.inherit)?;
    }
    if entry.deny != 0 {
        set_sid_ace(&entry.path, sid, entry.deny, true, entry.inherit)?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_entry(_entry: &LeaseEntry, _sid: &[u8]) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows ACLs are unavailable",
    ))
}

#[cfg(windows)]
fn set_sid_ace(path: &Path, sid: &[u8], mask: u32, deny: bool, inherit: bool) -> io::Result<()> {
    if deny {
        return insert_deny_sid_ace(path, sid, mask, inherit);
    }
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Authorization::{
        GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
        GRANT_ACCESS, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
    };
    use windows_sys::Win32::Security::{
        CONTAINER_INHERIT_ACE, DACL_SECURITY_INFORMATION, OBJECT_INHERIT_ACE,
    };
    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
        (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
    let result = unsafe {
        GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut dacl,
            &mut sacl,
            &mut descriptor,
        )
    };
    if result != 0 {
        return Err(io::Error::from_raw_os_error(result as i32));
    }
    if dacl.is_null() {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "refusing a null DACL",
        ));
    }
    let trustee = TRUSTEE_W {
        TrusteeForm: TRUSTEE_IS_SID,
        TrusteeType: TRUSTEE_IS_UNKNOWN,
        ptstrName: sid.as_ptr() as *mut u16,
        ..Default::default()
    };
    let flags = if inherit {
        CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE
    } else {
        0
    };
    let access = EXPLICIT_ACCESS_W {
        grfAccessPermissions: mask,
        grfAccessMode: GRANT_ACCESS,
        grfInheritance: flags,
        Trustee: trustee,
    };
    let mut replacement = null_mut();
    let result = unsafe { SetEntriesInAclW(1, &access, dacl, &mut replacement) };
    if result == 0 {
        let result = unsafe {
            SetNamedSecurityInfoW(
                wide.as_ptr() as *mut u16,
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                replacement,
                null_mut(),
            )
        };
        unsafe {
            LocalFree(replacement.cast());
            LocalFree(descriptor);
        }
        if result == 0 {
            Ok(())
        } else {
            Err(io::Error::from_raw_os_error(result as i32))
        }
    } else {
        unsafe {
            LocalFree(descriptor);
        }
        Err(io::Error::from_raw_os_error(result as i32))
    }
}

#[cfg(windows)]
fn insert_deny_sid_ace(path: &Path, sid: &[u8], mask: u32, inherit: bool) -> io::Result<()> {
    use std::mem::size_of;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Authorization::{
        GetNamedSecurityInfoW, SetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        AclSizeInformation, AddAccessDeniedAceEx, AddAce, GetAce, GetAclInformation, InitializeAcl,
        ACCESS_DENIED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, DACL_SECURITY_INFORMATION,
    };
    use windows_sys::Win32::Security::{CONTAINER_INHERIT_ACE, OBJECT_INHERIT_ACE};
    use windows_sys::Win32::System::SystemServices::ACCESS_DENIED_ACE_TYPE;

    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
        (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
    let result = unsafe {
        GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut dacl,
            &mut sacl,
            &mut descriptor,
        )
    };
    if result != 0 {
        return Err(io::Error::from_raw_os_error(result as i32));
    }
    if dacl.is_null() {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "refusing a null DACL",
        ));
    }
    let mut info: ACL_SIZE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe {
        GetAclInformation(
            dacl,
            (&mut info as *mut ACL_SIZE_INFORMATION).cast(),
            size_of::<ACL_SIZE_INFORMATION>() as u32,
            AclSizeInformation,
        )
    } == 0
    {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::last_os_error());
    }
    let ace_flags = if inherit {
        CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE
    } else {
        0
    };
    for index in 0..info.AceCount {
        let mut ace = null_mut();
        if unsafe { GetAce(dacl, index, &mut ace) } == 0 {
            unsafe {
                LocalFree(descriptor);
            }
            return Err(io::Error::last_os_error());
        }
        let header = unsafe { &*(ace as *const ACE_HEADER) };
        if header.AceType != ACCESS_DENIED_ACE_TYPE as u8 {
            continue;
        }
        let offset = std::mem::offset_of!(ACCESS_DENIED_ACE, SidStart);
        let ace_sid = unsafe { (ace as *const u8).add(offset).cast_mut().cast() };
        let ace_mask = unsafe { *(ace as *const u32).add(1) };
        if header.AceFlags as u32 == ace_flags
            && ace_mask == mask
            && unsafe {
                windows_sys::Win32::Security::EqualSid(ace_sid, sid.as_ptr().cast_mut().cast())
            } != 0
        {
            unsafe {
                LocalFree(descriptor);
            }
            return Ok(());
        }
    }
    let capacity =
        info.AclBytesInUse as usize + sid.len() + size_of::<ACE_HEADER>() + size_of::<u32>() + 16;
    if capacity > u16::MAX as usize {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ACL exceeds Windows size limit",
        ));
    }
    let mut storage = vec![0u64; capacity.div_ceil(size_of::<u64>())];
    let acl = storage.as_mut_ptr().cast::<ACL>();
    let revision = unsafe { (*dacl).AclRevision as u32 };
    if unsafe { InitializeAcl(acl, (storage.len() * size_of::<u64>()) as u32, revision) } == 0
        || unsafe {
            AddAccessDeniedAceEx(
                acl,
                revision,
                ace_flags,
                mask,
                sid.as_ptr().cast_mut().cast(),
            )
        } == 0
    {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::last_os_error());
    }
    for index in 0..info.AceCount {
        let mut ace = null_mut();
        if unsafe { GetAce(dacl, index, &mut ace) } == 0 {
            unsafe {
                LocalFree(descriptor);
            }
            return Err(io::Error::last_os_error());
        }
        let header = unsafe { &*(ace as *const ACE_HEADER) };
        if unsafe { AddAce(acl, revision, u32::MAX, ace, header.AceSize as u32) } == 0 {
            unsafe {
                LocalFree(descriptor);
            }
            return Err(io::Error::last_os_error());
        }
    }
    let result = unsafe {
        SetNamedSecurityInfoW(
            wide.as_ptr() as *mut u16,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            acl,
            null_mut(),
        )
    };
    unsafe {
        LocalFree(descriptor);
    }
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(result as i32))
    }
}

#[cfg(windows)]
fn remove_sid_aces(path: &Path, sid: &[u8]) -> io::Result<()> {
    use std::mem::size_of;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Authorization::{
        GetNamedSecurityInfoW, SetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        AclSizeInformation, AddAce, GetAce, GetAclInformation, InitializeAcl, ACCESS_ALLOWED_ACE,
        ACCESS_DENIED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, DACL_SECURITY_INFORMATION,
    };
    use windows_sys::Win32::System::SystemServices::{
        ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE,
    };
    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) =
        (null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
    let result = unsafe {
        GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            &mut owner,
            &mut group,
            &mut dacl,
            &mut sacl,
            &mut descriptor,
        )
    };
    if result != 0 {
        return if matches!(result, 2 | 3) {
            Ok(())
        } else {
            Err(io::Error::from_raw_os_error(result as i32))
        };
    }
    if dacl.is_null() {
        unsafe {
            LocalFree(descriptor);
        }
        return Ok(());
    }
    let mut info: ACL_SIZE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe {
        GetAclInformation(
            dacl,
            (&mut info as *mut ACL_SIZE_INFORMATION).cast(),
            size_of::<ACL_SIZE_INFORMATION>() as u32,
            AclSizeInformation,
        )
    } == 0
    {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::last_os_error());
    }
    let mut retained: Vec<Vec<u8>> = Vec::new();
    let mut removed = false;
    for index in 0..info.AceCount {
        let mut ace = null_mut();
        if unsafe { GetAce(dacl, index, &mut ace) } == 0 {
            unsafe {
                LocalFree(descriptor);
            }
            return Err(io::Error::last_os_error());
        }
        let header = unsafe { &*(ace as *const ACE_HEADER) };
        let is_basic = header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8
            || header.AceType == ACCESS_DENIED_ACE_TYPE as u8;
        let trustee_matches = if is_basic {
            let offset = if header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8 {
                std::mem::offset_of!(ACCESS_ALLOWED_ACE, SidStart)
            } else {
                std::mem::offset_of!(ACCESS_DENIED_ACE, SidStart)
            };
            let ace_sid = unsafe { (ace as *const u8).add(offset).cast_mut().cast() };
            unsafe {
                windows_sys::Win32::Security::EqualSid(ace_sid, sid.as_ptr().cast_mut().cast()) != 0
            }
        } else {
            false
        };
        if is_basic && trustee_matches {
            removed = true;
            continue;
        }
        let bytes =
            unsafe { std::slice::from_raw_parts(ace.cast::<u8>(), header.AceSize as usize) };
        retained.push(bytes.to_vec());
    }
    if !removed {
        unsafe {
            LocalFree(descriptor);
        }
        return Ok(());
    }
    let capacity = info.AclBytesInUse.max(size_of::<ACL>() as u32) as usize;
    let mut storage = vec![0u64; capacity.div_ceil(size_of::<u64>())];
    let acl = storage.as_mut_ptr().cast::<ACL>();
    let revision = unsafe { (*dacl).AclRevision as u32 };
    if unsafe { InitializeAcl(acl, (storage.len() * size_of::<u64>()) as u32, revision) } == 0 {
        unsafe {
            LocalFree(descriptor);
        }
        return Err(io::Error::last_os_error());
    }
    for ace in retained {
        if unsafe {
            AddAce(
                acl,
                revision,
                u32::MAX,
                ace.as_ptr().cast(),
                ace.len() as u32,
            )
        } == 0
        {
            unsafe {
                LocalFree(descriptor);
            }
            return Err(io::Error::last_os_error());
        }
    }
    let result = unsafe {
        SetNamedSecurityInfoW(
            wide.as_ptr() as *mut u16,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            acl,
            null_mut(),
        )
    };
    unsafe {
        LocalFree(descriptor);
    }
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(result as i32))
    }
}

#[cfg(not(windows))]
fn remove_sid_aces(_path: &Path, _sid: &[u8]) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HbarPermissionProfile, SandboxLevel};
    use std::collections::HashMap;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("hbar-acl-lease-test-{}", Uuid::new_v4().simple()));
            fs::create_dir(&path).expect("private temp fixture");
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_profile_sid() -> (Vec<u16>, *mut core::ffi::c_void) {
        use std::ptr::null;
        let name: Vec<u16> = format!("hbar.test.{}", Uuid::new_v4().simple())
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut sid = std::ptr::null_mut();
        let result = unsafe {
            windows_sys::Win32::Security::Isolation::CreateAppContainerProfile(
                name.as_ptr(),
                name.as_ptr(),
                name.as_ptr(),
                null(),
                0,
                &mut sid,
            )
        };
        assert!(
            result >= 0 && !sid.is_null(),
            "private fixture AppContainer profile creation: {result}"
        );
        (name, sid)
    }

    fn sid_ace_masks(path: &Path, sid: *mut core::ffi::c_void) -> (u32, u32) {
        use std::mem::size_of;
        use windows_sys::Win32::Security::Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT};
        use windows_sys::Win32::Security::{
            AclSizeInformation, GetAce, GetAclInformation, ACCESS_ALLOWED_ACE, ACCESS_DENIED_ACE,
            ACE_HEADER, ACL_SIZE_INFORMATION, DACL_SECURITY_INFORMATION,
        };
        use windows_sys::Win32::System::SystemServices::{
            ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE,
        };
        let wide: Vec<u16> = path
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let (mut owner, mut group, mut dacl, mut sacl, mut descriptor) = (
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        assert_eq!(
            unsafe {
                GetNamedSecurityInfoW(
                    wide.as_ptr(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    &mut owner,
                    &mut group,
                    &mut dacl,
                    &mut sacl,
                    &mut descriptor,
                )
            },
            0
        );
        assert!(!dacl.is_null());
        let mut info: ACL_SIZE_INFORMATION = unsafe { std::mem::zeroed() };
        assert_ne!(
            unsafe {
                GetAclInformation(
                    dacl,
                    (&mut info as *mut ACL_SIZE_INFORMATION).cast(),
                    size_of::<ACL_SIZE_INFORMATION>() as u32,
                    AclSizeInformation,
                )
            },
            0
        );
        let mut allowed = 0;
        let mut denied = 0;
        for index in 0..info.AceCount {
            let mut ace = std::ptr::null_mut();
            assert_ne!(unsafe { GetAce(dacl, index, &mut ace) }, 0);
            let header = unsafe { &*(ace as *const ACE_HEADER) };
            if header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8
                || header.AceType == ACCESS_DENIED_ACE_TYPE as u8
            {
                let offset = if header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8 {
                    std::mem::offset_of!(ACCESS_ALLOWED_ACE, SidStart)
                } else {
                    std::mem::offset_of!(ACCESS_DENIED_ACE, SidStart)
                };
                let ace_sid = unsafe { (ace as *const u8).add(offset).cast_mut().cast() };
                if unsafe { windows_sys::Win32::Security::EqualSid(ace_sid, sid) } != 0 {
                    let mask = unsafe { *(ace as *const u32).add(1) };
                    if header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8 {
                        allowed |= mask;
                    } else {
                        denied |= mask;
                    }
                }
            }
        }
        unsafe {
            windows_sys::Win32::Foundation::LocalFree(descriptor);
        }
        (allowed, denied)
    }

    fn profile(root: &Path) -> HbarPermissionProfile {
        let environment = std::env::vars().collect::<HashMap<_, _>>();
        let environment_allowlist = environment.keys().cloned().collect::<Vec<_>>();
        HbarPermissionProfile {
            workspace_root: root.to_string_lossy().into_owned(),
            writable_roots: vec![root.to_string_lossy().into_owned()],
            readable_roots: vec![],
            protected_paths: None,
            read_only_paths: None,
            network_enabled: false,
            env_overrides: HashMap::new(),
            environment,
            environment_allowlist,
            level: SandboxLevel::Unelevated,
        }
    }

    #[test]
    fn populated_root_plan_includes_descendants_and_read_only_denies_only_write() {
        let temporary = Fixture::new();
        let root = temporary.0.join("root");
        let nested = root.join("existing").join("deep.txt");
        fs::create_dir_all(nested.parent().expect("nested parent")).expect("nested tree");
        fs::write(&nested, "fixture").expect("nested file");
        let mut profile = profile(&root);
        profile.read_only_paths = Some(vec![nested
            .parent()
            .unwrap()
            .to_string_lossy()
            .into_owned()]);
        let plan = build_plan(&profile).expect("bounded plan");
        let canonical_root = fs::canonicalize(&root).expect("canonical root");
        let canonical_nested = fs::canonicalize(&nested).expect("canonical file");
        assert!(plan.iter().any(|entry| entry.path == canonical_root));
        assert!(plan.iter().any(|entry| entry.path == canonical_nested));
        let nested_entry = plan
            .iter()
            .find(|entry| entry.path == canonical_nested)
            .expect("file entry");
        assert_ne!(
            nested_entry.allow & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_READ,
            0
        );
        assert_ne!(
            nested_entry.deny & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE,
            0
        );
        assert_eq!(
            nested_entry.deny & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0
        );
    }

    #[test]
    fn missing_protected_path_fails_closed() {
        let temporary = Fixture::new();
        let root = temporary.0.join("root");
        fs::create_dir(&root).expect("root fixture");
        let mut profile = profile(&root);
        profile.protected_paths = Some(vec![root.join("missing").to_string_lossy().into_owned()]);
        assert!(build_plan(&profile).is_err());
    }

    #[test]
    fn traversal_depth_limit_fails_closed_on_a_private_fixture() {
        let fixture = Fixture::new();
        let root = fixture.0.join("root");
        fs::create_dir(&root).expect("fixture root");
        let mut cursor = root.clone();
        for _ in 0..=MAX_TREE_DEPTH {
            cursor.push("d");
            fs::create_dir(&cursor).expect("bounded-depth fixture directory");
        }
        assert!(build_plan(&profile(&root)).is_err());
    }

    #[test]
    fn populated_root_acl_lease_preserves_other_sid_and_recovers_crash_record() {
        let fixture = Fixture::new();
        let root = fixture.0.join("root");
        let journal = fixture.0.join("private-journal");
        fs::create_dir_all(root.join("nested")).expect("private tree");
        fs::create_dir_all(root.join("protected")).expect("protected fixture tree");
        fs::create_dir_all(root.join("read-only")).expect("read-only fixture tree");
        fs::create_dir(&journal).expect("private journal root");
        fs::write(root.join("nested/existing.txt"), "fixture").expect("existing file");
        fs::write(root.join("protected/secret.txt"), "fixture secret").expect("protected sentinel");
        fs::write(root.join("read-only/value.txt"), "fixture value").expect("read-only sentinel");
        let (app_name, app_sid) = test_profile_sid();
        let (_other_name, other_sid) = test_profile_sid();
        let mut profile = profile(&root);
        profile.protected_paths = Some(vec![root.join("protected").to_string_lossy().into_owned()]);
        profile.read_only_paths = Some(vec![root.join("read-only").to_string_lossy().into_owned()]);
        unsafe {
            set_sid_ace(
                &root,
                std::slice::from_raw_parts(
                    other_sid.cast(),
                    windows_sys::Win32::Security::GetLengthSid(other_sid) as usize,
                ),
                windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_READ,
                false,
                true,
            )
            .expect("unrelated fixture ACE");
        }
        let job_name = format!("hbar.test.job.{}", Uuid::new_v4().simple());
        let wide_job_name = crate::vendor::spawn::wide(&job_name);
        let job = unsafe {
            windows_sys::Win32::System::JobObjects::CreateJobObjectW(
                std::ptr::null(),
                wide_job_name.as_ptr(),
            )
        };
        assert!(!job.is_null(), "fixture named Job Object");
        let lease = unsafe {
            FilesystemLease::acquire(
                &profile,
                &journal,
                String::from_utf16_lossy(&app_name[..app_name.len() - 1]),
                job_name.clone(),
                app_sid,
            )
            .expect("durable populated root lease")
        };
        assert!(
            lease.journal_path.exists(),
            "journal is durable during the lease"
        );
        assert_ne!(
            sid_ace_masks(&root.join("nested/existing.txt"), app_sid).0,
            0,
            "existing descendants receive the lease ACE"
        );
        fs::create_dir(root.join("nested/created-during-lease")).expect("new inherited directory");
        fs::write(root.join("nested/created-during-lease/new.txt"), "fixture")
            .expect("new inherited file");
        assert_ne!(
            sid_ace_masks(&root.join("nested/created-during-lease/new.txt"), app_sid).0,
            0,
            "new descendants inherit the active lease"
        );
        fs::write(root.join("protected/new-secret.txt"), "fixture secret")
            .expect("host can add a protected fixture during the lease");
        fs::write(root.join("read-only/new-value.txt"), "fixture value")
            .expect("host can add a read-only fixture during the lease");
        assert_eq!(
            sid_ace_masks(&root.join("protected/new-secret.txt"), app_sid).0
                & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0,
            "new protected descendants inherit no read grant"
        );
        assert_ne!(
            sid_ace_masks(&root.join("protected/new-secret.txt"), app_sid).1
                & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0,
            "new protected descendants inherit deny-read"
        );
        assert_ne!(
            sid_ace_masks(&root.join("read-only/new-value.txt"), app_sid).0
                & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0,
            "new read-only descendants inherit read"
        );
        assert_ne!(
            sid_ace_masks(&root.join("read-only/new-value.txt"), app_sid).1
                & windows_sys::Win32::Storage::FileSystem::FILE_WRITE_DATA,
            0,
            "new read-only descendants inherit deny-write"
        );
        assert_ne!(
            sid_ace_masks(&root, other_sid).0,
            0,
            "unrelated fixture SID remains while the lease is active"
        );
        let protected = sid_ace_masks(&root.join("protected"), app_sid);
        assert_ne!(
            protected.1 & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_READ,
            0
        );
        assert_ne!(
            protected.1 & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE,
            0
        );
        let read_only = sid_ace_masks(&root.join("read-only"), app_sid);
        assert_ne!(
            read_only.1 & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE,
            0
        );
        assert_eq!(
            read_only.1 & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0
        );
        assert_ne!(
            read_only.0 & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0
        );
        assert_ne!(
            sid_ace_masks(&root.join("protected/secret.txt"), app_sid).1
                & windows_sys::Win32::Storage::FileSystem::FILE_READ_DATA,
            0,
            "protected descendants inherit deny-read"
        );
        assert_ne!(
            sid_ace_masks(&root.join("read-only/value.txt"), app_sid).1
                & windows_sys::Win32::Storage::FileSystem::FILE_GENERIC_WRITE,
            0,
            "read-only descendants inherit deny-write"
        );
        std::mem::forget(lease);
        assert_eq!(
            recover_dead_leases(&journal).expect("live Job keeps its lease"),
            0,
            "recovery leaves a record while its named Job exists"
        );
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(job);
        }
        assert_eq!(recover_dead_leases(&journal).expect("dead job recovery"), 1);
        assert_eq!(
            recover_dead_leases(&journal).expect("idempotent recovery"),
            0
        );
        assert_eq!(
            sid_ace_masks(&root.join("nested/existing.txt"), app_sid),
            (0, 0),
            "crash recovery removes the launch SID"
        );
        assert_eq!(
            sid_ace_masks(&root.join("nested/created-during-lease/new.txt"), app_sid),
            (0, 0),
            "crash recovery removes inherited ACEs from files created during the lease"
        );
        assert_eq!(
            sid_ace_masks(&root.join("protected/new-secret.txt"), app_sid),
            (0, 0),
            "crash recovery removes inherited ACEs from protected files created during the lease"
        );
        assert_eq!(
            sid_ace_masks(&root.join("read-only/new-value.txt"), app_sid),
            (0, 0),
            "crash recovery removes inherited ACEs from read-only files created during the lease"
        );
        for path in [
            root.join("protected"),
            root.join("read-only"),
            journal.clone(),
        ] {
            assert!(!dacl_is_protected(&path).expect("restored DACL inheritance"));
        }
        assert!(
            sid_ace_masks(&root, other_sid).0 > 0,
            "crash recovery preserves unrelated ACEs"
        );
        assert_eq!(fs::read_dir(&journal).expect("journal listing").count(), 0);
        unsafe {
            let _ = windows_sys::Win32::Security::Isolation::DeleteAppContainerProfile(
                app_name.as_ptr(),
            );
            let _ = windows_sys::Win32::Security::Isolation::DeleteAppContainerProfile(
                _other_name.as_ptr(),
            );
            windows_sys::Win32::Foundation::LocalFree(app_sid);
            windows_sys::Win32::Foundation::LocalFree(other_sid);
        }
    }

    #[test]
    fn appcontainer_process_enforces_protected_and_read_only_subtrees() {
        let fixture = Fixture::new();
        let root = fixture.0.join("root");
        let journal = fixture.0.join("journal");
        let protected = root.join("protected");
        let read_only = root.join("read-only");
        fs::create_dir_all(&protected).expect("protected fixture");
        fs::create_dir_all(&read_only).expect("read-only fixture");
        fs::create_dir(&journal).expect("private journal");
        let secret = protected.join("secret.txt");
        let readable = read_only.join("value.txt");
        fs::write(&secret, "secret").expect("fixture secret");
        fs::write(&readable, "readable").expect("fixture read-only value");
        let mut profile = profile(&root);
        profile.protected_paths = Some(vec![protected.to_string_lossy().into_owned()]);
        profile.read_only_paths = Some(vec![read_only.to_string_lossy().into_owned()]);
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let powershell = PathBuf::from(system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        let writable = root.join("new.txt");
        let script = format!(
            "$ErrorActionPreference='Stop'; try {{ Get-Content -LiteralPath {} -Raw -ErrorAction Stop; exit 11 }} catch {{}}; try {{ Add-Content -LiteralPath {} -Value 'blocked' -ErrorAction Stop; exit 12 }} catch {{}}; if ((Get-Content -LiteralPath {} -Raw) -ne 'readable') {{ exit 13 }}; try {{ Add-Content -LiteralPath {} -Value 'blocked' -ErrorAction Stop; exit 14 }} catch {{}}; Set-Content -LiteralPath {} -Value 'writable' -NoNewline; Write-Output 'acl-lease-effective'; exit 0",
            crate::vendor::spawn::ps_quote(&secret),
            crate::vendor::spawn::ps_quote(&secret),
            crate::vendor::spawn::ps_quote(&readable),
            crate::vendor::spawn::ps_quote(&readable),
            crate::vendor::spawn::ps_quote(&writable),
        );
        let outcome = crate::vendor::spawn::run_probe(
            &profile,
            vec![
                powershell.to_string_lossy().into_owned(),
                "-NoLogo".into(),
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-Command".into(),
                script,
            ],
            &root.to_string_lossy(),
            std::time::Duration::from_secs(10),
            &journal,
        )
        .expect("AppContainer process completion");
        assert_eq!(outcome.0, 0, "stdout: {}\nstderr: {}", outcome.1, outcome.2);
        assert!(outcome.1.contains("acl-lease-effective"));
        assert_eq!(
            fs::read_to_string(&writable).expect("writable result"),
            "writable"
        );
        assert_eq!(
            fs::read_to_string(&secret).expect("protected fixture remains"),
            "secret"
        );
        assert_eq!(
            fs::read_to_string(&readable).expect("read-only fixture remains"),
            "readable"
        );
    }
}
