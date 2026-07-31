use std::{collections::HashSet, time::Duration};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DisplayId(String);

impl DisplayId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysicalPoint {
    pub x: i32,
    pub y: i32,
}

impl PhysicalPoint {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysicalSize {
    pub width: u32,
    pub height: u32,
}

impl PhysicalSize {
    pub const fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysicalRect {
    pub origin: PhysicalPoint,
    pub size: PhysicalSize,
}

impl PhysicalRect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            origin: PhysicalPoint::new(x, y),
            size: PhysicalSize::new(width, height),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Display {
    pub id: DisplayId,
    pub work_area: PhysicalRect,
    pub scale_factor: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DisplaySnapshot {
    displays: Vec<Display>,
    cursor: PhysicalPoint,
}

impl DisplaySnapshot {
    pub fn new(displays: Vec<Display>, cursor: PhysicalPoint) -> Result<Self, String> {
        if displays.is_empty() {
            return Err("显示器快照不能为空".to_string());
        }
        if displays
            .iter()
            .any(|display| !display.scale_factor.is_finite() || display.scale_factor <= 0.0)
        {
            return Err("显示器缩放比例必须是有限正数".to_string());
        }
        if displays
            .iter()
            .map(|display| &display.id)
            .collect::<HashSet<_>>()
            .len()
            != displays.len()
        {
            return Err("显示器标识必须唯一".to_string());
        }
        Ok(Self { displays, cursor })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PetPlacement {
    pub display_id: DisplayId,
    pub position: PhysicalPoint,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LogicalVelocity {
    pub x_points_per_second: f64,
    pub y_points_per_second: f64,
}

impl LogicalVelocity {
    pub const fn new(x_points_per_second: f64, y_points_per_second: f64) -> Self {
        Self {
            x_points_per_second,
            y_points_per_second,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MotionStep {
    pub placement: PetPlacement,
    pub velocity: LogicalVelocity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SafeBounds {
    min_x: i64,
    min_y: i64,
    max_x: i64,
    max_y: i64,
}

pub fn advance_placement(
    snapshot: &DisplaySnapshot,
    placement: PetPlacement,
    velocity: LogicalVelocity,
    elapsed: Duration,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<MotionStep> {
    let display = snapshot
        .displays
        .iter()
        .find(|display| display.id == placement.display_id)?;
    if !display.scale_factor.is_finite()
        || display.scale_factor <= 0.0
        || !velocity.x_points_per_second.is_finite()
        || !velocity.y_points_per_second.is_finite()
    {
        return None;
    }

    let elapsed_seconds = elapsed.as_secs_f64();
    let x = f64::from(placement.position.x)
        + velocity.x_points_per_second * elapsed_seconds * display.scale_factor;
    let y = f64::from(placement.position.y)
        + velocity.y_points_per_second * elapsed_seconds * display.scale_factor;
    let bounds = safe_bounds(display.work_area, window_size, margin)?;
    let (x, x_velocity) =
        clamp_motion_axis(x, bounds.min_x, bounds.max_x, velocity.x_points_per_second);
    let (y, y_velocity) =
        clamp_motion_axis(y, bounds.min_y, bounds.max_y, velocity.y_points_per_second);

    Some(MotionStep {
        placement: PetPlacement {
            display_id: placement.display_id,
            position: PhysicalPoint::new(x, y),
        },
        velocity: LogicalVelocity::new(x_velocity, y_velocity),
    })
}

pub fn resolve_startup_placement(
    snapshot: &DisplaySnapshot,
    saved_position: Option<PhysicalPoint>,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PetPlacement> {
    if let Some((display, saved_position)) = saved_position.and_then(|position| {
        snapshot
            .displays
            .iter()
            .find(|display| position_fits(display.work_area, position, window_size, margin))
            .map(|display| (display, position))
    }) {
        return Some(PetPlacement {
            display_id: display.id.clone(),
            position: saved_position,
        });
    }

    recall_placement(snapshot, window_size, margin)
}

pub fn recall_placement(
    snapshot: &DisplaySnapshot,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PetPlacement> {
    let display = snapshot
        .displays
        .iter()
        .find(|display| contains_point(display.work_area, snapshot.cursor))
        .or_else(|| snapshot.displays.iter().find(|display| display.primary))
        .or_else(|| snapshot.displays.first())?;
    let position = safe_corner(display.work_area, window_size, margin)?;
    Some(PetPlacement {
        display_id: display.id.clone(),
        position,
    })
}

pub fn reconcile_placement(
    snapshot: &DisplaySnapshot,
    placement: PetPlacement,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PetPlacement> {
    let display = snapshot
        .displays
        .iter()
        .find(|display| display.id == placement.display_id)
        .or_else(|| {
            let center = PhysicalPoint::new(
                saturating_add_half(placement.position.x, window_size.width),
                saturating_add_half(placement.position.y, window_size.height),
            );
            snapshot
                .displays
                .iter()
                .min_by_key(|display| squared_distance_to_rect(center, display.work_area))
        })?;
    let position = clamp_position(display.work_area, placement.position, window_size, margin)?;

    Some(PetPlacement {
        display_id: display.id.clone(),
        position,
    })
}

pub fn adopt_external_position(
    snapshot: &DisplaySnapshot,
    previous: PetPlacement,
    new_position: PhysicalPoint,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PetPlacement> {
    let center = PhysicalPoint::new(
        saturating_add_half(new_position.x, window_size.width),
        saturating_add_half(new_position.y, window_size.height),
    );
    let display = snapshot
        .displays
        .iter()
        .find(|display| {
            display.id == previous.display_id && contains_point(display.work_area, center)
        })
        .or_else(|| {
            snapshot
                .displays
                .iter()
                .find(|display| contains_point(display.work_area, center))
        })?;
    let position = clamp_position(display.work_area, new_position, window_size, margin)?;

    Some(PetPlacement {
        display_id: display.id.clone(),
        position,
    })
}

fn saturating_add_half(value: i32, size: u32) -> i32 {
    clamp_to_i32(i64::from(value) + i64::from(size / 2))
}

fn squared_distance_to_rect(point: PhysicalPoint, rect: PhysicalRect) -> u128 {
    let left = i64::from(rect.origin.x);
    let top = i64::from(rect.origin.y);
    let right = left + i64::from(rect.size.width);
    let bottom = top + i64::from(rect.size.height);
    let x = i64::from(point.x);
    let y = i64::from(point.y);
    let dx = if x < left {
        left - x
    } else if x > right {
        x - right
    } else {
        0
    };
    let dy = if y < top {
        top - y
    } else if y > bottom {
        y - bottom
    } else {
        0
    };

    (i128::from(dx) * i128::from(dx) + i128::from(dy) * i128::from(dy)) as u128
}

fn clamp_position(
    work_area: PhysicalRect,
    position: PhysicalPoint,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PhysicalPoint> {
    let bounds = safe_bounds(work_area, window_size, margin)?;

    Some(PhysicalPoint::new(
        clamp_to_i32(i64::from(position.x).clamp(bounds.min_x, bounds.max_x)),
        clamp_to_i32(i64::from(position.y).clamp(bounds.min_y, bounds.max_y)),
    ))
}

fn contains_point(rect: PhysicalRect, point: PhysicalPoint) -> bool {
    let left = i64::from(rect.origin.x);
    let top = i64::from(rect.origin.y);
    let right = left + i64::from(rect.size.width);
    let bottom = top + i64::from(rect.size.height);
    let x = i64::from(point.x);
    let y = i64::from(point.y);

    (left..right).contains(&x) && (top..bottom).contains(&y)
}

fn safe_corner(
    work_area: PhysicalRect,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<PhysicalPoint> {
    let bounds = safe_bounds(work_area, window_size, margin)?;

    Some(PhysicalPoint::new(
        clamp_to_i32(bounds.max_x),
        clamp_to_i32(bounds.max_y),
    ))
}

fn clamp_to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

fn round_to_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

fn clamp_motion_axis(value: f64, minimum: i64, maximum: i64, velocity: f64) -> (i32, f64) {
    if value < minimum as f64 {
        return (clamp_to_i32(minimum), velocity.abs());
    }
    if value > maximum as f64 {
        return (clamp_to_i32(maximum), -velocity.abs());
    }
    (round_to_i32(value), velocity)
}

fn position_fits(
    work_area: PhysicalRect,
    position: PhysicalPoint,
    window_size: PhysicalSize,
    margin: i32,
) -> bool {
    let Some(bounds) = safe_bounds(work_area, window_size, margin) else {
        return false;
    };
    let x = i64::from(position.x);
    let y = i64::from(position.y);

    (bounds.min_x..=bounds.max_x).contains(&x) && (bounds.min_y..=bounds.max_y).contains(&y)
}

fn safe_bounds(
    work_area: PhysicalRect,
    window_size: PhysicalSize,
    margin: i32,
) -> Option<SafeBounds> {
    let margin = i64::from(margin.max(0));
    let min_x = i64::from(work_area.origin.x) + margin;
    let min_y = i64::from(work_area.origin.y) + margin;
    let max_x = i64::from(work_area.origin.x) + i64::from(work_area.size.width)
        - i64::from(window_size.width)
        - margin;
    let max_y = i64::from(work_area.origin.y) + i64::from(work_area.size.height)
        - i64::from(window_size.height)
        - margin;
    if min_x > max_x || min_y > max_y {
        return None;
    }

    Some(SafeBounds {
        min_x,
        min_y,
        max_x,
        max_y,
    })
}
