import { spawn } from "node:child_process";

import {
  RUST_COVERAGE_OUTPUT_DIRECTORY,
  RUST_COVERAGE_SUMMARY_PATH,
} from "./coverage-contract.mjs";

export const CARGO_LLVM_COV_VERSION = "0.8.7";

const RUST_COVERAGE_IGNORE_PATTERN = [
  "(^|/)(tests?|target|research|reference)(/|$)",
  "(^|/)src-tauri/gen(/|$)",
  "(^|/)\\.scratch(/|$)",
].join("|");

function missingToolMessage() {
  return [
    `缺少 cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`,
    "请选择一种安装方式后重试：",
    `cargo install cargo-llvm-cov --version ${CARGO_LLVM_COV_VERSION} --locked`,
    `cargo install --root target/coverage-tools cargo-llvm-cov --version ${CARGO_LLVM_COV_VERSION} --locked`,
    'PATH="$PWD/target/coverage-tools/bin:$PATH" pnpm coverage:rust',
  ].join("\n");
}

function missingLlvmToolsMessage() {
  return [
    "缺少 llvm-tools-preview，覆盖率命令不会自动修改 Rust toolchain。",
    "请选择一种安装方式后重试：",
    "rustup component add llvm-tools-preview",
    'RUSTUP_HOME="$PWD/target/coverage-rustup" rustup toolchain install stable --profile minimal --component llvm-tools-preview',
    'RUSTUP_HOME="$PWD/target/coverage-rustup" RUSTUP_TOOLCHAIN=stable PATH="$PWD/target/coverage-tools/bin:$PATH" pnpm coverage:rust',
  ].join("\n");
}

export function hasLlvmTools(output) {
  return output.split("\n").some((line) => line.startsWith("llvm-tools"));
}

export async function runRustCoverage({ repositoryRoot, run }) {
  const tool = await run("cargo", ["llvm-cov", "--version"], {
    cwd: repositoryRoot,
    output: "capture",
  });
  if (!tool.ok) {
    throw new Error(missingToolMessage());
  }
  const components = await run("rustup", ["component", "list", "--installed"], {
    cwd: repositoryRoot,
    output: "capture",
  });
  if (!components.ok || !hasLlvmTools(components.stdout)) {
    throw new Error(missingLlvmToolsMessage());
  }

  const commands = [
    {
      label: "运行 Rust 覆盖率测试",
      args: ["llvm-cov", "--workspace", "--all-targets", "--no-report"],
    },
    {
      label: "输出 Rust 覆盖率摘要",
      args: [
        "llvm-cov",
        "report",
        "--ignore-filename-regex",
        RUST_COVERAGE_IGNORE_PATTERN,
      ],
    },
    {
      label: "写入 Rust 覆盖率范围清单",
      args: [
        "llvm-cov",
        "report",
        "--json",
        "--summary-only",
        "--output-path",
        RUST_COVERAGE_SUMMARY_PATH,
        "--ignore-filename-regex",
        RUST_COVERAGE_IGNORE_PATTERN,
      ],
    },
    {
      label: "生成 Rust 覆盖率 HTML",
      args: [
        "llvm-cov",
        "report",
        "--html",
        "--output-dir",
        RUST_COVERAGE_OUTPUT_DIRECTORY,
        "--ignore-filename-regex",
        RUST_COVERAGE_IGNORE_PATTERN,
      ],
    },
  ];

  for (const command of commands) {
    const result = await run("cargo", command.args, {
      cwd: repositoryRoot,
      output: "inherit",
    });
    if (!result.ok) {
      throw new Error(`${command.label}失败`);
    }
  }
}

export function createCommandRunner() {
  return async (command, args, { cwd, output }) =>
    await new Promise((complete) => {
      const capture = output === "capture";
      const child = spawn(command, args, {
        cwd,
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      });
      let stdout = "";
      let stderr = "";
      if (capture) {
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
      }
      child.once("error", (error) => {
        complete({ ok: false, stdout, stderr: error.message });
      });
      child.once("close", (code) => {
        complete({ ok: code === 0, stdout, stderr });
      });
    });
}
