fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "connection_info",
            "resource_browser",
            "resource_open_system",
            "open_tool_window",
            "focus_tool_window",
            "close_tool_window",
            "pick_directory",
            "list_fonts",
            "set_window_effect",
            "read_ui_zoom",
            "write_ui_zoom",
            "native_notification_permission",
            "request_native_notification_permission",
            "send_native_notification",
            "native_notification_delivery_status",
        ]),
    ))
    .expect("Unable to generate desktop permissions")
}
