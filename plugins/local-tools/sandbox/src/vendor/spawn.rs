// Placeholder spawn implementation.
// Full vendor implementation lands in the next sub-feature.

use crate::{HbarPermissionProfile, SandboxedProcessHandle};

pub async fn spawn_sandboxed_impl(
    _profile: HbarPermissionProfile,
    _argv: Vec<String>,
    _cwd: String,
) -> napi::Result<SandboxedProcessHandle> {
    Err(napi::Error::from_reason(
        "OS-level sandbox not yet implemented; vendor modules are stubs",
    ))
}
