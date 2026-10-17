use serde::Deserialize;
use std::{io::Read, time::Duration};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BackgroundState {
    unattended: bool,
}

/// One authenticated request, including when attaching to an already running Host.
/// Unknown write outcomes are reported to the launcher rather than replayed.
pub(crate) fn enable_background(url: &str, token: &str) -> Result<(), Box<dyn std::error::Error>> {
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()?
        .post(format!("{url}/api/desktop/background"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "unattended": true }))
        .send()?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Unable to enable background execution ({status})").into());
    }
    let bytes = response.take(1025).bytes().collect::<Result<Vec<_>, _>>()?;
    if bytes.len() > 1024 {
        return Err("Background execution response is oversized".into());
    }
    let state: BackgroundState = serde_json::from_slice(&bytes)?;
    if !state.unattended {
        return Err("Host did not enable background execution".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, thread};

    fn host(status: &str, body: String, headers: &str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let status = status.to_owned();
        let headers = headers.to_owned();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 1024];
            while request.len() < 8192 {
                let count = stream.read(&mut chunk).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                if request
                    .windows(19)
                    .any(|part| part == b"{\"unattended\":true}")
                {
                    break;
                }
            }
            write!(
                stream,
                "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, handle)
    }

    #[test]
    fn background_entry_authenticates_and_requires_positive_host_acknowledgement() {
        let (url, request) = host("200 OK", "{\"unattended\":true}".into(), "");
        enable_background(&url, "native-test-token").unwrap();
        let request = request.join().unwrap();
        assert!(request.starts_with("POST /api/desktop/background HTTP/1.1\r\n"));
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer native-test-token\r\n"));
        for (status, body) in [
            ("403 Forbidden", "{}".into()),
            ("200 OK", "{\"unattended\":false}".into()),
            ("200 OK", "{\"unattended\":true,\"unknown\":1}".into()),
            ("200 OK", " ".repeat(1025)),
        ] {
            let (url, request) = host(status, body, "");
            assert!(enable_background(&url, "native-test-token").is_err());
            request.join().unwrap();
        }
    }

    #[test]
    fn background_writes_never_follow_redirects() {
        let other = TcpListener::bind("127.0.0.1:0").unwrap();
        other.set_nonblocking(true).unwrap();
        let (url, request) = host(
            "307 Temporary Redirect",
            "{}".into(),
            &format!("Location: http://{}/other\r\n", other.local_addr().unwrap()),
        );
        assert!(enable_background(&url, "native-test-token").is_err());
        request.join().unwrap();
        assert_eq!(
            other.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
}
