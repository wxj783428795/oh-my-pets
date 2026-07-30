mod behavior;
mod desktop_runtime;
mod desktop_smoke;
pub mod diagnostics;
pub mod pet_pack_store;
pub mod window_recovery;
mod window_shell;

use std::{
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use behavior::{BehaviorStep, PreviewBehavior};
use desktop_runtime::schedule_desktop_smoke;
use desktop_smoke::requested_report_path;
use diagnostics::{DiagnosticsPetPack, DiagnosticsSnapshot, write_diagnostics};
use oh_my_pets_domain::{
    AtlasManifest, LoadedPetPack, PetManifest, PetPackSummary, ValidationIssue, load_pet_pack,
};
use pet_pack_store::PetPackStore;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use window_recovery::{WindowSize, WorkArea, recover_position};
use window_shell::{
    MenuAction, PET_WINDOW_LABEL, configure_pet_collection_behavior, dispatch_tauri_menu,
};

const TRAY_ID: &str = "main-tray";
const TRAY_TITLE: &str = "卷";
const TRAY_TOOLTIP: &str = "Oh My Pets macOS 预览版";
const MENU_SHOW_PET: &str = "show-pet";
const MENU_HIDE_PET: &str = "hide-pet";
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
    shell: Mutex<ShellSnapshot>,
    pet_pack: PetPackStore,
    behavior: Mutex<PreviewBehavior>,
    frontend_smoke: Mutex<Option<FrontendSmokeStatus>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            shell: Mutex::new(ShellSnapshot::default()),
            pet_pack: PetPackStore::default(),
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

fn snapshot(state: &AppState) -> Result<ShellSnapshot, CommandError> {
    state
        .shell
        .lock()
        .map(|value| value.clone())
        .map_err(|_| CommandError::shell("窗口状态锁已损坏"))
}

fn set_click_through_inner(
    app: &AppHandle,
    state: &AppState,
    enabled: bool,
) -> Result<ShellSnapshot, CommandError> {
    let window = pet_window(app)?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let value = {
        let mut shell = state
            .shell
            .lock()
            .map_err(|_| CommandError::shell("窗口状态锁已损坏"))?;
        shell.click_through = enabled;
        shell.clone()
    };
    let _ = app.emit("shell-state", &value);
    Ok(value)
}

fn reset_window_position_inner(app: &AppHandle) -> Result<(), CommandError> {
    let window = pet_window(app)?;
    let current_monitor = window
        .current_monitor()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let primary_monitor = if current_monitor.is_none() {
        window
            .primary_monitor()
            .map_err(|error| CommandError::shell(error.to_string()))?
    } else {
        None
    };
    let window_size = window
        .outer_size()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let to_work_area = |monitor: &tauri::Monitor| {
        let area = monitor.work_area();
        WorkArea {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        }
    };
    let position = recover_position(
        current_monitor.as_ref().map(to_work_area),
        primary_monitor.as_ref().map(to_work_area),
        WindowSize {
            width: window_size.width,
            height: window_size.height,
        },
        24,
    )
    .ok_or_else(|| CommandError::shell("无法读取当前或主显示器"))?;
    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(|error| CommandError::shell(error.to_string()))?;
    dispatch_window_menu(app, MenuAction::ShowPet)
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
    state
        .behavior
        .lock()
        .map_err(|_| CommandError::shell("行为状态锁已损坏"))
        .map(|mut behavior| behavior.next(&actions))
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
    state
        .behavior
        .lock()
        .map_err(|_| CommandError::shell("行为状态锁已损坏"))
        .map(|behavior| behavior.trigger(action, &actions))
}

fn export_diagnostics_inner(app: &AppHandle, state: &AppState) -> Result<PathBuf, CommandError> {
    let shell = snapshot(state)?;
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
fn set_click_through(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<ShellSnapshot, CommandError> {
    set_click_through_inner(&app, state.inner(), enabled)
}

#[tauri::command]
fn reset_window_position(app: AppHandle) -> Result<(), CommandError> {
    reset_window_position_inner(&app)
}

#[tauri::command]
fn hide_preview_window(window: WebviewWindow) -> Result<(), CommandError> {
    window
        .hide()
        .map_err(|error| CommandError::shell(error.to_string()))
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
fn export_diagnostics(app: AppHandle, state: State<'_, AppState>) -> Result<String, CommandError> {
    export_diagnostics_inner(&app, state.inner()).map(|path| path.display().to_string())
}

fn handle_tray_menu(app: &AppHandle, id: &str) -> Result<(), CommandError> {
    let action = match id {
        MENU_SHOW_PET => Some(MenuAction::ShowPet),
        MENU_HIDE_PET => Some(MenuAction::HidePet),
        MENU_OPEN_PREFERENCES => Some(MenuAction::OpenPreferences),
        MENU_QUIT => Some(MenuAction::Quit),
        _ => None,
    };
    match action {
        Some(action) => dispatch_window_menu(app, action),
        None => Ok(()),
    }
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

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_pet = MenuItem::with_id(app, MENU_SHOW_PET, "显示宠物", true, None::<&str>)?;
    let hide_pet = MenuItem::with_id(app, MENU_HIDE_PET, "隐藏宠物", true, None::<&str>)?;
    let preferences = MenuItem::with_id(
        app,
        MENU_OPEN_PREFERENCES,
        "打开偏好设置…",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出 Oh My Pets", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_pet, &hide_pet, &preferences, &quit])?;

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
                match dispatch_window_menu(tray.app_handle(), MenuAction::ShowPet) {
                    Ok(()) => mark_tray_ready(tray.app_handle()),
                    Err(error) => report_tray_failure(tray.app_handle(), error),
                }
            }
        });
    let _tray = tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AppState::default())
        .on_window_event(|window, event| {
            if window.label() == PET_WINDOW_LABEL
                && let WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
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
            window.set_always_on_top(true)?;
            window.set_visible_on_all_workspaces(true)?;
            configure_pet_collection_behavior(&window)?;
            build_tray(&handle)?;

            let state = app.state::<AppState>();
            let _ = reload_example_pet_pack_inner(&handle, state.inner());
            if let Some(report_path) = requested_report_path() {
                schedule_desktop_smoke(&handle, report_path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shell_snapshot,
            set_click_through,
            reset_window_position,
            hide_preview_window,
            current_pet_pack,
            reload_example_pet_pack,
            next_preview_action,
            trigger_preview_action,
            export_diagnostics
        ]);
    let mut app = builder
        .build(tauri::generate_context!())
        .expect("failed to build Oh My Pets");
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    app.run(|_, _| {});
}
