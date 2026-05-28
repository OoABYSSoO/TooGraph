import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  backendDependencyMarkerFilename,
  backendVenvDirname,
  createDependencySignature,
  frontendDependencyMarkerFilename,
  isDependencyInstallForced,
  isDependencyInstallSkipped,
  resolveBackendDependencyPlan,
  resolveFrontendDependencyPlan,
  venvPythonPath,
  writeBackendDependencyMarker,
  writeFrontendDependencyMarker,
} from "./start-dependency-plan.mjs";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "toograph-deps-"));
  const frontendDir = join(root, "frontend");
  const backendDir = join(root, "backend");
  mkdirSync(frontendDir, { recursive: true });
  mkdirSync(backendDir, { recursive: true });
  writeFileSync(join(frontendDir, "package.json"), '{"dependencies":{"vue":"3.5.0"}}\n');
  writeFileSync(join(frontendDir, "package-lock.json"), '{"lockfileVersion":3}\n');
  writeFileSync(join(backendDir, "requirements.txt"), "fastapi>=0.115,<1.0\n");
  return {
    root,
    frontendDir,
    backendDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("dependency install flags support explicit skip and force modes", () => {
  assert.equal(isDependencyInstallSkipped({ TOOGRAPH_SKIP_DEP_INSTALL: "1" }), true);
  assert.equal(isDependencyInstallSkipped({ TOOGRAPH_SKIP_DEP_INSTALL: "false" }), false);
  assert.equal(isDependencyInstallForced({ TOOGRAPH_FORCE_DEP_INSTALL: "yes" }), true);
  assert.equal(isDependencyInstallForced({ TOOGRAPH_FORCE_DEP_INSTALL: "0" }), false);
});

test("frontend dependency plan installs when node_modules or the marker is missing", () => {
  const fixture = createFixture();
  try {
    const plan = resolveFrontendDependencyPlan({ frontendDir: fixture.frontendDir, env: {} });

    assert.equal(plan.shouldInstall, true);
    assert.equal(plan.reason, "missing_node_modules");
    assert.equal(plan.markerPath, join(fixture.frontendDir, "node_modules", frontendDependencyMarkerFilename));
  } finally {
    fixture.cleanup();
  }
});

test("frontend dependency plan skips when manifest marker matches", () => {
  const fixture = createFixture();
  try {
    mkdirSync(join(fixture.frontendDir, "node_modules"), { recursive: true });
    writeFrontendDependencyMarker({ frontendDir: fixture.frontendDir });

    const plan = resolveFrontendDependencyPlan({ frontendDir: fixture.frontendDir, env: {} });

    assert.equal(plan.shouldInstall, false);
    assert.equal(plan.reason, "up_to_date");
  } finally {
    fixture.cleanup();
  }
});

test("frontend dependency plan reinstalls when dependency manifests change", () => {
  const fixture = createFixture();
  try {
    mkdirSync(join(fixture.frontendDir, "node_modules"), { recursive: true });
    writeFrontendDependencyMarker({ frontendDir: fixture.frontendDir });
    writeFileSync(join(fixture.frontendDir, "package.json"), '{"dependencies":{"vue":"3.6.0"}}\n');

    const plan = resolveFrontendDependencyPlan({ frontendDir: fixture.frontendDir, env: {} });

    assert.equal(plan.shouldInstall, true);
    assert.equal(plan.reason, "dependency_manifest_changed");
  } finally {
    fixture.cleanup();
  }
});

test("backend dependency plan uses the dedicated TooGraph venv by default", () => {
  const fixture = createFixture();
  try {
    const plan = resolveBackendDependencyPlan({ backendDir: fixture.backendDir, env: {}, platform: "linux" });

    assert.equal(plan.venvDir, join(fixture.backendDir, backendVenvDirname));
    assert.equal(plan.pythonPath, join(fixture.backendDir, backendVenvDirname, "bin", "python"));
    assert.equal(plan.shouldCreateVenv, true);
    assert.equal(plan.shouldInstall, true);
    assert.equal(plan.reason, "missing_venv");
  } finally {
    fixture.cleanup();
  }
});

test("backend dependency plan skips when venv marker matches requirements", () => {
  const fixture = createFixture();
  try {
    const venvDir = join(fixture.backendDir, backendVenvDirname);
    mkdirSync(join(venvDir, "bin"), { recursive: true });
    writeFileSync(join(venvDir, "bin", "python"), "");
    writeBackendDependencyMarker({ backendDir: fixture.backendDir, venvDir });

    const plan = resolveBackendDependencyPlan({ backendDir: fixture.backendDir, env: {}, platform: "linux" });

    assert.equal(plan.shouldCreateVenv, false);
    assert.equal(plan.shouldInstall, false);
    assert.equal(plan.reason, "up_to_date");
    assert.equal(readFileSync(join(venvDir, backendDependencyMarkerFilename), "utf8"), `${createDependencySignature(fixture.backendDir, ["requirements.txt"])}\n`);
  } finally {
    fixture.cleanup();
  }
});

test("backend dependency plan supports custom venv path and Windows python layout", () => {
  const fixture = createFixture();
  try {
    const customVenv = join(fixture.root, "custom-env");
    const plan = resolveBackendDependencyPlan({
      backendDir: fixture.backendDir,
      env: { TOOGRAPH_PYTHON_ENV: customVenv },
      platform: "win32",
    });

    assert.equal(plan.venvDir, customVenv);
    assert.equal(plan.pythonPath, join(customVenv, "Scripts", "python.exe"));
    assert.equal(venvPythonPath(customVenv, "win32"), join(customVenv, "Scripts", "python.exe"));
  } finally {
    fixture.cleanup();
  }
});
