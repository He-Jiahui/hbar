use napi::{Error, Result};
use napi_derive::napi;
use std::mem::size_of;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::System::Threading::{
    GetCurrentThread, GetThreadInformation, SetThreadInformation, ThreadMemoryPriority,
    MEMORY_PRIORITY_INFORMATION,
};

fn failure(action: &str) -> Error {
    Error::from_reason(format!("{action} failed (Windows error {})", unsafe {
        GetLastError()
    }))
}

#[napi]
pub fn current_thread_memory_priority() -> Result<u32> {
    let mut information = MEMORY_PRIORITY_INFORMATION { MemoryPriority: 0 };
    // The current-thread pseudo handle is borrowed; it must never be closed.
    if unsafe {
        GetThreadInformation(
            GetCurrentThread(),
            ThreadMemoryPriority,
            &mut information as *mut _ as *mut _,
            size_of::<MEMORY_PRIORITY_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(failure("Current thread memory priority query"));
    }
    Ok(information.MemoryPriority)
}

#[napi]
pub fn set_current_thread_memory_priority(priority: u32) -> Result<()> {
    if !(1..=5).contains(&priority) {
        return Err(Error::from_reason("Invalid current thread memory priority"));
    }
    let information = MEMORY_PRIORITY_INFORMATION {
        MemoryPriority: priority,
    };
    if unsafe {
        SetThreadInformation(
            GetCurrentThread(),
            ThreadMemoryPriority,
            &information as *const _ as *const _,
            size_of::<MEMORY_PRIORITY_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(failure("Current thread memory priority update"));
    }
    Ok(())
}
