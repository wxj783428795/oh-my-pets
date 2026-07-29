use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

const CONTRACT_JSON: &str = include_str!("../../scripts/desktop-smoke-contract.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSmokeContract {
    schema_version: u8,
    automated_checks: Vec<String>,
    manual_items: Vec<String>,
}

fn contract() -> DesktopSmokeContract {
    serde_json::from_str(CONTRACT_JSON).expect("desktop smoke contract must be valid")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSmokeCheck {
    name: String,
    status: &'static str,
    detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSmokeReport {
    schema_version: u8,
    pub passed: bool,
    app_version: String,
    platform: &'static str,
    checks: Vec<DesktopSmokeCheck>,
    manual_qa_required: bool,
    manual_items: Vec<String>,
}

impl DesktopSmokeReport {
    pub fn new(app_version: impl Into<String>) -> Self {
        let contract = contract();
        Self {
            schema_version: contract.schema_version,
            passed: false,
            app_version: app_version.into(),
            platform: std::env::consts::OS,
            checks: Vec::new(),
            manual_qa_required: true,
            manual_items: contract.manual_items,
        }
    }

    pub fn pass(&mut self, name: impl Into<String>, detail: impl Into<String>) {
        self.checks.push(DesktopSmokeCheck {
            name: name.into(),
            status: "passed",
            detail: detail.into(),
        });
    }

    pub fn fail(&mut self, name: impl Into<String>, detail: impl Into<String>) {
        self.checks.push(DesktopSmokeCheck {
            name: name.into(),
            status: "failed",
            detail: detail.into(),
        });
    }

    pub fn finish(mut self) -> Self {
        self.passed = contract().automated_checks.iter().all(|required| {
            self.checks
                .iter()
                .any(|check| check.name == *required && check.status == "passed")
        });
        self
    }

    pub fn write_to(self, path: &Path) -> io::Result<bool> {
        let report = self.finish();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let contents = serde_json::to_string_pretty(&report).map_err(io::Error::other)?;
        fs::write(path, format!("{contents}\n"))?;
        Ok(report.passed)
    }
}

pub fn requested_report_path() -> Option<PathBuf> {
    std::env::var_os("OH_MY_PETS_DESKTOP_SMOKE_REPORT").map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_report_uses_the_cross_language_contract() {
        let mut report = DesktopSmokeReport::new("0.1.0");
        for name in contract().automated_checks {
            report.pass(name, "通过");
        }
        let report = report.finish();
        let json = serde_json::to_value(report).expect("report should serialize");

        assert_eq!(json["schemaVersion"], 1);
        assert_eq!(json["passed"], true);
        assert_eq!(json["manualQaRequired"], true);
        assert_eq!(json["checks"].as_array().map(Vec::len), Some(5));
        assert!(
            json["manualItems"]
                .as_array()
                .is_some_and(|items| !items.is_empty())
        );
    }

    #[test]
    fn report_fails_when_a_required_check_is_missing_or_failed() {
        let mut report = DesktopSmokeReport::new("0.1.0");
        report.pass("app_startup", "窗口已启动");
        report.fail("example_pet_pack_loaded", "宠物包未加载");

        let report = report.finish();

        assert!(!report.passed);
    }
}
