const PLACEHOLDERS = new Set([
  "",
  "pending",
  "todo",
  "n/a",
  "待补",
  "待实施",
  "待验证",
]);

function stripFormatting(value) {
  return value.trim().replace(/^`|`$/g, "");
}

function topLevelField(markdown, name) {
  const match = markdown.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  return match ? stripFormatting(match[1]) : "";
}

function headingBody(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === heading.toLowerCase(),
  );
  if (start === -1) {
    return "";
  }

  const level = heading.match(/^#+/)?.[0].length ?? 0;
  const end = lines.findIndex(
    (line, index) =>
      index > start && new RegExp(`^#{1,${level}}(?:\\s|$)`).test(line.trim()),
  );
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

function section(markdown, name) {
  return headingBody(markdown, `### ${name}`);
}

function sectionField(markdown, sectionName, fieldName) {
  const body = section(markdown, sectionName);
  const match = body.match(new RegExp(`^- ${fieldName}:\\s*(.*)$`, "im"));
  return match ? stripFormatting(match[1]) : "";
}

function isFilled(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[。.!！?？:：;；]+$/u, "")
    .trim();
  return !PLACEHOLDERS.has(normalized);
}

function runsPnpmScript(value, script) {
  const [runner, command] = value.trim().split(/\s+/);
  return runner === "pnpm" && command === script;
}

export function validateCloseoutTicket(markdown) {
  const status = topLevelField(markdown, "Status").toLowerCase();
  const contract = topLevelField(markdown, "Closeout-Contract").toLowerCase();
  const errors = [];

  if (contract !== "v1") {
    errors.push("Closeout-Contract 必须是 v1");
  }

  const verifyStatus = sectionField(markdown, "Verify", "Status").toLowerCase();
  const verifyCommand = sectionField(markdown, "Verify", "Command");
  const verifyResult = sectionField(markdown, "Verify", "Result");
  if (verifyStatus !== "passed") {
    errors.push("Verify Status 必须是 passed");
  }
  if (!runsPnpmScript(verifyCommand, "verify")) {
    errors.push("Verify Command 必须执行 pnpm verify");
  }
  if (!isFilled(verifyResult)) {
    errors.push("Verify Result 必须填写实际结果");
  }

  const manualStatus = sectionField(
    markdown,
    "Manual QA",
    "Status",
  ).toLowerCase();
  const manualCommand = sectionField(markdown, "Manual QA", "Command");
  const manualResult = sectionField(markdown, "Manual QA", "Result");
  const manualReason = sectionField(markdown, "Manual QA", "Reason");
  if (!["passed", "not-applicable"].includes(manualStatus)) {
    errors.push("Manual QA Status 必须是 passed 或 not-applicable");
  }
  if (!isFilled(manualResult)) {
    errors.push("Manual QA Result 必须填写实际结果");
  }
  if (
    manualStatus === "passed" &&
    !runsPnpmScript(manualCommand, "qa:desktop")
  ) {
    errors.push("Manual QA Command 必须执行 pnpm qa:desktop");
  }
  if (manualStatus === "not-applicable" && !isFilled(manualReason)) {
    errors.push("Manual QA 标记为 not-applicable 时必须填写 Reason");
  }

  if (
    sectionField(markdown, "Review", "Standards").toLowerCase() !== "passed"
  ) {
    errors.push("Standards review 必须是 passed");
  }
  if (sectionField(markdown, "Review", "Spec").toLowerCase() !== "passed") {
    errors.push("Spec review 必须是 passed");
  }
  if (!isFilled(sectionField(markdown, "Review", "Notes"))) {
    errors.push("Review Notes 必须填写实际结论");
  }

  if (
    sectionField(markdown, "Commit", "Status").toLowerCase() !== "committed"
  ) {
    errors.push("Commit Status 必须是 committed");
  }
  const commitHash = sectionField(markdown, "Commit", "Hash");
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) {
    errors.push("Commit Hash 必须是 7-40 位 Git 十六进制哈希");
  }

  const answer = headingBody(markdown, "## Answer");
  if (!isFilled(answer)) {
    errors.push("Answer 必须记录实际交付结果");
  }

  return { status, contract, errors };
}

export function readCloseoutCommitHash(markdown) {
  return sectionField(markdown, "Commit", "Hash");
}
