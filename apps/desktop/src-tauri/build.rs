fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "connection_info",
            "read_ui_zoom",
            "write_ui_zoom",
        ]),
    ))
    .expect("Unable to generate desktop permissions")
}
