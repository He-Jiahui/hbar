use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, Rect, Webview, WebviewBuilder, WebviewUrl};

#[derive(Default)]
pub struct ResourceBrowsers(pub Mutex<HashMap<String, BrowserStatus>>);
pub struct BrowserDataDirectory(pub PathBuf);
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_back: bool,
    pub can_forward: bool,
    pub visible: bool,
    pub failed: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: Option<f64>,
}

fn resource_url(value: &str) -> Result<tauri::Url, String> {
    if value.len() > 16384 {
        return Err("URL is too long".into());
    }
    let url = tauri::Url::parse(value).map_err(|_| "Invalid URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP and HTTPS resource URLs are supported".into());
    }
    Ok(url)
}
fn require_workbench(view: &Webview, connection: &super::Connection) -> Result<(), String> {
    let origin = tauri::Url::parse(&connection.url).map_err(|_| "Invalid workbench origin")?;
    if view.label() != "main"
        || !super::is_allowed_web_origin(&view.url().map_err(|e| e.to_string())?, &origin)
    {
        return Err("Resource operations are restricted to the workbench".into());
    }
    Ok(())
}
fn label(id: &str) -> Result<String, String> {
    if id.is_empty() || id.len() > 96 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid browser ID".into());
    }
    Ok(format!("resource-browser-{id}"))
}
#[tauri::command]
pub async fn resource_browser(
    view: Webview,
    app: tauri::AppHandle,
    connection: tauri::State<'_, super::Connection>,
    browsers: tauri::State<'_, ResourceBrowsers>,
    directory: tauri::State<'_, BrowserDataDirectory>,
    id: String,
    action: String,
    url: Option<String>,
    bounds: Option<BrowserBounds>,
) -> Result<Option<BrowserStatus>, String> {
    require_workbench(&view, &connection)?;
    let name = label(&id)?;
    if action == "create" {
        let target = resource_url(url.as_deref().ok_or("Missing URL")?)?;
        if app.get_webview(&name).is_none() {
            let mut states = browsers
                .0
                .lock()
                .map_err(|_| "Browser state is unavailable")?;
            if states.len() >= 8 {
                return Err("Browser tab limit reached".into());
            }
            states.insert(
                id.clone(),
                BrowserStatus {
                    url: target.to_string(),
                    title: target.host_str().unwrap_or("").into(),
                    loading: true,
                    can_back: false,
                    can_forward: false,
                    visible: false,
                    failed: false,
                },
            );
            drop(states);
            let load_app = app.clone();
            let load_id = id.clone();
            let popup_app = app.clone();
            let popup_label = name.clone();
            let mut builder = WebviewBuilder::new(&name, WebviewUrl::External(target))
                .data_directory(directory.0.clone())
                .on_navigation(|url| {
                    url.as_str() == "about:blank" || resource_url(url.as_str()).is_ok()
                })
                .on_new_window(move |url, _features| {
                    if resource_url(url.as_str()).is_ok() {
                        if let Some(browser) = popup_app.get_webview(&popup_label) {
                            let _ = browser.navigate(url);
                        }
                    }
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_page_load(move |_view, payload| {
                    if let Ok(mut states) = load_app.state::<ResourceBrowsers>().0.lock() {
                        if let Some(state) = states.get_mut(&load_id) {
                            state.url = payload.url().to_string();
                            state.loading =
                                payload.event() == tauri::webview::PageLoadEvent::Started;
                            if state.loading {
                                state.failed = false;
                            }
                        }
                    }
                });
            #[cfg(debug_assertions)]
            if let Some(port) = std::env::var("HBAR_RESOURCE_BROWSER_DEBUG_PORT")
                .ok()
                .and_then(|value| value.parse::<u16>().ok())
                .filter(|value| *value != 0)
            {
                builder =
                    builder.additional_browser_args(&format!("--remote-debugging-port={port}"));
            }
            if let Err(error) = view.window().add_child(
                builder,
                PhysicalPosition::new(0.0, 0.0),
                PhysicalSize::new(1.0, 1.0),
            ) {
                browsers
                    .0
                    .lock()
                    .map_err(|_| "Browser state is unavailable")?
                    .remove(&id);
                return Err(error.to_string());
            }
            if let Some(child) = app.get_webview(&name) {
                child.hide().map_err(|e| e.to_string())?;
                #[cfg(windows)]
                {
                    let event_app = app.clone();
                    let event_id = id.clone();
                    child
                        .with_webview(move |platform| unsafe {
                            if let Ok(core) = platform.controller().CoreWebView2() {
                                let handler = webview2_com::NavigationCompletedEventHandler::create(
                                    Box::new(move |_, args| {
                                        let mut success = windows::core::BOOL(0);
                                        if let Some(args) = args {
                                            args.IsSuccess(&mut success)?;
                                        }
                                        if let Ok(mut states) =
                                            event_app.state::<ResourceBrowsers>().0.lock()
                                        {
                                            if let Some(state) = states.get_mut(&event_id) {
                                                state.loading = false;
                                                state.failed = !success.as_bool();
                                            }
                                        }
                                        Ok(())
                                    }),
                                );
                                let mut token = 0;
                                let _ = core.add_NavigationCompleted(&handler, &mut token);
                            }
                        })
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    } else if action == "close" {
        if let Some(child) = app.get_webview(&name) {
            child.close().map_err(|e| e.to_string())?;
        }
        browsers
            .0
            .lock()
            .map_err(|_| "Browser state is unavailable")?
            .remove(&id);
        return Ok(None);
    } else {
        let child = app.get_webview(&name).ok_or("Browser tab is closed")?;
        match action.as_str() {
            "navigate" => {
                child
                    .navigate(resource_url(url.as_deref().ok_or("Missing URL")?)?)
                    .map_err(|e| e.to_string())?;
            }
            "reload" => {
                child.reload().map_err(|e| e.to_string())?;
            }
            "back" | "forward" => {
                child
                    .eval(if action == "back" {
                        "history.back()"
                    } else {
                        "history.forward()"
                    })
                    .map_err(|e| e.to_string())?;
            }
            "show" => {
                child.show().map_err(|e| e.to_string())?;
            }
            "hide" => {
                child.hide().map_err(|e| e.to_string())?;
            }
            "bounds" => {
                let rect = bounds.ok_or("Missing browser bounds")?;
                if [rect.x, rect.y, rect.width, rect.height]
                    .iter()
                    .any(|v| !v.is_finite() || *v < 0.0 || *v > 100000.0)
                    || rect.width < 1.0
                    || rect.height < 1.0
                {
                    return Err("Invalid browser bounds".into());
                }
                child
                    .set_bounds(Rect {
                        position: PhysicalPosition::new(rect.x, rect.y).into(),
                        size: PhysicalSize::new(rect.width, rect.height).into(),
                    })
                    .map_err(|e| e.to_string())?;
                if let Some(scale) = rect.scale {
                    if !scale.is_finite() || !(0.25..=8.0).contains(&scale) {
                        return Err("Invalid browser scale".into());
                    }
                    child
                        .set_zoom(scale / child.window().scale_factor().map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                }
            }
            "status" => {}
            _ => return Err("Unsupported browser action".into()),
        }
    }
    let child = app.get_webview(&name).ok_or("Browser tab is closed")?;
    let mut status = browsers
        .0
        .lock()
        .map_err(|_| "Browser state is unavailable")?
        .get(&id)
        .cloned()
        .ok_or("Browser state is unavailable")?;
    status.url = child.url().map_err(|e| e.to_string())?.to_string();
    #[cfg(windows)]
    {
        let (tx, rx) = mpsc::sync_channel(1);
        child
            .with_webview(move |platform| {
                use windows::core::{BOOL, PWSTR};
                unsafe {
                    let result = (|| {
                        let core = platform
                            .controller()
                            .CoreWebView2()
                            .map_err(|e| e.to_string())?;
                        let mut title = PWSTR::null();
                        let mut back = BOOL(0);
                        let mut forward = BOOL(0);
                        let mut visible = BOOL(0);
                        core.DocumentTitle(&mut title).map_err(|e| e.to_string())?;
                        let text = title.to_string().unwrap_or_default();
                        windows::Win32::System::Com::CoTaskMemFree(Some(title.0.cast()));
                        core.CanGoBack(&mut back).map_err(|e| e.to_string())?;
                        core.CanGoForward(&mut forward).map_err(|e| e.to_string())?;
                        platform
                            .controller()
                            .IsVisible(&mut visible)
                            .map_err(|e| e.to_string())?;
                        Ok::<_, String>((
                            text,
                            back.as_bool(),
                            forward.as_bool(),
                            visible.as_bool(),
                        ))
                    })();
                    let _ = tx.send(result);
                }
            })
            .map_err(|e| e.to_string())?;
        let (title, back, forward, visible) = rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "Browser status timed out")??;
        status.title = title;
        status.can_back = back;
        status.can_forward = forward;
        status.visible = visible;
    }
    Ok(Some(status))
}

#[tauri::command]
pub async fn resource_open_system(
    view: Webview,
    connection: tauri::State<'_, super::Connection>,
    target: String,
) -> Result<(), String> {
    require_workbench(&view, &connection)?;
    let value = if target.starts_with("http://") || target.starts_with("https://") {
        resource_url(&target)?.to_string()
    } else {
        let path = PathBuf::from(&target);
        if !path.is_absolute() || !path.is_file() {
            return Err("System file opening requires an existing local absolute file".into());
        }
        if target.contains('\0') {
            return Err("Invalid file path".into());
        }
        target
    };
    #[cfg(windows)]
    {
        use windows::{
            core::PCWSTR,
            Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        };
        let target: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
        let action: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(action.as_ptr()),
                PCWSTR(target.as_ptr()),
                None,
                None,
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err("The system could not open this resource".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Err("Native resource opening is unavailable on this platform".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn url_and_labels_are_bounded_and_explicit() {
        assert!(resource_url("https://example.com:8080/path").is_ok());
        for value in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:pass@example.com",
        ] {
            assert!(resource_url(value).is_err());
        }
        assert!(label("a-b-123").is_ok());
        assert!(label("../main").is_err());
        assert!(label("").is_err());
    }
}
