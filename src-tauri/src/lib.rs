mod behavior;
mod desktop_runtime;
mod desktop_smoke;
pub mod diagnostics;
pub mod direct_interaction;
mod direct_interaction_runtime;
pub mod display_motion;
mod display_runtime;
mod login_item;
mod native_pet_panel;
mod native_pet_position;
pub mod pet_pack_store;
mod preferences_store;
mod product_state;
mod window_shell;

use std::{
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use behavior::{BehaviorStep, PreviewBehavior};
use desktop_runtime::schedule_desktop_smoke;
use desktop_smoke::requested_report_path;
use diagnostics::{DiagnosticsPetPack, DiagnosticsSnapshot, write_diagnostics};
use direct_interaction::DirectInteraction;
use direct_interaction_runtime::{InteractionPayload, PointerRequest};
use display_motion::PhysicalPoint;
use login_item::{LoginItem as _, SystemLoginItem, change_launch_at_login};
use native_pet_position::NativePetPositionController;
use oh_my_pets_domain::{
    AtlasManifest, LoadedPetPack, PetManifest, PetPackSummary, ValidationIssue, load_pet_pack,
};
use pet_pack_store::PetPackStore;
use preferences_store::FilePreferencesRepository;
use product_state::{
    ActivityFrequency, PetSize, ProductStateController, ProductStateSnapshot, Velocity,
};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Listener, Manager, State, WebviewWindow, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use window_shell::{
    MenuAction, PET_WINDOW_LABEL, configure_pet_collection_behavior, dispatch_tauri_menu,
};

const TRAY_ID: &str = "main-tray";
const TRAY_TITLE: &str = "卷";
const TRAY_TOOLTIP: &str = "Oh My Pets macOS 预览版";
const MENU_SHOW_PET: &str = "show-pet";
const MENU_HIDE_PET: &str = "hide-pet";
const MENU_ENABLE_QUIET: &str = "enable-quiet";
const MENU_DISABLE_QUIET: &str = "disable-quiet";
const MENU_ENABLE_CLICK_THROUGH: &str = "enable-click-through";
const MENU_DISABLE_CLICK_THROUGH: &str = "disable-click-through";
const MENU_RECALL_PET: &str = "recall-pet";
const MENU_OPEN_PREFERENCES: &str = "open-preferences";
const MENU_QUIT: &str = "quit";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShellSnapshot {
    click_through: bool,
    always_on_top: bool,
    visible_on_all_workspaces: bool,
}

impl Default for ShellSnapshot {
    fn default() -> Self {
        Self {
            click_through: false,
            always_on_top: true,
            visible_on_all_workspaces: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetPackPayload {
    revision: u64,
    manifest: PetManifest,
    atlas: AtlasManifest,
    summary: PetPackSummary,
    image_url: String,
}

impl PetPackPayload {
    fn from_loaded(revision: u64, pack: &LoadedPetPack) -> Self {
        Self {
            revision,
            manifest: pack.manifest.clone(),
            atlas: pack.atlas.clone(),
            summary: pack.summary.clone(),
            image_url: format!(
                "data:{};base64,{}",
                pack.atlas_image.media_type,
                STANDARD.encode(&pack.atlas_image.bytes)
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: String,
    message: String,
    details: Vec<ValidationIssue>,
    revision: Option<u64>,
}

impl CommandError {
    fn shell(message: impl Into<String>) -> Self {
        Self {
            code: "shell.error".to_string(),
            message: message.into(),
            details: Vec::new(),
            revision: None,
        }
    }

    fn shell_at(revision: u64, message: impl Into<String>) -> Self {
        Self {
            code: "shell.error".to_string(),
            message: message.into(),
            details: Vec::new(),
            revision: Some(revision),
        }
    }

    fn pack(revision: u64, issues: Vec<ValidationIssue>) -> Self {
        Self {
            code: "pet-pack.invalid".to_string(),
            message: "示例宠物包未通过校验".to_string(),
            details: issues,
            revision: Some(revision),
        }
    }
}

struct AppState {
    product: ProductStateController,
    pet_pack: PetPackStore,
    pet_position: NativePetPositionController,
    pet_panel_contract: Mutex<native_pet_panel::PetPanelContract>,
    interaction: Mutex<DirectInteraction>,
    behavior: Mutex<PreviewBehavior>,
    frontend_smoke: Mutex<Option<FrontendSmokeStatus>>,
}

impl AppState {
    fn new(product: ProductStateController) -> Self {
        Self {
            product,
            pet_pack: PetPackStore::default(),
            pet_position: NativePetPositionController::default(),
            pet_panel_contract: Mutex::new(native_pet_panel::PetPanelContract::default()),
            interaction: Mutex::new(DirectInteraction::default()),
            behavior: Mutex::new(PreviewBehavior::default()),
            frontend_smoke: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendSmokeStatus {
    #[serde(default)]
    surface: Option<String>,
    loaded: bool,
    detail: String,
}

fn pet_window(app: &AppHandle) -> Result<WebviewWindow, CommandError> {
    window_shell::pet_window(app).map_err(CommandError::shell)
}

fn dispatch_window_menu(app: &AppHandle, action: MenuAction) -> Result<(), CommandError> {
    dispatch_tauri_menu(app, action).map_err(|error| CommandError::shell(error.to_string()))
}

fn example_pack_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/pets/juanjuan")
}

fn preferences_file_path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    if let Some(path) = std::env::var_os("OH_MY_PETS_QA_PREFERENCES_PATH") {
        return Ok(PathBuf::from(path));
    }
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("preferences.json"))
        .map_err(|error| CommandError::shell(error.to_string()))
}

fn snapshot(state: &AppState) -> Result<ShellSnapshot, CommandError> {
    state
        .product
        .snapshot()
        .map(|value| ShellSnapshot {
            click_through: value.session.click_through,
            ..ShellSnapshot::default()
        })
        .map_err(CommandError::shell)
}

fn publish_product_state(
    app: &AppHandle,
    value: &ProductStateSnapshot,
) -> Result<(), CommandError> {
    // 先更新始终可用的恢复入口，再通知 WebView；尤其不能让鼠标穿透已经生效、
    // 但菜单仍停留在“开启鼠标穿透”。
    refresh_tray_menu(app, value).map_err(|error| CommandError::shell(error.to_string()))?;
    app.emit("product-state", value)
        .map_err(|error| CommandError::shell(error.to_string()))
}

fn set_click_through_inner(
    app: &AppHandle,
    state: &AppState,
    enabled: bool,
) -> Result<ShellSnapshot, CommandError> {
    let window = pet_window(app)?;
    let previous = state
        .product
        .snapshot()
        .map_err(CommandError::shell)?
        .session
        .click_through;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| CommandError::shell(error.to_string()))?;
    if enabled && let Err(error) = direct_interaction_runtime::cancel_all(app, state) {
        let rollback = window.set_ignore_cursor_events(previous);
        return Err(CommandError::shell(match rollback {
            Ok(()) => error.message,
            Err(rollback_error) => format!(
                "{}；恢复原窗口鼠标穿透状态失败：{rollback_error}",
                error.message
            ),
        }));
    }
    let product = match state.product.set_click_through(enabled) {
        Ok(product) => product,
        Err(error) => {
            let rollback = window.set_ignore_cursor_events(previous);
            return Err(CommandError::shell(match rollback {
                Ok(()) => error,
                Err(rollback_error) => {
                    format!("{error}；恢复原窗口鼠标穿透状态失败：{rollback_error}")
                }
            }));
        }
    };
    if let Err(publish_error) = publish_product_state(app, &product) {
        let window_rollback = window.set_ignore_cursor_events(previous);
        let state_rollback = state.product.set_click_through(previous);
        if let Ok(previous_state) = &state_rollback {
            let _ = publish_product_state(app, previous_state);
        }
        let rollback_details = match (window_rollback, state_rollback) {
            (Ok(()), Ok(_)) => "已恢复原鼠标穿透状态".to_string(),
            (window_result, state_result) => format!(
                "恢复原状态失败：窗口={}；状态={}",
                window_result
                    .err()
                    .map_or_else(|| "成功".to_string(), |error| error.to_string()),
                state_result.err().unwrap_or_else(|| "成功".to_string())
            ),
        };
        return Err(CommandError::shell(format!(
            "{}；{rollback_details}",
            publish_error.message
        )));
    }
    let value = ShellSnapshot {
        click_through: product.session.click_through,
        ..ShellSnapshot::default()
    };
    app.emit("shell-state", &value)
        .map_err(|error| CommandError::shell(error.to_string()))?;
    Ok(value)
}

fn reset_window_position_inner(
    app: &AppHandle,
    state: &AppState,
) -> Result<ProductStateSnapshot, CommandError> {
    let window = pet_window(app)?;
    state
        .pet_position
        .recall(&window, &state.product)
        .map_err(CommandError::shell)?;
    dispatch_window_menu(app, MenuAction::ShowPet)?;
    state
        .product
        .set_pet_hidden(false)
        .map_err(CommandError::shell)
}

fn restore_window_position(app: &AppHandle, state: &AppState) -> Result<(), CommandError> {
    let window = pet_window(app)?;
    if let Some(value) = state
        .pet_position
        .restore(&window, &state.product)
        .map_err(CommandError::shell)?
    {
        publish_product_state(app, &value)?;
    }
    Ok(())
}

fn schedule_display_reconciliation(app: &AppHandle) {
    let handle = app.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(1));
            if handle.get_webview_window(PET_WINDOW_LABEL).is_none() {
                break;
            }
            let state = handle.state::<AppState>();
            let result = pet_window(&handle).and_then(|window| {
                state
                    .pet_position
                    .reconcile(&window, &state.product)
                    .map_err(CommandError::shell)
            });
            match result {
                Ok(Some(value)) => {
                    if let Err(error) = publish_product_state(&handle, &value) {
                        report_tray_failure(&handle, error);
                    }
                }
                Ok(None) => {}
                Err(error) => report_tray_failure(&handle, error),
            }
        }
    });
}

fn reload_example_pet_pack_inner(
    app: &AppHandle,
    state: &AppState,
) -> Result<PetPackPayload, CommandError> {
    let revision = state
        .pet_pack
        .begin_reload()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    match load_pet_pack(example_pack_dir(), &app.package_info().version.to_string()) {
        Ok(pack) => {
            let payload = PetPackPayload::from_loaded(revision, &pack);
            let applied = state
                .pet_pack
                .accept(revision, pack)
                .map_err(|error| CommandError::shell_at(revision, error.to_string()))?;
            if applied {
                state
                    .behavior
                    .lock()
                    .map_err(|_| CommandError::shell_at(revision, "行为状态锁已损坏"))?
                    .reset();
            }
            Ok(payload)
        }
        Err(error) => {
            let applied = state
                .pet_pack
                .reject(revision, error.0.clone())
                .map_err(|error| CommandError::shell_at(revision, error.to_string()))?;
            if applied {
                state
                    .behavior
                    .lock()
                    .map_err(|_| CommandError::shell_at(revision, "行为状态锁已损坏"))?
                    .reset();
            }
            Err(CommandError::pack(revision, error.0))
        }
    }
}

fn current_pet_pack_inner(state: &AppState) -> Result<PetPackPayload, CommandError> {
    let snapshot = state
        .pet_pack
        .snapshot()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    snapshot
        .pack
        .as_ref()
        .map(|pack| PetPackPayload::from_loaded(snapshot.revision, pack))
        .ok_or_else(|| CommandError::pack(snapshot.revision, snapshot.issues))
}

fn next_preview_action_inner(state: &AppState) -> Result<BehaviorStep, CommandError> {
    let actions = state
        .pet_pack
        .behavior_actions()
        .map_err(|error| CommandError::shell(error.to_string()))?
        .ok_or_else(|| CommandError::shell("宠物包尚未加载"))?;
    let step = state
        .behavior
        .lock()
        .map_err(|_| CommandError::shell("行为状态锁已损坏"))
        .map(|mut behavior| behavior.next(&actions))?;
    state
        .product
        .set_runtime_behavior(
            &step.action,
            Velocity { x: 0.0, y: 0.0 },
            Some(u64::from(step.hold_ms)),
        )
        .map_err(CommandError::shell)?;
    Ok(step)
}

fn trigger_preview_action_inner(
    state: &AppState,
    action: &str,
) -> Result<BehaviorStep, CommandError> {
    let actions = state
        .pet_pack
        .behavior_actions()
        .map_err(|error| CommandError::shell(error.to_string()))?
        .ok_or_else(|| CommandError::shell("宠物包尚未加载"))?;
    let step = state
        .behavior
        .lock()
        .map_err(|_| CommandError::shell("行为状态锁已损坏"))
        .map(|behavior| behavior.trigger(action, &actions))?;
    state
        .product
        .set_runtime_behavior(
            &step.action,
            Velocity { x: 0.0, y: 0.0 },
            Some(u64::from(step.hold_ms)),
        )
        .map_err(CommandError::shell)?;
    Ok(step)
}

fn export_diagnostics_inner(app: &AppHandle, state: &AppState) -> Result<PathBuf, CommandError> {
    let shell = snapshot(state)?;
    let product = state.product.snapshot().map_err(CommandError::shell)?;
    let pet_pack = state
        .pet_pack
        .snapshot()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| CommandError::shell(error.to_string()))?
        .as_secs();

    let output_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let diagnostic = DiagnosticsSnapshot {
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        click_through: shell.click_through,
        always_on_top: shell.always_on_top,
        visible_on_all_workspaces: shell.visible_on_all_workspaces,
        pet_size: match product.preferences.pet_size {
            PetSize::Small => "small",
            PetSize::Medium => "medium",
            PetSize::Large => "large",
        }
        .to_string(),
        activity_frequency: match product.preferences.activity_frequency {
            ActivityFrequency::Low => "low",
            ActivityFrequency::Standard => "standard",
            ActivityFrequency::High => "high",
        }
        .to_string(),
        launch_at_login: product.preferences.launch_at_login,
        quiet_mode: product.session.quiet_mode,
        pet_hidden: product.session.pet_hidden,
        preference_health: product.preference_health.message,
        pet_pack: pet_pack.pack.as_ref().map(|pack| DiagnosticsPetPack {
            display_name: pack.summary.display_name.clone(),
            version: pack.summary.version.clone(),
            action_count: pack.summary.action_count,
            frame_count: pack.summary.frame_count,
        }),
        pet_pack_issues: pet_pack.issues,
    };
    write_diagnostics(&output_dir, timestamp, &diagnostic)
        .map_err(|error| CommandError::shell(error.to_string()))
}

#[tauri::command]
fn shell_snapshot(state: State<'_, AppState>) -> Result<ShellSnapshot, CommandError> {
    snapshot(state.inner())
}

#[tauri::command]
fn native_file_drop_coordinate_space() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "logical"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "physical"
    }
}

#[tauri::command]
fn product_state_snapshot(
    state: State<'_, AppState>,
) -> Result<ProductStateSnapshot, CommandError> {
    state.product.snapshot().map_err(CommandError::shell)
}

#[tauri::command]
fn set_pet_size(
    app: AppHandle,
    state: State<'_, AppState>,
    pet_size: PetSize,
) -> Result<ProductStateSnapshot, CommandError> {
    let value = state
        .product
        .set_pet_size(pet_size)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn set_activity_frequency(
    app: AppHandle,
    state: State<'_, AppState>,
    activity_frequency: ActivityFrequency,
) -> Result<ProductStateSnapshot, CommandError> {
    let value = state
        .product
        .set_activity_frequency(activity_frequency)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn set_launch_at_login(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<ProductStateSnapshot, CommandError> {
    let value = change_launch_at_login(&state.product, &SystemLoginItem::new(&app), enabled)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn set_quiet_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<ProductStateSnapshot, CommandError> {
    let value = state
        .product
        .set_quiet_mode(enabled)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn set_click_through(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<ShellSnapshot, CommandError> {
    set_click_through_inner(&app, state.inner(), enabled)
}

#[tauri::command]
fn reset_window_position(app: AppHandle, state: State<'_, AppState>) -> Result<(), CommandError> {
    let value = reset_window_position_inner(&app, state.inner())?;
    publish_product_state(&app, &value)?;
    Ok(())
}

#[tauri::command]
fn hide_preview_window(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ProductStateSnapshot, CommandError> {
    pet_window(&app)?
        .hide()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let value = state
        .product
        .set_pet_hidden(true)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn replay_onboarding(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ProductStateSnapshot, CommandError> {
    let value = state
        .product
        .set_onboarding_seen(false)
        .map_err(CommandError::shell)?;
    publish_product_state(&app, &value)?;
    Ok(value)
}

#[tauri::command]
fn current_pet_pack(state: State<'_, AppState>) -> Result<PetPackPayload, CommandError> {
    current_pet_pack_inner(state.inner())
}

#[tauri::command]
fn reload_example_pet_pack(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PetPackPayload, CommandError> {
    reload_example_pet_pack_inner(&app, state.inner())
}

#[tauri::command]
fn next_preview_action(state: State<'_, AppState>) -> Result<BehaviorStep, CommandError> {
    next_preview_action_inner(state.inner())
}

#[tauri::command]
fn trigger_preview_action(
    state: State<'_, AppState>,
    action: String,
) -> Result<BehaviorStep, CommandError> {
    trigger_preview_action_inner(state.inner(), &action)
}

#[tauri::command]
fn begin_pet_pointer(
    app: AppHandle,
    state: State<'_, AppState>,
    pointer: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::begin_pointer(&app, state.inner(), pointer)
}

#[tauri::command]
fn update_pet_pointer(
    app: AppHandle,
    state: State<'_, AppState>,
    capture_id: u64,
    pointer: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::update_pointer(&app, state.inner(), capture_id, pointer)
}

#[tauri::command]
fn end_pet_pointer(
    app: AppHandle,
    state: State<'_, AppState>,
    capture_id: u64,
    pointer: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::end_pointer(&app, state.inner(), capture_id, pointer)
}

#[tauri::command]
fn handle_pet_file_drop(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<PathBuf>,
    pointer: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::handle_file_drop(&app, state.inner(), paths, pointer)
}

#[tauri::command]
fn complete_pet_action(
    app: AppHandle,
    state: State<'_, AppState>,
    revision: u64,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::complete_action(&app, state.inner(), revision)
}

#[tauri::command]
fn cancel_pet_pointer(
    app: AppHandle,
    state: State<'_, AppState>,
    capture_id: u64,
) -> Result<InteractionPayload, CommandError> {
    direct_interaction_runtime::cancel_pointer(&app, state.inner(), capture_id)
}

#[tauri::command]
fn export_diagnostics(app: AppHandle, state: State<'_, AppState>) -> Result<String, CommandError> {
    export_diagnostics_inner(&app, state.inner()).map(|path| path.display().to_string())
}

fn handle_tray_menu(app: &AppHandle, id: &str) -> Result<(), CommandError> {
    let state = app.state::<AppState>();
    let value = match id {
        MENU_SHOW_PET => {
            dispatch_window_menu(app, MenuAction::ShowPet)?;
            Some(
                state
                    .product
                    .set_pet_hidden(false)
                    .map_err(CommandError::shell)?,
            )
        }
        MENU_HIDE_PET => {
            dispatch_window_menu(app, MenuAction::HidePet)?;
            Some(
                state
                    .product
                    .set_pet_hidden(true)
                    .map_err(CommandError::shell)?,
            )
        }
        MENU_ENABLE_QUIET => Some(reset_window_position_inner(app, state.inner()).and_then(
            |_| {
                state
                    .product
                    .set_quiet_mode(true)
                    .map_err(CommandError::shell)
            },
        )?),
        MENU_DISABLE_QUIET => Some(
            state
                .product
                .set_quiet_mode(false)
                .map_err(CommandError::shell)?,
        ),
        MENU_ENABLE_CLICK_THROUGH => {
            set_click_through_inner(app, state.inner(), true)?;
            None
        }
        MENU_DISABLE_CLICK_THROUGH => {
            set_click_through_inner(app, state.inner(), false)?;
            None
        }
        MENU_RECALL_PET => Some(reset_window_position_inner(app, state.inner())?),
        MENU_OPEN_PREFERENCES => {
            dispatch_window_menu(app, MenuAction::OpenPreferences)?;
            None
        }
        MENU_QUIT => {
            dispatch_window_menu(app, MenuAction::Quit)?;
            None
        }
        _ => None,
    };
    if let Some(value) = value {
        publish_product_state(app, &value)?;
    }
    Ok(())
}

fn mark_tray_ready(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some(TRAY_TITLE));
        let _ = tray.set_tooltip(Some(TRAY_TOOLTIP));
    }
}

fn report_tray_failure(app: &AppHandle, error: CommandError) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some("卷!"));
        let _ = tray.set_tooltip(Some(format!("操作失败：{}", error.message)));
    }
    let _ = app.emit("shell-operation-failed", error);
}

fn product_tray_menu(
    app: &AppHandle,
    state: &ProductStateSnapshot,
) -> tauri::Result<Menu<tauri::Wry>> {
    let (visibility_id, visibility_label) = if state.session.pet_hidden {
        (MENU_SHOW_PET, "显示宠物")
    } else {
        (MENU_HIDE_PET, "隐藏宠物")
    };
    let (quiet_id, quiet_label) = if state.session.quiet_mode {
        (MENU_DISABLE_QUIET, "退出安静模式")
    } else {
        (MENU_ENABLE_QUIET, "开启安静模式")
    };
    let (click_id, click_label) = if state.session.click_through {
        (MENU_DISABLE_CLICK_THROUGH, "关闭鼠标穿透")
    } else {
        (MENU_ENABLE_CLICK_THROUGH, "开启鼠标穿透")
    };
    let visibility = MenuItem::with_id(app, visibility_id, visibility_label, true, None::<&str>)?;
    let quiet = MenuItem::with_id(app, quiet_id, quiet_label, true, None::<&str>)?;
    let click = MenuItem::with_id(app, click_id, click_label, true, None::<&str>)?;
    let recall = MenuItem::with_id(app, MENU_RECALL_PET, "召回宠物", true, None::<&str>)?;
    let preferences = MenuItem::with_id(
        app,
        MENU_OPEN_PREFERENCES,
        "打开偏好设置…",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出 Oh My Pets", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&visibility, &quiet, &click, &recall, &preferences, &quit],
    )
}

fn refresh_tray_menu(app: &AppHandle, state: &ProductStateSnapshot) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(product_tray_menu(app, state)?))?;
    }
    Ok(())
}

fn build_tray(app: &AppHandle) -> Result<(), CommandError> {
    let state = app
        .state::<AppState>()
        .product
        .snapshot()
        .map_err(CommandError::shell)?;
    let menu =
        product_tray_menu(app, &state).map_err(|error| CommandError::shell(error.to_string()))?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(TRAY_TOOLTIP)
        .title(TRAY_TITLE)
        .on_menu_event(
            |app, event| match handle_tray_menu(app, event.id.as_ref()) {
                Ok(()) => mark_tray_ready(app),
                Err(error) => report_tray_failure(app, error),
            },
        )
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                match handle_tray_menu(tray.app_handle(), MENU_SHOW_PET) {
                    Ok(()) => mark_tray_ready(tray.app_handle()),
                    Err(error) => report_tray_failure(tray.app_handle(), error),
                }
            }
        });
    let _tray = tray
        .build(app)
        .map_err(|error| CommandError::shell(error.to_string()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));
    let builder = builder
        .on_window_event(|window, event| {
            if window.label() != PET_WINDOW_LABEL {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    let state = window.state::<AppState>();
                    match state.product.set_pet_hidden(true).and_then(|value| {
                        publish_product_state(window.app_handle(), &value)
                            .map_err(|error| error.message)
                    }) {
                        Ok(()) => {}
                        Err(error) => {
                            report_tray_failure(window.app_handle(), CommandError::shell(error));
                        }
                    }
                }
                WindowEvent::Moved(position) => {
                    let state = window.state::<AppState>();
                    let result = pet_window(window.app_handle()).and_then(|pet| {
                        state
                            .pet_position
                            .observe_move(
                                &pet,
                                &state.product,
                                PhysicalPoint::new(position.x, position.y),
                            )
                            .map_err(CommandError::shell)
                    });
                    match result {
                        Ok(Some(value)) => {
                            if let Err(error) = publish_product_state(window.app_handle(), &value) {
                                report_tray_failure(window.app_handle(), error);
                            }
                        }
                        Ok(None) => {}
                        Err(error) => report_tray_failure(window.app_handle(), error),
                    }
                }
                WindowEvent::ScaleFactorChanged { .. } => {
                    let state = window.state::<AppState>();
                    let result = pet_window(window.app_handle()).and_then(|pet| {
                        state
                            .pet_position
                            .reconcile(&pet, &state.product)
                            .map_err(CommandError::shell)
                    });
                    match result {
                        Ok(Some(value)) => {
                            if let Err(error) = publish_product_state(window.app_handle(), &value) {
                                report_tray_failure(window.app_handle(), error);
                            }
                        }
                        Ok(None) => {}
                        Err(error) => report_tray_failure(window.app_handle(), error),
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let launch_at_login = SystemLoginItem::new(&handle).is_enabled()?;
            let preferences_path = preferences_file_path(&handle).map_err(|error| error.message)?;
            let product = ProductStateController::load(
                Box::new(FilePreferencesRepository::new(preferences_path)),
                launch_at_login,
            )?;
            app.manage(AppState::new(product));

            let frontend_handle = handle.clone();
            app.listen("frontend-smoke-status", move |event| {
                let Ok(status) = serde_json::from_str::<FrontendSmokeStatus>(event.payload())
                else {
                    return;
                };
                if let Ok(mut current) = frontend_handle.state::<AppState>().frontend_smoke.lock() {
                    *current = Some(status);
                }
            });
            let window = pet_window(&handle).map_err(|error| error.message)?;
            let panel_contract = native_pet_panel::configure_pet_panel(&window)?;
            *app.state::<AppState>()
                .pet_panel_contract
                .lock()
                .map_err(|_| "宠物原生面板契约状态锁已损坏")? = panel_contract;
            window.set_always_on_top(true)?;
            window.set_visible_on_all_workspaces(true)?;
            configure_pet_collection_behavior(&window)?;
            restore_window_position(&handle, app.state::<AppState>().inner())
                .map_err(|error| error.message)?;
            build_tray(&handle).map_err(|error| error.message)?;
            schedule_display_reconciliation(&handle);

            let state = app.state::<AppState>();
            let _ = reload_example_pet_pack_inner(&handle, state.inner());
            if let Some(report_path) = requested_report_path() {
                schedule_desktop_smoke(&handle, report_path);
            }
            // ADR 0002：TAO 的启动激活请求已经结束，此时切回 Accessory 不会抢走
            // 其他应用的 first responder，偏好设置仍可在用户发起后正常交互。
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shell_snapshot,
            native_file_drop_coordinate_space,
            product_state_snapshot,
            set_pet_size,
            set_activity_frequency,
            set_launch_at_login,
            set_quiet_mode,
            set_click_through,
            reset_window_position,
            hide_preview_window,
            replay_onboarding,
            current_pet_pack,
            reload_example_pet_pack,
            next_preview_action,
            trigger_preview_action,
            begin_pet_pointer,
            update_pet_pointer,
            end_pet_pointer,
            handle_pet_file_drop,
            complete_pet_action,
            cancel_pet_pointer,
            export_diagnostics
        ]);
    let mut app = builder
        .build(tauri::generate_context!())
        .expect("failed to build Oh My Pets");
    // ADR 0002：阻止 TAO 在 applicationDidFinishLaunching 中的强制激活打断
    // 当前前台应用的键盘 first responder；setup 完成后再恢复 Accessory。
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
    app.run(|_, _| {});
}
