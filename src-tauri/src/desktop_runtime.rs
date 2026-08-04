use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::mpsc::{Receiver, sync_channel},
    thread,
    time::Duration,
};

use crate::{
    desktop_smoke::DesktopSmokeReport,
    direct_interaction::{
        DragUpdate, InteractionAction, InteractionOutcome, InteractionPolicy, PointerInput,
        SurfacePoint, SurfaceSize, ThrowMotion, ThrowPhase,
    },
    direct_interaction_runtime::{self, PointerRequest},
    display_motion::{LogicalVelocity, recall_placement},
    display_runtime::{capture_display_snapshot, outer_window_size},
    native_pet_position::PET_SAFE_MARGIN,
    window_shell::PREFERENCES_WINDOW_LABEL,
};

fn controlled_pointer(
    local_x: f64,
    local_y: f64,
    screen: SurfacePoint,
    origin: SurfacePoint,
    elapsed_ms: u64,
) -> PointerInput {
    PointerInput {
        surface_point: SurfacePoint::new(local_x, local_y),
        surface_size: SurfaceSize::new(320.0, 320.0),
        screen_point: screen,
        window_origin: origin,
        occurred_at: Duration::from_millis(elapsed_ms),
    }
}

fn complete_smoke_action(
    app: &AppHandle,
    state: &AppState,
    payload: &direct_interaction_runtime::InteractionPayload,
) -> Result<(), CommandError> {
    if let Some(revision) = payload.revision
        && payload.complete_on_finish == Some(true)
    {
        direct_interaction_runtime::complete_action(app, state, revision)?;
    }
    Ok(())
}

fn observe_visible_interaction(app: &AppHandle) -> Receiver<String> {
    let (sender, receiver) = sync_channel(1);
    app.once("pet-interaction-visible", move |event| {
        let _ = sender.send(event.payload().to_string());
    });
    receiver
}

fn expect_visible_interaction(
    receiver: &Receiver<String>,
    revision: Option<u64>,
    action: &str,
    timeout: Duration,
) -> Result<(), CommandError> {
    let payload = receiver
        .recv_timeout(timeout)
        .map_err(|_| CommandError::shell(format!("{action} 未在 100ms 内产生 Pixi 首帧确认")))?;
    let payload: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|error| CommandError::shell(format!("可见互动确认格式无效：{error}")))?;
    let actual_revision = payload.get("revision").and_then(serde_json::Value::as_u64);
    if actual_revision.is_none()
        || revision.is_some_and(|expected| actual_revision != Some(expected))
        || payload.get("action").and_then(serde_json::Value::as_str) != Some(action)
    {
        return Err(CommandError::shell(format!(
            "可见互动确认不匹配：expected={action}@{revision:?}, actual={payload}"
        )));
    }
    Ok(())
}

fn verify_direct_interaction_and_private_file_feed(
    app: &AppHandle,
    state: &AppState,
) -> Result<String, CommandError> {
    let window = pet_window(app)?;
    let pack = current_pet_pack_inner(state)?;
    let canvas = pack.manifest.canvas;
    let layout = pack.manifest.layout;
    let position = window
        .outer_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let origin = SurfacePoint::new(f64::from(position.x), f64::from(position.y));
    let start_screen = SurfacePoint::new(origin.x + 160.0, origin.y + 160.0);
    let policy = InteractionPolicy::interactive();
    let visible_tap = observe_visible_interaction(app);
    let tap_started_at = std::time::Instant::now();

    let tap_capture = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .begin_pointer(
            controlled_pointer(160.0, 160.0, start_screen, origin, 0),
            canvas,
            &layout,
            policy,
        )
        .capture_id()
        .ok_or_else(|| CommandError::shell("受控热区点击未被捕获"))?;
    let tap = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .end_pointer(
            tap_capture,
            controlled_pointer(160.0, 160.0, start_screen, origin, 20),
            policy,
            window
                .scale_factor()
                .map_err(|error| CommandError::shell(error.to_string()))?,
        );
    let tap_payload = direct_interaction_runtime::publish_outcome(app, state, tap)?;
    if tap_payload.action != Some("tap_react") {
        return Err(CommandError::shell("受控热区点击未触发 tap_react"));
    }
    app.emit("pet-interaction", tap_payload.clone())
        .map_err(|error| CommandError::shell(error.to_string()))?;
    expect_visible_interaction(
        &visible_tap,
        tap_payload.revision,
        "tap_react",
        Duration::from_millis(100),
    )?;
    let tap_response_ms = tap_started_at.elapsed().as_millis();
    if tap_response_ms > 100 {
        return Err(CommandError::shell(format!(
            "受控热区点击响应耗时 {tap_response_ms}ms，超过 100ms 契约"
        )));
    }
    complete_smoke_action(app, state, &tap_payload)?;

    let drag_capture = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .begin_pointer(
            controlled_pointer(160.0, 160.0, start_screen, origin, 100),
            canvas,
            &layout,
            policy,
        )
        .capture_id()
        .ok_or_else(|| CommandError::shell("受控拖拽未捕获宠物热区"))?;
    let dragged_screen = SurfacePoint::new(start_screen.x - 48.0, start_screen.y - 24.0);
    let update = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .update_pointer(
            drag_capture,
            controlled_pointer(112.0, 136.0, dragged_screen, origin, 140),
            policy,
        );
    let DragUpdate::Move {
        revision: drag_revision,
        action_started: true,
        window_origin,
    } = update
    else {
        return Err(CommandError::shell("受控拖拽未进入 drag_hold"));
    };
    direct_interaction_runtime::publish_action(
        app,
        state,
        drag_revision,
        InteractionAction::DragHold,
        LogicalVelocity::new(0.0, 0.0),
    )?;
    state
        .pet_position
        .drag_to(
            &window,
            &state.product,
            PhysicalPoint::new(
                window_origin.x.round() as i32,
                window_origin.y.round() as i32,
            ),
        )
        .map_err(CommandError::shell)?;
    thread::sleep(Duration::from_millis(80));
    let moved = window
        .outer_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    if moved == position {
        return Err(CommandError::shell("受控拖拽没有移动真实原生窗口"));
    }

    let released_screen = SurfacePoint::new(start_screen.x - 148.0, start_screen.y - 80.0);
    let released = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .end_pointer(
            drag_capture,
            controlled_pointer(12.0, 80.0, released_screen, origin, 180),
            policy,
            window
                .scale_factor()
                .map_err(|error| CommandError::shell(error.to_string()))?,
        );
    let InteractionOutcome::Throw {
        revision: throw_revision,
        velocity_x,
        velocity_y,
    } = released
    else {
        return Err(CommandError::shell("受控释放未进入 fall"));
    };
    let fall_payload = direct_interaction_runtime::publish_outcome(app, state, released)?;
    if fall_payload.action != Some("fall") {
        return Err(CommandError::shell("受控释放未发布 fall"));
    }
    let mut motion = ThrowMotion::new(LogicalVelocity::new(velocity_x, velocity_y))
        .ok_or_else(|| CommandError::shell("受控释放速度无效"))?;
    let elapsed = Duration::from_millis(50);
    let mut phase = ThrowPhase::Falling;
    for _ in 0..120 {
        let requested = motion.velocity_for_step(elapsed);
        let (_, step) = state
            .pet_position
            .advance(&window, &state.product, requested, elapsed, false)
            .map_err(CommandError::shell)?;
        phase = motion.observe_step(requested, step.velocity);
        if phase == ThrowPhase::Landed {
            break;
        }
    }
    if phase != ThrowPhase::Landed {
        return Err(CommandError::shell("受控抛掷未在时限内落地"));
    }
    state
        .pet_position
        .persist_current(&state.product)
        .map_err(CommandError::shell)?;
    let land = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .finish_throw(throw_revision);
    let land_payload = direct_interaction_runtime::publish_outcome(app, state, land)?;
    if land_payload.action != Some("land") {
        return Err(CommandError::shell("受控抛掷未发布 land"));
    }
    complete_smoke_action(app, state, &land_payload)?;

    let marker = "OMP_PRIVATE_DESKTOP_FEED_7F31";
    let temporary =
        std::env::temp_dir().join(format!("oh-my-pets-direct-smoke-{}", std::process::id()));
    let private_file = temporary.join(format!("{marker}.txt"));
    let private_contents = format!("private contents {marker}").into_bytes();
    fs::create_dir_all(&temporary)
        .map_err(|_| CommandError::shell("无法创建文件投喂 smoke 临时目录"))?;
    fs::write(&private_file, &private_contents)
        .map_err(|_| CommandError::shell("无法创建文件投喂 smoke 临时文件"))?;
    let file_result = (|| {
        let request = PointerRequest {
            local_x: 160.0,
            local_y: 160.0,
            surface_width: 320.0,
            surface_height: 320.0,
            occurred_at_ms: 240.0,
        };
        let feed = direct_interaction_runtime::handle_file_drop(
            app,
            state,
            vec![private_file.clone()],
            request,
        )?;
        if feed.action != Some("feed_react") {
            return Err(CommandError::shell("单个普通文件未触发 feed_react"));
        }
        complete_smoke_action(app, state, &feed)?;
        let curious = direct_interaction_runtime::handle_file_drop(
            app,
            state,
            vec![temporary.clone()],
            request,
        )?;
        if curious.action != Some("curious") {
            return Err(CommandError::shell("目录投喂未触发 curious"));
        }
        complete_smoke_action(app, state, &curious)?;

        state
            .product
            .set_quiet_mode(true)
            .map_err(CommandError::shell)?;
        let quiet = direct_interaction_runtime::handle_file_drop(
            app,
            state,
            vec![private_file.clone()],
            request,
        );
        state
            .product
            .set_quiet_mode(false)
            .map_err(CommandError::shell)?;
        if quiet?.kind != "ignored" {
            return Err(CommandError::shell("安静模式未阻止文件投喂反馈"));
        }

        let after =
            fs::read(&private_file).map_err(|_| CommandError::shell("无法复核投喂文件完整性"))?;
        if after != private_contents {
            return Err(CommandError::shell("投喂文件内容发生变化"));
        }
        let serialized = serde_json::to_string(&(
            feed,
            curious,
            state.product.snapshot().map_err(CommandError::shell)?,
        ))
        .map_err(|error| CommandError::shell(error.to_string()))?;
        if serialized.contains(marker) {
            return Err(CommandError::shell("文件路径进入产品状态或动作载荷"));
        }
        let diagnostics_path = export_diagnostics_inner(app, state)?;
        let diagnostics = fs::read_to_string(&diagnostics_path)
            .map_err(|_| CommandError::shell("无法读取文件投喂后的诊断导出"))?;
        let diagnostics_cleanup = fs::remove_file(&diagnostics_path);
        if diagnostics.contains(marker) {
            return Err(CommandError::shell("文件路径或内容进入诊断导出"));
        }
        if diagnostics_cleanup.is_err() {
            return Err(CommandError::shell("文件投喂诊断 smoke 临时导出清理失败"));
        }
        Ok(())
    })();
    let cleanup_file = fs::remove_file(&private_file);
    let cleanup_dir = fs::remove_dir(&temporary);
    file_result?;
    if cleanup_file.is_err() || cleanup_dir.is_err() {
        return Err(CommandError::shell("文件投喂 smoke 临时资产清理失败"));
    }

    if window
        .is_focused()
        .map_err(|error| CommandError::shell(error.to_string()))?
    {
        return Err(CommandError::shell("直接互动后宠物窗口意外获得焦点"));
    }
    handle_tray_menu(app, MENU_RECALL_PET)?;
    let snapshot = state.product.snapshot().map_err(CommandError::shell)?;
    if snapshot.session.current_action != "idle"
        || snapshot.session.velocity != (Velocity { x: 0.0, y: 0.0 })
    {
        return Err(CommandError::shell("直接互动 smoke 结束后未恢复 idle"));
    }

    Ok(format!(
        "真实窗口完成热区点击（响应 {tap_response_ms}ms）、拖拽、抛掷落地与召回；普通文件/目录投喂、安静限制和产品状态/动作载荷/诊断路径零留存均通过，且全程未聚焦"
    ))
}

fn wait_for_window(app: &AppHandle, label: &str, timeout: Duration) -> Option<WebviewWindow> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if let Some(window) = app.get_webview_window(label) {
            return Some(window);
        }
        if std::time::Instant::now() >= deadline {
            return None;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn wait_for_window_to_close(app: &AppHandle, label: &str, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if app.get_webview_window(label).is_none() {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn wait_for_window_surface(window: &WebviewWindow, surface: &str, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let matches = window.url().is_ok_and(|url| {
            url.query_pairs()
                .any(|(name, value)| name == "surface" && value == surface)
        });
        if matches {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn record_product_state_startup(
    report: &mut DesktopSmokeReport,
    app: &AppHandle,
    state: &AppState,
) {
    match state.product.snapshot() {
        Ok(snapshot)
            if !snapshot.session.quiet_mode
                && !snapshot.session.pet_hidden
                && !snapshot.session.click_through
                && snapshot.session.current_action == "idle"
                && snapshot.session.velocity.x == 0.0
                && snapshot.session.velocity.y == 0.0
                && snapshot.session.behavior_timer_ms.is_none() =>
        {
            report.pass(
                "product_state_startup_reset",
                "真实进程只恢复持久偏好，会话状态以可见、可交互、非安静和 idle 启动",
            );
        }
        Ok(snapshot) => report.fail(
            "product_state_startup_reset",
            format!("启动会话状态未重置：{:?}", snapshot.session),
        ),
        Err(error) => report.fail("product_state_startup_reset", error),
    }

    let login_item = SystemLoginItem::new(app);
    match (login_item.is_enabled(), state.product.snapshot()) {
        (Ok(observed), Ok(snapshot)) if observed == snapshot.preferences.launch_at_login => {
            report.pass(
                "login_item_truth",
                format!("系统登录项真实状态与产品状态一致：{observed}"),
            );
        }
        (observed, snapshot) => report.fail(
            "login_item_truth",
            format!("系统登录项={observed:?}，产品状态={snapshot:?}"),
        ),
    }
}

fn verify_native_window_motion_and_recall(
    app: &AppHandle,
    state: &AppState,
) -> Result<String, CommandError> {
    let window = pet_window(app)?;
    let displays = capture_display_snapshot(&window).map_err(CommandError::shell)?;
    let window_size = outer_window_size(&window).map_err(CommandError::shell)?;
    let expected_recall = recall_placement(&displays, window_size, PET_SAFE_MARGIN)
        .ok_or_else(|| CommandError::shell("无法计算鼠标所在显示器的召回位置"))?;

    handle_tray_menu(app, MENU_RECALL_PET)?;
    thread::sleep(Duration::from_millis(100));
    let recalled = window
        .outer_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    if recalled.x != expected_recall.position.x || recalled.y != expected_recall.position.y {
        return Err(CommandError::shell(format!(
            "召回位置不在鼠标显示器安全角：实际=({}, {})，期望=({}, {})",
            recalled.x, recalled.y, expected_recall.position.x, expected_recall.position.y
        )));
    }

    let (before, step) = state
        .pet_position
        .advance(
            &window,
            &state.product,
            LogicalVelocity::new(-80.0, 0.0),
            Duration::from_millis(500),
            true,
        )
        .map_err(CommandError::shell)?;
    let expected_after = step.placement.position;
    thread::sleep(Duration::from_millis(100));
    let moved = window
        .outer_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let actual_after = PhysicalPoint::new(moved.x, moved.y);
    if actual_after != expected_after || actual_after == before {
        return Err(CommandError::shell(format!(
            "原生窗口坐标未按 Rust 运动模型变化：起点={before:?}，模型={expected_after:?}，实际={actual_after:?}"
        )));
    }
    if window
        .is_focused()
        .map_err(|error| CommandError::shell(error.to_string()))?
    {
        return Err(CommandError::shell("普通位置更新后宠物窗口意外获得焦点"));
    }
    let pet_instances = app
        .webview_windows()
        .keys()
        .filter(|label| label.as_str() == PET_WINDOW_LABEL)
        .count();
    if pet_instances != 1 {
        return Err(CommandError::shell(format!(
            "位置更新后宠物窗口实例数异常：{pet_instances}"
        )));
    }

    handle_tray_menu(app, MENU_RECALL_PET)?;
    Ok(format!(
        "原生窗口从 ({}, {}) 移动到 ({}, {})，随后召回鼠标显示器安全角；未聚焦且仅有一个 pet 实例",
        before.x, before.y, actual_after.x, actual_after.y
    ))
}

fn run_desktop_smoke(app: &AppHandle) -> DesktopSmokeReport {
    let mut report = DesktopSmokeReport::new(app.package_info().version.to_string());

    let pet = pet_window(app);
    let preferences_absent = app.get_webview_window(PREFERENCES_WINDOW_LABEL).is_none();
    let legacy_main_absent = app.get_webview_window("main").is_none();
    match &pet {
        Ok(window)
            if window.is_visible().is_ok_and(|visible| visible)
                && preferences_absent
                && legacy_main_absent =>
        {
            report.pass(
                "product_window_topology",
                "启动时只有 pet 可见，preferences 未创建，旧 main 角色不存在",
            );
        }
        Ok(window) => report.fail(
            "product_window_topology",
            format!(
                "pet 可见={:?}，preferences 缺席={preferences_absent}，旧 main 缺席={legacy_main_absent}",
                window.is_visible()
            ),
        ),
        Err(error) => report.fail("product_window_topology", error.message.clone()),
    }

    match pet {
        Ok(window) => {
            let focused = window.is_focused();
            let decorated = window.is_decorated();
            let resizable = window.is_resizable();
            let always_on_top = window.is_always_on_top();
            let state = app.state::<AppState>();
            let panel_contract = state
                .pet_panel_contract
                .lock()
                .map(|contract| *contract)
                .map_err(|_| "宠物原生面板契约状态锁已损坏");
            if matches!(focused, Ok(false))
                && matches!(decorated, Ok(false))
                && matches!(resizable, Ok(false))
                && matches!(always_on_top, Ok(true))
                && panel_contract
                    .as_ref()
                    .is_ok_and(|contract| contract.is_satisfied())
            {
                report.pass(
                    "pet_window_contract",
                    "真实宠物 NSPanel 非激活、不可成为 key/main、未聚焦、无边框、不可缩放且始终置顶",
                );
            } else {
                report.fail(
                    "pet_window_contract",
                    format!(
                        "面板={panel_contract:?}，聚焦={focused:?}，边框={decorated:?}，可缩放={resizable:?}，置顶={always_on_top:?}"
                    ),
                );
            }
        }
        Err(error) => report.fail("pet_window_contract", error.message),
    }

    let state = app.state::<AppState>();
    match verify_native_window_motion_and_recall(app, state.inner()) {
        Ok(detail) => report.pass("native_window_motion_and_display_recall", detail),
        Err(error) => report.fail("native_window_motion_and_display_recall", error.message),
    }
    record_product_state_startup(&mut report, app, state.inner());

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
        Some(status) if status.loaded && status.surface.as_deref() == Some("pet") => {
            report.pass("frontend_pet_mounted", status.detail);
        }
        Some(status) => report.fail(
            "frontend_pet_mounted",
            format!("surface={:?}，{}", status.surface, status.detail),
        ),
        None => report.fail(
            "frontend_pet_mounted",
            "前端在 5 秒内未报告 PixiJS 宠物挂载结果",
        ),
    }

    match verify_direct_interaction_and_private_file_feed(app, state.inner()) {
        Ok(detail) => report.pass("direct_interaction_and_private_file_feed", detail),
        Err(error) => report.fail("direct_interaction_and_private_file_feed", error.message),
    }

    let hidden = handle_tray_menu(app, MENU_HIDE_PET)
        .and_then(|_| {
            thread::sleep(Duration::from_millis(100));
            pet_window(app)
        })
        .and_then(|window| {
            window
                .is_visible()
                .map(|visible| !visible)
                .map_err(|error| CommandError::shell(error.to_string()))
        });
    let hidden_state = state
        .product
        .snapshot()
        .is_ok_and(|snapshot| snapshot.session.pet_hidden);
    let restored = handle_tray_menu(app, MENU_SHOW_PET)
        .and_then(|_| {
            thread::sleep(Duration::from_millis(100));
            pet_window(app)
        })
        .and_then(|window| {
            window
                .is_visible()
                .map_err(|error| CommandError::shell(error.to_string()))
        });
    let restored_state = state
        .product
        .snapshot()
        .is_ok_and(|snapshot| !snapshot.session.pet_hidden);
    match (hidden, restored) {
        (Ok(true), Ok(true)) => report.pass(
            "pet_hide_and_menu_restore",
            "托盘菜单处理器已隐藏并恢复真实宠物窗口",
        ),
        (hidden, restored) => report.fail(
            "pet_hide_and_menu_restore",
            format!("隐藏结果={hidden:?}，恢复结果={restored:?}"),
        ),
    }

    let quiet_enabled = handle_tray_menu(app, MENU_ENABLE_QUIET).is_ok()
        && state
            .product
            .snapshot()
            .is_ok_and(|snapshot| snapshot.session.quiet_mode);
    let quiet_disabled = handle_tray_menu(app, MENU_DISABLE_QUIET).is_ok()
        && state
            .product
            .snapshot()
            .is_ok_and(|snapshot| !snapshot.session.quiet_mode);
    if hidden_state && restored_state && quiet_enabled && quiet_disabled {
        report.pass(
            "product_state_and_menu_sync",
            "菜单操作与 Rust 产品状态双向一致，测试结束已恢复可见和非安静状态",
        );
    } else {
        report.fail(
            "product_state_and_menu_sync",
            format!(
                "隐藏={hidden_state}，恢复={restored_state}，安静开启={quiet_enabled}，安静退出={quiet_disabled}"
            ),
        );
    }

    let first_open = handle_tray_menu(app, MENU_OPEN_PREFERENCES)
        .and_then(|_| {
            wait_for_window(app, PREFERENCES_WINDOW_LABEL, Duration::from_secs(2))
                .ok_or_else(|| CommandError::shell("偏好设置窗口未创建"))
        })
        .and_then(|window| {
            window
                .is_visible()
                .map(|visible| (window, visible))
                .map_err(|error| CommandError::shell(error.to_string()))
        });
    let repeated_open = handle_tray_menu(app, MENU_OPEN_PREFERENCES);
    let developer_route = first_open.as_ref().is_ok_and(|(window, _)| {
        window
            .eval("window.location.replace('?surface=developer')")
            .is_ok()
            && wait_for_window_surface(window, "developer", Duration::from_secs(2))
    });
    let preferences_route_restored = developer_route
        && handle_tray_menu(app, MENU_OPEN_PREFERENCES).is_ok()
        && first_open.as_ref().is_ok_and(|(window, _)| {
            wait_for_window_surface(window, "preferences", Duration::from_secs(2))
        });
    let first_close = first_open.as_ref().map_or_else(
        |_| false,
        |(window, _)| {
            window.close().is_ok()
                && wait_for_window_to_close(app, PREFERENCES_WINDOW_LABEL, Duration::from_secs(2))
        },
    );
    let reopened = if first_close {
        handle_tray_menu(app, MENU_OPEN_PREFERENCES)
            .and_then(|_| {
                wait_for_window(app, PREFERENCES_WINDOW_LABEL, Duration::from_secs(2))
                    .ok_or_else(|| CommandError::shell("关闭后的偏好设置窗口未重建"))
            })
            .and_then(|window| {
                window
                    .is_visible()
                    .map(|visible| (window, visible))
                    .map_err(|error| CommandError::shell(error.to_string()))
            })
    } else {
        Err(CommandError::shell("首次偏好设置窗口未正常关闭"))
    };
    let reopened_visible = reopened.as_ref().is_ok_and(|(_, visible)| *visible);
    let cleanup = reopened
        .as_ref()
        .map(|(window, _)| window.close().is_ok())
        .unwrap_or(false)
        && wait_for_window_to_close(app, PREFERENCES_WINDOW_LABEL, Duration::from_secs(2));
    let pet_survived = pet_window(app)
        .and_then(|window| {
            window
                .is_visible()
                .map_err(|error| CommandError::shell(error.to_string()))
        })
        .is_ok_and(|visible| visible);
    if first_open.as_ref().is_ok_and(|(_, visible)| *visible)
        && repeated_open.is_ok()
        && developer_route
        && preferences_route_restored
        && first_close
        && reopened_visible
        && cleanup
        && pet_survived
    {
        report.pass(
            "preferences_recovery",
            "偏好设置按需创建、重复显示、可从开发预览恢复、关闭后重建，宠物窗口持续可见",
        );
    } else {
        report.fail(
            "preferences_recovery",
            format!(
                "首次={first_open:?}，重复={repeated_open:?}，开发路由={developer_route}，设置路由恢复={preferences_route_restored}，关闭={first_close}，重建可见={reopened_visible}，清理={cleanup}，宠物存活={pet_survived}"
            ),
        );
    }

    let visible_idle = observe_visible_interaction(app);
    let enabled = set_click_through_inner(app, state.inner(), true);
    let visible_idle_result =
        expect_visible_interaction(&visible_idle, None, "idle", Duration::from_millis(100));
    let disabled = set_click_through_inner(app, state.inner(), false);
    match (enabled, disabled) {
        (Ok(enabled), Ok(disabled))
            if enabled.click_through && !disabled.click_through && visible_idle_result.is_ok() =>
        {
            report.pass(
                "click_through_toggle",
                "真实窗口已开启并关闭点击穿透，取消动作到达 Pixi 首帧后恢复可交互状态",
            );
        }
        (enabled, disabled) => report.fail(
            "click_through_toggle",
            format!(
                "开启结果={enabled:?}，关闭结果={disabled:?}，可见取消={visible_idle_result:?}"
            ),
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

pub(super) fn schedule_desktop_smoke(app: &AppHandle, report_path: PathBuf) {
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
