use std::{path::PathBuf, thread, time::Duration};

use oh_my_pets_domain::{Layout, Size};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::{
    AppState, CommandError,
    direct_interaction::{
        DragUpdate, InteractionAction, InteractionOutcome, InteractionPolicy, PointerInput,
        SurfacePoint, SurfaceSize, ThrowMotion, ThrowPhase, classify_file_drop,
        elapsed_from_milliseconds,
    },
    display_motion::{LogicalVelocity, PhysicalPoint},
    pet_window,
    product_state::Velocity,
    publish_product_state,
};

const THROW_STEP: Duration = Duration::from_millis(16);

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerRequest {
    pub local_x: f64,
    pub local_y: f64,
    pub surface_width: f64,
    pub surface_height: f64,
    pub occurred_at_ms: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InteractionPayload {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hold_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complete_on_finish: Option<bool>,
}

impl InteractionPayload {
    fn ignored() -> Self {
        Self {
            kind: "ignored",
            capture_id: None,
            revision: None,
            action: None,
            hold_ms: None,
            complete_on_finish: None,
        }
    }

    fn captured(capture_id: u64) -> Self {
        Self {
            kind: "captured",
            capture_id: Some(capture_id),
            ..Self::ignored()
        }
    }

    fn dragging(revision: u64) -> Self {
        Self {
            kind: "dragging",
            revision: Some(revision),
            ..Self::ignored()
        }
    }

    fn action(revision: u64, action: InteractionAction) -> Self {
        let (name, hold_ms, complete_on_finish) = action.presentation();
        Self {
            kind: "action",
            capture_id: None,
            revision: Some(revision),
            action: Some(name),
            hold_ms: Some(hold_ms),
            complete_on_finish: Some(complete_on_finish),
        }
    }
}

pub fn begin_pointer(
    app: &AppHandle,
    state: &AppState,
    request: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    let window = pet_window(app)?;
    let input = capture_pointer_input(&window, request)?;
    let (canvas, layout) = interaction_layout(state)?;
    let policy = interaction_policy(state)?;
    let capture = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .begin_pointer(input, canvas, &layout, policy);
    Ok(capture
        .capture_id()
        .map_or_else(InteractionPayload::ignored, InteractionPayload::captured))
}

pub fn update_pointer(
    app: &AppHandle,
    state: &AppState,
    capture_id: u64,
    request: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    let window = pet_window(app)?;
    let input = capture_pointer_input(&window, request)?;
    let policy = interaction_policy(state)?;
    let update = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .update_pointer(capture_id, input, policy);
    let DragUpdate::Move {
        revision,
        action_started,
        window_origin,
    } = update
    else {
        return Ok(InteractionPayload::ignored());
    };
    state
        .pet_position
        .drag_to(
            &window,
            &state.product,
            PhysicalPoint::new(round_to_i32(window_origin.x), round_to_i32(window_origin.y)),
        )
        .map_err(CommandError::shell)?;
    if action_started {
        publish_action(
            app,
            state,
            revision,
            InteractionAction::DragHold,
            LogicalVelocity::new(0.0, 0.0),
        )
    } else {
        Ok(InteractionPayload::dragging(revision))
    }
}

pub fn end_pointer(
    app: &AppHandle,
    state: &AppState,
    capture_id: u64,
    request: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    let window = pet_window(app)?;
    let input = capture_pointer_input(&window, request)?;
    let policy = interaction_policy(state)?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let outcome = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .end_pointer(capture_id, input, policy, scale_factor);
    let payload = publish_outcome(app, state, outcome)?;
    if let InteractionOutcome::Throw {
        revision,
        velocity_x,
        velocity_y,
    } = outcome
    {
        schedule_throw(app, revision, LogicalVelocity::new(velocity_x, velocity_y));
    }
    Ok(payload)
}

pub fn handle_file_drop(
    app: &AppHandle,
    state: &AppState,
    paths: Vec<PathBuf>,
    request: PointerRequest,
) -> Result<InteractionPayload, CommandError> {
    let classification = classify_file_drop(&paths);
    drop(paths);
    let window = pet_window(app)?;
    let input = capture_pointer_input(&window, request)?;
    let (canvas, layout) = interaction_layout(state)?;
    let policy = interaction_policy(state)?;
    let outcome = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .handle_file_drop(classification, input, canvas, &layout, policy);
    publish_outcome(app, state, outcome)
}

pub fn complete_action(
    app: &AppHandle,
    state: &AppState,
    revision: u64,
) -> Result<InteractionPayload, CommandError> {
    let outcome = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .complete_action(revision);
    publish_outcome(app, state, outcome)
}

pub fn cancel_pointer(
    app: &AppHandle,
    state: &AppState,
    capture_id: u64,
) -> Result<InteractionPayload, CommandError> {
    let outcome = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .cancel_pointer(capture_id);
    publish_outcome(app, state, outcome)
}

pub fn cancel_all(app: &AppHandle, state: &AppState) -> Result<(), CommandError> {
    let outcome = state
        .interaction
        .lock()
        .map_err(|_| CommandError::shell("直接交互状态锁已损坏"))?
        .cancel_all();
    let payload = publish_outcome(app, state, outcome)?;
    app.emit("pet-interaction", payload)
        .map_err(|error| CommandError::shell(error.to_string()))
}

fn capture_pointer_input(
    window: &WebviewWindow,
    request: PointerRequest,
) -> Result<PointerInput, CommandError> {
    let cursor = window
        .cursor_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let origin = window
        .outer_position()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    Ok(PointerInput {
        surface_point: SurfacePoint::new(request.local_x, request.local_y),
        surface_size: SurfaceSize::new(request.surface_width, request.surface_height),
        screen_point: SurfacePoint::new(cursor.x, cursor.y),
        window_origin: SurfacePoint::new(f64::from(origin.x), f64::from(origin.y)),
        occurred_at: elapsed_from_milliseconds(request.occurred_at_ms),
    })
}

fn interaction_layout(state: &AppState) -> Result<(Size, Layout), CommandError> {
    let snapshot = state
        .pet_pack
        .snapshot()
        .map_err(|error| CommandError::shell(error.to_string()))?;
    let pack = snapshot
        .pack
        .as_ref()
        .ok_or_else(|| CommandError::shell("宠物包尚未加载"))?;
    Ok((pack.manifest.canvas, pack.manifest.layout.clone()))
}

fn interaction_policy(state: &AppState) -> Result<InteractionPolicy, CommandError> {
    let snapshot = state.product.snapshot().map_err(CommandError::shell)?;
    Ok(InteractionPolicy {
        quiet_mode: snapshot.session.quiet_mode,
        click_through: snapshot.session.click_through,
    })
}

pub(crate) fn publish_outcome(
    app: &AppHandle,
    state: &AppState,
    outcome: InteractionOutcome,
) -> Result<InteractionPayload, CommandError> {
    match outcome {
        InteractionOutcome::Ignored => Ok(InteractionPayload::ignored()),
        InteractionOutcome::Action { revision, action } => {
            publish_action(app, state, revision, action, LogicalVelocity::new(0.0, 0.0))
        }
        InteractionOutcome::Throw {
            revision,
            velocity_x,
            velocity_y,
        } => publish_action(
            app,
            state,
            revision,
            InteractionAction::Fall,
            LogicalVelocity::new(velocity_x, velocity_y),
        ),
    }
}

pub(crate) fn publish_action(
    app: &AppHandle,
    state: &AppState,
    revision: u64,
    action: InteractionAction,
    velocity: LogicalVelocity,
) -> Result<InteractionPayload, CommandError> {
    let (name, hold_ms, complete_on_finish) = action.presentation();
    let value = state
        .product
        .set_runtime_behavior(
            name,
            Velocity {
                x: velocity.x_points_per_second,
                y: velocity.y_points_per_second,
            },
            complete_on_finish.then_some(u64::from(hold_ms)),
        )
        .map_err(CommandError::shell)?;
    publish_product_state(app, &value)?;
    Ok(InteractionPayload::action(revision, action))
}

fn schedule_throw(app: &AppHandle, revision: u64, velocity: LogicalVelocity) {
    let handle = app.clone();
    thread::spawn(move || run_throw(handle, revision, velocity));
}

fn run_throw(app: AppHandle, revision: u64, velocity: LogicalVelocity) {
    let Some(mut motion) = ThrowMotion::new(velocity) else {
        finish_throw(&app, revision);
        return;
    };
    loop {
        let state = app.state::<AppState>();
        let active = state
            .interaction
            .lock()
            .is_ok_and(|interaction| interaction.is_throw_active(revision));
        if !active {
            return;
        }
        let requested = motion.velocity_for_step(THROW_STEP);
        let step = pet_window(&app).and_then(|window| {
            state
                .pet_position
                .advance(&window, &state.product, requested, THROW_STEP, false)
                .map_err(CommandError::shell)
        });
        let Ok((_, step)) = step else {
            let _ = pet_window(&app).and_then(|window| {
                state
                    .pet_position
                    .reconcile(&window, &state.product)
                    .map(|_| ())
                    .map_err(CommandError::shell)
            });
            break;
        };
        let phase = motion.observe_step(requested, step.velocity);
        let velocity = motion.velocity();
        let _ = state.product.set_runtime_behavior(
            "fall",
            Velocity {
                x: velocity.x_points_per_second,
                y: velocity.y_points_per_second,
            },
            None,
        );
        if phase == ThrowPhase::Landed {
            break;
        }
        thread::sleep(THROW_STEP);
    }
    finish_throw(&app, revision);
}

fn finish_throw(app: &AppHandle, revision: u64) {
    let state = app.state::<AppState>();
    let active = state
        .interaction
        .lock()
        .is_ok_and(|interaction| interaction.is_throw_active(revision));
    if !active {
        return;
    }
    let _ = state.pet_position.persist_current(&state.product);
    let outcome = state
        .interaction
        .lock()
        .ok()
        .map(|mut interaction| interaction.finish_throw(revision))
        .unwrap_or(InteractionOutcome::Ignored);
    if let Ok(payload) = publish_outcome(app, state.inner(), outcome)
        && payload.kind == "action"
    {
        let _ = app.emit("pet-interaction", payload);
    }
}

fn round_to_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}
