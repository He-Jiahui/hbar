use crate::{read_current_native_connection, Connection, NativeConnectionPath};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    io::Read,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Copy {
    pub(crate) copy_address: String,
    pub(crate) pair_operator: String,
    pub(crate) pair_observer: String,
    dialog_title: String,
    acknowledge: String,
    address_copied: String,
    copy_failed: String,
    pairing_failed: String,
}

fn valid_text(value: &str, limit: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= limit && !value.contains('\0')
}

impl Copy {
    fn validate(&self) -> Result<(), String> {
        if [
            &self.copy_address,
            &self.pair_operator,
            &self.pair_observer,
            &self.dialog_title,
            &self.acknowledge,
        ]
        .iter()
        .any(|value| !valid_text(value, 120))
            || [
                &self.address_copied,
                &self.copy_failed,
                &self.pairing_failed,
            ]
            .iter()
            .any(|value| !valid_text(value, 500))
        {
            return Err("Host supplied invalid tray action copy".into());
        }
        Ok(())
    }
}

#[derive(Clone, std::marker::Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Role {
    Operator,
    Observer,
}

#[derive(Serialize)]
struct PairingRequest {
    role: Role,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pairing {
    code: String,
    expires_at: u64,
    title: String,
    message: String,
    acknowledge: String,
}

impl Pairing {
    fn validate(&self, now: u64) -> Result<(), String> {
        if self.code.len() != 8
            || !self.code.bytes().all(|value| value.is_ascii_digit())
            || self.expires_at <= now
            || self.expires_at > now.saturating_add(360_000)
            || !valid_text(&self.title, 120)
            || !valid_text(&self.message, 6000)
            || !valid_text(&self.acknowledge, 120)
            || !self.message.contains(&self.code)
        {
            return Err("Host supplied an invalid pairing response".into());
        }
        Ok(())
    }
}

pub(crate) struct Actions {
    copy: Copy,
    busy: AtomicBool,
    closing: AtomicBool,
}

impl Actions {
    pub(crate) fn new(copy: Copy) -> Self {
        Self {
            copy,
            busy: AtomicBool::new(false),
            closing: AtomicBool::new(false),
        }
    }

    fn claim(&self) -> bool {
        !self.closing.load(Ordering::Acquire)
            && self
                .busy
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
    }

    pub(crate) fn close(&self) {
        self.closing.store(true, Ordering::Release);
    }
}

fn client() -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
}

fn decode<T: DeserializeOwned>(response: reqwest::blocking::Response) -> Result<T, String> {
    if !response.status().is_success() {
        return Err("Host tray request failed".into());
    }
    let mut bytes = Vec::new();
    response
        .take(32_769)
        .read_to_end(&mut bytes)
        .map_err(|_| "Unable to read Host tray response")?;
    if bytes.len() > 32_768 {
        return Err("Host tray response is oversized".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Host tray response is invalid".into())
}

pub(crate) fn load(connection: &Connection) -> Result<Option<Copy>, String> {
    let response = client()
        .map_err(|_| "Unable to prepare tray request")?
        .get(format!("{}/api/desktop/tray", connection.url))
        .bearer_auth(&connection.token)
        .send()
        .map_err(|_| "Unable to load Host tray actions")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let copy: Copy = decode(response)?;
    copy.validate()?;
    Ok(Some(copy))
}

fn show(app: &AppHandle, title: String, message: String, acknowledge: String, failed: bool) {
    let state = app.state::<Actions>();
    if state.closing.load(Ordering::Acquire) {
        state.busy.store(false, Ordering::Release);
        return;
    }
    let handle = app.clone();
    app.dialog()
        .message(message)
        .title(title)
        .kind(if failed {
            MessageDialogKind::Error
        } else {
            MessageDialogKind::Info
        })
        .buttons(MessageDialogButtons::OkCustom(acknowledge))
        .show(move |_| {
            handle
                .state::<Actions>()
                .busy
                .store(false, Ordering::Release);
        });
}

pub(crate) fn copy_address(app: &AppHandle) {
    let Some(state) = app.try_state::<Actions>() else {
        return;
    };
    if !state.claim() {
        return;
    }
    let url = &app.state::<Connection>().url;
    let failed = app.clipboard().write_text(url.clone()).is_err();
    let message = if failed {
        state.copy.copy_failed.clone()
    } else {
        format!("{}\n\n{}", state.copy.address_copied, url)
    };
    show(
        app,
        state.copy.dialog_title.clone(),
        message,
        state.copy.acknowledge.clone(),
        failed,
    );
}

fn request_pairing(connection: &Connection, role: Role) -> Result<Pairing, String> {
    // A click submits exactly once. A timeout leaves an unknown result; it is never replayed.
    let response = client()
        .map_err(|_| "Unable to prepare pairing request")?
        .post(format!("{}/api/desktop/pairing", connection.url))
        .bearer_auth(&connection.token)
        .json(&PairingRequest { role })
        .send()
        .map_err(|_| "Unable to confirm pairing outcome")?;
    let pairing: Pairing = decode(response)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid system clock")?
        .as_millis();
    pairing.validate(u64::try_from(now).map_err(|_| "Invalid system clock")?)?;
    Ok(pairing)
}

pub(crate) fn pair(app: &AppHandle, role: Role) {
    let Some(state) = app.try_state::<Actions>() else {
        return;
    };
    if !state.claim() {
        return;
    }
    let connection = app.state::<Connection>().inner().clone();
    let path = app.state::<NativeConnectionPath>().0.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match read_current_native_connection(&path, &connection)
            .and_then(|current| request_pairing(&current, role))
        {
            Ok(pairing) => show(
                &handle,
                pairing.title,
                pairing.message,
                pairing.acknowledge,
                false,
            ),
            Err(_) => {
                let state = handle.state::<Actions>();
                show(
                    &handle,
                    state.copy.dialog_title.clone(),
                    state.copy.pairing_failed.clone(),
                    state.copy.acknowledge.clone(),
                    true,
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        thread,
        time::Instant,
    };

    fn reply(status: &str, body: &str, extra: &str) -> (Connection, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let connection = Connection {
            url: format!("http://{}", listener.local_addr().unwrap()),
            token: "fixture-only-token".into(),
            instance_id: "fixture".into(),
            pid: None,
            supervisor_pid: None,
        };
        let response = format!(
            "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n{}",
            status,
            body.len(),
            extra,
            body
        );
        let thread = thread::spawn(move || {
            let start = Instant::now();
            let (mut socket, _) = loop {
                match listener.accept() {
                    Ok(value) => break value,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(start.elapsed() < Duration::from_secs(5));
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("Fixture listener failed: {error}"),
                }
            };
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            socket
                .set_write_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(&mut socket);
            let mut request = String::new();
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                assert!(request.len() + line.len() < 8192);
                if line == "\r\n" {
                    break;
                }
                if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                    length = value.trim().parse::<usize>().unwrap();
                }
                request.push_str(&line);
            }
            assert!(length < 4096);
            let mut input = vec![0; length];
            reader.read_exact(&mut input).unwrap();
            request.push_str(std::str::from_utf8(&input).unwrap());
            socket.write_all(response.as_bytes()).unwrap();
            request
        });
        (connection, thread)
    }

    fn fixture_copy() -> Copy {
        Copy {
            copy_address: "复制地址".into(),
            pair_operator: "Pair operator".into(),
            pair_observer: "Pair observer".into(),
            dialog_title: "hbar".into(),
            acknowledge: "Close".into(),
            address_copied: "Copied".into(),
            copy_failed: "Failed".into(),
            pairing_failed: "Unknown".into(),
        }
    }

    #[test]
    fn actions_are_bounded_exclusive_and_stale_after_exit() {
        let actions = Actions::new(fixture_copy());
        assert!(actions.copy.validate().is_ok());
        assert!(actions.claim());
        assert!(!actions.claim());
        actions.busy.store(false, Ordering::Release);
        assert!(actions.claim());
        actions.busy.store(false, Ordering::Release);
        actions.close();
        assert!(!actions.claim());
        let mut copy = fixture_copy();
        copy.pair_operator = "字".repeat(120);
        assert!(copy.validate().is_ok());
        copy.pair_operator.push('字');
        assert!(copy.validate().is_err());
        copy.pair_operator = "\0".into();
        assert!(copy.validate().is_err());
    }

    #[test]
    fn pairing_requires_a_bounded_unexpired_numeric_code_and_its_visible_receipt() {
        let mut pairing = Pairing {
            code: "12345678".into(),
            expires_at: 301_000,
            title: "配对".into(),
            message: "Code 12345678".into(),
            acknowledge: "Close".into(),
        };
        assert!(pairing.validate(1000).is_ok());
        assert!(pairing.validate(301_000).is_err());
        assert!(pairing.validate(0).is_ok());
        pairing.expires_at = 360_001;
        assert!(pairing.validate(0).is_err());
        pairing.expires_at = 301_000;
        pairing.message = "No code".into();
        assert!(pairing.validate(0).is_err());
        pairing.message = "Code 12345678".into();
        pairing.code = "１２３４５６７８".into();
        assert!(pairing.validate(0).is_err());
    }

    #[test]
    fn older_hosts_omit_new_actions_and_redirects_are_never_followed_with_credentials() {
        let (connection, server) = reply("404 Not Found", "", "");
        assert!(load(&connection).unwrap().is_none());
        assert!(server.join().unwrap().starts_with("GET /api/desktop/tray "));
        let redirect = TcpListener::bind("127.0.0.1:0").unwrap();
        redirect.set_nonblocking(true).unwrap();
        let location = format!(
            "Location: http://{}/stolen\r\n",
            redirect.local_addr().unwrap()
        );
        let (connection, server) = reply("302 Found", "", &location);
        assert!(request_pairing(&connection, Role::Observer).is_err());
        assert!(server.join().unwrap().ends_with(r#"{"role":"observer"}"#));
        assert!(
            matches!(redirect.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock)
        );
    }

    #[test]
    fn oversized_pairing_responses_fail_after_one_bounded_request() {
        let (connection, server) = reply("200 OK", &"x".repeat(32_769), "");
        assert!(request_pairing(&connection, Role::Operator).is_err());
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /api/desktop/pairing "));
        assert!(request.ends_with(r#"{"role":"operator"}"#));
    }
}
