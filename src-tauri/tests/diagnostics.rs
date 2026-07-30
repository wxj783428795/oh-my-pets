use std::fs;

use oh_my_pets_domain::ValidationIssue;
use oh_my_pets_lib::diagnostics::{DiagnosticsPetPack, DiagnosticsSnapshot, write_diagnostics};

#[test]
fn writes_a_local_diagnostic_report_from_the_desktop_state() {
    let output_dir = tempfile::tempdir().expect("create diagnostics directory");
    let snapshot = DiagnosticsSnapshot {
        app_version: "0.1.0".to_string(),
        platform: "macos".to_string(),
        architecture: "aarch64".to_string(),
        click_through: false,
        always_on_top: true,
        visible_on_all_workspaces: true,
        pet_size: "medium".to_string(),
        activity_frequency: "standard".to_string(),
        launch_at_login: false,
        quiet_mode: false,
        pet_hidden: false,
        preference_health: "偏好数据损坏，已使用安全默认值".to_string(),
        pet_pack: Some(DiagnosticsPetPack {
            display_name: "卷卷".to_string(),
            version: "1.0.0".to_string(),
            action_count: 15,
            frame_count: 1,
        }),
        pet_pack_issues: vec![ValidationIssue::warning(
            "atlas.placeholder",
            "atlas.png",
            "当前使用占位图集",
        )],
    };

    let output =
        write_diagnostics(output_dir.path(), 42, &snapshot).expect("write diagnostic report");
    let report = fs::read_to_string(&output).expect("read diagnostic report");

    assert_eq!(
        output.file_name().and_then(|name| name.to_str()),
        Some("oh-my-pets-diagnostics-42.md")
    );
    assert!(report.contains("- 应用版本：0.1.0"));
    assert!(report.contains("- 平台：macos aarch64"));
    assert!(report.contains("- 偏好状态：偏好数据损坏，已使用安全默认值"));
    assert!(report.contains("- 宠物尺寸：medium"));
    assert!(report.contains("- 活动频率：standard"));
    assert!(!report.contains("/Users/example/Library/Application Support"));
    assert!(report.contains("- 宠物包：卷卷 1.0.0（15 个动作，1 个图集帧）"));
    assert!(report.contains("- 宠物包问题：[atlas.placeholder] atlas.png：当前使用占位图集"));
    assert!(report.contains("整窗点击穿透与系统级文件拖放不能同时工作"));
}
