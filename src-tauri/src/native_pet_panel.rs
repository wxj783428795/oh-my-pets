#[cfg(target_os = "macos")]
use tauri::Manager as _;
use tauri::WebviewWindow;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PetPanelContract {
    pub is_panel: bool,
    pub nonactivating: bool,
    pub can_become_key: bool,
    pub can_become_main: bool,
}

impl PetPanelContract {
    pub fn is_satisfied(self) -> bool {
        self.is_panel && self.nonactivating && !self.can_become_key && !self.can_become_main
    }
}

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(PetPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

#[cfg(target_os = "macos")]
pub fn configure_pet_panel(window: &WebviewWindow) -> tauri::Result<PetPanelContract> {
    use tauri_nspanel::WebviewWindowExt as _;

    let panel = window.to_panel::<PetPanel>()?;
    let style = crate::window_shell::pet_panel_style_mask(panel.as_panel().styleMask());
    panel.set_style_mask(style);
    panel.set_hides_on_deactivate(false);
    panel.set_becomes_key_only_if_needed(true);
    panel.set_released_when_closed(false);

    Ok(PetPanelContract {
        is_panel: true,
        nonactivating: panel
            .as_panel()
            .styleMask()
            .contains(objc2_app_kit::NSWindowStyleMask::NonactivatingPanel),
        can_become_key: panel.can_become_key_window(),
        can_become_main: panel.can_become_main_window(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn configure_pet_panel(_window: &WebviewWindow) -> tauri::Result<PetPanelContract> {
    Ok(PetPanelContract::default())
}

#[cfg(test)]
mod tests {
    use super::PetPanelContract;

    #[test]
    fn panel_contract_requires_nonactivation_without_key_or_main_eligibility() {
        assert!(
            PetPanelContract {
                is_panel: true,
                nonactivating: true,
                can_become_key: false,
                can_become_main: false,
            }
            .is_satisfied()
        );
        assert!(!PetPanelContract::default().is_satisfied());
    }
}
