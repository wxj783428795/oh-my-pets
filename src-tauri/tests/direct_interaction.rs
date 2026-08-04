use std::{fs, time::Duration};

use oh_my_pets_domain::{Layout, Point, Rect, Size};
use oh_my_pets_lib::direct_interaction::{
    DirectInteraction, DragUpdate, InteractionAction, InteractionOutcome, InteractionPolicy,
    PointerInput, SurfacePoint, SurfaceSize, ThrowMotion, ThrowPhase, classify_file_drop,
    elapsed_from_milliseconds,
};
use oh_my_pets_lib::display_motion::{
    Display, DisplayId, DisplaySnapshot, LogicalVelocity, PetPlacement, PhysicalPoint,
    PhysicalRect, PhysicalSize, advance_placement,
};

fn layout() -> Layout {
    Layout {
        baseline: Point { x: 160, y: 292 },
        hitbox: Rect {
            x: 54,
            y: 32,
            width: 212,
            height: 260,
        },
        drop_zone: Rect {
            x: 86,
            y: 112,
            width: 148,
            height: 132,
        },
        bubble_anchor: Point { x: 160, y: 24 },
    }
}

#[test]
fn one_regular_file_inside_drop_zone_triggers_feed_without_retaining_or_changing_the_file() {
    let temporary = tempfile::tempdir().expect("temporary directory should be available");
    let sensitive_marker = "OMP_PRIVATE_FEED_MARKER_7f31";
    let path = temporary.path().join(format!("{sensitive_marker}.txt"));
    let contents = b"private bytes stay untouched";
    fs::write(&path, contents).expect("fixture should be writable");
    let before = fs::metadata(&path).expect("fixture metadata should be readable");
    let classification = classify_file_drop(std::slice::from_ref(&path));
    let mut interaction = DirectInteraction::default();

    let outcome = interaction.handle_file_drop(
        classification,
        pointer(80.0, 80.0, 10),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        InteractionPolicy::interactive(),
    );

    assert_eq!(
        outcome,
        InteractionOutcome::Action {
            revision: 1,
            action: InteractionAction::FeedReact,
        }
    );
    assert!(!format!("{classification:?}{outcome:?}").contains(sensitive_marker));
    assert_eq!(
        fs::read(&path).expect("fixture should remain readable"),
        contents
    );
    let after = fs::metadata(&path).expect("fixture metadata should remain readable");
    assert_eq!(after.len(), before.len());
}

#[test]
fn folder_inside_drop_zone_triggers_one_curious_reaction() {
    let temporary = tempfile::tempdir().expect("temporary directory should be available");
    let classification = classify_file_drop(&[temporary.path().to_path_buf()]);
    let mut interaction = DirectInteraction::default();

    let outcome = interaction.handle_file_drop(
        classification,
        pointer(80.0, 80.0, 10),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        InteractionPolicy::interactive(),
    );

    assert_eq!(
        outcome,
        InteractionOutcome::Action {
            revision: 1,
            action: InteractionAction::Curious,
        }
    );
}

#[test]
fn multiple_files_inside_drop_zone_trigger_only_one_curious_reaction() {
    let temporary = tempfile::tempdir().expect("temporary directory should be available");
    let first = temporary.path().join("first.txt");
    let second = temporary.path().join("second.txt");
    fs::write(&first, b"first").expect("first fixture should be writable");
    fs::write(&second, b"second").expect("second fixture should be writable");
    let classification = classify_file_drop(&[first, second]);
    let mut interaction = DirectInteraction::default();

    let outcome = interaction.handle_file_drop(
        classification,
        pointer(80.0, 80.0, 10),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        InteractionPolicy::interactive(),
    );

    assert_eq!(
        outcome,
        InteractionOutcome::Action {
            revision: 1,
            action: InteractionAction::Curious,
        }
    );
}

fn pointer(x: f64, y: f64, elapsed_ms: u64) -> PointerInput {
    PointerInput {
        surface_point: SurfacePoint::new(x, y),
        surface_size: SurfaceSize::new(160.0, 160.0),
        screen_point: SurfacePoint::new(900.0, 500.0),
        window_origin: SurfacePoint::new(820.0, 420.0),
        occurred_at: Duration::from_millis(elapsed_ms),
    }
}

#[test]
fn drag_follows_the_pointer_and_caps_scale_aware_release_velocity() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();
    let mut down = pointer(80.0, 80.0, 0);
    down.screen_point = SurfacePoint::new(900.0, 500.0);
    down.window_origin = SurfacePoint::new(820.0, 420.0);
    let capture_id = interaction
        .begin_pointer(
            down,
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            policy,
        )
        .capture_id()
        .expect("the pointer should capture the pet");

    let mut moved = pointer(80.0, 80.0, 10);
    moved.screen_point = SurfacePoint::new(940.0, 520.0);
    assert_eq!(
        interaction.update_pointer(capture_id, moved, policy),
        DragUpdate::Move {
            revision: 1,
            action_started: true,
            window_origin: SurfacePoint::new(860.0, 440.0),
        }
    );

    let mut released = pointer(80.0, 80.0, 30);
    released.screen_point = SurfacePoint::new(2_000.0, -500.0);
    let outcome = interaction.end_pointer(capture_id, released, policy, 2.0);

    assert_eq!(
        outcome,
        InteractionOutcome::Throw {
            revision: 2,
            velocity_x: 1_800.0,
            velocity_y: -1_800.0,
        }
    );
}

#[test]
fn release_after_the_pointer_stops_starts_a_zero_velocity_fall() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();
    let capture_id = interaction
        .begin_pointer(
            pointer(80.0, 80.0, 0),
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            policy,
        )
        .capture_id()
        .expect("the pointer should capture the pet");
    let mut moved = pointer(80.0, 80.0, 10);
    moved.screen_point = SurfacePoint::new(940.0, 520.0);
    assert!(matches!(
        interaction.update_pointer(capture_id, moved, policy),
        DragUpdate::Move { .. }
    ));

    let mut released = moved;
    released.occurred_at = Duration::from_millis(250);
    assert_eq!(
        interaction.end_pointer(capture_id, released, policy, 2.0),
        InteractionOutcome::Throw {
            revision: 2,
            velocity_x: 0.0,
            velocity_y: 0.0,
        }
    );
}

#[test]
fn release_point_can_turn_a_fast_gesture_into_a_throw_without_an_intermediate_move() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();
    let capture_id = interaction
        .begin_pointer(
            pointer(80.0, 80.0, 0),
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            policy,
        )
        .capture_id()
        .expect("the pointer should capture the pet");
    let mut released = pointer(100.0, 80.0, 20);
    released.screen_point = SurfacePoint::new(940.0, 500.0);

    assert!(matches!(
        interaction.end_pointer(capture_id, released, policy, 2.0),
        InteractionOutcome::Throw {
            velocity_x,
            velocity_y: 0.0,
            ..
        } if velocity_x > 0.0
    ));
}

#[test]
fn browser_elapsed_time_remains_monotonic_after_a_full_day() {
    assert_eq!(
        elapsed_from_milliseconds(86_400_250.0),
        Duration::from_millis(86_400_250)
    );
    assert_eq!(elapsed_from_milliseconds(f64::NAN), Duration::ZERO);
    assert_eq!(elapsed_from_milliseconds(-1.0), Duration::ZERO);
}

#[test]
fn enabling_click_through_cancels_an_active_drag_immediately() {
    let mut interaction = DirectInteraction::default();
    let interactive = InteractionPolicy::interactive();
    let capture_id = interaction
        .begin_pointer(
            pointer(80.0, 80.0, 0),
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            interactive,
        )
        .capture_id()
        .expect("the pointer should capture the pet");
    let mut moved = pointer(80.0, 80.0, 10);
    moved.screen_point = SurfacePoint::new(940.0, 520.0);
    assert!(matches!(
        interaction.update_pointer(capture_id, moved, interactive),
        DragUpdate::Move { .. }
    ));

    let mut later = moved;
    later.screen_point = SurfacePoint::new(980.0, 540.0);
    later.occurred_at = Duration::from_millis(20);
    assert_eq!(
        interaction.update_pointer(capture_id, later, InteractionPolicy::passthrough()),
        DragUpdate::Ignored
    );
    assert_eq!(
        interaction.update_pointer(capture_id, later, interactive),
        DragUpdate::Ignored
    );
}

#[test]
fn fast_throw_bounces_and_eventually_lands_inside_the_safe_area() {
    let displays = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("main"),
            work_area: PhysicalRect::new(0, 0, 800, 600),
            scale_factor: 2.0,
            primary: true,
        }],
        PhysicalPoint::new(400, 300),
    )
    .expect("display fixture should be valid");
    let mut placement = PetPlacement {
        display_id: DisplayId::new("main"),
        position: PhysicalPoint::new(420, 200),
    };
    let mut throwing = ThrowMotion::new(LogicalVelocity::new(4_000.0, -1_400.0))
        .expect("finite release velocity should start a throw");
    let elapsed = Duration::from_millis(16);
    let mut phase = ThrowPhase::Falling;

    for _ in 0..600 {
        let requested = throwing.velocity_for_step(elapsed);
        let step = advance_placement(
            &displays,
            placement,
            requested,
            elapsed,
            PhysicalSize::new(320, 320),
            24,
        )
        .expect("the safe display should accept every throw step");
        placement = step.placement;
        phase = throwing.observe_step(requested, step.velocity);
        if phase == ThrowPhase::Landed {
            break;
        }
    }

    assert_eq!(phase, ThrowPhase::Landed);
    assert!((24..=456).contains(&placement.position.x));
    assert!((24..=256).contains(&placement.position.y));
    assert_eq!(throwing.velocity(), LogicalVelocity::new(0.0, 0.0));
}

#[test]
fn stale_animation_completion_cannot_override_a_newer_user_action() {
    let mut interaction = DirectInteraction::default();
    let first = interaction.handle_file_drop(
        oh_my_pets_lib::direct_interaction::FileDropClassification::SingleRegularFile,
        pointer(80.0, 80.0, 10),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        InteractionPolicy::interactive(),
    );
    let second = interaction.handle_file_drop(
        oh_my_pets_lib::direct_interaction::FileDropClassification::Rejected,
        pointer(80.0, 80.0, 20),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        InteractionPolicy::interactive(),
    );
    assert_eq!(first.revision(), Some(1));
    assert_eq!(second.revision(), Some(2));

    assert_eq!(interaction.complete_action(1), InteractionOutcome::Ignored);
    assert_eq!(
        interaction.complete_action(2),
        InteractionOutcome::Action {
            revision: 3,
            action: InteractionAction::Idle,
        }
    );
}

#[test]
fn throw_owns_the_action_until_land_then_returns_to_idle() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();
    let capture_id = interaction
        .begin_pointer(
            pointer(80.0, 80.0, 0),
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            policy,
        )
        .capture_id()
        .expect("the pointer should capture the pet");
    let mut moved = pointer(80.0, 80.0, 20);
    moved.screen_point = SurfacePoint::new(940.0, 520.0);
    assert!(matches!(
        interaction.update_pointer(capture_id, moved, policy),
        DragUpdate::Move { .. }
    ));
    let released = interaction.end_pointer(capture_id, moved, policy, 2.0);
    assert_eq!(released.revision(), Some(2));

    assert_eq!(interaction.complete_action(2), InteractionOutcome::Ignored);
    assert_eq!(
        interaction.finish_throw(2),
        InteractionOutcome::Action {
            revision: 3,
            action: InteractionAction::Land,
        }
    );
    assert_eq!(interaction.finish_throw(2), InteractionOutcome::Ignored);
    assert_eq!(
        interaction.complete_action(3),
        InteractionOutcome::Action {
            revision: 4,
            action: InteractionAction::Idle,
        }
    );
}

#[test]
fn interaction_actions_publish_stable_semantic_keys_and_completion_rules() {
    assert_eq!(
        InteractionAction::TapReact.presentation(),
        ("tap_react", 620, true)
    );
    assert_eq!(
        InteractionAction::DragHold.presentation(),
        ("drag_hold", 60_000, false)
    );
    assert_eq!(
        InteractionAction::Fall.presentation(),
        ("fall", 60_000, false)
    );
    assert_eq!(InteractionAction::Land.presentation(), ("land", 320, true));
    assert_eq!(
        InteractionAction::FeedReact.presentation(),
        ("feed_react", 1_100, true)
    );
    assert_eq!(
        InteractionAction::Curious.presentation(),
        ("curious", 1_200, true)
    );
    assert_eq!(
        InteractionAction::Idle.presentation(),
        ("idle", 60_000, false)
    );
}

#[test]
fn cancelled_pointer_never_turns_into_a_click_or_throw() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();
    let capture_id = interaction
        .begin_pointer(
            pointer(80.0, 80.0, 0),
            Size {
                width: 320,
                height: 320,
            },
            &layout(),
            policy,
        )
        .capture_id()
        .expect("the pointer should capture the pet");

    assert_eq!(
        interaction.cancel_pointer(capture_id),
        InteractionOutcome::Ignored
    );
    assert_eq!(
        interaction.end_pointer(capture_id, pointer(80.0, 80.0, 20), policy, 2.0),
        InteractionOutcome::Ignored
    );
}

#[test]
fn click_inside_scaled_hitbox_triggers_tap_reaction() {
    let mut interaction = DirectInteraction::default();
    let policy = InteractionPolicy::interactive();

    let capture = interaction.begin_pointer(
        pointer(80.0, 80.0, 10),
        Size {
            width: 320,
            height: 320,
        },
        &layout(),
        policy,
    );
    let capture_id = capture
        .capture_id()
        .expect("a hit inside the scaled hitbox should be captured");
    let outcome = interaction.end_pointer(capture_id, pointer(80.0, 80.0, 30), policy, 2.0);

    assert_eq!(
        outcome,
        InteractionOutcome::Action {
            revision: 1,
            action: InteractionAction::TapReact,
        }
    );
}

#[test]
fn scaled_hitbox_uses_inclusive_leading_and_exclusive_trailing_edges() {
    let canvas = Size {
        width: 320,
        height: 320,
    };
    let policy = InteractionPolicy::interactive();
    let mut interaction = DirectInteraction::default();
    let mut leading_edge = pointer(27.0, 16.0, 10);
    leading_edge.screen_point = SurfacePoint::new(847.0, 436.0);

    assert!(
        interaction
            .begin_pointer(leading_edge, canvas, &layout(), policy)
            .capture_id()
            .is_some()
    );
    interaction.cancel_all();

    let mut right_edge = pointer(133.0, 80.0, 20);
    right_edge.screen_point = SurfacePoint::new(953.0, 500.0);
    assert!(
        interaction
            .begin_pointer(right_edge, canvas, &layout(), policy)
            .capture_id()
            .is_none()
    );

    let mut bottom_edge = pointer(80.0, 146.0, 30);
    bottom_edge.screen_point = SurfacePoint::new(900.0, 566.0);
    assert!(
        interaction
            .begin_pointer(bottom_edge, canvas, &layout(), policy)
            .capture_id()
            .is_none()
    );
}
