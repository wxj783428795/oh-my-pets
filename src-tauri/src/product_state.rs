use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const CURRENT_PREFERENCES_VERSION: u32 = 1;
const MAX_STORED_COORDINATE: u32 = 1_000_000;

pub trait PreferencesRepository: Send + Sync {
    fn load(&self) -> Result<Option<Vec<u8>>, String>;
    fn save(&self, contents: &[u8]) -> Result<PreferencesSaveStatus, String>;
}

pub enum PreferencesSaveStatus {
    Durable,
    CommittedWithWarning(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetSize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityFrequency {
    Low,
    Standard,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentPreferences {
    pub pet_size: PetSize,
    pub activity_frequency: ActivityFrequency,
    pub launch_at_login: bool,
    pub last_valid_position: Option<SavedPosition>,
    pub onboarding_seen: bool,
}

impl Default for PersistentPreferences {
    fn default() -> Self {
        Self {
            pet_size: PetSize::Medium,
            activity_frequency: ActivityFrequency::Standard,
            launch_at_login: false,
            last_valid_position: None,
            onboarding_seen: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreferencesDocument {
    version: u32,
    #[serde(flatten)]
    preferences: PersistentPreferences,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyPreferencesDocument {
    version: u32,
    pet_size: PetSize,
    activity_frequency: ActivityFrequency,
    launch_at_login: bool,
    last_valid_position: Option<SavedPosition>,
}

struct DecodedPreferences {
    preferences: PersistentPreferences,
    health: PreferenceHealth,
    requires_save: bool,
}

fn recovered_preferences(message: impl Into<String>) -> DecodedPreferences {
    DecodedPreferences {
        preferences: PersistentPreferences::default(),
        health: PreferenceHealth {
            kind: PreferenceHealthKind::Recovered,
            message: message.into(),
        },
        requires_save: false,
    }
}

fn position_is_invalid(position: Option<&SavedPosition>) -> bool {
    position.is_some_and(|position| {
        position.x.unsigned_abs() > MAX_STORED_COORDINATE
            || position.y.unsigned_abs() > MAX_STORED_COORDINATE
    })
}

fn decode_preferences(contents: &[u8]) -> DecodedPreferences {
    let value: serde_json::Value = match serde_json::from_slice(contents) {
        Ok(value) => value,
        Err(_) => return recovered_preferences("偏好数据损坏，已使用安全默认值"),
    };
    let Some(version) = value.get("version").and_then(serde_json::Value::as_u64) else {
        return recovered_preferences("偏好版本无效，已使用安全默认值");
    };
    if version == 0 {
        let legacy: LegacyPreferencesDocument = match serde_json::from_value(value) {
            Ok(legacy) => legacy,
            Err(_) => return recovered_preferences("旧版偏好包含无效值，已使用安全默认值"),
        };
        if legacy.version != 0 || position_is_invalid(legacy.last_valid_position.as_ref()) {
            return recovered_preferences("旧版偏好位置越界，已使用安全默认值");
        }
        return DecodedPreferences {
            preferences: PersistentPreferences {
                pet_size: legacy.pet_size,
                activity_frequency: legacy.activity_frequency,
                launch_at_login: legacy.launch_at_login,
                last_valid_position: legacy.last_valid_position,
                onboarding_seen: false,
            },
            health: PreferenceHealth {
                kind: PreferenceHealthKind::Migrated,
                message: "旧版偏好已升级到当前版本".to_string(),
            },
            requires_save: true,
        };
    }
    if version != u64::from(CURRENT_PREFERENCES_VERSION) {
        return recovered_preferences("偏好版本不受支持，已使用安全默认值");
    }
    let document: PreferencesDocument = match serde_json::from_value(value) {
        Ok(document) => document,
        Err(_) => return recovered_preferences("偏好包含无效值，已使用安全默认值"),
    };
    if position_is_invalid(document.preferences.last_valid_position.as_ref()) {
        return recovered_preferences("偏好位置越界，已使用安全默认值");
    }
    DecodedPreferences {
        preferences: document.preferences,
        health: PreferenceHealth {
            kind: PreferenceHealthKind::Healthy,
            message: "偏好文件已加载".to_string(),
        },
        requires_save: false,
    }
}

fn encode_preferences(preferences: &PersistentPreferences) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(&PreferencesDocument {
        version: CURRENT_PREFERENCES_VERSION,
        preferences: preferences.clone(),
    })
    .map_err(|error| format!("无法编码偏好文件：{error}"))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Velocity {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub quiet_mode: bool,
    pub pet_hidden: bool,
    pub click_through: bool,
    pub current_action: String,
    pub velocity: Velocity,
    pub behavior_timer_ms: Option<u64>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            quiet_mode: false,
            pet_hidden: false,
            click_through: false,
            current_action: "idle".to_string(),
            velocity: Velocity { x: 0.0, y: 0.0 },
            behavior_timer_ms: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreferenceHealthKind {
    Healthy,
    Missing,
    Migrated,
    Recovered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferenceHealth {
    pub kind: PreferenceHealthKind,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductStateSnapshot {
    pub preferences: PersistentPreferences,
    pub session: SessionState,
    pub preference_health: PreferenceHealth,
}

pub struct ProductStateController {
    state: Mutex<ProductStateSnapshot>,
    #[allow(dead_code)]
    repository: Box<dyn PreferencesRepository>,
}

impl ProductStateController {
    pub fn load(
        repository: Box<dyn PreferencesRepository>,
        launch_at_login: bool,
    ) -> Result<Self, String> {
        let contents = repository.load()?;
        let decoded = match contents {
            Some(contents) => decode_preferences(&contents),
            None => DecodedPreferences {
                preferences: PersistentPreferences::default(),
                health: PreferenceHealth {
                    kind: PreferenceHealthKind::Missing,
                    message: "未找到偏好文件，已使用安全默认值".to_string(),
                },
                requires_save: false,
            },
        };
        let mut preferences = decoded.preferences;
        let mut health = decoded.health;
        let mut requires_save = decoded.requires_save;
        if preferences.launch_at_login != launch_at_login {
            preferences.launch_at_login = launch_at_login;
            requires_save = true;
        }
        if requires_save {
            let contents = encode_preferences(&preferences)?;
            match repository.save(&contents) {
                Ok(PreferencesSaveStatus::Durable) => {}
                Ok(PreferencesSaveStatus::CommittedWithWarning(warning)) => {
                    health = PreferenceHealth {
                        kind: PreferenceHealthKind::Recovered,
                        message: format!("偏好已替换，但持久化确认不完整：{warning}"),
                    };
                }
                Err(error) => {
                    health = PreferenceHealth {
                        kind: PreferenceHealthKind::Recovered,
                        message: format!(
                            "偏好升级或系统状态校正未能写回，将继续使用本次安全状态：{error}"
                        ),
                    };
                }
            }
        }
        Ok(Self {
            state: Mutex::new(ProductStateSnapshot {
                preferences,
                session: SessionState::default(),
                preference_health: health,
            }),
            repository,
        })
    }

    pub fn snapshot(&self) -> Result<ProductStateSnapshot, String> {
        self.state
            .lock()
            .map(|state| state.clone())
            .map_err(|_| "产品状态锁已损坏".to_string())
    }

    fn update_preferences(
        &self,
        update: impl FnOnce(&mut PersistentPreferences),
    ) -> Result<ProductStateSnapshot, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "产品状态锁已损坏".to_string())?;
        let previous = state.preferences.clone();
        update(&mut state.preferences);
        let contents = encode_preferences(&state.preferences)?;
        match self.repository.save(&contents) {
            Ok(PreferencesSaveStatus::Durable) => {}
            Ok(PreferencesSaveStatus::CommittedWithWarning(warning)) => {
                state.preference_health = PreferenceHealth {
                    kind: PreferenceHealthKind::Recovered,
                    message: format!("偏好已替换，但持久化确认不完整：{warning}"),
                };
            }
            Err(error) => {
                state.preferences = previous;
                return Err(error);
            }
        }
        Ok(state.clone())
    }

    pub fn reconcile_launch_at_login(
        &self,
        launch_at_login: bool,
        warning: impl Into<String>,
    ) -> Result<ProductStateSnapshot, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "产品状态锁已损坏".to_string())?;
        state.preferences.launch_at_login = launch_at_login;
        state.preference_health = PreferenceHealth {
            kind: PreferenceHealthKind::Recovered,
            message: warning.into(),
        };
        Ok(state.clone())
    }

    pub fn set_pet_size(&self, pet_size: PetSize) -> Result<ProductStateSnapshot, String> {
        self.update_preferences(|preferences| preferences.pet_size = pet_size)
    }

    pub fn set_activity_frequency(
        &self,
        activity_frequency: ActivityFrequency,
    ) -> Result<ProductStateSnapshot, String> {
        self.update_preferences(|preferences| {
            preferences.activity_frequency = activity_frequency;
        })
    }

    pub fn set_launch_at_login(
        &self,
        launch_at_login: bool,
    ) -> Result<ProductStateSnapshot, String> {
        self.update_preferences(|preferences| {
            preferences.launch_at_login = launch_at_login;
        })
    }

    pub fn set_last_valid_position(
        &self,
        position: SavedPosition,
    ) -> Result<ProductStateSnapshot, String> {
        if position_is_invalid(Some(&position)) {
            return Err("无法保存越界的宠物位置".to_string());
        }
        self.update_preferences(|preferences| {
            preferences.last_valid_position = Some(position);
        })
    }

    pub fn set_onboarding_seen(&self, seen: bool) -> Result<ProductStateSnapshot, String> {
        self.update_preferences(|preferences| {
            preferences.onboarding_seen = seen;
        })
    }

    fn update_session(
        &self,
        update: impl FnOnce(&mut SessionState),
    ) -> Result<ProductStateSnapshot, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "产品状态锁已损坏".to_string())?;
        update(&mut state.session);
        Ok(state.clone())
    }

    pub fn set_quiet_mode(&self, enabled: bool) -> Result<ProductStateSnapshot, String> {
        self.update_session(|session| session.quiet_mode = enabled)
    }

    pub fn set_pet_hidden(&self, hidden: bool) -> Result<ProductStateSnapshot, String> {
        self.update_session(|session| session.pet_hidden = hidden)
    }

    pub fn set_click_through(&self, enabled: bool) -> Result<ProductStateSnapshot, String> {
        self.update_session(|session| session.click_through = enabled)
    }

    pub fn set_runtime_behavior(
        &self,
        action: &str,
        velocity: Velocity,
        behavior_timer_ms: Option<u64>,
    ) -> Result<ProductStateSnapshot, String> {
        self.update_session(|session| {
            session.current_action = action.to_string();
            session.velocity = velocity;
            session.behavior_timer_ms = behavior_timer_ms;
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::{
        ActivityFrequency, PetSize, PreferenceHealthKind, PreferencesRepository,
        PreferencesSaveStatus, ProductStateController, SavedPosition,
    };

    struct MissingPreferences;

    impl PreferencesRepository for MissingPreferences {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(None)
        }

        fn save(&self, _contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
            panic!("loading safe defaults must not write preferences");
        }
    }

    #[test]
    fn missing_preferences_start_with_safe_defaults_and_reset_session_state() {
        let controller = ProductStateController::load(Box::new(MissingPreferences), false)
            .expect("missing preferences should use safe defaults");

        let snapshot = controller.snapshot().expect("state should be readable");

        assert_eq!(snapshot.preferences.pet_size, PetSize::Medium);
        assert_eq!(
            snapshot.preferences.activity_frequency,
            ActivityFrequency::Standard
        );
        assert!(!snapshot.preferences.launch_at_login);
        assert!(snapshot.preferences.last_valid_position.is_none());
        assert!(!snapshot.preferences.onboarding_seen);
        assert!(!snapshot.session.quiet_mode);
        assert!(!snapshot.session.pet_hidden);
        assert!(!snapshot.session.click_through);
        assert_eq!(snapshot.session.current_action, "idle");
        assert_eq!(snapshot.session.velocity.x, 0.0);
        assert_eq!(snapshot.session.velocity.y, 0.0);
        assert!(snapshot.session.behavior_timer_ms.is_none());
        assert_eq!(
            snapshot.preference_health.kind,
            PreferenceHealthKind::Missing
        );
    }

    #[derive(Clone)]
    struct RecordingPreferences {
        loaded: Vec<u8>,
        saves: Arc<Mutex<Vec<Vec<u8>>>>,
    }

    impl PreferencesRepository for RecordingPreferences {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(Some(self.loaded.clone()))
        }

        fn save(&self, contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
            self.saves
                .lock()
                .expect("save recorder should stay available")
                .push(contents.to_vec());
            Ok(PreferencesSaveStatus::Durable)
        }
    }

    struct FailedWriteBackPreferences {
        loaded: Vec<u8>,
    }

    impl PreferencesRepository for FailedWriteBackPreferences {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(Some(self.loaded.clone()))
        }

        fn save(&self, _contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
            Err("测试写回失败".to_string())
        }
    }

    #[test]
    fn migration_write_back_failure_keeps_the_app_available_with_local_diagnostics() {
        let controller = ProductStateController::load(
            Box::new(FailedWriteBackPreferences {
                loaded: br#"{
                    "version": 0,
                    "petSize": "small",
                    "activityFrequency": "low",
                    "launchAtLogin": false,
                    "lastValidPosition": {"x": 24, "y": 48}
                }"#
                .to_vec(),
            }),
            false,
        )
        .expect("migration write-back failure must not abort startup");

        let snapshot = controller.snapshot().expect("state should be readable");
        assert_eq!(snapshot.preferences.pet_size, PetSize::Small);
        assert_eq!(
            snapshot.preference_health.kind,
            PreferenceHealthKind::Recovered
        );
        assert!(snapshot.preference_health.message.contains("写回"));
        assert!(snapshot.preference_health.message.contains("测试写回失败"));
    }

    struct CommittedWithWarningPreferences {
        loaded: Vec<u8>,
    }

    impl PreferencesRepository for CommittedWithWarningPreferences {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(Some(self.loaded.clone()))
        }

        fn save(&self, _contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
            Ok(PreferencesSaveStatus::CommittedWithWarning(
                "目录同步失败".to_string(),
            ))
        }
    }

    #[test]
    fn committed_write_warning_keeps_memory_aligned_with_the_replaced_file() {
        let controller = ProductStateController::load(
            Box::new(CommittedWithWarningPreferences {
                loaded: br#"{
                    "version": 1,
                    "petSize": "medium",
                    "activityFrequency": "standard",
                    "launchAtLogin": false,
                    "lastValidPosition": null,
                    "onboardingSeen": false
                }"#
                .to_vec(),
            }),
            false,
        )
        .expect("valid preferences should load");

        let snapshot = controller
            .set_pet_size(PetSize::Large)
            .expect("a committed replacement remains a successful state change");

        assert_eq!(snapshot.preferences.pet_size, PetSize::Large);
        assert_eq!(
            snapshot.preference_health.kind,
            PreferenceHealthKind::Recovered
        );
        assert!(snapshot.preference_health.message.contains("目录同步失败"));
    }

    #[test]
    fn versioned_preferences_restore_only_persistent_fields_and_follow_system_login_state() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let repository = RecordingPreferences {
            loaded: br#"{
                "version": 1,
                "petSize": "large",
                "activityFrequency": "high",
                "launchAtLogin": true,
                "lastValidPosition": {"x": 140, "y": 90},
                "onboardingSeen": true
            }"#
            .to_vec(),
            saves: saves.clone(),
        };

        let controller = ProductStateController::load(Box::new(repository), false)
            .expect("valid preferences should load");
        let snapshot = controller.snapshot().expect("state should be readable");

        assert_eq!(snapshot.preferences.pet_size, PetSize::Large);
        assert_eq!(
            snapshot.preferences.activity_frequency,
            ActivityFrequency::High
        );
        assert!(!snapshot.preferences.launch_at_login);
        assert_eq!(
            snapshot.preferences.last_valid_position,
            Some(SavedPosition { x: 140, y: 90 })
        );
        assert!(snapshot.preferences.onboarding_seen);
        assert_eq!(snapshot.session.current_action, "idle");
        assert!(!snapshot.session.quiet_mode);
        assert!(!snapshot.session.pet_hidden);
        assert!(!snapshot.session.click_through);
        assert_eq!(
            snapshot.preference_health.kind,
            PreferenceHealthKind::Healthy
        );

        let saved = saves.lock().expect("save recorder should be readable");
        assert_eq!(saved.len(), 1);
        let corrected: serde_json::Value =
            serde_json::from_slice(&saved[0]).expect("saved preferences should be JSON");
        assert_eq!(corrected["launchAtLogin"], false);
    }

    #[test]
    fn damaged_unknown_or_invalid_preferences_recover_without_exposing_a_path() {
        let cases = [
            ("截断 JSON", br#"{"version":1"#.as_slice(), "损坏"),
            (
                "未知版本",
                br#"{
                    "version": 99,
                    "petSize": "small",
                    "activityFrequency": "low",
                    "launchAtLogin": false,
                    "lastValidPosition": null,
                    "onboardingSeen": true
                }"#,
                "版本",
            ),
            (
                "非法尺寸",
                br#"{
                    "version": 1,
                    "petSize": "gigantic",
                    "activityFrequency": "standard",
                    "launchAtLogin": false,
                    "lastValidPosition": null,
                    "onboardingSeen": false
                }"#,
                "无效",
            ),
            (
                "越界位置",
                br#"{
                    "version": 1,
                    "petSize": "medium",
                    "activityFrequency": "standard",
                    "launchAtLogin": false,
                    "lastValidPosition": {"x": 2147483647, "y": 0},
                    "onboardingSeen": false
                }"#,
                "位置",
            ),
        ];

        for (name, loaded, expected_message) in cases {
            let controller = ProductStateController::load(
                Box::new(RecordingPreferences {
                    loaded: loaded.to_vec(),
                    saves: Arc::new(Mutex::new(Vec::new())),
                }),
                false,
            )
            .unwrap_or_else(|error| panic!("{name} 应安全恢复：{error}"));
            let snapshot = controller.snapshot().expect("state should be readable");

            assert_eq!(
                snapshot.preferences,
                super::PersistentPreferences::default()
            );
            assert_eq!(
                snapshot.preference_health.kind,
                PreferenceHealthKind::Recovered
            );
            assert!(
                snapshot
                    .preference_health
                    .message
                    .contains(expected_message),
                "{name} 的诊断应包含 {expected_message}，实际为 {}",
                snapshot.preference_health.message
            );
            assert!(!snapshot.preference_health.message.contains('/'));

            let updated = controller
                .set_pet_size(PetSize::Large)
                .expect("恢复后的偏好应能正常保存");
            assert_eq!(
                updated.preference_health.kind,
                PreferenceHealthKind::Recovered,
                "{name} 的本次启动恢复证据不应被后续保存覆盖"
            );
        }
    }

    #[test]
    fn legacy_preferences_are_migrated_and_saved_in_the_current_version() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let repository = RecordingPreferences {
            loaded: br#"{
                "version": 0,
                "petSize": "small",
                "activityFrequency": "low",
                "launchAtLogin": false,
                "lastValidPosition": {"x": 24, "y": 48}
            }"#
            .to_vec(),
            saves: saves.clone(),
        };

        let controller = ProductStateController::load(Box::new(repository), false)
            .expect("legacy preferences should migrate");
        let snapshot = controller.snapshot().expect("state should be readable");

        assert_eq!(snapshot.preferences.pet_size, PetSize::Small);
        assert_eq!(
            snapshot.preferences.activity_frequency,
            ActivityFrequency::Low
        );
        assert_eq!(
            snapshot.preferences.last_valid_position,
            Some(SavedPosition { x: 24, y: 48 })
        );
        assert!(!snapshot.preferences.onboarding_seen);
        assert_eq!(
            snapshot.preference_health.kind,
            PreferenceHealthKind::Migrated
        );

        let saved = saves.lock().expect("save recorder should be readable");
        assert_eq!(saved.len(), 1);
        let migrated: serde_json::Value =
            serde_json::from_slice(&saved[0]).expect("migrated preferences should be JSON");
        assert_eq!(migrated["version"], 1);
        assert_eq!(migrated["onboardingSeen"], false);
    }

    #[test]
    fn concurrent_preference_updates_are_serialized_without_persisting_session_state() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let repository = RecordingPreferences {
            loaded: br#"{
                "version": 1,
                "petSize": "medium",
                "activityFrequency": "standard",
                "launchAtLogin": false,
                "lastValidPosition": null,
                "onboardingSeen": false
            }"#
            .to_vec(),
            saves: saves.clone(),
        };
        let controller = Arc::new(
            ProductStateController::load(Box::new(repository), false)
                .expect("valid preferences should load"),
        );

        let size_controller = controller.clone();
        let size_update = std::thread::spawn(move || size_controller.set_pet_size(PetSize::Large));
        let frequency_controller = controller.clone();
        let frequency_update = std::thread::spawn(move || {
            frequency_controller.set_activity_frequency(ActivityFrequency::High)
        });

        size_update
            .join()
            .expect("size update thread should finish")
            .expect("size update should persist");
        frequency_update
            .join()
            .expect("frequency update thread should finish")
            .expect("frequency update should persist");

        let snapshot = controller.snapshot().expect("state should be readable");
        assert_eq!(snapshot.preferences.pet_size, PetSize::Large);
        assert_eq!(
            snapshot.preferences.activity_frequency,
            ActivityFrequency::High
        );

        let saved = saves.lock().expect("save recorder should be readable");
        let final_document: serde_json::Value =
            serde_json::from_slice(saved.last().expect("updates should save preferences"))
                .expect("saved preferences should be JSON");
        assert_eq!(final_document["petSize"], "large");
        assert_eq!(final_document["activityFrequency"], "high");
        assert!(final_document.get("session").is_none());
        assert!(final_document.get("quietMode").is_none());
        assert!(final_document.get("clickThrough").is_none());
    }

    #[test]
    fn session_updates_never_persist_and_are_reset_on_the_next_launch() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let loaded = br#"{
            "version": 1,
            "petSize": "medium",
            "activityFrequency": "standard",
            "launchAtLogin": false,
            "lastValidPosition": null,
            "onboardingSeen": false
        }"#
        .to_vec();
        let controller = ProductStateController::load(
            Box::new(RecordingPreferences {
                loaded: loaded.clone(),
                saves: saves.clone(),
            }),
            false,
        )
        .expect("valid preferences should load");

        controller
            .set_quiet_mode(true)
            .expect("quiet mode should update");
        controller
            .set_pet_hidden(true)
            .expect("hidden state should update");
        controller
            .set_click_through(true)
            .expect("click-through should update");
        controller
            .set_runtime_behavior("walk_left", super::Velocity { x: -3.0, y: 1.5 }, Some(800))
            .expect("runtime behavior should update");

        let session = controller
            .snapshot()
            .expect("state should be readable")
            .session;
        assert!(session.quiet_mode);
        assert!(session.pet_hidden);
        assert!(session.click_through);
        assert_eq!(session.current_action, "walk_left");
        assert_eq!(session.velocity, super::Velocity { x: -3.0, y: 1.5 });
        assert_eq!(session.behavior_timer_ms, Some(800));
        assert!(
            saves
                .lock()
                .expect("save recorder should be readable")
                .is_empty()
        );

        let restarted = ProductStateController::load(
            Box::new(RecordingPreferences {
                loaded,
                saves: Arc::new(Mutex::new(Vec::new())),
            }),
            false,
        )
        .expect("restart should load persistent preferences");
        assert_eq!(
            restarted
                .snapshot()
                .expect("restarted state should be readable")
                .session,
            super::SessionState::default()
        );
    }

    #[test]
    fn position_and_onboarding_seam_persist_and_replay_only_resets_the_marker() {
        let saves = Arc::new(Mutex::new(Vec::new()));
        let controller = ProductStateController::load(
            Box::new(RecordingPreferences {
                loaded: br#"{
                    "version": 1,
                    "petSize": "medium",
                    "activityFrequency": "standard",
                    "launchAtLogin": false,
                    "lastValidPosition": null,
                    "onboardingSeen": false
                }"#
                .to_vec(),
                saves: saves.clone(),
            }),
            false,
        )
        .expect("valid preferences should load");

        controller
            .set_last_valid_position(SavedPosition { x: 320, y: 180 })
            .expect("position should persist");
        controller
            .set_onboarding_seen(true)
            .expect("onboarding marker should persist");
        let replay = controller
            .set_onboarding_seen(false)
            .expect("replay should reset the marker");

        assert_eq!(
            replay.preferences.last_valid_position,
            Some(SavedPosition { x: 320, y: 180 })
        );
        assert!(!replay.preferences.onboarding_seen);
        let saved = saves.lock().expect("save recorder should be readable");
        let document: serde_json::Value =
            serde_json::from_slice(saved.last().expect("updates should be saved"))
                .expect("saved preferences should be JSON");
        assert_eq!(document["lastValidPosition"]["x"], 320);
        assert_eq!(document["lastValidPosition"]["y"], 180);
        assert_eq!(document["onboardingSeen"], false);
    }
}
