//! hbar-sandbox-win: Windows AppContainer child process confinement.
//!
//! Each launch gets a unique AppContainer SID, explicit filesystem ACL leases,
//! durable lease journal, and kill-on-close Job Object. Network capability is
//! reported only after a live external listener handshake. This crate does not
//! configure Windows Firewall, loopback exemptions, or global security settings.
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

// Adapted Codex source (Apache-2.0 — see NOTICE at repo root).
#[cfg(windows)]
mod vendor;

/// Performs and caches a real AppContainer confinement probe.
#[napi]
pub fn is_available() -> bool {
    #[cfg(windows)]
    {
        vendor::spawn::probe_confinement().available
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Returns which AppContainer restrictions have passed live process tests.
#[cfg(windows)]
#[napi]
pub fn probe_confinement() -> vendor::spawn::SandboxProbeCapabilities {
    vendor::spawn::probe_confinement()
}

/// Spawn a command inside an OS-level sandbox.
///
/// On non-Windows platforms this always returns an error; callers should check
/// `is_available()` first. The TypeScript wrapper in local-tools does this.
/// `journal_directory` is an optional, separately typed host-private root. It must come
/// from B's internal data directory, never from the requested permission profile; omission
/// is accepted at the ABI boundary for compatibility and fails closed at runtime.
#[napi]
pub async fn spawn_sandboxed(
    profile: HbarPermissionProfile,
    argv: Vec<String>,
    cwd: String,
    journal_directory: Option<String>,
) -> napi::Result<SandboxedProcessHandle> {
    #[cfg(windows)]
    {
        vendor::spawn::spawn_sandboxed_impl(profile, argv, cwd, journal_directory).await
    }
    #[cfg(not(windows))]
    {
        let _ = (profile, argv, cwd, journal_directory);
        Err(napi::Error::from_reason(
            "OS-level sandbox is only available on Windows",
        ))
    }
}
