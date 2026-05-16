#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LEGACY_KEY_RENAMES = new Map([
  ["skillKey", "actionKey"],
  ["skillBindings", "actionBindings"],
  ["skillInstructionBlocks", "actionInstructionBlocks"],
  ["requiredSkills", "requiredActions"],
]);

const LEGACY_KIND_RENAMES = new Map([
  ["skill_input", "action_input"],
  ["skill_output", "action_output"],
  ["skill_invocation", "action_invocation"],
]);

export function migrateNodeSystemActions(value) {
  const report = {
    renamedKeys: {},
    rewrittenKinds: {},
  };
  const migrated = migrateValue(value, report);
  return { migrated, report };
}

function migrateValue(value, report) {
  if (Array.isArray(value)) {
    return value.map((item) => migrateValue(item, report));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const nextKey = LEGACY_KEY_RENAMES.get(rawKey) ?? rawKey;
    if (nextKey !== rawKey) {
      report.renamedKeys[rawKey] = (report.renamedKeys[rawKey] ?? 0) + 1;
    }
    next[nextKey] = migrateValue(rawValue, report);
  }

  if (typeof next.kind === "string") {
    const nextKind = LEGACY_KIND_RENAMES.get(next.kind);
    if (nextKind) {
      report.rewrittenKinds[next.kind] = (report.rewrittenKinds[next.kind] ?? 0) + 1;
      next.kind = nextKind;
    } else if (next.kind === "skill" && isCapabilityLike(next)) {
      report.rewrittenKinds.skill = (report.rewrittenKinds.skill ?? 0) + 1;
      next.kind = "action";
    }
  }

  return next;
}

function isCapabilityLike(value) {
  return (
    Object.prototype.hasOwnProperty.call(value, "key") ||
    Object.prototype.hasOwnProperty.call(value, "name") ||
    Object.prototype.hasOwnProperty.call(value, "description")
  );
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printUsage() {
  console.error("Usage: node scripts/migrate-node-system-actions.mjs <input.json> [output.json]");
}

function main(argv) {
  const [, , inputPath, outputPath] = argv;
  if (!inputPath || inputPath === "--help" || inputPath === "-h") {
    printUsage();
    return inputPath ? 0 : 1;
  }

  const input = readJsonFile(inputPath);
  const { migrated, report } = migrateNodeSystemActions(input);
  if (outputPath) {
    writeJsonFile(outputPath, migrated);
  } else {
    process.stdout.write(`${JSON.stringify(migrated, null, 2)}\n`);
  }
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

const currentPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentPath) {
  process.exitCode = main(process.argv);
}
