use serde_json::{json, Map, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

const MAX_FILE_BYTES: u64 = 128 * 1024;
const MAX_LINE_BYTES: usize = 4096;

/// Best-effort, bounded native lifecycle diagnostics. This intentionally has no
/// dependency on the Host logger so native startup failures remain observable.
#[derive(Clone)]
pub(crate) struct NativeDiagnostics {
    path: PathBuf,
    quota_lock: Arc<Mutex<()>>,
}

impl NativeDiagnostics {
    pub(crate) fn for_settings_root(settings_root: &Path) -> Self {
        Self {
            path: settings_root
                .join("diagnostics")
                .join("native-lifecycle.jsonl"),
            quota_lock: Arc::new(Mutex::new(())),
        }
    }

    pub(crate) fn initialized(&self) {
        self.write("launcher_initialized", "info", &[]);
    }

    pub(crate) fn tray_ready(&self, background: bool) {
        self.write("tray_ready", "info", &[("background", json!(background))]);
    }

    pub(crate) fn connection_reused(&self, instance_id: &str, supervisor_pid: Option<u32>) {
        self.write(
            "connection_reused",
            "info",
            &instance_fields(instance_id, supervisor_pid),
        );
    }

    pub(crate) fn connection_validation_failed(&self) {
        self.write("connection_validation_failed", "warn", &[]);
    }

    pub(crate) fn host_spawn_failed(&self) {
        self.write("host_child_spawn_failed", "error", &[]);
    }

    pub(crate) fn host_spawned(&self, pid: u32) {
        self.write("host_child_spawned", "info", &[("childPid", json!(pid))]);
    }

    pub(crate) fn host_ready(&self, connection: &crate::Connection) {
        self.write(
            "host_health_matched",
            "info",
            &instance_fields_with_pid(
                &connection.instance_id,
                connection.pid,
                connection.supervisor_pid,
            ),
        );
    }

    pub(crate) fn host_exited(&self, pid: u32, code: Option<i32>) {
        self.write(
            "host_child_exited",
            "error",
            &[("childPid", json!(pid)), ("exitCode", optional_i32(code))],
        );
    }

    pub(crate) fn host_start_timeout(&self, pid: Option<u32>) {
        self.write(
            "host_start_timeout",
            "error",
            &[("childPid", optional_pid(pid))],
        );
    }

    pub(crate) fn owner_release_requested(&self, pid: Option<u32>, owner: &'static str) {
        self.write(
            "owner_release_requested",
            "info",
            &[("childPid", optional_pid(pid)), ("owner", json!(owner))],
        );
    }

    fn write(&self, event: &str, level: &str, fields: &[(&str, Value)]) {
        let mut record = Map::new();
        record.insert("schemaVersion".into(), json!(1));
        record.insert("component".into(), json!("desktop"));
        record.insert("level".into(), json!(level));
        record.insert("time".into(), json!(unix_millis()));
        record.insert("monotonicMs".into(), json!(monotonic_millis()));
        record.insert("processId".into(), json!(std::process::id()));
        record.insert("event".into(), json!(event));
        for (key, value) in fields {
            if !value.is_null() {
                record.insert((*key).into(), value.clone());
            }
        }
        let Ok(mut line) = serde_json::to_vec(&record) else {
            return;
        };
        if line.len() > MAX_LINE_BYTES {
            return;
        }
        line.push(b'\n');
        // Diagnostics are best effort. Never wait behind another writer; the
        // critical section only protects quota inspection, rotation and append.
        let Ok(_quota_guard) = self.quota_lock.try_lock() else {
            return;
        };
        let Some(parent) = self.path.parent() else {
            return;
        };
        if fs::create_dir_all(parent).is_err() {
            return;
        }
        let current_size = fs::metadata(&self.path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if current_size.saturating_add(line.len() as u64) > MAX_FILE_BYTES {
            let rotated = self.path.with_extension("jsonl.1");
            if fs::remove_file(&rotated).is_err() && rotated.exists() {
                return;
            }
            if fs::rename(&self.path, rotated).is_err() {
                return;
            }
        }
        let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        else {
            return;
        };
        let _ = file.write_all(&line);
        let _ = file.flush();
    }
}

fn optional_pid(value: Option<u32>) -> Value {
    value.map_or(Value::Null, |value| json!(value))
}

fn optional_i32(value: Option<i32>) -> Value {
    value.map_or(Value::Null, |value| json!(value))
}

fn instance_fields(instance_id: &str, supervisor_pid: Option<u32>) -> Vec<(&'static str, Value)> {
    let mut fields = vec![("supervisorPid", optional_pid(supervisor_pid))];
    fields.extend(instance_identity(instance_id));
    fields
}

fn instance_fields_with_pid(
    instance_id: &str,
    pid: Option<u32>,
    supervisor_pid: Option<u32>,
) -> Vec<(&'static str, Value)> {
    let mut fields = vec![
        ("childPid", optional_pid(pid)),
        ("supervisorPid", optional_pid(supervisor_pid)),
    ];
    fields.extend(instance_identity(instance_id));
    fields
}

fn instance_identity(instance_id: &str) -> Vec<(&'static str, Value)> {
    if is_uuid(instance_id) {
        vec![("instanceId", json!(instance_id))]
    } else {
        Vec::new()
    }
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn monotonic_millis() -> u128 {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::{Arc, Barrier},
        thread,
    };

    fn test_root(label: &str) -> PathBuf {
        let parent = std::env::temp_dir();
        for attempt in 0..8 {
            let root = parent.join(format!(
                "hbar-native-diagnostics-{label}-{}-{attempt}",
                std::process::id()
            ));
            if fs::create_dir(&root).is_ok() {
                return root;
            }
        }
        panic!("could not create isolated native diagnostics test root");
    }

    fn cleanup_test_root(root: &Path) {
        let owned = fs::canonicalize(root).unwrap();
        let parent = fs::canonicalize(std::env::temp_dir()).unwrap();
        assert_eq!(owned.parent(), Some(parent.as_path()));
        assert!(owned
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("hbar-native-diagnostics-")));
        fs::remove_dir_all(owned).unwrap();
    }

    #[test]
    fn lifecycle_log_is_bounded_and_does_not_include_connection_secret() {
        let root = test_root("secret");
        let diagnostics = NativeDiagnostics::for_settings_root(&root);
        diagnostics.initialized();
        diagnostics.connection_reused("secret-instance", Some(42));
        let initial = fs::read_to_string(root.join("diagnostics/native-lifecycle.jsonl")).unwrap();
        assert!(!initial.contains("secret-instance"));
        assert!(initial.contains("launcher_initialized"));
        for _ in 0..4000 {
            diagnostics.host_start_timeout(Some(42));
        }
        let current = fs::metadata(root.join("diagnostics/native-lifecycle.jsonl"))
            .unwrap()
            .len();
        assert!(current <= MAX_FILE_BYTES);
        let text = fs::read_to_string(root.join("diagnostics/native-lifecycle.jsonl")).unwrap();
        let rotated = fs::read_to_string(root.join("diagnostics/native-lifecycle.jsonl.1"))
            .unwrap_or_default();
        assert!(!format!("{text}{rotated}").contains("secret-instance"));
        cleanup_test_root(&root);
    }

    #[test]
    fn concurrent_clones_keep_rotated_files_bounded_and_lines_valid_json() {
        let root = test_root("concurrent");
        let diagnostics = NativeDiagnostics::for_settings_root(&root);
        let barrier = Arc::new(Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|worker| {
                let barrier = Arc::clone(&barrier);
                let diagnostics = diagnostics.clone();
                thread::spawn(move || {
                    barrier.wait();
                    for _ in 0..2_000 {
                        diagnostics.host_start_timeout(Some((worker + 1) as u32));
                    }
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        let current_path = root.join("diagnostics/native-lifecycle.jsonl");
        let rotated_path = root.join("diagnostics/native-lifecycle.jsonl.1");
        for path in [current_path, rotated_path] {
            if !path.exists() {
                continue;
            }
            assert!(fs::metadata(&path).unwrap().len() <= MAX_FILE_BYTES);
            for line in fs::read_to_string(&path).unwrap().lines() {
                assert!(!line.is_empty());
                let parsed: Value = serde_json::from_str(line).unwrap();
                assert_eq!(parsed["schemaVersion"], 1);
                assert_eq!(parsed["component"], "desktop");
            }
        }
        cleanup_test_root(&root);
    }
}
