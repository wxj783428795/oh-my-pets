use std::{path::PathBuf, time::Duration};

use oh_my_pets_domain::{Layout, Rect, Size};

use crate::display_motion::LogicalVelocity;

const MAX_RELEASE_SPEED: f64 = 1_800.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfacePoint {
    pub x: f64,
    pub y: f64,
}

impl SurfacePoint {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfaceSize {
    pub width: f64,
    pub height: f64,
}

impl SurfaceSize {
    pub const fn new(width: f64, height: f64) -> Self {
        Self { width, height }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PointerInput {
    pub surface_point: SurfacePoint,
    pub surface_size: SurfaceSize,
    pub screen_point: SurfacePoint,
    pub window_origin: SurfacePoint,
    pub occurred_at: Duration,
}

pub fn elapsed_from_milliseconds(elapsed_ms: f64) -> Duration {
    if !elapsed_ms.is_finite() || elapsed_ms <= 0.0 {
        return Duration::ZERO;
    }
    Duration::from_millis(elapsed_ms.min(u64::MAX as f64) as u64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InteractionPolicy {
    pub quiet_mode: bool,
    pub click_through: bool,
}

impl InteractionPolicy {
    pub const fn interactive() -> Self {
        Self {
            quiet_mode: false,
            click_through: false,
        }
    }

    pub const fn passthrough() -> Self {
        Self {
            quiet_mode: false,
            click_through: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InteractionAction {
    Idle,
    DragHold,
    Fall,
    Land,
    TapReact,
    FeedReact,
    Curious,
}

impl InteractionAction {
    pub const fn presentation(self) -> (&'static str, u32, bool) {
        match self {
            Self::Idle => ("idle", 60_000, false),
            Self::DragHold => ("drag_hold", 60_000, false),
            Self::Fall => ("fall", 60_000, false),
            Self::Land => ("land", 320, true),
            Self::TapReact => ("tap_react", 620, true),
            Self::FeedReact => ("feed_react", 1_100, true),
            Self::Curious => ("curious", 1_200, true),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileDropClassification {
    SingleRegularFile,
    Rejected,
}

pub fn classify_file_drop(paths: &[PathBuf]) -> FileDropClassification {
    if paths.len() == 1 && std::fs::metadata(&paths[0]).is_ok_and(|metadata| metadata.is_file()) {
        FileDropClassification::SingleRegularFile
    } else {
        FileDropClassification::Rejected
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InteractionOutcome {
    Ignored,
    Action {
        revision: u64,
        action: InteractionAction,
    },
    Throw {
        revision: u64,
        velocity_x: f64,
        velocity_y: f64,
    },
}

impl InteractionOutcome {
    pub const fn revision(self) -> Option<u64> {
        match self {
            Self::Ignored => None,
            Self::Action { revision, .. } | Self::Throw { revision, .. } => Some(revision),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DragUpdate {
    Ignored,
    Move {
        revision: u64,
        action_started: bool,
        window_origin: SurfacePoint,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThrowPhase {
    Falling,
    Landed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ThrowMotion {
    velocity: LogicalVelocity,
    elapsed: Duration,
    floor_bounces: u8,
    phase: ThrowPhase,
}

impl ThrowMotion {
    pub fn new(velocity: LogicalVelocity) -> Option<Self> {
        if !velocity.x_points_per_second.is_finite() || !velocity.y_points_per_second.is_finite() {
            return None;
        }
        Some(Self {
            velocity: LogicalVelocity::new(
                velocity
                    .x_points_per_second
                    .clamp(-MAX_RELEASE_SPEED, MAX_RELEASE_SPEED),
                velocity
                    .y_points_per_second
                    .clamp(-MAX_RELEASE_SPEED, MAX_RELEASE_SPEED),
            ),
            elapsed: Duration::ZERO,
            floor_bounces: 0,
            phase: ThrowPhase::Falling,
        })
    }

    pub fn velocity_for_step(&mut self, elapsed: Duration) -> LogicalVelocity {
        if self.phase == ThrowPhase::Landed {
            return self.velocity;
        }
        self.elapsed = self.elapsed.saturating_add(elapsed);
        let seconds = elapsed.as_secs_f64().min(0.1);
        let horizontal_drag = (1.0 - 1.8 * seconds).max(0.0);
        self.velocity.x_points_per_second *= horizontal_drag;
        self.velocity.y_points_per_second = (self.velocity.y_points_per_second + 2_200.0 * seconds)
            .clamp(-MAX_RELEASE_SPEED, MAX_RELEASE_SPEED);
        self.velocity
    }

    pub fn observe_step(
        &mut self,
        requested: LogicalVelocity,
        boundary_velocity: LogicalVelocity,
    ) -> ThrowPhase {
        if self.phase == ThrowPhase::Landed {
            return self.phase;
        }
        let hit_horizontal = direction_changed(
            requested.x_points_per_second,
            boundary_velocity.x_points_per_second,
        );
        let hit_vertical = direction_changed(
            requested.y_points_per_second,
            boundary_velocity.y_points_per_second,
        );
        self.velocity.x_points_per_second = if hit_horizontal {
            boundary_velocity.x_points_per_second * 0.55
        } else {
            boundary_velocity.x_points_per_second
        };
        self.velocity.y_points_per_second = if hit_vertical {
            if requested.y_points_per_second > 0.0 {
                self.floor_bounces = self.floor_bounces.saturating_add(1);
                boundary_velocity.y_points_per_second * 0.35
            } else {
                boundary_velocity.y_points_per_second * 0.35
            }
        } else {
            boundary_velocity.y_points_per_second
        };

        if (hit_vertical
            && requested.y_points_per_second > 0.0
            && (requested.y_points_per_second <= 520.0 || self.floor_bounces >= 4))
            || self.elapsed >= Duration::from_secs(5)
        {
            self.velocity = LogicalVelocity::new(0.0, 0.0);
            self.phase = ThrowPhase::Landed;
        }
        self.phase
    }

    pub const fn velocity(&self) -> LogicalVelocity {
        self.velocity
    }
}

fn direction_changed(requested: f64, actual: f64) -> bool {
    requested != 0.0 && actual != 0.0 && requested.is_sign_positive() != actual.is_sign_positive()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PointerCapture(Option<u64>);

impl PointerCapture {
    pub const fn capture_id(self) -> Option<u64> {
        self.0
    }
}

#[derive(Debug, Clone, Copy)]
struct ActivePointer {
    capture_id: u64,
    start_screen_point: SurfacePoint,
    grab_offset: SurfacePoint,
    samples: [Option<(SurfacePoint, Duration)>; 8],
    sample_count: usize,
    dragging: bool,
}

#[derive(Debug, Default)]
pub struct DirectInteraction {
    next_capture_id: u64,
    revision: u64,
    active_pointer: Option<ActivePointer>,
    throw_revision: Option<u64>,
}

impl DirectInteraction {
    pub fn cancel_pointer(&mut self, capture_id: u64) -> InteractionOutcome {
        let Some(active) = self.active_pointer.as_ref() else {
            return InteractionOutcome::Ignored;
        };
        if active.capture_id != capture_id {
            return InteractionOutcome::Ignored;
        }
        let was_dragging = active.dragging;
        self.active_pointer = None;
        if !was_dragging {
            return InteractionOutcome::Ignored;
        }
        self.revision = self.revision.wrapping_add(1).max(1);
        InteractionOutcome::Action {
            revision: self.revision,
            action: InteractionAction::Idle,
        }
    }

    pub fn is_throw_active(&self, revision: u64) -> bool {
        self.revision == revision && self.throw_revision == Some(revision)
    }

    pub fn cancel_all(&mut self) -> InteractionOutcome {
        self.active_pointer = None;
        self.throw_revision = None;
        self.revision = self.revision.wrapping_add(1).max(1);
        InteractionOutcome::Action {
            revision: self.revision,
            action: InteractionAction::Idle,
        }
    }

    pub fn complete_action(&mut self, revision: u64) -> InteractionOutcome {
        if revision != self.revision
            || self.throw_revision == Some(revision)
            || self
                .active_pointer
                .as_ref()
                .is_some_and(|pointer| pointer.dragging)
        {
            return InteractionOutcome::Ignored;
        }
        self.revision = self.revision.wrapping_add(1).max(1);
        InteractionOutcome::Action {
            revision: self.revision,
            action: InteractionAction::Idle,
        }
    }

    pub fn finish_throw(&mut self, revision: u64) -> InteractionOutcome {
        if self.revision != revision || self.throw_revision != Some(revision) {
            return InteractionOutcome::Ignored;
        }
        self.throw_revision = None;
        self.revision = self.revision.wrapping_add(1).max(1);
        InteractionOutcome::Action {
            revision: self.revision,
            action: InteractionAction::Land,
        }
    }

    pub fn handle_file_drop(
        &mut self,
        classification: FileDropClassification,
        input: PointerInput,
        canvas: Size,
        layout: &Layout,
        policy: InteractionPolicy,
    ) -> InteractionOutcome {
        if policy.click_through
            || policy.quiet_mode
            || !point_is_inside(input, canvas, layout.drop_zone)
        {
            return InteractionOutcome::Ignored;
        }

        self.revision = self.revision.wrapping_add(1).max(1);
        self.throw_revision = None;
        InteractionOutcome::Action {
            revision: self.revision,
            action: match classification {
                FileDropClassification::SingleRegularFile => InteractionAction::FeedReact,
                FileDropClassification::Rejected => InteractionAction::Curious,
            },
        }
    }

    pub fn begin_pointer(
        &mut self,
        input: PointerInput,
        canvas: Size,
        layout: &Layout,
        policy: InteractionPolicy,
    ) -> PointerCapture {
        if policy.click_through || !point_is_inside(input, canvas, layout.hitbox) {
            return PointerCapture(None);
        }

        self.next_capture_id = self.next_capture_id.wrapping_add(1).max(1);
        let capture_id = self.next_capture_id;
        let mut samples = [None; 8];
        samples[0] = Some((input.screen_point, input.occurred_at));
        self.active_pointer = Some(ActivePointer {
            capture_id,
            start_screen_point: input.screen_point,
            grab_offset: SurfacePoint::new(
                input.screen_point.x - input.window_origin.x,
                input.screen_point.y - input.window_origin.y,
            ),
            samples,
            sample_count: 1,
            dragging: false,
        });
        self.throw_revision = None;
        PointerCapture(Some(capture_id))
    }

    pub fn update_pointer(
        &mut self,
        capture_id: u64,
        input: PointerInput,
        policy: InteractionPolicy,
    ) -> DragUpdate {
        if policy.click_through {
            if self
                .active_pointer
                .as_ref()
                .is_some_and(|active| active.capture_id == capture_id)
            {
                self.active_pointer = None;
            }
            return DragUpdate::Ignored;
        }
        let Some(active) = self.active_pointer.as_mut() else {
            return DragUpdate::Ignored;
        };
        if active.capture_id != capture_id || !screen_sample_is_valid(input) {
            return DragUpdate::Ignored;
        }

        push_sample(active, input.screen_point, input.occurred_at);
        let distance_x = input.screen_point.x - active.start_screen_point.x;
        let distance_y = input.screen_point.y - active.start_screen_point.y;
        let action_started =
            !active.dragging && distance_x * distance_x + distance_y * distance_y >= 16.0;
        if !active.dragging && !action_started {
            return DragUpdate::Ignored;
        }
        if action_started {
            active.dragging = true;
            self.revision = self.revision.wrapping_add(1).max(1);
        }

        DragUpdate::Move {
            revision: self.revision,
            action_started,
            window_origin: SurfacePoint::new(
                input.screen_point.x - active.grab_offset.x,
                input.screen_point.y - active.grab_offset.y,
            ),
        }
    }

    pub fn end_pointer(
        &mut self,
        capture_id: u64,
        input: PointerInput,
        policy: InteractionPolicy,
        scale_factor: f64,
    ) -> InteractionOutcome {
        let Some(active) = self.active_pointer.as_ref() else {
            return InteractionOutcome::Ignored;
        };
        if active.capture_id != capture_id {
            return InteractionOutcome::Ignored;
        }
        let mut active = self
            .active_pointer
            .take()
            .expect("active pointer was checked");
        if policy.click_through {
            return InteractionOutcome::Ignored;
        }

        let released_after_drag_threshold = screen_sample_is_valid(input) && {
            let distance_x = input.screen_point.x - active.start_screen_point.x;
            let distance_y = input.screen_point.y - active.start_screen_point.y;
            distance_x * distance_x + distance_y * distance_y >= 16.0
        };
        if active.dragging || released_after_drag_threshold {
            if screen_sample_is_valid(input) {
                push_sample(&mut active, input.screen_point, input.occurred_at);
            }
            let (velocity_x, velocity_y) = release_velocity(&active, scale_factor);
            self.revision = self.revision.wrapping_add(1).max(1);
            self.throw_revision = Some(self.revision);
            return InteractionOutcome::Throw {
                revision: self.revision,
                velocity_x,
                velocity_y,
            };
        }
        if policy.quiet_mode {
            return InteractionOutcome::Ignored;
        }

        self.revision = self.revision.wrapping_add(1).max(1);
        InteractionOutcome::Action {
            revision: self.revision,
            action: InteractionAction::TapReact,
        }
    }
}

fn screen_sample_is_valid(input: PointerInput) -> bool {
    input.screen_point.x.is_finite() && input.screen_point.y.is_finite()
}

fn push_sample(active: &mut ActivePointer, point: SurfacePoint, occurred_at: Duration) {
    if active.sample_count > 0 {
        let latest_index = (active.sample_count - 1).min(active.samples.len() - 1);
        if active.samples[latest_index].is_some_and(|(_, previous)| occurred_at < previous) {
            return;
        }
    }
    if active.sample_count < active.samples.len() {
        active.samples[active.sample_count] = Some((point, occurred_at));
        active.sample_count += 1;
    } else {
        active.samples.rotate_left(1);
        let last = active.samples.len() - 1;
        active.samples[last] = Some((point, occurred_at));
    }
}

fn release_velocity(active: &ActivePointer, scale_factor: f64) -> (f64, f64) {
    if !scale_factor.is_finite() || scale_factor <= 0.0 || active.sample_count < 2 {
        return (0.0, 0.0);
    }
    let samples = &active.samples[..active.sample_count.min(active.samples.len())];
    let Some((last_point, last_time)) = samples.iter().rev().flatten().next().copied() else {
        return (0.0, 0.0);
    };
    let cutoff = last_time.saturating_sub(Duration::from_millis(120));
    let Some((first_point, first_time)) = samples
        .iter()
        .flatten()
        .find(|(_, time)| *time >= cutoff)
        .copied()
    else {
        return (0.0, 0.0);
    };
    let elapsed = last_time.saturating_sub(first_time).as_secs_f64();
    if elapsed <= f64::EPSILON {
        return (0.0, 0.0);
    }
    let velocity_x = (last_point.x - first_point.x) / scale_factor / elapsed;
    let velocity_y = (last_point.y - first_point.y) / scale_factor / elapsed;
    (
        velocity_x.clamp(-MAX_RELEASE_SPEED, MAX_RELEASE_SPEED),
        velocity_y.clamp(-MAX_RELEASE_SPEED, MAX_RELEASE_SPEED),
    )
}

fn point_is_inside(input: PointerInput, canvas: Size, rect: Rect) -> bool {
    if !input.surface_point.x.is_finite()
        || !input.surface_point.y.is_finite()
        || !input.surface_size.width.is_finite()
        || !input.surface_size.height.is_finite()
        || input.surface_size.width <= 0.0
        || input.surface_size.height <= 0.0
    {
        return false;
    }

    let canvas_x = input.surface_point.x * f64::from(canvas.width) / input.surface_size.width;
    let canvas_y = input.surface_point.y * f64::from(canvas.height) / input.surface_size.height;
    let left = f64::from(rect.x);
    let top = f64::from(rect.y);
    let right = left + f64::from(rect.width);
    let bottom = top + f64::from(rect.height);

    (left..right).contains(&canvas_x) && (top..bottom).contains(&canvas_y)
}
