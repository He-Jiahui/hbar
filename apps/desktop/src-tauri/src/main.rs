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
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    url: String,
    token: String,
    instance_id: String,
}

#[tauri::command]
fn connection_info(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Connection>,
) -> Result<Connection, String> {
    let expected = tauri::Url::parse(&state.url).map_err(|e| e.to_string())?;
    if window.label() != "main"
        || window.url().map_err(|e| e.to_string())?.origin() != expected.origin()
    {
        return Err("Connection credentials are restricted to the local workbench".into());
    }
    Ok(state.inner().clone())
}

fn existing(home: &Path) -> Option<Connection> {
    let connection: Connection =
        serde_json::from_slice(&fs::read(home.join("connection.json")).ok()?).ok()?;
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

fn launch(app: &tauri::AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let home = std::env::var_os("HBAR_HOME")
        .map(PathBuf::from)
        .unwrap_or(app.path().home_dir()?.join(".hbar"));
    let home = dunce::simplified(&home).to_path_buf();
    fs::create_dir_all(&home)?;
    if let Some(connection) = existing(&home) {
        return Ok(connection);
    }
    let resources = if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../dist/desktop-resources")
    } else {
        app.path().resource_dir()?.join("runtime")
    };
    // Tauri returns verbatim Windows paths; Bun's module loader expects ordinary drive/UNC paths.
    let resources = dunce::simplified(&resources).to_path_buf();
    let executable = resources.join(if cfg!(windows) { "bun.exe" } else { "bun" });
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(home.join("host.log"))?;
    let mut command = Command::new(executable);
    command
        .arg(resources.join("host.js"))
        .args(["--desktop", "--port", "0", "--home"])
        .arg(&home)
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
        if let Some(connection) = existing(&home) {
            return Ok(connection);
        }
        if let Some(status) = child.try_wait()? {
            return Err(format!(
                "Host exited with {status}. See {}",
                home.join("host.log").display()
            )
            .into());
        }
        if started.elapsed() > Duration::from_secs(30) {
            return Err(format!(
                "Host startup timed out. See {}",
                home.join("host.log").display()
            )
            .into());
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![connection_info])
        .setup(|app| {
            let connection = launch(app.handle())?;
            let origin = tauri::Url::parse(&connection.url)?.origin();
            let url = tauri::Url::parse(&connection.url)?;
            app.manage(connection);
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("hbar")
                .inner_size(1440.0, 960.0)
                .min_inner_size(900.0, 600.0)
                .on_navigation(move |next| next.origin() == origin)
                .build()?;
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
