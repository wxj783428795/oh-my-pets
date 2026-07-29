#!/usr/bin/env node

import { resolve } from "node:path";

import {
  createSystemProbes,
  diagnoseRepository,
  doctorExitCode,
  formatDoctorReport,
} from "./lib/doctor.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const report = await diagnoseRepository({
  repositoryRoot,
  probes: createSystemProbes(),
});

console.log(formatDoctorReport(report));
process.exitCode = doctorExitCode(report);
