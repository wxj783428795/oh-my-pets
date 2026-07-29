import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  playwrightArgumentsFor,
  playwrightFailureGuidance,
  playwrightPaths,
} from "./lib/playwright-runner.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = require.resolve("@playwright/test/cli");
const action = process.argv[2];

let playwrightArguments;
try {
  playwrightArguments = playwrightArgumentsFor(action);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

if (playwrightArguments) {
  const { browsers } = playwrightPaths(repositoryRoot);
  const environment = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsers,
  };
  delete environment.NO_COLOR;
  const child = spawn(
    process.execPath,
    [playwrightCli, ...playwrightArguments],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    },
  );
  child.once("error", (error) => {
    console.error(error.message);
    console.error(playwrightFailureGuidance());
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      console.error(`Playwright 被信号 ${signal} 终止`);
      process.exitCode = 1;
    } else {
      process.exitCode = code ?? 1;
    }
    if (process.exitCode !== 0) {
      console.error(playwrightFailureGuidance());
    }
  });
}
