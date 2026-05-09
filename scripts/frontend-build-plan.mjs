import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const frontendBuildManifestFilename = ".graphiteui-build-manifest.json";

const manifestVersion = 1;

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

function toManifestPath(frontendDir, filePath) {
  return relative(frontendDir, filePath).replaceAll("\\", "/");
}

function addInputFile(filePath, inputs) {
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    return;
  }
  if (stats.isFile()) {
    inputs.push(filePath);
  }
}

function collectInputFiles(directory, inputs) {
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
        collectInputFiles(entryPath, inputs);
      }
      continue;
    }
    if (entry.isFile()) {
      inputs.push(entryPath);
    }
  }
}

function listFrontendInputFiles(frontendDir) {
  const inputs = [];
  for (const file of frontendInputFiles) {
    addInputFile(resolve(frontendDir, file), inputs);
  }

  for (const directory of frontendInputDirectories) {
    collectInputFiles(resolve(frontendDir, directory), inputs);
  }

  return inputs.sort((left, right) => toManifestPath(frontendDir, left).localeCompare(toManifestPath(frontendDir, right)));
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createFrontendBuildManifest({ frontendDir } = {}) {
  if (!frontendDir) {
    throw new Error("frontendDir is required");
  }

  const aggregateHash = createHash("sha256");
  const inputs = [];

  for (const filePath of listFrontendInputFiles(frontendDir)) {
    const contents = readFileSync(filePath);
    const inputPath = toManifestPath(frontendDir, filePath);
    const inputHash = hashBytes(contents);
    aggregateHash.update(inputPath);
    aggregateHash.update("\0");
    aggregateHash.update(inputHash);
    aggregateHash.update("\0");
    inputs.push({
      path: inputPath,
      hash: inputHash,
      bytes: contents.byteLength,
    });
  }

  return {
    version: manifestVersion,
    inputHash: aggregateHash.digest("hex"),
    inputs,
  };
}

export function writeFrontendBuildManifest({ frontendDir, distDir } = {}) {
  if (!distDir) {
    throw new Error("distDir is required");
  }

  const manifest = {
    ...createFrontendBuildManifest({ frontendDir }),
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, frontendBuildManifestFilename), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function readFrontendBuildManifest(distDir) {
  const manifestPath = resolve(distDir, frontendBuildManifestFilename);
  if (!existsSync(manifestPath)) {
    return { status: "missing", manifestPath };
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest?.version !== manifestVersion || typeof manifest.inputHash !== "string") {
      return { status: "invalid", manifestPath };
    }
    return { status: "ok", manifest, manifestPath };
  } catch {
    return { status: "invalid", manifestPath };
  }
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

  const storedManifest = readFrontendBuildManifest(distDir);
  if (storedManifest.status === "missing") {
    return {
      shouldBuild: true,
      reason: "missing_manifest",
      distEntryPath,
      manifestPath: storedManifest.manifestPath,
    };
  }
  if (storedManifest.status === "invalid") {
    return {
      shouldBuild: true,
      reason: "invalid_manifest",
      distEntryPath,
      manifestPath: storedManifest.manifestPath,
    };
  }

  const currentManifest = createFrontendBuildManifest({ frontendDir });
  if (currentManifest.inputHash !== storedManifest.manifest.inputHash) {
    return {
      shouldBuild: true,
      reason: "source_changed",
      distEntryPath,
      manifestPath: storedManifest.manifestPath,
      currentInputHash: currentManifest.inputHash,
      manifestInputHash: storedManifest.manifest.inputHash,
    };
  }

  return {
    shouldBuild: false,
    reason: "up_to_date",
    distEntryPath,
    manifestPath: storedManifest.manifestPath,
    currentInputHash: currentManifest.inputHash,
  };
}
