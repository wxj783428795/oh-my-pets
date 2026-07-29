import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "..", "desktop-smoke-contract.json"),
    "utf8",
  ),
);

export const AUTOMATED_DESKTOP_CHECKS = Object.freeze(contract.automatedChecks);
export const MANUAL_DESKTOP_CHECKS = Object.freeze(contract.manualItems);

export function validateDesktopSmokeReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["桌面 smoke 报告必须是 JSON 对象"];
  }
  if (report.schemaVersion !== contract.schemaVersion) {
    errors.push(`schemaVersion 必须是 ${contract.schemaVersion}`);
  }
  if (report.passed !== true) {
    errors.push("报告 passed 必须是 true");
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];
  for (const name of AUTOMATED_DESKTOP_CHECKS) {
    const check = checks.find((candidate) => candidate?.name === name);
    if (!check) {
      errors.push(`缺少自动化检查: ${name}`);
    } else if (check.status !== "passed") {
      errors.push(`自动化检查未通过: ${name}`);
    }
  }

  if (report.manualQaRequired !== true) {
    errors.push("报告必须明确 manualQaRequired=true");
  }
  if (!Array.isArray(report.manualItems) || report.manualItems.length === 0) {
    errors.push("报告必须列出真实 macOS 桌面人工 QA 项");
  }
  return errors;
}

export function manualQaPlatformError(platform) {
  return platform === "darwin"
    ? null
    : `真实桌面人工 QA 仅支持 macOS（darwin），当前平台为 ${platform}`;
}

export function manualQaPassed(results, appStayedRunning) {
  return (
    appStayedRunning === true &&
    results.length > 0 &&
    results.every(({ passed }) => passed === true)
  );
}
