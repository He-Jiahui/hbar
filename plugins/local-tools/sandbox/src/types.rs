//! Types shared between the N-API surface and the vendor implementation.
//!
//! These are the hbar replacements for codex_protocol::models::PermissionProfile
//! and codex_utils_pty::SpawnedProcess.

use napi_derive::napi;

/// Supported AppContainer launch mode. Other historical sandbox modes are not implemented.
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum SandboxLevel {
    /// Launch in a unique AppContainer with explicit filesystem leases and a Job Object.
    Unelevated,
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
    /// Absolute paths the sandboxed process may read from.
    pub readable_roots: Vec<String>,
    /// Existing paths whose subtree must be denied to the AppContainer (both read and write).
    /// Missing paths fail closed; paths must be contained by an authorized root.
    pub protected_paths: Option<Vec<String>>,
    /// Existing paths whose subtree may be read but not written by the AppContainer.
    /// Missing paths fail closed; paths must be contained by an authorized root.
    pub read_only_paths: Option<Vec<String>>,
    /// Request AppContainer network capabilities. Launch is rejected unless the live network probe passes.
    pub network_enabled: bool,
    /// Additional env vars to set inside the sandbox (from the resolved profile's `environment.set`).
    pub env_overrides: std::collections::HashMap<String, String>,
    /// B-curated base environment. The native launcher never inherits its own process environment.
    pub environment: std::collections::HashMap<String, String>,
    /// B-owned allowlist used to intersect the base environment and snapshot overrides.
    pub environment_allowlist: Vec<String>,
    /// Supported AppContainer launch mode.
    pub level: SandboxLevel,
}

/// Handle returned after spawn. Output is fetched in bounded poll chunks; the
/// handle remains registered until the Job Object is empty and both pipes drain.
#[napi(object)]
#[derive(Debug)]
pub struct SandboxedProcessHandle {
    /// OS process id.
    pub pid: u32,
    /// Opaque registry key used by `pollSandboxed` and `terminateSandboxed`.
    pub handle_id: String,
}
