#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_chrome;

use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashSet, VecDeque},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::{Effect, EffectsBuilder},
    Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolWindowOpenOptions {
    window_id: String,
    title: String,
    url: String,
    width: Option<f64>,
    height: Option<f64>,
}

fn valid_tool_window_label(label: &str) -> bool {
    label.starts_with("tool-window-")
        && ("tool-window-".len()..=128).contains(&label.len())
        && label["tool-window-".len()..].chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_' | '.')
        })
}

fn tool_window_label(window_id: &str) -> String {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in window_id.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    let readable: String = window_id
        .chars()
        .map(|character| {
            if character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_' | '.')
            {
                character
            } else {
                '-'
            }
        })
        .take(72)
        .collect();
    format!("tool-window-{readable}-{hash:016x}")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowThemeSurface {
    mode: String,
    background_opacity: f64,
}

#[derive(Deserialize)]
struct WindowThemeProfile {
    surface: WindowThemeSurface,
    #[serde(default)]
    colors: WindowThemeColors,
}

#[derive(Default, Deserialize)]
struct WindowThemeColors {
    #[serde(default = "default_window_background")]
    background: String,
}

fn default_window_background() -> String {
    "#0b0d10".into()
}

fn window_background_rgba(value: &str, opacity: u8) -> (u8, u8, u8, u8) {
    let hex = value.strip_prefix('#').unwrap_or(value);
    let parse = |part: &str| u8::from_str_radix(part, 16).ok();
    let rgb = match hex.len() {
        6 | 8 => (parse(&hex[0..2]), parse(&hex[2..4]), parse(&hex[4..6])),
        _ => (None, None, None),
    };
    match rgb {
        (Some(red), Some(green), Some(blue)) => (red, green, blue, opacity),
        _ => (11, 13, 16, opacity),
    }
}

fn validate_window_theme(profile: &WindowThemeProfile) -> Result<(), String> {
    if !matches!(profile.surface.mode.as_str(), "solid" | "acrylic" | "liquid-glass") {
        return Err("Unsupported window surface mode".into());
    }
    if !profile.surface.background_opacity.is_finite()
        || !(0.12..=1.0).contains(&profile.surface.background_opacity)
    {
        return Err("Window background opacity is outside the theme contract".into());
    }
    let value = profile.colors.background.strip_prefix('#').unwrap_or(&profile.colors.background);
    if !matches!(value.len(), 6 | 8) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Window background must be a six or eight digit hex colour".into());
    }
    Ok(())
}

#[cfg(test)]
mod window_effect_tests {
    use super::{
        list_fonts, normalize_font_list, validate_window_theme, window_background_rgba,
        WindowThemeColors, WindowThemeProfile, WindowThemeSurface,
    };

    #[test]
    fn uses_theme_background_for_native_acrylic() {
        assert_eq!(window_background_rgba("#c7ced8", 210), (199, 206, 216, 210));
        assert_eq!(window_background_rgba("not-a-colour", 210), (11, 13, 16, 210));
    }

    #[test]
    fn rejects_window_effect_values_outside_theme_contract() {
        let profile = WindowThemeProfile {
            surface: WindowThemeSurface { mode: "acrylic".into(), background_opacity: 0.8 },
            colors: WindowThemeColors { background: "#0b0d10".into() },
        };
        assert!(validate_window_theme(&profile).is_ok());
        let invalid = WindowThemeProfile {
            surface: WindowThemeSurface { mode: "unknown".into(), background_opacity: 0.8 },
            colors: WindowThemeColors { background: "rgb(1, 2, 3)".into() },
        };
        assert!(validate_window_theme(&invalid).is_err());
    }

    #[test]
    fn normalizes_font_names_and_keeps_a_safe_fallback() {
        let fonts = normalize_font_list([
            " Segoe UI ".to_owned(),
            "Segoe UI".to_owned(),
            "url(https://example.invalid/font)".to_owned(),
            "body; color: red".to_owned(),
            "Noto Sans".to_owned(),
        ]);
        assert_eq!(
            fonts,
            vec!["Noto Sans".to_owned(), "Segoe UI".to_owned()]
        );
        assert!(list_fonts().iter().any(|font| font == "system-ui"));

        let bounded = normalize_font_list((0..4096).map(|index| format!("Font {index}")));
        assert_eq!(bounded.len(), 2048);
    }
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
    validate_window_theme(&profile)?;
    let opacity = (profile.surface.background_opacity.clamp(0.12, 1.0) * 255.0).round() as u8;
    match profile.surface.mode.as_str() {
        "acrylic" | "liquid-glass" => {
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::{apply_acrylic, clear_acrylic};
                // Re-applying Acrylic after a mode/opacity change can leave the
                // previous composition state behind on Windows. Clear first;
                // there may be no active effect, so the result is intentionally
                // ignored.
                let _ = clear_acrylic(&window);
                apply_acrylic(&window, Some(window_background_rgba(&profile.colors.background, opacity))).map_err(|error| error.to_string())?;
                return Ok(WindowEffectResult { native: true, message: None });
            }
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial};
                // Remove the previous material before applying the selected
                // profile so switching between profiles is deterministic.
                let _ = clear_vibrancy(&window);
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .map_err(|error| error.to_string())?;
                return Ok(WindowEffectResult { native: true, message: None });
            }
            #[cfg(not(any(target_os = "windows", target_os = "macos")))]
            {
                let _ = window;
                Ok(WindowEffectResult { native: false, message: Some("css-fallback".into()) })
            }
        }
        "solid" => {
            #[cfg(target_os = "windows")]
            {
                let _ = window_vibrancy::clear_acrylic(&window);
            }
            #[cfg(target_os = "macos")]
            {
                let _ = window_vibrancy::clear_vibrancy(&window);
            }
            Ok(WindowEffectResult { native: false, message: Some("solid-surface".into()) })
        }
        _ => Ok(WindowEffectResult { native: false, message: Some("css-fallback".into()) }),
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
    #[serde(default)]
    supervisor_pid: Option<u32>,
}

fn launched_by(connection: &Connection, expected_pid: u32) -> bool {
    expected_pid > 0
        && connection.pid.is_some_and(|pid| pid > 0)
        && connection.supervisor_pid.or(connection.pid) == Some(expected_pid)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathPointer {
    version: u8,
    data_root: PathBuf,
    cache_root: PathBuf,
    #[serde(default)]
    settings_root: Option<PathBuf>,
    #[serde(default)]
    identity_root: Option<PathBuf>,
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
    // The source-development launcher owns the watch process tree. A captured
    // Host PID can become stale after reload; let that launcher release it.
    if cfg!(debug_assertions) && std::env::var("HBAR_DESKTOP_DEV").as_deref() == Ok("1") {
        return;
    }
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

struct UiZoomPath(PathBuf);

#[derive(Default)]
struct NativeNotificationState {
    delivered: Mutex<DeliveredNotificationIds>,
}

const MAX_DELIVERED_NOTIFICATION_IDS: usize = 400;

#[derive(Default)]
struct DeliveredNotificationIds {
    ids: HashSet<String>,
    order: VecDeque<String>,
}

impl DeliveredNotificationIds {
    fn contains(&self, id: &str) -> bool {
        self.ids.contains(id)
    }

    fn insert(&mut self, id: String) {
        if !self.ids.insert(id.clone()) {
            return;
        }
        self.order.push_back(id);
        while self.order.len() > MAX_DELIVERED_NOTIFICATION_IDS {
            if let Some(evicted) = self.order.pop_front() {
                self.ids.remove(&evicted);
            }
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeNotificationRequest {
    id: String,
    title: String,
    body: String,
}

fn valid_notification_text(value: &str, field: &str, max_bytes: usize) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("Notification {field} must not be empty"));
    }
    if value.len() > max_bytes {
        return Err(format!("Notification {field} exceeds {max_bytes} bytes"));
    }
    Ok(())
}

fn valid_notification_body(value: &str) -> Result<(), String> {
    if value.len() > 4096 {
        return Err("Notification body exceeds 4096 bytes".into());
    }
    Ok(())
}

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
    let expected = tauri::Url::parse(&state.url).map_err(|e| e.to_string())?;
    if window.label() != "main" && !valid_tool_window_label(window.label())
        || !is_allowed_web_origin(&window.url().map_err(|e| e.to_string())?, &expected)
    {
        return Err("Connection credentials are restricted to the local workbench".into());
    }
    Ok(state.inner().clone())
}

#[tauri::command]
fn open_tool_window(
    app: tauri::AppHandle,
    source: tauri::WebviewWindow,
    options: ToolWindowOpenOptions,
) -> Result<String, String> {
    let label = tool_window_label(&options.window_id);
    if !valid_tool_window_label(&label) {
        return Err("Invalid Tool Window label".into());
    }
    let expected = source.url().map_err(|error| error.to_string())?;
    let target = tauri::Url::parse(&options.url).map_err(|error| error.to_string())?;
    if !is_allowed_web_origin(&target, &expected) {
        return Err("Tool Window URL must use the workbench origin".into());
    }
    if let Some(existing) = app.get_webview_window(&label) {
        existing.show().map_err(|error| error.to_string())?;
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(options.window_id);
    }
    let width = options.width.unwrap_or(920.0).clamp(480.0, 2400.0);
    let height = options.height.unwrap_or(720.0).clamp(360.0, 1800.0);
    let event_window_id = options.window_id.clone();
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target))
        .title(options.title)
        .transparent(true)
        .inner_size(width, height)
        .min_inner_size(420.0, 280.0)
        .on_navigation(move |next| is_allowed_web_origin(next, &expected))
        .build()
        .map_err(|error| error.to_string())?;
    let event_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = event_app.emit("tool-window-event", serde_json::json!({
                "type": "closed",
                "windowId": event_window_id,
            }));
        }
    });
    Ok(options.window_id)
}

#[tauri::command]
fn focus_tool_window(app: tauri::AppHandle, window_id: String) -> Result<(), String> {
    let label = tool_window_label(&window_id);
    if !valid_tool_window_label(&label) {
        return Err("Invalid Tool Window label".into());
    }
    let window = app.get_webview_window(&label).ok_or_else(|| "Tool Window not found".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn close_tool_window(app: tauri::AppHandle, window_id: String) -> Result<(), String> {
    let label = tool_window_label(&window_id);
    if !valid_tool_window_label(&label) {
        return Err("Invalid Tool Window label".into());
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
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

fn curated_fonts() -> Vec<String> {
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

fn normalize_font_list(values: impl IntoIterator<Item = String>) -> Vec<String> {
    const MAX_FONT_FAMILIES: usize = 2048;
    let mut fonts = BTreeSet::new();
    for value in values {
        let name = value.trim();
        if name.is_empty()
            || name.len() > 240
            || name.chars().any(|character| character.is_control())
            || name.contains(';')
            || name.contains('{')
            || name.contains('}')
            || name.to_ascii_lowercase().contains("url(")
            || name.to_ascii_lowercase().contains("var(")
            || name.to_ascii_lowercase().contains("expression(")
        {
            continue;
        }
        fonts.insert(name.to_owned());
        if fonts.len() >= MAX_FONT_FAMILIES {
            break;
        }
    }
    fonts.into_iter().collect()
}

#[cfg(target_os = "windows")]
fn system_font_names() -> Vec<String> {
    use std::os::windows::process::CommandExt;

    const SCRIPT: &str = r#"
$paths = @(
  'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
  'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
)
foreach ($path in $paths) {
  if (Test-Path $path) {
    (Get-ItemProperty -Path $path).PSObject.Properties |
      Where-Object { $_.Name -notlike 'PS*' } |
      ForEach-Object { ($_.Name -replace '\s+\([^)]*\)$', '') }
  }
}
"#;
    Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
        .creation_flags(0x08000000)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn system_font_names() -> Vec<String> {
    let output = Command::new("system_profiler")
        .args(["SPFontsDataType", "-json"])
        .output()
        .ok()
        .filter(|output| output.status.success());
    let Some(output) = output else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return Vec::new();
    };
    let mut families = Vec::new();
    collect_font_families(&value, &mut families);
    families
}

#[cfg(target_os = "macos")]
fn collect_font_families(value: &serde_json::Value, families: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(entries) => {
            if let Some(serde_json::Value::String(family)) = entries.get("family") {
                families.push(family.clone());
            }
            for entry in entries.values() {
                collect_font_families(entry, families);
            }
        }
        serde_json::Value::Array(entries) => {
            for entry in entries {
                collect_font_families(entry, families);
            }
        }
        _ => {}
    }
}

#[cfg(target_os = "linux")]
fn system_font_names() -> Vec<String> {
    Command::new("fc-list")
        .args([":", "family"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .flat_map(|line| line.split(','))
                .map(str::trim)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn system_font_names() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
fn list_fonts() -> Vec<String> {
    normalize_font_list(curated_fonts().into_iter().chain(system_font_names()))
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

#[tauri::command]
fn native_notification_permission(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    require_main_workbench(&window, &connection)?;
    app.notification()
        .permission_state()
        .map(|state| format!("{state:?}"))
        .map_err(|error| format!("Unable to read notification permission: {error}"))
}

#[tauri::command]
fn request_native_notification_permission(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    require_main_workbench(&window, &connection)?;
    app.notification()
        .request_permission()
        .map(|state| format!("{state:?}"))
        .map_err(|error| format!("Unable to request notification permission: {error}"))
}

#[tauri::command]
fn send_native_notification(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeNotificationState>,
    request: NativeNotificationRequest,
) -> Result<bool, String> {
    require_main_workbench(&window, &connection)?;
    valid_notification_text(&request.id, "id", 256)?;
    valid_notification_text(&request.title, "title", 256)?;
    valid_notification_body(&request.body)?;
    let mut delivered = state
        .delivered
        .lock()
        .map_err(|_| "Notification delivery state is unavailable".to_string())?;
    if delivered.contains(&request.id) {
        return Ok(false);
    }
    let notification = app.notification().builder().title(request.title);
    let notification = if request.body.trim().is_empty() {
        notification
    } else {
        notification.body(request.body)
    };
    notification
        .show()
        .map_err(|error| format!("Unable to show native notification: {error}"))?;
    delivered.insert(request.id);
    Ok(true)
}

/// Read-only acknowledgement that this workbench accepted a notification id.
/// This does not send a notification or mark it read; it only exposes the
/// bounded in-memory delivery ledger to the owning WebView for verification.
#[tauri::command]
fn native_notification_delivery_status(
    window: tauri::WebviewWindow,
    connection: tauri::State<'_, Connection>,
    state: tauri::State<'_, NativeNotificationState>,
    id: String,
) -> Result<bool, String> {
    require_main_workbench(&window, &connection)?;
    valid_notification_text(&id, "id", 256)?;
    let delivered = state
        .delivered
        .lock()
        .map_err(|_| "Notification delivery state is unavailable".to_string())?;
    Ok(delivered.contains(&id))
}

fn existing(settings_root: &Path, expected_pid: Option<u32>) -> Option<Connection> {
    let connection: Connection =
        serde_json::from_slice(&fs::read(settings_root.join("connection.json")).ok()?)
            .ok()?;
    let url = tauri::Url::parse(&connection.url).ok()?;
    if expected_pid.is_some_and(|pid| !launched_by(&connection, pid)) {
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

fn path_roots(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), Box<dyn std::error::Error>> {
    let compatibility_root = std::env::var_os("HBAR_HOME").map(PathBuf::from);
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
        .filter(|value| value.version == 1 || value.version == 2);
    let explicit_root = compatibility_root
        .clone()
        .or_else(|| std::env::var_os("HBAR_DATA_ROOT").map(PathBuf::from));
    let preferred = pointer
        .as_ref()
        .filter(|value| value.version == 2)
        .filter(|value| {
            explicit_root.as_ref().is_none_or(|root| {
                root == &value.data_root || value.identity_root.as_ref() == Some(root)
            })
        });
    let data_root = preferred
        .map(|value| value.data_root.clone())
        .or(explicit_root)
        .or_else(|| pointer.as_ref().map(|value| value.data_root.clone()))
        .unwrap_or_else(|| system_root.join("data"));
    let cache_root = preferred
        .map(|value| value.cache_root.clone())
        .or_else(|| compatibility_root.as_ref().map(|root| root.join("cache")))
        .or_else(|| std::env::var_os("HBAR_CACHE_ROOT").map(PathBuf::from))
        .or_else(|| pointer.as_ref().map(|value| value.cache_root.clone()))
        .unwrap_or_else(|| system_root.join("cache"));
    let settings_root = pointer
        .as_ref()
        .filter(|value| value.data_root == data_root)
        .and_then(|value| value.settings_root.clone())
        .unwrap_or_else(|| data_root.join("settings"));
    Ok((
        dunce::simplified(&data_root).to_path_buf(),
        dunce::simplified(&cache_root).to_path_buf(),
        dunce::simplified(&settings_root).to_path_buf(),
    ))
}

fn launch(app: &tauri::AppHandle) -> Result<(Connection, PathBuf), Box<dyn std::error::Error>> {
    let (data_root, cache_root, settings_root) = path_roots(app)?;
    fs::create_dir_all(&settings_root)?;
    fs::create_dir_all(&cache_root)?;
    if let Some(connection) = existing(&settings_root, None) {
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
    let development_url = development_web_url();
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
    if let Some(url) = development_url {
        command
            .arg("--origin")
            .arg(url.origin().ascii_serialization());
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
        if let Some(connection) = existing(&settings_root, Some(child_pid)) {
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
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            connection_info,
            open_tool_window,
            focus_tool_window,
            close_tool_window,
            pick_directory,
            list_fonts,
            set_window_effect,
            read_ui_zoom,
            write_ui_zoom,
            native_notification_permission,
            request_native_notification_permission,
            send_native_notification,
            native_notification_delivery_status,
            desktop_chrome::set_desktop_chrome_copy
        ])
        .setup(|app| {
            let startup_copy = desktop_chrome::startup_copy()?;
            let (connection, data_root) = launch(app.handle())?;
            let origin = tauri::Url::parse(&connection.url)?.origin();
            let url = tauri::Url::parse(&connection.url)?;
            let (platform, material, effect) = native_window_profile();
            let mut web_url = development_web_url().unwrap_or_else(|| url.clone());
            web_url
                .query_pairs_mut()
                .append_pair("hbar-native", "1")
                .append_pair("hbar-platform", platform)
                .append_pair("hbar-material", material);
            let host_pid = connection.pid;
            app.manage(UiZoomPath(
                data_root.join("settings").join("desktop-ui-zoom.json"),
            ));
            app.manage(NativeNotificationState::default());
            app.manage(connection);
            let mut window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(web_url))
                    .title(&startup_copy.window_title)
                    .inner_size(1440.0, 960.0)
                    .min_inner_size(900.0, 600.0)
                    .decorations(false)
                    .shadow(true)
                    .on_navigation(move |next| {
                        next.origin() == origin
                            || development_web_url()
                                .is_some_and(|dev_url| next.origin() == dev_url.origin())
                    });
            if let Some(effect) = effect {
                window_builder = window_builder
                    .transparent(true)
                    .effects(EffectsBuilder::new().effect(effect).build());
            }
            let window = window_builder.build()?;
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
            let open = MenuItem::with_id(app, "open", &startup_copy.tray_open, true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", &startup_copy.tray_exit, true, None::<&str>)?;
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
            let tray = TrayIconBuilder::new()
                .icon(Image::new_owned(pixels, 32, 32))
                .tooltip(&startup_copy.tray_tooltip)
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
            app.manage(desktop_chrome::DesktopChromeState::new(open, exit, tray, startup_copy));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_identity_distinguishes_supervisor_from_live_host_and_preserves_legacy_direct_hosts() {
        let mut connection: Connection = serde_json::from_str(
            r#"{"url":"http://127.0.0.1:4321","token":"fixture","instanceId":"instance","pid":42,"supervisorPid":7}"#,
        ).unwrap();
        assert!(launched_by(&connection, 7));
        assert!(!launched_by(&connection, 42));
        assert!(!launched_by(&connection, 99));
        assert!(!launched_by(&connection, 0));
        connection.pid = None;
        assert!(!launched_by(&connection, 7));
        let legacy: Connection = serde_json::from_str(
            r#"{"url":"http://127.0.0.1:4321","token":"fixture","instanceId":"instance","pid":42}"#,
        ).unwrap();
        assert!(launched_by(&legacy, 42));
        assert!(!launched_by(&legacy, 7));
    }

    #[test]
    fn native_notification_accepts_title_only_host_records_and_bounds_utf8_body_bytes() {
        assert!(valid_notification_body("").is_ok());
        assert!(valid_notification_body("   ").is_ok());
        assert!(valid_notification_body(&"a".repeat(4096)).is_ok());
        assert!(valid_notification_body(&"界".repeat(1365)).is_ok());
        assert!(valid_notification_body(&"a".repeat(4097)).is_err());
        assert!(valid_notification_body(&"界".repeat(1366)).is_err());
        assert!(valid_notification_text("", "title", 256).is_err());
    }

    #[test]
    fn native_notification_deduplication_is_bounded_and_fifo() {
        let mut delivered = DeliveredNotificationIds::default();
        delivered.insert("first".to_string());
        for index in 0..MAX_DELIVERED_NOTIFICATION_IDS {
            delivered.insert(format!("event-{index}"));
        }
        assert_eq!(delivered.order.len(), MAX_DELIVERED_NOTIFICATION_IDS);
        assert!(!delivered.contains("first"));
        assert!(delivered.contains("event-0"));
        delivered.insert("newest".to_string());
        assert_eq!(delivered.order.len(), MAX_DELIVERED_NOTIFICATION_IDS);
        assert!(!delivered.contains("event-0"));
        assert!(delivered.contains("newest"));
    }

    #[test]
    fn native_notification_delivery_status_tracks_membership_without_inserting() {
        let mut delivered = DeliveredNotificationIds::default();
        assert!(!delivered.contains("run-1"));
        delivered.insert("run-1".to_string());
        assert!(delivered.contains("run-1"));
        delivered.insert("run-1".to_string());
        assert_eq!(delivered.order, vec!["run-1"]);
    }

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
