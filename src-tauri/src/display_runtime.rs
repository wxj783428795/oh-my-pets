use std::collections::HashMap;

use tauri::{Monitor, WebviewWindow};

use crate::display_motion::{
    Display, DisplayId, DisplaySnapshot, PhysicalPoint, PhysicalRect, PhysicalSize,
};

pub fn capture_display_snapshot(window: &WebviewWindow) -> Result<DisplaySnapshot, String> {
    let primary = window
        .primary_monitor()
        .map_err(|error| format!("读取主显示器失败：{error}"))?;
    let mut monitors = window
        .available_monitors()
        .map_err(|error| format!("读取显示器列表失败：{error}"))?;
    monitors.sort_by_key(|monitor| {
        (
            monitor.position().y,
            monitor.position().x,
            monitor.size().width,
            monitor.size().height,
        )
    });

    let mut occurrences = HashMap::<String, usize>::new();
    let displays = monitors
        .into_iter()
        .map(|monitor| {
            let base_id = monitor
                .name()
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            let occurrence = occurrences.entry(base_id.clone()).or_default();
            let id = runtime_display_id(Some(&base_id), *occurrence);
            *occurrence += 1;
            let work_area = monitor.work_area();
            Display {
                id: DisplayId::new(id),
                work_area: PhysicalRect::new(
                    work_area.position.x,
                    work_area.position.y,
                    work_area.size.width,
                    work_area.size.height,
                ),
                scale_factor: monitor.scale_factor(),
                primary: primary
                    .as_ref()
                    .is_some_and(|primary| monitors_are_equal(primary, &monitor)),
            }
        })
        .collect();
    let cursor = window
        .cursor_position()
        .map_err(|error| format!("读取鼠标位置失败：{error}"))?;

    DisplaySnapshot::new(
        displays,
        PhysicalPoint::new(round_to_i32(cursor.x), round_to_i32(cursor.y)),
    )
}

pub fn outer_window_size(window: &WebviewWindow) -> Result<PhysicalSize, String> {
    window
        .outer_size()
        .map(|size| PhysicalSize::new(size.width, size.height))
        .map_err(|error| format!("读取宠物窗口尺寸失败：{error}"))
}

fn runtime_display_id(name: Option<&str>, occurrence: usize) -> String {
    let base_id = name.unwrap_or("unknown");
    if occurrence == 0 {
        base_id.to_string()
    } else {
        format!("{base_id}#{}", occurrence + 1)
    }
}

fn monitors_are_equal(left: &Monitor, right: &Monitor) -> bool {
    let left_work_area = left.work_area();
    let right_work_area = right.work_area();
    left.name() == right.name()
        && left.position() == right.position()
        && left.size() == right.size()
        && left_work_area.position == right_work_area.position
        && left_work_area.size == right_work_area.size
        && left.scale_factor().to_bits() == right.scale_factor().to_bits()
}

fn round_to_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod tests {
    use super::runtime_display_id;

    #[test]
    fn runtime_display_identity_does_not_depend_on_resolution_or_scale() {
        assert_eq!(
            runtime_display_id(Some("Studio Display"), 0),
            "Studio Display"
        );
        assert_eq!(
            runtime_display_id(Some("Studio Display"), 1),
            "Studio Display#2"
        );
    }
}
