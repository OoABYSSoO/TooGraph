import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDownloadSourceCandidates,
  chooseBestDownloadSource,
  npmMirrorRegistry,
  npmOfficialRegistry,
  pipOfficialIndexUrl,
  pipTsinghuaIndexUrl,
  redactUrlCredentials,
  selectDownloadSource,
} from "./start-download-source-plan.mjs";

test("download source candidates include configured source and known fallbacks", () => {
  const npmCandidates = buildDownloadSourceCandidates({
    kind: "npm",
    configuredUrl: "https://registry.example.test/custom/",
    env: {},
  });

  assert.deepEqual(
    npmCandidates.map((candidate) => candidate.url),
    ["https://registry.example.test/custom/", npmOfficialRegistry, npmMirrorRegistry],
  );
  assert.equal(npmCandidates[0].probeUrl, "https://registry.example.test/custom/vue");

  const pipCandidates = buildDownloadSourceCandidates({
    kind: "pip",
    configuredUrl: "https://pypi.example.test/simple",
    env: {},
  });

  assert.deepEqual(
    pipCandidates.map((candidate) => candidate.url),
    ["https://pypi.example.test/simple", pipOfficialIndexUrl, pipTsinghuaIndexUrl],
  );
  assert.equal(pipCandidates[0].probeUrl, "https://pypi.example.test/simple/fastapi/");
});

test("download source selection prefers the fastest reachable candidate", () => {
  const selected = chooseBestDownloadSource([
    {
      ok: true,
      elapsedMs: 120,
      candidate: { kind: "npm", label: "official", url: npmOfficialRegistry, probeUrl: `${npmOfficialRegistry}vue` },
    },
    {
      ok: true,
      elapsedMs: 35,
      candidate: { kind: "npm", label: "mirror", url: npmMirrorRegistry, probeUrl: `${npmMirrorRegistry}vue` },
    },
  ]);

  assert.equal(selected.url, npmMirrorRegistry);
  assert.equal(selected.mode, "probed");
  assert.equal(selected.elapsedMs, 35);
});

test("download source selection can use explicit temporary overrides without probing", async () => {
  const selected = await selectDownloadSource({
    kind: "pip",
    configuredUrl: pipOfficialIndexUrl,
    env: { TOOGRAPH_PIP_INDEX_URL: "https://mirror.example.test/simple/" },
    fetchImpl: async () => {
      throw new Error("forced temporary source should not be probed");
    },
  });

  assert.equal(selected.url, "https://mirror.example.test/simple");
  assert.equal(selected.probeUrl, "https://mirror.example.test/simple/fastapi/");
  assert.equal(selected.mode, "forced");
});

test("download source candidates ignore invalid configured source values", () => {
  const npmCandidates = buildDownloadSourceCandidates({
    kind: "npm",
    configuredUrl: "not-a-url",
    env: {},
  });

  assert.deepEqual(
    npmCandidates.map((candidate) => candidate.url),
    [npmOfficialRegistry, npmMirrorRegistry],
  );
});

test("download source display URLs redact embedded credentials", () => {
  assert.equal(
    redactUrlCredentials("https://user:secret@example.test/simple"),
    "https://***:***@example.test/simple",
  );
  assert.equal(redactUrlCredentials("https://example.test/simple"), "https://example.test/simple");
});
