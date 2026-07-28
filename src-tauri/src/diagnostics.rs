use std::{
    fmt::Write as _,
    fs, io,
    path::{Path, PathBuf},
};

use oh_my_pets_domain::ValidationIssue;

#[derive(Debug, Clone)]
pub struct DiagnosticsPetPack {
    pub display_name: String,
    pub version: String,
    pub action_count: usize,
    pub frame_count: usize,
}

#[derive(Debug, Clone)]
pub struct DiagnosticsSnapshot {
    pub app_version: String,
    pub platform: String,
    pub architecture: String,
    pub click_through: bool,
    pub always_on_top: bool,
    pub visible_on_all_workspaces: bool,
    pub pet_pack: Option<DiagnosticsPetPack>,
    pub pet_pack_issues: Vec<ValidationIssue>,
}

pub fn write_diagnostics(
    output_dir: &Path,
    timestamp: u64,
    snapshot: &DiagnosticsSnapshot,
) -> io::Result<PathBuf> {
    let mut report = String::new();
    let _ = writeln!(report, "# Oh My Pets 诊断摘要");
    let _ = writeln!(report);
    let _ = writeln!(report, "- 应用版本：{}", snapshot.app_version);
    let _ = writeln!(
        report,
        "- 平台：{} {}",
        snapshot.platform, snapshot.architecture
    );
    let _ = writeln!(report, "- 点击穿透：{}", snapshot.click_through);
    let _ = writeln!(report, "- 始终置顶：{}", snapshot.always_on_top);
    let _ = writeln!(
        report,
        "- 所有工作区可见：{}",
        snapshot.visible_on_all_workspaces
    );
    if let Some(pack) = snapshot.pet_pack.as_ref() {
        let _ = writeln!(
            report,
            "- 宠物包：{} {}（{} 个动作，{} 个图集帧）",
            pack.display_name, pack.version, pack.action_count, pack.frame_count
        );
    } else {
        let _ = writeln!(report, "- 宠物包：未加载");
    }
    for issue in &snapshot.pet_pack_issues {
        let _ = writeln!(
            report,
            "- 宠物包问题：[{}] {}：{}",
            issue.code, issue.path, issue.message
        );
    }
    let _ = writeln!(report);
    let _ = writeln!(report, "## 已知平台约束");
    let _ = writeln!(report);
    let _ = writeln!(
        report,
        "macOS 透明 WebView 的整窗点击穿透与系统级文件拖放不能同时工作。"
    );

    fs::create_dir_all(output_dir)?;
    let output = output_dir.join(format!("oh-my-pets-diagnostics-{timestamp}.md"));
    fs::write(&output, report)?;
    Ok(output)
}
