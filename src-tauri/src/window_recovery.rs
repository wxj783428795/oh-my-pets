#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

pub fn recover_position(
    current: Option<WorkArea>,
    primary: Option<WorkArea>,
    window: WindowSize,
    margin: i32,
) -> Option<WindowPosition> {
    let area = current.or(primary)?;
    let x = i64::from(area.x) + i64::from(area.width) - i64::from(window.width) - i64::from(margin);
    let y =
        i64::from(area.y) + i64::from(area.height) - i64::from(window.height) - i64::from(margin);

    Some(WindowPosition {
        x: clamp_to_i32(x),
        y: clamp_to_i32(y),
    })
}

fn clamp_to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}
