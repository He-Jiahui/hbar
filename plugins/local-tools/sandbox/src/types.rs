//! Types shared between the N-API surface and the vendor implementation.
//!
//! These are the hbar replacements for codex_protocol::models::PermissionProfile
//! and codex_utils_pty::SpawnedProcess.

use napi_derive::napi;

/// OS-level sandbox mode.
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum SandboxLevel {
    /// CreateRestrictedToken (DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED).
    /// No UAC required; network blocking is env-var only.
    Unelevated,
    /// Dedicated local sandbox user accounts with Windows Firewall and WFP filters.
    /// Requires a one-time UAC prompt during setup.
    Elevated,
}

/// Fully-resolved permission profile passed from TypeScript when spawning a sandboxed command.
/// Built from the Run's pinned ResolvedSandboxProfile snapshot.
#[napi(object)]
#[derive(Debug, Clone)]
pub struct HbarPermissionProfile {
    /// Absolute path to the workspace root (working directory for the command).
    pub workspace_root: String,
    /// Absolute paths the sandboxed process may write to.
    pub writable_roots: Vec<String>,
    /// Absolute paths the sandboxed process may read from (elevated only; unelevated reads all).
    pub readable_roots: Vec<String>,
    /// When `true`, network-blocking env vars are NOT applied.
    pub network_enabled: bool,
    /// Additional env vars to set inside the sandbox (from the resolved profile's `environment.set`).
    pub env_overrides: std::collections::HashMap<String, String>,
    /// Which sandbox level to use.
    pub level: SandboxLevel,
}

/// Handle returned to TypeScript after a sandboxed process is spawned.
/// Streams are managed by Rust-side Tokio tasks; TypeScript polls via callbacks or awaits exit.
#[napi(object)]
#[derive(Debug)]
pub struct SandboxedProcessHandle {
    /// OS process id.
    pub pid: u32,
    /// Monotonic token used by `write_stdin` / `close_stdin` / `terminate`.
    pub handle_id: String,
}
