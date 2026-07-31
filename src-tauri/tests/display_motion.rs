use std::time::Duration;

use oh_my_pets_lib::display_motion::{
    Display, DisplayId, DisplaySnapshot, LogicalVelocity, PetPlacement, PhysicalPoint,
    PhysicalRect, PhysicalSize, adopt_external_position, advance_placement, recall_placement,
    reconcile_placement, resolve_startup_placement,
};

#[test]
fn valid_saved_position_is_restored_on_a_negative_coordinate_display() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("built-in"),
                work_area: PhysicalRect::new(0, 0, 1512, 900),
                scale_factor: 2.0,
                primary: true,
            },
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
        ],
        PhysicalPoint::new(200, 160),
    )
    .expect("fixture should describe a valid desktop");

    let placement = resolve_startup_placement(
        &displays,
        Some(PhysicalPoint::new(-1600, 320)),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("a visible saved position should be restored");

    assert_eq!(placement.display_id, DisplayId::new("left"));
    assert_eq!(placement.position, PhysicalPoint::new(-1600, 320));
}

#[test]
fn invalid_saved_position_recalls_to_the_cursor_display_safe_corner() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("built-in"),
                work_area: PhysicalRect::new(0, 0, 1512, 900),
                scale_factor: 2.0,
                primary: true,
            },
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
        ],
        PhysicalPoint::new(-800, 400),
    )
    .expect("fixture should describe a valid desktop");

    let placement = resolve_startup_placement(
        &displays,
        Some(PhysicalPoint::new(4200, 180)),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("an invalid saved position should be recovered");

    assert_eq!(placement.display_id, DisplayId::new("left"));
    assert_eq!(placement.position, PhysicalPoint::new(-344, 736));
}

#[test]
fn explicit_recall_always_uses_the_cursor_display() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
            Display {
                id: DisplayId::new("right"),
                work_area: PhysicalRect::new(0, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: true,
            },
        ],
        PhysicalPoint::new(700, 300),
    )
    .expect("fixture should describe a valid desktop");

    let recalled = recall_placement(&displays, PhysicalSize::new(320, 320), 24)
        .expect("the cursor display should have a safe corner");

    assert_eq!(recalled.display_id, DisplayId::new("right"));
    assert_eq!(recalled.position, PhysicalPoint::new(1576, 736));
}

#[test]
fn display_snapshot_rejects_an_invalid_scale_factor() {
    let result = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("invalid"),
            work_area: PhysicalRect::new(0, 0, 1920, 1080),
            scale_factor: 0.0,
            primary: true,
        }],
        PhysicalPoint::new(400, 200),
    );

    assert_eq!(result, Err("显示器缩放比例必须是有限正数".to_string()));
}

#[test]
fn display_snapshot_rejects_duplicate_display_ids() {
    let result = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("same"),
                work_area: PhysicalRect::new(0, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: true,
            },
            Display {
                id: DisplayId::new("same"),
                work_area: PhysicalRect::new(1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
        ],
        PhysicalPoint::new(400, 200),
    );

    assert_eq!(result, Err("显示器标识必须唯一".to_string()));
}

#[test]
fn logical_velocity_is_scaled_once_when_moving_the_native_window() {
    let displays = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("retina"),
            work_area: PhysicalRect::new(0, 0, 3024, 1800),
            scale_factor: 2.0,
            primary: true,
        }],
        PhysicalPoint::new(120, 100),
    )
    .expect("fixture should describe a valid desktop");
    let placement = PetPlacement {
        display_id: DisplayId::new("retina"),
        position: PhysicalPoint::new(100, 200),
    };

    let step = advance_placement(
        &displays,
        placement,
        LogicalVelocity::new(100.0, 0.0),
        Duration::from_millis(500),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("motion should remain on the current display");

    assert_eq!(step.placement.position, PhysicalPoint::new(200, 200));
    assert_eq!(step.velocity, LogicalVelocity::new(100.0, 0.0));
}

#[test]
fn non_finite_velocity_is_rejected_without_moving_the_pet() {
    let displays = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("primary"),
            work_area: PhysicalRect::new(0, 0, 1920, 1080),
            scale_factor: 1.0,
            primary: true,
        }],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe a valid desktop");
    let placement = PetPlacement {
        display_id: DisplayId::new("primary"),
        position: PhysicalPoint::new(400, 500),
    };

    let step = advance_placement(
        &displays,
        placement,
        LogicalVelocity::new(f64::NAN, 0.0),
        Duration::from_millis(16),
        PhysicalSize::new(320, 320),
        24,
    );

    assert!(step.is_none());
}

#[test]
fn autonomous_motion_bounces_inside_the_current_display_instead_of_crossing_screens() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
            Display {
                id: DisplayId::new("right"),
                work_area: PhysicalRect::new(0, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: true,
            },
        ],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe a valid desktop");
    let placement = PetPlacement {
        display_id: DisplayId::new("left"),
        position: PhysicalPoint::new(-400, 600),
    };

    let step = advance_placement(
        &displays,
        placement,
        LogicalVelocity::new(400.0, 0.0),
        Duration::from_secs(1),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("collision should keep the pet on its current display");

    assert_eq!(step.placement.display_id, DisplayId::new("left"));
    assert_eq!(step.placement.position, PhysicalPoint::new(-344, 600));
    assert_eq!(step.velocity, LogicalVelocity::new(-400.0, 0.0));
}

#[test]
fn disconnected_upper_display_recovers_to_the_nearest_remaining_safe_area() {
    let remaining_displays = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("built-in"),
            work_area: PhysicalRect::new(0, 0, 1512, 900),
            scale_factor: 2.0,
            primary: true,
        }],
        PhysicalPoint::new(900, 400),
    )
    .expect("fixture should describe the post-disconnect desktop");
    let old_placement = PetPlacement {
        display_id: DisplayId::new("upper"),
        position: PhysicalPoint::new(500, -1000),
    };

    let recovered = reconcile_placement(
        &remaining_displays,
        old_placement,
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("a disconnected display should not strand the pet");

    assert_eq!(recovered.display_id, DisplayId::new("built-in"));
    assert_eq!(recovered.position, PhysicalPoint::new(500, 24));
}

#[test]
fn work_area_and_scale_changes_clamp_the_window_without_changing_displays() {
    let changed_displays = DisplaySnapshot::new(
        vec![Display {
            id: DisplayId::new("retina"),
            work_area: PhysicalRect::new(0, 25, 1280, 695),
            scale_factor: 2.0,
            primary: true,
        }],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe the changed desktop");
    let previous = PetPlacement {
        display_id: DisplayId::new("retina"),
        position: PhysicalPoint::new(1000, 500),
    };

    let recovered =
        reconcile_placement(&changed_displays, previous, PhysicalSize::new(640, 640), 24)
            .expect("the resized window should fit the changed work area");

    assert_eq!(recovered.display_id, DisplayId::new("retina"));
    assert_eq!(recovered.position, PhysicalPoint::new(616, 56));
}

#[test]
fn a_saved_position_remains_valid_on_a_display_arranged_below_the_primary() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("primary"),
                work_area: PhysicalRect::new(0, 0, 1512, 900),
                scale_factor: 2.0,
                primary: true,
            },
            Display {
                id: DisplayId::new("lower"),
                work_area: PhysicalRect::new(0, 900, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
        ],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe a vertical desktop");

    let restored = resolve_startup_placement(
        &displays,
        Some(PhysicalPoint::new(480, 1120)),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("a valid position on the lower display should be preserved");

    assert_eq!(restored.display_id, DisplayId::new("lower"));
    assert_eq!(restored.position, PhysicalPoint::new(480, 1120));
}

#[test]
fn an_external_window_move_updates_the_current_display() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
            Display {
                id: DisplayId::new("right"),
                work_area: PhysicalRect::new(0, 0, 1920, 1080),
                scale_factor: 2.0,
                primary: true,
            },
        ],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe a valid desktop");
    let previous = PetPlacement {
        display_id: DisplayId::new("left"),
        position: PhysicalPoint::new(-500, 600),
    };

    let adopted = adopt_external_position(
        &displays,
        previous,
        PhysicalPoint::new(240, 360),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("a complete move onto another display should be adopted");

    assert_eq!(adopted.display_id, DisplayId::new("right"));
    assert_eq!(adopted.position, PhysicalPoint::new(240, 360));
}

#[test]
fn an_external_move_to_a_new_display_edge_is_clamped_on_that_display() {
    let displays = DisplaySnapshot::new(
        vec![
            Display {
                id: DisplayId::new("left"),
                work_area: PhysicalRect::new(-1920, 0, 1920, 1080),
                scale_factor: 1.0,
                primary: false,
            },
            Display {
                id: DisplayId::new("right"),
                work_area: PhysicalRect::new(0, 0, 1920, 1080),
                scale_factor: 2.0,
                primary: true,
            },
        ],
        PhysicalPoint::new(400, 200),
    )
    .expect("fixture should describe a valid desktop");
    let previous = PetPlacement {
        display_id: DisplayId::new("left"),
        position: PhysicalPoint::new(-500, 600),
    };

    let adopted = adopt_external_position(
        &displays,
        previous,
        PhysicalPoint::new(0, 0),
        PhysicalSize::new(320, 320),
        24,
    )
    .expect("the window center identifies the new display");

    assert_eq!(adopted.display_id, DisplayId::new("right"));
    assert_eq!(adopted.position, PhysicalPoint::new(24, 24));
}
