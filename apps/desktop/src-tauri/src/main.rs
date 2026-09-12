#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowThemeSurface {
    mode: String,
    background_opacity: f64,
}

#[derive(Deserialize)]
struct WindowThemeProfile {
    surface: WindowThemeSurface,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowEffectResult {
    native: bool,
    message: Option<String>,
}

#[tauri::command]
fn set_window_effect(
    window: tauri::WebviewWindow,
    profile: WindowThemeProfile,
) -> Result<WindowEffectResult, String> {
    let opacity = (profile.surface.background_opacity.clamp(0.12, 1.0) * 255.0).round() as u8;
    match profile.surface.mode.as_str() {
        "acrylic" | "liquid-glass" => {
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_acrylic;
                apply_acrylic(&window, Some((18, 20, 24, opacity))).map_err(|error| error.to_string())?;
                return Ok(WindowEffectResult { native: true, message: None });
            }
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .map_err(|error| error.to_string())?;
                return Ok(WindowEffectResult { native: true, message: None });
            }
            #[cfg(not(any(target_os = "windows", target_os = "macos")))]
            {
                let _ = window;
                Ok(WindowEffectResult { native: false, message: Some("当前平台使用 CSS 模糊回退。".into()) })
            }
        }
        _ => Ok(WindowEffectResult { native: false, message: Some("纯色表面不启用原生模糊。".into()) }),
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    url: String,
    token: String,
    instance_id: String,
    #[serde(default)]
    pid: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathPointer {
    version: u8,
    data_root: PathBuf,
    cache_root: PathBuf,
}

fn development_web_url() -> Option<tauri::Url> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let raw = std::env::var("HBAR_WEB_DEV_URL").ok()?;
    let url = tauri::Url::parse(&raw).ok()?;
    (url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        && url.path() == "/")
        .then_some(url)
}

fn is_allowed_web_origin(candidate: &tauri::Url, host_url: &tauri::Url) -> bool {
    candidate.origin() == host_url.origin()
        || development_web_url().is_some_and(|dev_url| candidate.origin() == dev_url.origin())
}

#[cfg(windows)]
fn should_exit_service() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    const MB_YESNO: u32 = 0x0000_0004;
    const MB_ICONQUESTION: u32 = 0x0000_0020;
    const IDYES: i32 = 6;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            ty: u32,
        ) -> i32;
    }
    let text: Vec<u16> =
        OsStr::new("退出服务？\n选择“是”退出 hbar 和本地 Host 服务；选择“否”隐藏到托盘。\0")
            .encode_wide()
            .collect();
    let caption: Vec<u16> = OsStr::new("hbar").encode_wide().chain(Some(0)).collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_YESNO | MB_ICONQUESTION,
        ) == IDYES
    }
}

#[cfg(not(windows))]
fn should_exit_service() -> bool {
    false
}

fn stop_host(pid: Option<u32>) {
    let Some(pid) = pid else { return };
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
}

fn exit_service(app: &tauri::AppHandle) {
    let pid = app
        .try_state::<Connection>()
        .and_then(|connection| connection.pid);
    stop_host(pid);
    app.exit(0);
}

#[tauri::command]
fn connection_info(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Connection>,
) -> Result<Connection, String> {
    let expected = tauri::Url::parse(&state.url).map_err(|e| e.to_string())?;
    if window.label() != "main"
        || !is_allowed_web_origin(&window.url().map_err(|e| e.to_string())?, &expected)
    {
        return Err("Connection credentials are restricted to the local workbench".into());
    }
    Ok(state.inner().clone())
}

#[tauri::command]
#[cfg(target_os = "windows")]
fn pick_directory() -> Option<String> {
    use std::os::windows::process::CommandExt;

    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择工作区目录'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }
"#;
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-STA", "-NonInteractive", "-Command", script])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|path| !path.is_empty())
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn pick_directory() -> Option<String> {
    None
}

#[tauri::command]
fn list_fonts() -> Vec<String> {
    vec![
        "system-ui".into(),
        "Segoe UI".into(),
        "Microsoft YaHei".into(),
        "PingFang SC".into(),
        "Noto Sans".into(),
        "Arial".into(),
        "sans-serif".into(),
    ]
}

fn existing(data_root: &Path, expected_pid: Option<u32>) -> Option<Connection> {
    let connection: Connection =
        serde_json::from_slice(&fs::read(data_root.join("settings").join("connection.json")).ok()?)
            .ok()?;
    let url = tauri::Url::parse(&connection.url).ok()?;
    if expected_pid.is_some() && connection.pid != expected_pid {
        return None;
    }
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

fn launch(app: &tauri::AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let (data_root, cache_root) = path_roots(app)?;
    fs::create_dir_all(data_root.join("settings"))?;
    fs::create_dir_all(&cache_root)?;
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
        .args(["--desktop", "--port"])
        .arg(if development_web_url().is_some() { "4317" } else { "0" })
        .arg("--data-root")
        .arg(&data_root)
        .arg("--cache-root")
        .arg(&cache_root)
        .env("HBAR_STORAGE_WORKER", resources.join("storage-worker.js"))
        .env("HBAR_WEB_ROOT", resources.join("web"))
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log);
    if development_web_url().is_some() {
        command
            .arg("--origin")
            .arg("http://127.0.0.1:5173")
            .arg("--origin")
            .arg("http://localhost:5173");
    }
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
    let child_pid = child.id();
    let started = Instant::now();
    loop {
        if let Some(connection) = existing(&data_root, Some(child_pid)) {
            return Ok(connection);
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![connection_info, pick_directory, list_fonts, set_window_effect])
        .setup(|app| {
            let connection = launch(app.handle())?;
            let origin = tauri::Url::parse(&connection.url)?.origin();
            let url = tauri::Url::parse(&connection.url)?;
            let mut web_url = development_web_url().unwrap_or_else(|| url.clone());
            if development_web_url().is_some() {
                web_url
                    .query_pairs_mut()
                    .append_pair("hbarHost", &connection.url)
                    .append_pair("hbarToken", &connection.token);
            }
            let host_pid = connection.pid;
            app.manage(connection);
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(web_url))
                .title("hbar")
                .transparent(true)
                .inner_size(1440.0, 960.0)
                .min_inner_size(900.0, 600.0)
                .on_navigation(move |next| {
                    next.origin() == origin
                        || development_web_url()
                            .is_some_and(|dev_url| next.origin() == dev_url.origin())
                })
                .build()?;
            let handle = window.clone();
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if should_exit_service() {
                        stop_host(host_pid);
                        app_handle.exit(0);
                    } else {
                        let _ = handle.hide();
                    }
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
                    "exit" => exit_service(app),
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
        .build(tauri::generate_context!())
        .expect("Unable to start hbar desktop")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                let pid = app
                    .try_state::<Connection>()
                    .and_then(|connection| connection.pid);
                stop_host(pid);
            }
        });
}
