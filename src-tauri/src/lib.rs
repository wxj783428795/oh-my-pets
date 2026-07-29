mod behavior;
mod desktop_smoke;
pub mod diagnostics;
pub mod pet_pack_store;
pub mod window_recovery;

use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use behavior::{BehaviorStep, PreviewBehavior};
use desktop_smoke::{DesktopSmokeReport, requested_report_path};
use diagnostics::{DiagnosticsPetPack, DiagnosticsSnapshot, write_diagnostics};
use oh_my_pets_domain::{
    AtlasManifest, LoadedPetPack, PetManifest, PetPackSummary, ValidationIssue, load_pet_pack,
};
use pet_pack_store::PetPackStore;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, State, WebviewWindow,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use window_recovery::{WindowSize, WorkArea, recover_position};

const WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main-tray";
const TRAY_TITLE: &str = "卷";
const TRAY_TOOLTIP: &str = "Oh My Pets macOS 预览版";
const MENU_SHOW: &str = "show";
const MENU_HIDE: &str = "hide";
const MENU_RESET_POSITION: &str = "reset-position";
const MENU_DISABLE_CLICK_THROUGH: &str = "disable-click-through";
const MENU_RELOAD_PACK: &str = "reload-pack";
const MENU_EXPORT_DIAGNOSTICS: &str = "export-diagnostics";
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
    loaded: bool,
    detail: String,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, CommandError> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| CommandError::shell("主窗口不存在"))
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

fn show_window_inner(app: &AppHandle) -> Result<(), CommandError> {
    let window = main_window(app)?;
    window
        .show()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    window
        .unminimize()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    window
        .set_focus()
        .map_err(|error| CommandError::shell(error.to_string()))
}

fn hide_window_inner(app: &AppHandle) -> Result<(), CommandError> {
    main_window(app)?
        .hide()
        .map_err(|error| CommandError::shell(error.to_string()))
}

fn set_click_through_inner(
    app: &AppHandle,
    state: &AppState,
    enabled: bool,
) -> Result<ShellSnapshot, CommandError> {
    let window = main_window(app)?;
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
    let window = main_window(app)?;
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
    show_window_inner(app)
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
fn hide_preview_window(app: AppHandle) -> Result<(), CommandError> {
    hide_window_inner(&app)
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

fn handle_tray_menu(app: &AppHandle, id: &str) -> Result<Option<u64>, CommandError> {
    let state = app.state::<AppState>();
    match id {
        MENU_SHOW => show_window_inner(app).map(|_| None),
        MENU_HIDE => hide_window_inner(app).map(|_| None),
        MENU_RESET_POSITION => reset_window_position_inner(app).map(|_| None),
        MENU_DISABLE_CLICK_THROUGH => {
            set_click_through_inner(app, state.inner(), false).map(|_| None)
        }
        MENU_RELOAD_PACK => match reload_example_pet_pack_inner(app, state.inner()) {
            Ok(payload) => {
                let revision = payload.revision;
                let _ = app.emit("pet-pack-reloaded", payload);
                Ok(Some(revision))
            }
            Err(error) => {
                let _ = app.emit("pet-pack-load-failed", error.clone());
                Err(error)
            }
        },
        MENU_EXPORT_DIAGNOSTICS => {
            let path = export_diagnostics_inner(app, state.inner())?;
            let _ = app.emit("diagnostics-exported", path.display().to_string());
            Ok(None)
        }
        MENU_QUIT => {
            app.exit(0);
            Ok(None)
        }
        _ => Ok(None),
    }
}

fn is_current_pack_revision(app: &AppHandle, revision: Option<u64>) -> bool {
    match revision {
        Some(revision) => app
            .state::<AppState>()
            .pet_pack
            .is_latest_revision(revision)
            .unwrap_or(true),
        None => true,
    }
}

fn mark_tray_ready(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some(TRAY_TITLE));
        let _ = tray.set_tooltip(Some(TRAY_TOOLTIP));
    }
}

fn report_tray_failure(app: &AppHandle, error: CommandError) {
    if !is_current_pack_revision(app, error.revision) {
        return;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some("卷!"));
        let _ = tray.set_tooltip(Some(format!("操作失败：{}", error.message)));
    }
    let _ = app.emit("shell-operation-failed", error);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, MENU_SHOW, "显示预览工作台", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, MENU_HIDE, "隐藏窗口", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, MENU_RESET_POSITION, "重置位置", true, None::<&str>)?;
    let disable_click_through = MenuItem::with_id(
        app,
        MENU_DISABLE_CLICK_THROUGH,
        "关闭点击穿透",
        true,
        None::<&str>,
    )?;
    let reload = MenuItem::with_id(
        app,
        MENU_RELOAD_PACK,
        "重新加载示例宠物包",
        true,
        None::<&str>,
    )?;
    let diagnostics = MenuItem::with_id(
        app,
        MENU_EXPORT_DIAGNOSTICS,
        "导出诊断摘要",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出 Oh My Pets", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &reset,
            &disable_click_through,
            &reload,
            &diagnostics,
            &quit,
        ],
    )?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(TRAY_TOOLTIP)
        .title(TRAY_TITLE)
        .on_menu_event(
            |app, event| match handle_tray_menu(app, event.id.as_ref()) {
                Ok(revision) if is_current_pack_revision(app, revision) => mark_tray_ready(app),
                Ok(_) => {}
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
                match show_window_inner(tray.app_handle()) {
                    Ok(()) => mark_tray_ready(tray.app_handle()),
                    Err(error) => report_tray_failure(tray.app_handle(), error),
                }
            }
        });
    let _tray = tray.build(app)?;
    Ok(())
}

fn run_desktop_smoke(app: &AppHandle) -> DesktopSmokeReport {
    let mut report = DesktopSmokeReport::new(app.package_info().version.to_string());

    match main_window(app) {
        Ok(window) => match window.is_visible() {
            Ok(true) => report.pass("app_startup", "真实 Tauri 主窗口已启动并可见"),
            Ok(false) => report.fail("app_startup", "真实 Tauri 主窗口已启动但不可见"),
            Err(error) => report.fail("app_startup", error.to_string()),
        },
        Err(error) => report.fail("app_startup", error.message),
    }

    let state = app.state::<AppState>();
    match current_pet_pack_inner(state.inner()) {
        Ok(payload) if payload.summary.action_count > 0 && payload.summary.frame_count > 0 => {
            report.pass(
                "example_pet_pack_loaded",
                format!(
                    "{}：{} 个动作，{} 个图集帧",
                    payload.summary.display_name,
                    payload.summary.action_count,
                    payload.summary.frame_count
                ),
            );
        }
        Ok(payload) => report.fail(
            "example_pet_pack_loaded",
            format!("{} 缺少动作或图集帧", payload.summary.display_name),
        ),
        Err(error) => report.fail("example_pet_pack_loaded", error.message),
    }

    let frontend_deadline = std::time::Instant::now() + Duration::from_secs(5);
    let frontend_status = loop {
        let current = state
            .frontend_smoke
            .lock()
            .ok()
            .and_then(|status| status.clone());
        if current.is_some() || std::time::Instant::now() >= frontend_deadline {
            break current;
        }
        thread::sleep(Duration::from_millis(50));
    };
    match frontend_status {
        Some(status) if status.loaded => {
            report.pass("frontend_pet_mounted", status.detail);
        }
        Some(status) => report.fail("frontend_pet_mounted", status.detail),
        None => report.fail(
            "frontend_pet_mounted",
            "前端在 5 秒内未报告 PixiJS 宠物挂载结果",
        ),
    }

    let hidden = handle_tray_menu(app, MENU_HIDE)
        .and_then(|_| {
            thread::sleep(Duration::from_millis(100));
            main_window(app)
        })
        .and_then(|window| {
            window
                .is_visible()
                .map(|visible| !visible)
                .map_err(|error| CommandError::shell(error.to_string()))
        });
    let restored = handle_tray_menu(app, MENU_SHOW)
        .and_then(|_| {
            thread::sleep(Duration::from_millis(100));
            main_window(app)
        })
        .and_then(|window| {
            window
                .is_visible()
                .map_err(|error| CommandError::shell(error.to_string()))
        });
    match (hidden, restored) {
        (Ok(true), Ok(true)) => report.pass(
            "window_hide_and_tray_restore",
            "托盘菜单处理器已隐藏并恢复真实主窗口",
        ),
        (hidden, restored) => report.fail(
            "window_hide_and_tray_restore",
            format!("隐藏结果={hidden:?}，恢复结果={restored:?}"),
        ),
    }

    let enabled = set_click_through_inner(app, state.inner(), true);
    let disabled = set_click_through_inner(app, state.inner(), false);
    match (enabled, disabled) {
        (Ok(enabled), Ok(disabled)) if enabled.click_through && !disabled.click_through => {
            report.pass(
                "click_through_toggle",
                "真实窗口已开启并关闭点击穿透，最终恢复可交互状态",
            );
        }
        (enabled, disabled) => report.fail(
            "click_through_toggle",
            format!("开启结果={enabled:?}，关闭结果={disabled:?}"),
        ),
    }

    match export_diagnostics_inner(app, state.inner()) {
        Ok(path) => match fs::read_to_string(&path) {
            Ok(contents)
                if contents.contains("# Oh My Pets 诊断摘要")
                    && contents.contains("- 宠物包：") =>
            {
                report.pass("diagnostics_export", path.display().to_string());
            }
            Ok(_) => report.fail(
                "diagnostics_export",
                format!("诊断文件内容不完整：{}", path.display()),
            ),
            Err(error) => report.fail("diagnostics_export", error.to_string()),
        },
        Err(error) => report.fail("diagnostics_export", error.message),
    }

    report
}

fn schedule_desktop_smoke(app: &AppHandle, report_path: PathBuf) {
    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        let exit_code = match run_desktop_smoke(&handle).write_to(&report_path) {
            Ok(true) => 0,
            Ok(false) => 1,
            Err(error) => {
                eprintln!("无法写入桌面 smoke 报告 {}：{error}", report_path.display());
                1
            }
        };
        handle.exit(exit_code);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
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
            let window = main_window(&handle).map_err(|error| error.message)?;
            window.set_always_on_top(true)?;
            window.set_visible_on_all_workspaces(true)?;
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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Oh My Pets");
}
