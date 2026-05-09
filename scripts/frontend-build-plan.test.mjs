import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveFrontendBuildPlan } from "./frontend-build-plan.mjs";

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

test("requests a build when the frontend dist entry is missing", () => {
  const fixture = createFixture();
  try {
    writeTimedFile(join(fixture.frontendDir, "src", "main.ts"), "console.log('hello');", new Date("2026-01-01T00:00:00Z"));

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

test("skips the build when dist is newer than frontend inputs", () => {
  const fixture = createFixture();
  try {
    const srcDir = join(fixture.frontendDir, "src");
    writeTimedFile(join(srcDir, "main.ts"), "console.log('hello');", new Date("2026-01-01T00:00:00Z"));
    utimesSync(srcDir, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    writeTimedFile(join(fixture.distDir, "index.html"), "<div id=\"app\"></div>", new Date("2026-01-02T00:00:00Z"));

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

test("requests a build when a frontend input is newer than dist", () => {
  const fixture = createFixture();
  try {
    const srcDir = join(fixture.frontendDir, "src");
    writeTimedFile(join(fixture.distDir, "index.html"), "<div id=\"app\"></div>", new Date("2026-01-01T00:00:00Z"));
    writeTimedFile(join(srcDir, "main.ts"), "console.log('hello');", new Date("2026-01-02T00:00:00Z"));
    utimesSync(srcDir, new Date("2026-01-01T12:00:00Z"), new Date("2026-01-01T12:00:00Z"));

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "source_changed");
    assert.match(plan.newestInputPath, /main\.ts$/);
  } finally {
    fixture.cleanup();
  }
});

test("requests a build when a watched frontend directory changes after dist", () => {
  const fixture = createFixture();
  try {
    const srcDir = join(fixture.frontendDir, "src");
    writeTimedFile(join(srcDir, "main.ts"), "console.log('hello');", new Date("2026-01-01T00:00:00Z"));
    writeTimedFile(join(fixture.distDir, "index.html"), "<div id=\"app\"></div>", new Date("2026-01-02T00:00:00Z"));
    utimesSync(srcDir, new Date("2026-01-03T00:00:00Z"), new Date("2026-01-03T00:00:00Z"));

    const plan = resolveFrontendBuildPlan({
      frontendDir: fixture.frontendDir,
      distDir: fixture.distDir,
      env: {},
    });

    assert.equal(plan.shouldBuild, true);
    assert.equal(plan.reason, "source_changed");
    assert.equal(plan.newestInputPath, srcDir);
  } finally {
    fixture.cleanup();
  }
});

test("allows a forced frontend build through an environment flag", () => {
  const fixture = createFixture();
  try {
    const srcDir = join(fixture.frontendDir, "src");
    writeTimedFile(join(srcDir, "main.ts"), "console.log('hello');", new Date("2026-01-01T00:00:00Z"));
    utimesSync(srcDir, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    writeTimedFile(join(fixture.distDir, "index.html"), "<div id=\"app\"></div>", new Date("2026-01-02T00:00:00Z"));

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
