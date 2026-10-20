use napi::bindgen_prelude::BigInt;
use napi::{Error, Result};
use napi_derive::napi;
use std::mem::size_of;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Storage::FileSystem::{
    FileIoPriorityHintInfo, GetFileType, IoPriorityHintVeryLow, SetFileInformationByHandle,
    FILE_IO_PRIORITY_HINT_INFO, FILE_TYPE_DISK,
};

#[repr(C, align(8))]
struct AlignedHint {
    information: FILE_IO_PRIORITY_HINT_INFO,
}

/// Hint only an existing caller-owned disk file handle. This function neither
/// takes ownership nor keeps the handle after the synchronous native call.
#[napi]
pub fn set_read_mostly_file_io_priority(handle: BigInt) -> Result<()> {
    let (negative, value, lossless) = handle.get_u64();
    if negative || !lossless || value == 0 || value == u64::MAX {
        return Err(Error::from_reason("Invalid borrowed file handle"));
    }
    let value = usize::try_from(value)
        .map_err(|_| Error::from_reason("Invalid borrowed file handle width"))?;
    let borrowed = value as *mut std::ffi::c_void;
    if unsafe { GetFileType(borrowed) } != FILE_TYPE_DISK {
        return Err(Error::from_reason(
            "Read-mostly I/O hint requires a disk file handle",
        ));
    }
    let hint = AlignedHint {
        information: FILE_IO_PRIORITY_HINT_INFO {
            PriorityHint: IoPriorityHintVeryLow,
        },
    };
    if unsafe {
        SetFileInformationByHandle(
            borrowed,
            FileIoPriorityHintInfo,
            &hint.information as *const _ as *const _,
            size_of::<FILE_IO_PRIORITY_HINT_INFO>() as u32,
        )
    } == 0
    {
        return Err(Error::from_reason(format!(
            "Read-mostly file I/O hint failed (Windows error {})",
            unsafe { GetLastError() }
        )));
    }
    Ok(())
}
