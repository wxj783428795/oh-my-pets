use std::{error::Error, fmt};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const PET_WINDOW_LABEL: &str = "pet";
pub const PREFERENCES_WINDOW_LABEL: &str = "preferences";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowRole {
    Pet,
    Preferences,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    ShowPet,
    HidePet,
    OpenPreferences,
    Quit,
}

pub trait WindowRuntime {
    fn window_exists(&self, role: WindowRole) -> bool;
    fn create_window(&mut self, role: WindowRole) -> Result<(), String>;
    fn restore_preferences_surface(&mut self) -> Result<(), String>;
    fn show_window(&mut self, role: WindowRole, focus: bool) -> Result<(), String>;
    fn hide_window(&mut self, role: WindowRole) -> Result<(), String>;
    fn close_window(&mut self, role: WindowRole) -> Result<(), String>;
    fn exit(&mut self) -> Result<(), String>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowShellError {
    action: &'static str,
    detail: String,
}

impl WindowShellError {
    fn new(action: &'static str, detail: String) -> Self {
        Self { action, detail }
    }
}

impl fmt::Display for WindowShellError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}：{}", self.action, self.detail)
    }
}

impl Error for WindowShellError {}

pub fn dispatch_menu(
    runtime: &mut impl WindowRuntime,
    action: MenuAction,
) -> Result<(), WindowShellError> {
    match action {
        MenuAction::ShowPet => runtime
            .show_window(WindowRole::Pet, false)
            .map_err(|error| WindowShellError::new("显示宠物失败", error)),
        MenuAction::HidePet => runtime
            .hide_window(WindowRole::Pet)
            .map_err(|error| WindowShellError::new("隐藏宠物失败", error)),
        MenuAction::OpenPreferences => {
            if !runtime.window_exists(WindowRole::Preferences) {
                runtime
                    .create_window(WindowRole::Preferences)
                    .map_err(|error| WindowShellError::new("创建偏好设置失败", error))?;
            }
            runtime
                .restore_preferences_surface()
                .map_err(|error| WindowShellError::new("恢复偏好设置页面失败", error))?;
            runtime
                .show_window(WindowRole::Preferences, true)
                .map_err(|error| WindowShellError::new("显示偏好设置失败", error))
        }
        MenuAction::Quit => {
            let cleanup = runtime
                .window_exists(WindowRole::Preferences)
                .then(|| runtime.close_window(WindowRole::Preferences))
                .transpose();
            let exit = runtime.exit();
            match (cleanup, exit) {
                (Err(cleanup_error), Err(exit_error)) => Err(WindowShellError::new(
                    "退出应用失败",
                    format!("{cleanup_error}；{exit_error}"),
                )),
                (Err(error), _) => Err(WindowShellError::new("退出前清理偏好设置失败", error)),
                (_, Err(error)) => Err(WindowShellError::new("退出应用失败", error)),
                _ => Ok(()),
            }
        }
    }
}

fn window_for_role(app: &AppHandle, role: WindowRole) -> Option<WebviewWindow> {
    let label = match role {
        WindowRole::Pet => PET_WINDOW_LABEL,
        WindowRole::Preferences => PREFERENCES_WINDOW_LABEL,
    };
    app.get_webview_window(label)
}

struct TauriWindowRuntime<'a> {
    app: &'a AppHandle,
}

impl WindowRuntime for TauriWindowRuntime<'_> {
    fn window_exists(&self, role: WindowRole) -> bool {
        window_for_role(self.app, role).is_some()
    }

    fn create_window(&mut self, role: WindowRole) -> Result<(), String> {
        match role {
            WindowRole::Pet => Err("宠物窗口只允许由启动配置创建".to_string()),
            WindowRole::Preferences => WebviewWindowBuilder::new(
                self.app,
                PREFERENCES_WINDOW_LABEL,
                WebviewUrl::App("index.html?surface=preferences".into()),
            )
            .title("Oh My Pets 偏好设置")
            .inner_size(820.0, 680.0)
            .min_inner_size(720.0, 600.0)
            .center()
            .resizable(true)
            .decorations(true)
            .transparent(false)
            .visible(false)
            .focused(false)
            .build()
            .map(|_| ())
            .map_err(|error| error.to_string()),
        }
    }

    fn restore_preferences_surface(&mut self) -> Result<(), String> {
        let window = window_for_role(self.app, WindowRole::Preferences)
            .ok_or_else(|| "Preferences 窗口不存在".to_string())?;
        let url = window.url().map_err(|error| error.to_string())?;
        let is_preferences = url
            .query_pairs()
            .any(|(name, value)| name == "surface" && value == "preferences");
        if !is_preferences {
            window
                .eval("window.location.replace('?surface=preferences')")
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn show_window(&mut self, role: WindowRole, focus: bool) -> Result<(), String> {
        let window =
            window_for_role(self.app, role).ok_or_else(|| format!("{role:?} 窗口不存在"))?;
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        if focus {
            window.set_focus().map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn hide_window(&mut self, role: WindowRole) -> Result<(), String> {
        window_for_role(self.app, role)
            .ok_or_else(|| format!("{role:?} 窗口不存在"))?
            .hide()
            .map_err(|error| error.to_string())
    }

    fn close_window(&mut self, role: WindowRole) -> Result<(), String> {
        match window_for_role(self.app, role) {
            Some(window) => window.close().map_err(|error| error.to_string()),
            None => Ok(()),
        }
    }

    fn exit(&mut self) -> Result<(), String> {
        self.app.exit(0);
        Ok(())
    }
}

pub fn pet_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    window_for_role(app, WindowRole::Pet).ok_or_else(|| "宠物窗口不存在".to_string())
}

pub fn dispatch_tauri_menu(app: &AppHandle, action: MenuAction) -> Result<(), WindowShellError> {
    dispatch_menu(&mut TauriWindowRuntime { app }, action)
}

#[cfg(target_os = "macos")]
fn pet_collection_behavior(
    current: objc2_app_kit::NSWindowCollectionBehavior,
) -> objc2_app_kit::NSWindowCollectionBehavior {
    let role_behaviors = objc2_app_kit::NSWindowCollectionBehavior::Primary
        | objc2_app_kit::NSWindowCollectionBehavior::Auxiliary;
    (current & !role_behaviors)
        | objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllSpaces
        | objc2_app_kit::NSWindowCollectionBehavior::FullScreenAuxiliary
        | objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllApplications
}

#[cfg(target_os = "macos")]
pub(crate) fn pet_panel_style_mask(
    current: objc2_app_kit::NSWindowStyleMask,
) -> objc2_app_kit::NSWindowStyleMask {
    current | objc2_app_kit::NSWindowStyleMask::NonactivatingPanel
}

#[cfg(target_os = "macos")]
pub fn configure_pet_collection_behavior(window: &WebviewWindow) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;

    let native_window = window.ns_window()?.cast::<NSWindow>();
    // SAFETY: Tauri owns this live NSWindow for the WebviewWindow, and setup invokes
    // this function on the macOS main thread before background smoke work begins.
    unsafe {
        let native_window = &*native_window;
        let behavior = pet_collection_behavior(native_window.collectionBehavior());
        native_window.setCollectionBehavior(behavior);
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn configure_pet_collection_behavior(_window: &WebviewWindow) -> tauri::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{MenuAction, WindowRole, WindowRuntime, dispatch_menu};

    #[derive(Default)]
    struct RecordingRuntime {
        preferences_exists: bool,
        preferences_surface: Option<&'static str>,
        fail_create_preferences: bool,
        fail_close_preferences: bool,
        events: Vec<String>,
    }

    impl WindowRuntime for RecordingRuntime {
        fn window_exists(&self, role: WindowRole) -> bool {
            match role {
                WindowRole::Pet => true,
                WindowRole::Preferences => self.preferences_exists,
            }
        }

        fn create_window(&mut self, role: WindowRole) -> Result<(), String> {
            self.events.push(format!("create:{role:?}"));
            if role == WindowRole::Preferences && self.fail_create_preferences {
                return Err("无法创建偏好设置".to_string());
            }
            if role == WindowRole::Preferences {
                self.preferences_exists = true;
                self.preferences_surface = Some("preferences");
            }
            Ok(())
        }

        fn restore_preferences_surface(&mut self) -> Result<(), String> {
            if self.preferences_surface != Some("preferences") {
                self.events.push("restore:Preferences".to_string());
                self.preferences_surface = Some("preferences");
            }
            Ok(())
        }

        fn show_window(&mut self, role: WindowRole, focus: bool) -> Result<(), String> {
            self.events.push(format!("show:{role:?}:focus={focus}"));
            Ok(())
        }

        fn hide_window(&mut self, role: WindowRole) -> Result<(), String> {
            self.events.push(format!("hide:{role:?}"));
            Ok(())
        }

        fn close_window(&mut self, role: WindowRole) -> Result<(), String> {
            self.events.push(format!("close:{role:?}"));
            if role == WindowRole::Preferences {
                self.preferences_exists = false;
                if self.fail_close_preferences {
                    return Err("无法关闭偏好设置".to_string());
                }
            }
            Ok(())
        }

        fn exit(&mut self) -> Result<(), String> {
            self.events.push("exit".to_string());
            Ok(())
        }
    }

    #[test]
    fn showing_pet_never_requests_focus_and_is_idempotent() {
        let mut runtime = RecordingRuntime::default();

        dispatch_menu(&mut runtime, MenuAction::ShowPet).expect("first show should succeed");
        dispatch_menu(&mut runtime, MenuAction::ShowPet).expect("repeated show should succeed");

        assert_eq!(
            runtime.events,
            ["show:Pet:focus=false", "show:Pet:focus=false"]
        );
    }

    #[test]
    fn preferences_are_created_once_then_reused_while_open() {
        let mut runtime = RecordingRuntime::default();

        dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect("first open should create preferences");
        dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect("second open should reuse preferences");

        assert_eq!(
            runtime.events,
            [
                "create:Preferences",
                "show:Preferences:focus=true",
                "show:Preferences:focus=true"
            ]
        );
    }

    #[test]
    fn a_closed_preferences_window_is_recreated() {
        let mut runtime = RecordingRuntime::default();
        dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect("first open should succeed");
        runtime.preferences_exists = false;
        runtime.events.clear();

        dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect("closed preferences should be recreated");

        assert_eq!(
            runtime.events,
            ["create:Preferences", "show:Preferences:focus=true"]
        );
    }

    #[test]
    fn opening_preferences_restores_the_product_surface_after_developer_preview() {
        let mut runtime = RecordingRuntime {
            preferences_exists: true,
            preferences_surface: Some("developer"),
            ..RecordingRuntime::default()
        };

        dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect("menu should restore preferences");

        assert_eq!(
            runtime.events,
            ["restore:Preferences", "show:Preferences:focus=true"]
        );
    }

    #[test]
    fn menu_failures_are_returned_without_continuing_the_action() {
        let mut runtime = RecordingRuntime {
            fail_create_preferences: true,
            ..RecordingRuntime::default()
        };

        let error = dispatch_menu(&mut runtime, MenuAction::OpenPreferences)
            .expect_err("create failure should be observable");

        assert!(error.to_string().contains("无法创建偏好设置"));
        assert_eq!(runtime.events, ["create:Preferences"]);
    }

    #[test]
    fn quit_closes_preferences_and_still_exits_when_cleanup_fails() {
        let mut runtime = RecordingRuntime {
            preferences_exists: true,
            fail_close_preferences: true,
            ..RecordingRuntime::default()
        };

        let error = dispatch_menu(&mut runtime, MenuAction::Quit)
            .expect_err("cleanup failure should remain observable");

        assert!(error.to_string().contains("无法关闭偏好设置"));
        assert_eq!(runtime.events, ["close:Preferences", "exit"]);
    }

    #[test]
    fn hiding_pet_uses_the_product_window_role() {
        let mut runtime = RecordingRuntime::default();

        dispatch_menu(&mut runtime, MenuAction::HidePet).expect("hide should succeed");

        assert_eq!(runtime.events, ["hide:Pet"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pet_can_join_other_applications_and_their_full_screen_spaces() {
        use objc2_app_kit::NSWindowCollectionBehavior;

        let behavior = super::pet_collection_behavior(NSWindowCollectionBehavior::Auxiliary);

        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllApplications));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Auxiliary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Primary));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pet_panel_preserves_its_frame_style_and_does_not_activate_the_app() {
        use objc2_app_kit::NSWindowStyleMask;

        let style = super::pet_panel_style_mask(NSWindowStyleMask::Borderless);

        assert!(style.contains(NSWindowStyleMask::Borderless));
        assert!(style.contains(NSWindowStyleMask::NonactivatingPanel));
    }
}
