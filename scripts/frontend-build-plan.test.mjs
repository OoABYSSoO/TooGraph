import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  frontendBuildManifestFilename,
  resolveFrontendBuildPlan,
  writeFrontendBuildManifest,
} from "./frontend-build-plan.mjs";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "graphiteui-frontend-build-"));
  const frontendDir = join(root, "frontend");
  const distDir = join(frontendDir, "dist");
  mkdirSync(join(frontendDir, "src"), { recursive: true });
  mkdirSync(distDir, { recursive: true });
  return {
    root,
    frontendDir,
    distDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeTimedFile(path, content, timestamp) {
  writeFileSync(path, content);
  utimesSync(path, timestamp, timestamp);
}

function writeDistEntry(fixture) {
  writeTimedFile(join(fixture.distDir, "index.html"), "<div id=\"app\"></div>", new Date("2026-01-02T00:00:00Z"));
}

function writeSourceEntry(fixture, content = "console.log('hello');") {
  const srcDir = join(fixture.frontendDir, "src");
  const sourcePath = join(srcDir, "main.ts");
  writeTimedFile(sourcePath, content, new Date("2026-01-01T00:00:00Z"));
  utimesSync(srcDir, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
  return sourcePath;
}

test("requests a build when the frontend dist entry is missing", () => {
  const fixture = createFixture();
  try {
    writeSourceEntry(fixture);

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "missing_dist");
  } finally {
    fixture.cleanup();
  }
});

test("requests a build when the frontend build manifest is missing", () => {
  const fixture = createFixture();
  try {
    writeSourceEntry(fixture);
    writeDistEntry(fixture);

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "missing_manifest");
  } finally {
    fixture.cleanup();
  }
});

test("writes a manifest with a stable content hash for frontend inputs", () => {
  const fixture = createFixture();
  try {
    writeSourceEntry(fixture);
    writeDistEntry(fixture);

    const manifest = writeFrontendBuildManifest({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
    });

    const manifestPath = join(fixture.distDir, frontendBuildManifestFilename);
    const manifestFromDisk = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.version, 1);
    assert.match(manifest.inputHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(manifest.inputs.map((input) => input.path), ["src/main.ts"]);
    assert.deepEqual(manifestFromDisk.inputs, manifest.inputs);
  } finally {
    fixture.cleanup();
  }
});

test("skips the build when the manifest hash still matches even if mtimes change", () => {
  const fixture = createFixture();
  try {
    const sourcePath = writeSourceEntry(fixture);
    writeDistEntry(fixture);
    writeFrontendBuildManifest({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
    });
    utimesSync(sourcePath, new Date("2026-01-03T00:00:00Z"), new Date("2026-01-03T00:00:00Z"));

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, false);
    assert.equal(plan.reason, "up_to_date");
  } finally {
    fixture.cleanup();
  }
});

test("requests a build when source content changes without a useful mtime signal", () => {
  const fixture = createFixture();
  try {
    const sourcePath = writeSourceEntry(fixture);
    writeDistEntry(fixture);
    writeFrontendBuildManifest({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
    });
    writeTimedFile(sourcePath, "console.log('changed');", new Date("2026-01-01T00:00:00Z"));

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "source_changed");
    assert.notEqual(plan.currentInputHash, plan.manifestInputHash);
  } finally {
    fixture.cleanup();
  }
});

test("requests a build when the frontend input file list changes", () => {
  const fixture = createFixture();
  try {
    writeSourceEntry(fixture);
    writeDistEntry(fixture);
    writeFrontendBuildManifest({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
    });
    writeTimedFile(join(fixture.frontendDir, "src", "extra.ts"), "export const value = 1;", new Date("2026-01-01T00:00:00Z"));

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "source_changed");
  } finally {
    fixture.cleanup();
  }
});

test("allows a forced frontend build through an environment flag", () => {
  const fixture = createFixture();
  try {
    writeSourceEntry(fixture);
    writeDistEntry(fixture);
    writeFrontendBuildManifest({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
    });

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: { GRAPHITEUI_FORCE_FRONTEND_BUILD: "1" },
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "forced");
  } finally {
    fixture.cleanup();
  }
});
