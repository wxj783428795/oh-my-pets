use oh_my_pets_lib::window_recovery::{WindowPosition, WindowSize, WorkArea, recover_position};

#[test]
fn falls_back_to_the_primary_monitor_when_the_window_is_offscreen() {
    let primary = WorkArea {
        x: -1920,
        y: 0,
        width: 1920,
        height: 1080,
    };

    let position = recover_position(
        None,
        Some(primary),
        WindowSize {
            width: 480,
            height: 600,
        },
        24,
    );

    assert_eq!(position, Some(WindowPosition { x: -504, y: 456 }));
}
