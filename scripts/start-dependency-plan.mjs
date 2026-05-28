import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const frontendDependencyMarkerFilename = ".toograph-deps.sha256";
export const backendVenvDirname = ".toograph_venv";
export const backendDependencyMarkerFilename = ".toograph-requirements.sha256";

const frontendDependencyFiles = ["package.json", "package-lock.json"];
const backendDependencyFiles = ["requirements.txt"];

function isFlagEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isDependencyInstallSkipped(env = process.env) {
  return isFlagEnabled(env.TOOGRAPH_SKIP_DEP_INSTALL);
}

export function isDependencyInstallForced(env = process.env) {
  return isFlagEnabled(env.TOOGRAPH_FORCE_DEP_INSTALL);
}

export function createDependencySignature(rootDir, relativePaths) {
  const digest = createHash("sha256");
  for (const relativePath of relativePaths) {
    const filePath = resolve(rootDir, relativePath);
    digest.update(relativePath);
    digest.update("\0");
    if (existsSync(filePath)) {
      digest.update(readFileSync(filePath));
    }
    digest.update("\0");
  }
  return digest.digest("hex");
}

function readMarker(markerPath) {
  try {
    return readFileSync(markerPath, "utf8").trim();
  } catch {
    return "";
  }
}

export function resolveFrontendDependencyPlan({ frontendDir, env = process.env } = {}) {
  if (!frontendDir) {
    throw new Error("frontendDir is required");
  }

  const nodeModulesDir = resolve(frontendDir, "node_modules");
  const markerPath = resolve(nodeModulesDir, frontendDependencyMarkerFilename);
  const dependencySignature = createDependencySignature(frontendDir, frontendDependencyFiles);

  if (isDependencyInstallSkipped(env)) {
    return {
      shouldInstall: false,
      reason: "skipped",
      markerPath,
      dependencySignature,
    };
  }
  if (isDependencyInstallForced(env)) {
    return {
      shouldInstall: true,
      reason: "forced",
      markerPath,
      dependencySignature,
    };
  }
  if (!existsSync(nodeModulesDir)) {
    return {
      shouldInstall: true,
      reason: "missing_node_modules",
      markerPath,
      dependencySignature,
    };
  }
  if (readMarker(markerPath) !== dependencySignature) {
    return {
      shouldInstall: true,
      reason: "dependency_manifest_changed",
      markerPath,
      dependencySignature,
    };
  }
  return {
    shouldInstall: false,
    reason: "up_to_date",
    markerPath,
    dependencySignature,
  };
}

export function writeFrontendDependencyMarker({ frontendDir } = {}) {
  if (!frontendDir) {
    throw new Error("frontendDir is required");
  }
  const nodeModulesDir = resolve(frontendDir, "node_modules");
  mkdirSync(nodeModulesDir, { recursive: true });
  const signature = createDependencySignature(frontendDir, frontendDependencyFiles);
  const markerPath = resolve(nodeModulesDir, frontendDependencyMarkerFilename);
  writeFileSync(markerPath, `${signature}\n`);
  return markerPath;
}

export function venvPythonPath(venvDir, platform = process.platform) {
  return platform === "win32" ? resolve(venvDir, "Scripts", "python.exe") : resolve(venvDir, "bin", "python");
}

export function resolveBackendDependencyPlan({ backendDir, env = process.env, platform = process.platform } = {}) {
  if (!backendDir) {
    throw new Error("backendDir is required");
  }

  const venvDir = resolve(env.TOOGRAPH_PYTHON_ENV || resolve(backendDir, backendVenvDirname));
  const pythonPath = venvPythonPath(venvDir, platform);
  const markerPath = resolve(venvDir, backendDependencyMarkerFilename);
  const dependencySignature = createDependencySignature(backendDir, backendDependencyFiles);
  const shouldCreateVenv = !existsSync(pythonPath);

  if (isDependencyInstallSkipped(env)) {
    return {
      shouldCreateVenv: false,
      shouldInstall: false,
      reason: "skipped",
      venvDir,
      pythonPath,
      markerPath,
      dependencySignature,
    };
  }
  if (isDependencyInstallForced(env)) {
    return {
      shouldCreateVenv,
      shouldInstall: true,
      reason: "forced",
      venvDir,
      pythonPath,
      markerPath,
      dependencySignature,
    };
  }
  if (shouldCreateVenv) {
    return {
      shouldCreateVenv: true,
      shouldInstall: true,
      reason: "missing_venv",
      venvDir,
      pythonPath,
      markerPath,
      dependencySignature,
    };
  }
  if (readMarker(markerPath) !== dependencySignature) {
    return {
      shouldCreateVenv: false,
      shouldInstall: true,
      reason: "dependency_manifest_changed",
      venvDir,
      pythonPath,
      markerPath,
      dependencySignature,
    };
  }
  return {
    shouldCreateVenv: false,
    shouldInstall: false,
    reason: "up_to_date",
    venvDir,
    pythonPath,
    markerPath,
    dependencySignature,
  };
}

export function writeBackendDependencyMarker({ backendDir, venvDir } = {}) {
  if (!backendDir) {
    throw new Error("backendDir is required");
  }
  if (!venvDir) {
    throw new Error("venvDir is required");
  }
  mkdirSync(venvDir, { recursive: true });
  const signature = createDependencySignature(backendDir, backendDependencyFiles);
  const markerPath = resolve(venvDir, backendDependencyMarkerFilename);
  writeFileSync(markerPath, `${signature}\n`);
  return markerPath;
}
