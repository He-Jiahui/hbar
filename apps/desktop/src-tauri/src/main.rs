#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::{Effect, EffectsBuilder},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    url: String,
    token: String,
    instance_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathPointer {
    version: u8,
    data_root: PathBuf,
    cache_root: PathBuf,
}

struct UiZoomPath(PathBuf);

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct UiZoomPreference {
    version: u8,
    zoom: f64,
}

const MAX_UI_ZOOM_FILE_BYTES: u64 = 4_096;
static UI_ZOOM_WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn valid_ui_zoom(zoom: f64) -> Result<f64, String> {
    if zoom.is_finite() && (0.5..=2.0).contains(&zoom) {
        Ok(zoom)
    } else {
        Err("UI zoom must be a finite number between 0.5 and 2.0".into())
    }
}

fn read_ui_zoom_file(path: &Path) -> Result<Option<f64>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Unable to inspect UI zoom preference: {error}")),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("UI zoom preference is not a regular file".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|error| format!("Unable to open UI zoom preference: {error}"))?
        .take(MAX_UI_ZOOM_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read UI zoom preference: {error}"))?;
    if bytes.len() as u64 > MAX_UI_ZOOM_FILE_BYTES {
        return Err("UI zoom preference exceeds the 4 KiB limit".into());
    }
    let preference: UiZoomPreference = serde_json::from_slice(&bytes)
        .map_err(|error| format!("UI zoom preference is invalid JSON: {error}"))?;
    if preference.version != 1 {
        return Err("UI zoom preference has an unsupported version".into());
    }
    valid_ui_zoom(preference.zoom).map(Some)
}

fn write_ui_zoom_file(path: &Path, zoom: f64) -> Result<f64, String> {
    let zoom = valid_ui_zoom(zoom)?;
    let parent = path
        .parent()
        .ok_or_else(|| "UI zoom preference has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create UI zoom settings directory: {error}"))?;
    let preference = serde_json::to_vec(&UiZoomPreference { version: 1, zoom })
        .map_err(|error| format!("Unable to encode UI zoom preference: {error}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Unable to timestamp UI zoom preference: {error}"))?
        .as_nanos();
    let sequence = UI_ZOOM_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = parent.join(format!(
        ".desktop-ui-zoom.{}.{timestamp}.{sequence}.tmp",
        std::process::id()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("Unable to stage UI zoom preference: {error}"))?;
        file.write_all(&preference)
            .map_err(|error| format!("Unable to write UI zoom preference: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Unable to flush UI zoom preference: {error}"))?;
        drop(file);
        fs::rename(&temporary, path)
            .map_err(|error| format!("Unable to replace UI zoom preference: {error}"))?;
        Ok(zoom)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn is_main_workbench(label: &str, current: &tauri::Url, expected: &tauri::Url) -> bool {
    label == "main"
        && expected.scheme() == "http"
        && expected.host_str() == Some("127.0.0.1")
        && current.origin() == expected.origin()
}

fn require_main_workbench(
    window: &tauri::WebviewWindow,
    connection: &Connection,
) -> Result<(), String> {
    let expected = tauri::Url::parse(&connection.url).map_err(|error| error.to_string())?;
    let current = window.url().map_err(|error| error.to_string())?;
    if is_main_workbench(window.label(), &current, &expected) {
        Ok(())
    } else {
        Err("Desktop preferences are restricted to the local workbench".into())
    }
}

#[tauri::command]
fn connection_info(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Connection>,
) -> Result<Connection, String> {
    require_main_workbench(&window, &state)
        .map_err(|_| "Connection credentials are restricted to the local workbench".to_string())?;
    Ok(state.inner().clone())
}

#[tauri::command]
fn read_ui_zoom(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    preference: tauri::State<'_, UiZoomPath>,
) -> Result<Option<f64>, String> {
    require_main_workbench(&window, &connection)?;
    read_ui_zoom_file(&preference.0)
}

#[tauri::command]
fn write_ui_zoom(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    preference: tauri::State<'_, UiZoomPath>,
    zoom: f64,
) -> Result<f64, String> {
    require_main_workbench(&window, &connection)?;
    write_ui_zoom_file(&preference.0, zoom)
}

fn existing(data_root: &Path) -> Option<Connection> {
    let connection: Connection =
        serde_json::from_slice(&fs::read(data_root.join("settings").join("connection.json")).ok()?)
            .ok()?;
    let url = tauri::Url::parse(&connection.url).ok()?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
        return None;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
        .ok()?;
    let status: serde_json::Value = client
        .get(format!("{}/healthz", connection.url))
        .send()
        .ok()?
        .json()
        .ok()?;
    (status["instanceId"].as_str() == Some(&connection.instance_id)).then_some(connection)
}

fn path_roots(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), Box<dyn std::error::Error>> {
    if let Some(home) = std::env::var_os("HBAR_HOME") {
        let data_root = PathBuf::from(home);
        return Ok((data_root.clone(), data_root.join("cache")));
    }
    let system_root = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or(app.path().home_dir()?.join("AppData").join("Local"))
            .join("hbar")
    } else {
        app.path().app_local_data_dir()?
    };
    let pointer_file = system_root.join("paths.json");
    let pointer = fs::read(pointer_file)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<PathPointer>(&bytes).ok())
        .filter(|value| value.version == 1);
    let data_root = std::env::var_os("HBAR_DATA_ROOT")
        .map(PathBuf::from)
        .or_else(|| pointer.as_ref().map(|value| value.data_root.clone()))
        .unwrap_or_else(|| system_root.join("data"));
    let cache_root = std::env::var_os("HBAR_CACHE_ROOT")
        .map(PathBuf::from)
        .or_else(|| pointer.map(|value| value.cache_root))
        .unwrap_or_else(|| system_root.join("cache"));
    Ok((
        dunce::simplified(&data_root).to_path_buf(),
        dunce::simplified(&cache_root).to_path_buf(),
    ))
}

fn launch(app: &tauri::AppHandle) -> Result<(Connection, PathBuf), Box<dyn std::error::Error>> {
    let (data_root, cache_root) = path_roots(app)?;
    fs::create_dir_all(data_root.join("settings"))?;
    fs::create_dir_all(&cache_root)?;
    if let Some(connection) = existing(&data_root) {
        return Ok((connection, data_root));
    }
    let resources = if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../dist/desktop-resources")
    } else {
        app.path().resource_dir()?.join("runtime")
    };
    // Tauri returns verbatim Windows paths; Bun's module loader expects ordinary drive/UNC paths.
    let resources = dunce::simplified(&resources).to_path_buf();
    let executable = resources.join(if cfg!(windows) { "bun.exe" } else { "bun" });
    let diagnostics = data_root.join("diagnostics");
    fs::create_dir_all(&diagnostics)?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(diagnostics.join("desktop-host.log"))?;
    let mut command = Command::new(executable);
    command
        .arg(resources.join("host.js"))
        .args(["--supervisor", "--desktop", "--port", "0", "--data-root"])
        .arg(&data_root)
        .arg("--cache-root")
        .arg(&cache_root)
        .env("HBAR_STORAGE_WORKER", resources.join("storage-worker.js"))
        .env("HBAR_WEB_ROOT", resources.join("web"))
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log);
    if let Some(workspace) = std::env::var_os("HBAR_WORKSPACE") {
        command.arg("--workspace").arg(workspace);
    }
    if std::env::var("HBAR_DEMO").as_deref() == Ok("1") {
        command.arg("--demo");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn()?;
    let started = Instant::now();
    loop {
        if let Some(connection) = existing(&data_root) {
            return Ok((connection, data_root));
        }
        if let Some(status) = child.try_wait()? {
            return Err(format!(
                "Host exited with {status}. See {}",
                diagnostics.join("desktop-host.log").display()
            )
            .into());
        }
        if started.elapsed() > Duration::from_secs(30) {
            return Err(format!(
                "Host startup timed out. See {}",
                diagnostics.join("desktop-host.log").display()
            )
            .into());
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(target_os = "windows")]
fn windows_supports_mica() -> bool {
    #[repr(C)]
    struct RtlOsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform_id: u32,
        service_pack: [u16; 128],
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut RtlOsVersionInfo) -> i32;
    }

    let mut version = RtlOsVersionInfo {
        size: std::mem::size_of::<RtlOsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform_id: 0,
        service_pack: [0; 128],
    };
    // RtlGetVersion reports the actual kernel build even when compatibility
    // manifests would make the public version helpers return an older value.
    let status = unsafe { RtlGetVersion(&mut version) };
    status >= 0 && version.major >= 10 && version.build >= 22_000
}

#[cfg(target_os = "windows")]
fn native_window_profile() -> (&'static str, &'static str, Option<Effect>) {
    if windows_supports_mica() {
        ("windows", "mica", Some(Effect::Mica))
    } else {
        ("windows", "solid", None)
    }
}

#[cfg(target_os = "macos")]
fn native_window_profile() -> (&'static str, &'static str, Option<Effect>) {
    ("macos", "vibrancy", Some(Effect::UnderWindowBackground))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn native_window_profile() -> (&'static str, &'static str, Option<Effect>) {
    ("linux", "solid", None)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            connection_info,
            read_ui_zoom,
            write_ui_zoom
        ])
        .setup(|app| {
            let (connection, data_root) = launch(app.handle())?;
            let origin = tauri::Url::parse(&connection.url)?.origin();
            let mut url = tauri::Url::parse(&connection.url)?;
            let (platform, material, effect) = native_window_profile();
            url.query_pairs_mut()
                .append_pair("hbar-native", "1")
                .append_pair("hbar-platform", platform)
                .append_pair("hbar-material", material);
            app.manage(UiZoomPath(
                data_root.join("settings").join("desktop-ui-zoom.json"),
            ));
            app.manage(connection);
            let mut window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                    .title("hbar")
                    .inner_size(1440.0, 960.0)
                    .min_inner_size(900.0, 600.0)
                    .decorations(false)
                    .shadow(true)
                    .on_navigation(move |next| next.origin() == origin);
            if let Some(effect) = effect {
                window_builder = window_builder
                    .transparent(true)
                    .effects(EffectsBuilder::new().effect(effect).build());
            }
            let window = window_builder.build()?;
            let handle = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = handle.hide();
                }
            });
            let open = MenuItem::with_id(app, "open", "Open hbar", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit desktop", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &exit])?;
            let mut pixels = vec![0u8; 32 * 32 * 4];
            for y in 0..32 {
                for x in 0..32 {
                    let mark = (7..11).contains(&x) && (5..27).contains(&y)
                        || (21..25).contains(&x) && (12..27).contains(&y)
                        || (7..25).contains(&x) && (12..16).contains(&y);
                    pixels[(y * 32 + x) * 4..(y * 32 + x) * 4 + 4].copy_from_slice(if mark {
                        &[130, 193, 162, 255]
                    } else {
                        &[35, 37, 42, 255]
                    });
                }
            }
            TrayIconBuilder::new()
                .icon(Image::new_owned(pixels, 32, 32))
                .tooltip("hbar")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start hbar desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path(name: &str) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "hbar-desktop-ui-zoom-test-{}-{}-{}",
            std::process::id(),
            name,
            UI_ZOOM_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).expect("create isolated UI zoom fixture");
        let preference = root.join("settings").join("desktop-ui-zoom.json");
        (root, preference)
    }

    #[test]
    fn ui_zoom_accepts_only_finite_values_within_native_range() {
        for value in [0.5, 1.0, 1.25, 2.0] {
            assert_eq!(valid_ui_zoom(value).unwrap(), value);
        }
        for value in [
            0.0,
            0.499,
            2.001,
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
        ] {
            assert!(valid_ui_zoom(value).is_err());
        }
    }

    #[test]
    fn ui_zoom_read_distinguishes_missing_and_damaged_preferences() {
        let (root, preference) = fixture_path("read");
        assert_eq!(read_ui_zoom_file(&preference).unwrap(), None);
        fs::create_dir_all(preference.parent().unwrap()).unwrap();
        for invalid in [
            b"not-json".as_slice(),
            br#"{"version":2,"zoom":1}"#.as_slice(),
            br#"{"version":1,"zoom":3}"#.as_slice(),
        ] {
            fs::write(&preference, invalid).unwrap();
            assert!(read_ui_zoom_file(&preference).is_err());
        }
        fs::write(&preference, vec![b' '; MAX_UI_ZOOM_FILE_BYTES as usize + 1]).unwrap();
        assert!(read_ui_zoom_file(&preference)
            .unwrap_err()
            .contains("4 KiB"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ui_zoom_write_atomically_replaces_the_preference_and_preserves_it_on_invalid_input() {
        let (root, preference) = fixture_path("write");
        assert_eq!(write_ui_zoom_file(&preference, 0.75).unwrap(), 0.75);
        assert_eq!(read_ui_zoom_file(&preference).unwrap(), Some(0.75));
        assert_eq!(write_ui_zoom_file(&preference, 1.5).unwrap(), 1.5);
        assert_eq!(read_ui_zoom_file(&preference).unwrap(), Some(1.5));
        assert!(write_ui_zoom_file(&preference, 2.5).is_err());
        assert_eq!(read_ui_zoom_file(&preference).unwrap(), Some(1.5));
        assert_eq!(
            fs::read_dir(preference.parent().unwrap()).unwrap().count(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ui_zoom_origin_is_limited_to_the_current_loopback_main_webview() {
        let expected = tauri::Url::parse("http://127.0.0.1:4321").unwrap();
        let current = tauri::Url::parse("http://127.0.0.1:4321/?hbar-native=1").unwrap();
        assert!(is_main_workbench("main", &current, &expected));
        assert!(!is_main_workbench("child", &current, &expected));
        assert!(!is_main_workbench(
            "main",
            &tauri::Url::parse("http://127.0.0.1:4322").unwrap(),
            &expected
        ));
        assert!(!is_main_workbench(
            "main",
            &current,
            &tauri::Url::parse("http://localhost:4321").unwrap()
        ));
    }
}
