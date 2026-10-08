fn main() {
    let source = std::path::PathBuf::from(
        std::env::var_os("CARGO_MANIFEST_DIR").expect("Missing Cargo manifest directory"),
    )
    .join("../../web/src/desktop-chrome-copy.json");
    println!("cargo:rerun-if-changed={}", source.display());
    let content =
        std::fs::read_to_string(&source).expect("Unable to read the host Desktop copy catalog");
    let catalog: serde_json::Value =
        serde_json::from_str(&content).expect("Invalid host Desktop copy catalog");
    for locale in ["zh-CN", "en-US"] {
        for field in ["windowTitle", "trayTooltip", "trayOpen", "trayExit"] {
            let text = catalog[locale][field]
                .as_str()
                .expect("Missing Desktop copy slot");
            assert!(
                !text.trim().is_empty()
                    && text.encode_utf16().count() <= 127
                    && !text
                        .chars()
                        .any(|character| character <= '\u{1f}' || character == '\u{7f}'),
                "Invalid Desktop copy slot"
            );
        }
    }
    let destination = std::path::PathBuf::from(
        std::env::var_os("OUT_DIR").expect("Missing Cargo output directory"),
    );
    std::fs::write(destination.join("desktop-chrome-copy.json"), content)
        .expect("Unable to generate Desktop startup copy");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "connection_info",
            "read_ui_zoom",
            "write_ui_zoom",
            "native_notification_permission",
            "request_native_notification_permission",
            "send_native_notification",
            "native_notification_delivery_status",
            "set_desktop_chrome_copy",
        ]),
    ))
    .expect("Unable to generate desktop permissions")
}
