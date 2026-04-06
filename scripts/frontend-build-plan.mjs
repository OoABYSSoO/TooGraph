import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const frontendInputFiles = [
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  ".env",
  ".env.local",
  ".env.production",
];

const frontendInputDirectories = ["src", "public"];
const skippedDirectories = new Set([".git", "dist", "node_modules"]);

function isForceBuildEnabled(env) {
  const value = String(env.GRAPHITEUI_FORCE_FRONTEND_BUILD || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function collectInputs(directory, inputs) {
  if (!existsSync(directory)) {
    return;
  }

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        inputs.push(entryPath);
        collectInputs(entryPath, inputs);
      }
      continue;
    }
    if (entry.isFile()) {
      inputs.push(entryPath);
    }
  }
}

function listFrontendInputs(frontendDir) {
  const inputs = [];
  for (const file of frontendInputFiles) {
    const filePath = resolve(frontendDir, file);
    if (existsSync(filePath)) {
      inputs.push(filePath);
    }
  }

  for (const directory of frontendInputDirectories) {
    const directoryPath = resolve(frontendDir, directory);
    if (existsSync(directoryPath)) {
      inputs.push(directoryPath);
      collectInputs(directoryPath, inputs);
    }
  }

  return inputs;
}

function findNewestInput(frontendDir) {
  let newestInputPath = null;
  let newestInputMtimeMs = 0;

  for (const filePath of listFrontendInputs(frontendDir)) {
    let stats;
    try {
      stats = statSync(filePath);
    } catch {
      continue;
    }
    if (stats.mtimeMs > newestInputMtimeMs) {
      newestInputPath = filePath;
      newestInputMtimeMs = stats.mtimeMs;
    }
  }

  return { newestInputPath, newestInputMtimeMs };
}

export function resolveFrontendBuildPlan({ frontendDir, distDir, env = process.env } = {}) {
  if (!frontendDir) {
    throw new Error("frontendDir is required");
  }
  if (!distDir) {
    throw new Error("distDir is required");
  }

  if (isForceBuildEnabled(env)) {
    return { shouldBuild: true, reason: "forced" };
  }

  const distEntryPath = resolve(distDir, "index.html");
  if (!existsSync(distEntryPath)) {
    return { shouldBuild: true, reason: "missing_dist", distEntryPath };
  }

  const distMtimeMs = statSync(distEntryPath).mtimeMs;
  const { newestInputPath, newestInputMtimeMs } = findNewestInput(frontendDir);
  if (newestInputPath && newestInputMtimeMs > distMtimeMs) {
    return {
      shouldBuild: true,
      reason: "source_changed",
      distEntryPath,
      distMtimeMs,
      newestInputPath,
      newestInputMtimeMs,
    };
  }

  return {
    shouldBuild: false,
    reason: "up_to_date",
    distEntryPath,
    distMtimeMs,
    newestInputPath,
    newestInputMtimeMs,
  };
}
