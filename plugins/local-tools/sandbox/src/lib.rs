//! hbar-sandbox-win: OS-level process sandbox for Windows.
//!
//! This crate vendors and adapts logic from codex-rs/windows-sandbox-rs
//! (OpenAI, Apache-2.0, commit e01f38c3) to provide two sandbox levels:
//!
//! - `unelevated`: CreateRestrictedToken (DISABLE_MAX_PRIVILEGE | LUA_TOKEN |
//!   WRITE_RESTRICTED) with capability SIDs and filesystem ACLs. No UAC needed.
//! - `elevated`: Dedicated local sandbox user accounts, Windows Firewall rules,
//!   and WFP filters for real network isolation. Requires a one-time UAC prompt.
//!
//! The vendored files live in `src/vendor/`. Type replacements:
//! - `codex_protocol::models::PermissionProfile` → `HbarPermissionProfile` (this crate)
//! - `codex_utils_absolute_path::AbsolutePathBuf` → `std::path::PathBuf`
//! - `codex_utils_pty::JobObject` → `crate::vendor::job_object::JobObject`
//! - `codex_utils_pty::SpawnedProcess` → `crate::SandboxedProcess`
//! - `codex_otel::*` → stripped (no telemetry in hbar)

#![deny(clippy::all)]
#![allow(clippy::too_many_arguments)]

use napi_derive::napi;

mod types;

pub use types::*;

// Vendored Codex source (unelevated path, Apache-2.0 — see NOTICE at repo root).
// These modules are stubs until the vendor sub-feature lands.
#[cfg(windows)]
mod vendor;

/// Returns `true` when the OS-level sandbox is available on this platform.
/// Always `true` on Windows; `false` elsewhere.
#[napi]
pub fn is_available() -> bool {
    cfg!(windows)
}

/// Spawn a command inside an OS-level sandbox.
///
/// On non-Windows platforms this always returns an error; callers should check
/// `is_available()` first. The TypeScript wrapper in local-tools does this.
#[napi]
pub async fn spawn_sandboxed(
    profile: HbarPermissionProfile,
    argv: Vec<String>,
    cwd: String,
) -> napi::Result<SandboxedProcessHandle> {
    #[cfg(windows)]
    {
        vendor::spawn::spawn_sandboxed_impl(profile, argv, cwd).await
    }
    #[cfg(not(windows))]
    {
        let _ = (profile, argv, cwd);
        Err(napi::Error::from_reason(
            "OS-level sandbox is only available on Windows",
        ))
    }
}
