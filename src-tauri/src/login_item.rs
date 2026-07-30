use crate::product_state::{ProductStateController, ProductStateSnapshot};

pub trait LoginItem {
    fn set_enabled(&self, enabled: bool) -> Result<(), String>;
    fn is_enabled(&self) -> Result<bool, String>;
}

#[cfg(target_os = "macos")]
pub struct SystemLoginItem<'a> {
    app: &'a tauri::AppHandle,
}

#[cfg(target_os = "macos")]
impl<'a> SystemLoginItem<'a> {
    pub fn new(app: &'a tauri::AppHandle) -> Self {
        Self { app }
    }
}

#[cfg(target_os = "macos")]
impl LoginItem for SystemLoginItem<'_> {
    fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        use tauri_plugin_autostart::ManagerExt as _;

        if enabled {
            self.app
                .autolaunch()
                .enable()
                .map_err(|error| format!("无法启用登录时启动：{error}"))
        } else {
            self.app
                .autolaunch()
                .disable()
                .map_err(|error| format!("无法关闭登录时启动：{error}"))
        }
    }

    fn is_enabled(&self) -> Result<bool, String> {
        use tauri_plugin_autostart::ManagerExt as _;

        self.app
            .autolaunch()
            .is_enabled()
            .map_err(|error| format!("无法读取登录项状态：{error}"))
    }
}

pub fn change_launch_at_login(
    state: &ProductStateController,
    login_item: &impl LoginItem,
    requested: bool,
) -> Result<ProductStateSnapshot, String> {
    let previous = state.snapshot()?.preferences.launch_at_login;
    login_item.set_enabled(requested)?;
    let observed = match login_item.is_enabled() {
        Ok(observed) => observed,
        Err(error) => {
            return match login_item.set_enabled(previous) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}；读取失败后的系统回滚也失败：{rollback_error}"
                )),
            };
        }
    };
    match state.set_launch_at_login(observed) {
        Ok(snapshot) => Ok(snapshot),
        Err(error) => match login_item.set_enabled(previous) {
            Ok(()) => Err(error),
            Err(rollback_error) => {
                let observed_after_failure = login_item.is_enabled().unwrap_or(requested);
                let warning = format!(
                    "登录项偏好写入失败且系统回滚失败；已按系统真实状态校正本次内存状态：{error}；回滚错误：{rollback_error}"
                );
                state
                    .reconcile_launch_at_login(observed_after_failure, warning.clone())
                    .map_err(|state_error| format!("{warning}；状态校正失败：{state_error}"))?;
                Err(warning)
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::product_state::{
        PreferencesRepository, PreferencesSaveStatus, ProductStateController,
    };

    use super::{LoginItem, change_launch_at_login};

    struct RecordingRepository {
        saves: Arc<Mutex<Vec<Vec<u8>>>>,
        fail_save: bool,
    }

    impl PreferencesRepository for RecordingRepository {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(None)
        }

        fn save(&self, contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
            if self.fail_save {
                return Err("偏好写入失败".to_string());
            }
            self.saves
                .lock()
                .expect("save recorder should stay available")
                .push(contents.to_vec());
            Ok(PreferencesSaveStatus::Durable)
        }
    }

    struct FakeLoginItem {
        enabled: Mutex<bool>,
        set_calls: Mutex<usize>,
        fail_set_call: Option<usize>,
        fail_read: bool,
    }

    impl LoginItem for FakeLoginItem {
        fn set_enabled(&self, enabled: bool) -> Result<(), String> {
            let mut calls = self
                .set_calls
                .lock()
                .expect("set call counter should stay available");
            *calls += 1;
            if self.fail_set_call == Some(*calls) {
                return Err("系统拒绝更新登录项".to_string());
            }
            *self
                .enabled
                .lock()
                .expect("fake state should stay available") = enabled;
            Ok(())
        }

        fn is_enabled(&self) -> Result<bool, String> {
            if self.fail_read {
                return Err("系统拒绝读取登录项".to_string());
            }
            Ok(*self
                .enabled
                .lock()
                .expect("fake state should stay available"))
        }
    }

    #[test]
    fn login_item_changes_system_state_then_persists_the_observed_result() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let controller = ProductStateController::load(
            Box::new(RecordingRepository {
                saves: saves.clone(),
                fail_save: false,
            }),
            false,
        )
        .expect("safe defaults should load");
        let login_item = FakeLoginItem {
            enabled: Mutex::new(false),
            set_calls: Mutex::new(0),
            fail_set_call: None,
            fail_read: false,
        };

        let snapshot = change_launch_at_login(&controller, &login_item, true)
            .expect("login item should be enabled");

        assert!(snapshot.preferences.launch_at_login);
        assert!(
            login_item
                .is_enabled()
                .expect("system state should be readable")
        );
        let saved = saves.lock().expect("save recorder should be readable");
        assert_eq!(saved.len(), 1);
        let document: serde_json::Value =
            serde_json::from_slice(&saved[0]).expect("saved preferences should be JSON");
        assert_eq!(document["launchAtLogin"], true);
    }

    #[test]
    fn login_item_failure_keeps_product_state_and_preferences_unchanged() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let controller = ProductStateController::load(
            Box::new(RecordingRepository {
                saves: saves.clone(),
                fail_save: false,
            }),
            false,
        )
        .expect("safe defaults should load");
        let login_item = FakeLoginItem {
            enabled: Mutex::new(false),
            set_calls: Mutex::new(0),
            fail_set_call: Some(1),
            fail_read: false,
        };

        let error = change_launch_at_login(&controller, &login_item, true)
            .expect_err("platform failure should be returned");

        assert!(error.contains("系统拒绝更新登录项"));
        assert!(
            !controller
                .snapshot()
                .expect("state should be readable")
                .preferences
                .launch_at_login
        );
        assert!(
            saves
                .lock()
                .expect("save recorder should be readable")
                .is_empty()
        );
    }

    #[test]
    fn login_item_observation_failure_rolls_the_platform_change_back() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let controller = ProductStateController::load(
            Box::new(RecordingRepository {
                saves: saves.clone(),
                fail_save: false,
            }),
            false,
        )
        .expect("safe defaults should load");
        let login_item = FakeLoginItem {
            enabled: Mutex::new(false),
            set_calls: Mutex::new(0),
            fail_set_call: None,
            fail_read: true,
        };

        let error = change_launch_at_login(&controller, &login_item, true)
            .expect_err("platform observation failure should be returned");

        assert!(error.contains("系统拒绝读取登录项"));
        assert!(
            !*login_item
                .enabled
                .lock()
                .expect("system state should remain readable")
        );
        assert!(
            !controller
                .snapshot()
                .expect("state should be readable")
                .preferences
                .launch_at_login
        );
        assert!(
            saves
                .lock()
                .expect("save recorder should be readable")
                .is_empty()
        );
    }

    #[test]
    fn observation_and_rollback_failures_are_both_reported() {
        let controller = ProductStateController::load(
            Box::new(RecordingRepository {
                saves: Arc::new(Mutex::new(Vec::new())),
                fail_save: false,
            }),
            false,
        )
        .expect("safe defaults should load");
        let login_item = FakeLoginItem {
            enabled: Mutex::new(false),
            set_calls: Mutex::new(0),
            fail_set_call: Some(2),
            fail_read: true,
        };

        let error = change_launch_at_login(&controller, &login_item, true)
            .expect_err("observation and rollback failures must be visible");

        assert!(error.contains("系统拒绝读取登录项"));
        assert!(error.contains("回滚"));
        assert!(error.contains("系统拒绝更新登录项"));
    }

    #[test]
    fn persistence_and_platform_rollback_failures_are_reported_and_reconciled() {
        let controller = ProductStateController::load(
            Box::new(RecordingRepository {
                saves: Arc::new(Mutex::new(Vec::new())),
                fail_save: true,
            }),
            false,
        )
        .expect("safe defaults should load");
        let login_item = FakeLoginItem {
            enabled: Mutex::new(false),
            set_calls: Mutex::new(0),
            fail_set_call: Some(2),
            fail_read: false,
        };

        let error = change_launch_at_login(&controller, &login_item, true)
            .expect_err("persistence and rollback failures must be visible");

        assert!(error.contains("偏好写入失败"));
        assert!(error.contains("回滚"));
        let snapshot = controller.snapshot().expect("state should be readable");
        assert!(
            snapshot.preferences.launch_at_login,
            "Rust state must follow the observed system truth after rollback fails"
        );
        assert_eq!(
            snapshot.preference_health.kind,
            crate::product_state::PreferenceHealthKind::Recovered
        );
    }
}
