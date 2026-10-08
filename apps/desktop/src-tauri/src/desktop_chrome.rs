use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io, sync::Mutex};
use tauri::{menu::MenuItem, tray::TrayIcon, WebviewWindow, Wry};

const STARTUP_CATALOG: &str = include_str!(concat!(env!("OUT_DIR"), "/desktop-chrome-copy.json"));

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopChromeCopy {
    pub(crate) window_title: String,
    pub(crate) tray_tooltip: String,
    pub(crate) tray_open: String,
    pub(crate) tray_exit: String,
    pub(crate) close_confirmation: DesktopCloseConfirmationCopy,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopCloseConfirmationCopy {
    pub(crate) title: String,
    pub(crate) message: String,
}

impl DesktopChromeCopy {
    fn validate(&self) -> Result<(), String> {
        for value in [
            &self.window_title,
            &self.tray_tooltip,
            &self.tray_open,
            &self.tray_exit,
            &self.close_confirmation.title,
        ] {
            if value.trim().is_empty()
                || value.encode_utf16().count() > 127
                || value
                    .chars()
                    .any(|character| character <= '\u{1f}' || character == '\u{7f}')
            {
                return Err("DESKTOP_CHROME_COPY_INVALID".into());
            }
        }
        let message = &self.close_confirmation.message;
        if message.trim().is_empty()
            || message.encode_utf16().count() > 4000
            || message.chars().any(|character| {
                (character <= '\u{1f}' && character != '\n' && character != '\r')
                    || character == '\u{7f}'
            })
        {
            return Err("DESKTOP_CHROME_COPY_INVALID".into());
        }
        Ok(())
    }
}

#[cfg(windows)]
pub(crate) fn close_confirmation(app: &tauri::AppHandle) -> Option<DesktopCloseConfirmationCopy> {
    use tauri::Manager;
    app.try_state::<DesktopChromeState>()
        .and_then(|state| {
            state
                .applied
                .lock()
                .ok()
                .map(|copy| copy.close_confirmation.clone())
        })
        .or_else(|| startup_copy().ok().map(|copy| copy.close_confirmation))
}

pub(crate) fn startup_copy() -> Result<DesktopChromeCopy, Box<dyn std::error::Error>> {
    let mut catalog: BTreeMap<String, DesktopChromeCopy> = serde_json::from_str(STARTUP_CATALOG)?;
    let copy = catalog.remove("zh-CN").ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "Missing default Desktop locale")
    })?;
    copy.validate()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    Ok(copy)
}

pub(crate) struct DesktopChromeState {
    open: MenuItem<Wry>,
    exit: MenuItem<Wry>,
    tray: TrayIcon<Wry>,
    applied: Mutex<DesktopChromeCopy>,
}

impl DesktopChromeState {
    pub(crate) fn new(
        open: MenuItem<Wry>,
        exit: MenuItem<Wry>,
        tray: TrayIcon<Wry>,
        copy: DesktopChromeCopy,
    ) -> Self {
        Self {
            open,
            exit,
            tray,
            applied: Mutex::new(copy),
        }
    }
}

#[tauri::command]
pub(crate) fn set_desktop_chrome_copy(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopChromeState>,
    copy: DesktopChromeCopy,
) -> Result<DesktopChromeCopy, String> {
    if window.label() != "main" {
        return Err("DESKTOP_CHROME_MAIN_ONLY".into());
    }
    copy.validate()?;
    let mut applied = state
        .applied
        .lock()
        .map_err(|_| "DESKTOP_CHROME_LOCK_FAILED")?;
    window
        .set_title(&copy.window_title)
        .map_err(|_| "DESKTOP_CHROME_WINDOW_FAILED")?;
    // Native menus interpret ampersands as mnemonic markers; preserve the host's literal copy.
    state
        .open
        .set_text(copy.tray_open.replace('&', "&&"))
        .map_err(|_| "DESKTOP_CHROME_MENU_FAILED")?;
    state
        .exit
        .set_text(copy.tray_exit.replace('&', "&&"))
        .map_err(|_| "DESKTOP_CHROME_MENU_FAILED")?;
    state
        .tray
        .set_tooltip(Some(&copy.tray_tooltip))
        .map_err(|_| "DESKTOP_CHROME_TRAY_FAILED")?;
    let receipt = DesktopChromeCopy {
        window_title: window
            .title()
            .map_err(|_| "DESKTOP_CHROME_WINDOW_READ_FAILED")?,
        tray_tooltip: copy.tray_tooltip.clone(),
        tray_open: state
            .open
            .text()
            .map_err(|_| "DESKTOP_CHROME_MENU_READ_FAILED")?
            .replace("&&", "&"),
        tray_exit: state
            .exit
            .text()
            .map_err(|_| "DESKTOP_CHROME_MENU_READ_FAILED")?
            .replace("&&", "&"),
        close_confirmation: copy.close_confirmation.clone(),
    };
    if receipt != copy {
        return Err("DESKTOP_CHROME_RECEIPT_MISMATCH".into());
    }
    *applied = receipt.clone();
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_catalog_has_valid_supported_locales_and_chinese_startup_copy() {
        let catalog: BTreeMap<String, DesktopChromeCopy> =
            serde_json::from_str(STARTUP_CATALOG).unwrap();
        assert_eq!(catalog.len(), 2);
        for locale in ["zh-CN", "en-US"] {
            catalog[locale].validate().unwrap();
        }
        assert_eq!(startup_copy().unwrap(), catalog["zh-CN"]);
        assert_eq!(catalog["zh-CN"].tray_open, "打开 hbar");
        assert_eq!(catalog["en-US"].tray_open, "Open hbar");
    }

    #[test]
    fn chrome_labels_use_utf16_capacity_and_reject_controls_instead_of_truncating() {
        let mut copy = startup_copy().unwrap();
        copy.tray_tooltip = "界".repeat(127);
        assert!(copy.validate().is_ok());
        copy.tray_tooltip.push('界');
        assert!(copy.validate().is_err());
        copy.tray_tooltip = "🙂".repeat(63);
        assert!(copy.validate().is_ok());
        copy.tray_tooltip.push('🙂');
        assert!(copy.validate().is_err());
        for invalid in ["", " ", "line\nbreak", "null\0byte"] {
            copy.tray_tooltip = invalid.into();
            assert!(copy.validate().is_err());
        }
    }

    #[test]
    fn close_confirmation_preserves_paragraphs_and_bounds_unicode_without_null_termination_in_copy()
    {
        let mut copy = startup_copy().unwrap();
        assert!(copy.close_confirmation.message.contains('\n'));
        copy.close_confirmation.message = "界".repeat(4000);
        assert!(copy.validate().is_ok());
        copy.close_confirmation.message.push('界');
        assert!(copy.validate().is_err());
        copy.close_confirmation.message = "🙂".repeat(2000);
        assert!(copy.validate().is_ok());
        copy.close_confirmation.message.push('🙂');
        assert!(copy.validate().is_err());
        for invalid in ["", " ", "null\0byte", "tab\tbyte"] {
            copy.close_confirmation.message = invalid.into();
            assert!(copy.validate().is_err());
        }
    }
}
