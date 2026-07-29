import { describe, expect, test, vi } from "vitest";

import { CARGO_LLVM_COV_VERSION, runRustCoverage } from "./coverage-rust.mjs";

describe("Rust 覆盖率命令", () => {
  test("缺少 cargo-llvm-cov 时清晰失败并给出固定版本的全局或本地安装选择", async () => {
    const run = vi.fn().mockResolvedValue({ ok: false });

    const error = await runRustCoverage({
      repositoryRoot: "/repo",
      run,
    }).catch((reason) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      `缺少 cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`,
    );
    expect(error.message).toContain(
      `cargo install cargo-llvm-cov --version ${CARGO_LLVM_COV_VERSION} --locked`,
    );
    expect(error.message).toContain(
      `cargo install --root target/coverage-tools cargo-llvm-cov --version ${CARGO_LLVM_COV_VERSION} --locked`,
    );
    expect(error.message).toContain(
      'PATH="$PWD/target/coverage-tools/bin:$PATH" pnpm coverage:rust',
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("cargo", ["llvm-cov", "--version"], {
      cwd: "/repo",
      output: "capture",
    });
  });

  test("测试只运行一次，再从同一份 profile 输出摘要、范围清单和 HTML", async () => {
    const run = vi.fn().mockImplementation(async (command, args) => {
      if (command === "rustup" && args[0] === "component") {
        return { ok: true, stdout: "llvm-tools-aarch64-apple-darwin" };
      }
      return {
        ok: true,
        stdout: `cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`,
      };
    });

    await runRustCoverage({ repositoryRoot: "/repo", run });

    expect(run.mock.calls.slice(2)).toEqual([
      [
        "cargo",
        ["llvm-cov", "--workspace", "--all-targets", "--no-report"],
        { cwd: "/repo", output: "inherit" },
      ],
      [
        "cargo",
        ["llvm-cov", "report", "--ignore-filename-regex", expect.any(String)],
        { cwd: "/repo", output: "inherit" },
      ],
      [
        "cargo",
        [
          "llvm-cov",
          "report",
          "--json",
          "--summary-only",
          "--output-path",
          "target/coverage/rust/summary.json",
          "--ignore-filename-regex",
          expect.any(String),
        ],
        { cwd: "/repo", output: "inherit" },
      ],
      [
        "cargo",
        [
          "llvm-cov",
          "report",
          "--html",
          "--output-dir",
          "target/coverage/rust",
          "--ignore-filename-regex",
          expect.any(String),
        ],
        { cwd: "/repo", output: "inherit" },
      ],
    ]);
  });

  test("缺少 llvm-tools-preview 时不触发交互安装并给出隔离安装方式", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: `cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`,
      })
      .mockResolvedValueOnce({ ok: true, stdout: "" });

    const error = await runRustCoverage({
      repositoryRoot: "/repo",
      run,
    }).catch((reason) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("缺少 llvm-tools-preview");
    expect(error.message).toContain("rustup component add llvm-tools-preview");
    expect(error.message).toContain(
      'RUSTUP_HOME="$PWD/target/coverage-rustup"',
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("任一覆盖率步骤失败时立即停止并指出失败阶段", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: `cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: "llvm-tools-aarch64-apple-darwin",
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    await expect(
      runRustCoverage({ repositoryRoot: "/repo", run }),
    ).rejects.toThrow("输出 Rust 覆盖率摘要失败");
    expect(run).toHaveBeenCalledTimes(4);
  });
});
