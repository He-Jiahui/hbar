use serde::Deserialize;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum StartupMode {
    #[default]
    Client,
    Background,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TrayCopy {
    pub(crate) open_client: String,
    pub(crate) open_web: String,
    pub(crate) exit_client: String,
    pub(crate) stop_backend: String,
}

impl Default for TrayCopy {
    fn default() -> Self {
        Self {
            open_client: "Open client".into(),
            open_web: "Open web".into(),
            exit_client: "Exit client".into(),
            stop_backend: "Stop backend and exit".into(),
        }
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Startup {
    pub(crate) startup_mode: StartupMode,
    pub(crate) labels: TrayCopy,
}

impl Startup {
    pub(crate) fn validate(&self) -> Result<(), String> {
        for value in [
            &self.labels.open_client,
            &self.labels.open_web,
            &self.labels.exit_client,
            &self.labels.stop_backend,
        ] {
            if value.trim().is_empty() || value.chars().count() > 120 || value.contains('\0') {
                return Err("Host supplied an invalid tray label".into());
            }
        }
        Ok(())
    }
}

/// An explicit launch flag overrides the saved Host setting without modifying it.
pub(crate) fn startup_override(
    args: impl IntoIterator<Item = String>,
) -> Result<Option<StartupMode>, String> {
    let mut selected = None;
    for argument in args {
        let next = match argument.as_str() {
            "--background" => StartupMode::Background,
            "--client" => StartupMode::Client,
            _ => continue,
        };
        if selected.is_some_and(|current| current != next) {
            return Err("Choose either --background or --client".into());
        }
        selected = Some(next);
    }
    Ok(selected)
}

/// Attached services are never terminated by ordinary client shutdown.
pub(crate) fn shutdown_owner(stop_backend: bool, service_pid: Option<u32>) -> Option<u32> {
    if stop_backend {
        service_pid.filter(|pid| *pid > 0)
    } else {
        None
    }
}

pub(crate) fn release_workbench_on_close(launch: StartupMode, saved: StartupMode) -> bool {
    launch == StartupMode::Background || saved == StartupMode::Background
}

pub(crate) fn host_port_override(value: Option<String>) -> Result<Option<u16>, String> {
    value
        .map(|port| {
            if port.is_empty() || !port.chars().all(|value| value.is_ascii_digit()) {
                return Err("HBAR_PORT must be an integer from 0 to 65535".into());
            }
            port.parse::<u16>()
                .map_err(|_| "HBAR_PORT must be an integer from 0 to 65535".into())
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_override_but_do_not_silently_conflict() {
        let args = |values: &[&str]| {
            values
                .iter()
                .map(|value| (*value).to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(startup_override(args(&[])).unwrap(), None);
        assert_eq!(
            startup_override(args(&["--background"])).unwrap(),
            Some(StartupMode::Background)
        );
        assert_eq!(
            startup_override(args(&["--client"])).unwrap(),
            Some(StartupMode::Client)
        );
        assert_eq!(
            startup_override(args(&["--background", "--background"])).unwrap(),
            Some(StartupMode::Background)
        );
        assert!(startup_override(args(&["--background", "--client"])).is_err());
        assert_eq!(
            startup_override(args(&["--background=false"])).unwrap(),
            None
        );
    }

    #[test]
    fn closing_a_client_preserves_attached_services() {
        assert_eq!(shutdown_owner(false, Some(40)), None);
        assert_eq!(shutdown_owner(true, Some(40)), Some(40));
        assert_eq!(shutdown_owner(true, None), None);
        assert_eq!(shutdown_owner(true, Some(0)), None);
        assert!(!release_workbench_on_close(
            StartupMode::Client,
            StartupMode::Client
        ));
        assert!(release_workbench_on_close(
            StartupMode::Background,
            StartupMode::Client
        ));
        assert!(release_workbench_on_close(
            StartupMode::Client,
            StartupMode::Background
        ));
        assert!(release_workbench_on_close(
            StartupMode::Background,
            StartupMode::Background
        ));
    }

    #[test]
    fn tray_copy_is_bounded() {
        let mut startup = Startup::default();
        assert!(startup.validate().is_ok());
        startup.labels.open_client = "x".repeat(121);
        assert!(startup.validate().is_err());
        startup.labels.open_client = "\0".into();
        assert!(startup.validate().is_err());
    }

    #[test]
    fn port_override_is_explicit_and_bounded() {
        assert_eq!(host_port_override(None).unwrap(), None);
        for port in [0, 4317, 65535] {
            assert_eq!(
                host_port_override(Some(port.to_string())).unwrap(),
                Some(port)
            );
        }
        for value in ["", "-1", "65536", "1.5", " 4317", "4e3"] {
            assert!(host_port_override(Some(value.into())).is_err());
        }
    }
}
