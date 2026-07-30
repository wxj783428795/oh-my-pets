use super::*;
use std::{fs, path::PathBuf, thread, time::Duration};

use crate::{desktop_smoke::DesktopSmokeReport, window_shell::PREFERENCES_WINDOW_LABEL};

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
            if matches!(focused, Ok(false))
                && matches!(decorated, Ok(false))
                && matches!(resizable, Ok(false))
                && matches!(always_on_top, Ok(true))
            {
                report.pass(
                    "pet_window_contract",
                    "真实宠物窗口未聚焦、无边框、不可缩放且始终置顶",
                );
            } else {
                report.fail(
                    "pet_window_contract",
                    format!(
                        "聚焦={focused:?}，边框={decorated:?}，可缩放={resizable:?}，置顶={always_on_top:?}"
                    ),
                );
            }
        }
        Err(error) => report.fail("pet_window_contract", error.message),
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
