import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { messages, SUPPORTED_LOCALES } from "./messages.ts";

type LocaleMessage = (typeof messages)[keyof typeof messages];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(currentDirectory, "..");

const legacyTerms = /\bSkills?\b|技能/u;
const actionScopes = [
  "nav.actions",
  "presets.searchPlaceholder",
  "presets.actions",
  "presets.requiredActions",
  "actions",
  "nodeCard.removeAction",
  "nodeCard.addAction",
  "nodeCard.selectAction",
  "nodeCard.noAction",
  "nodeCard.noActionOption",
  "nodeCard.actionLoadFailed",
  "nodeCard.actionCopy",
  "nodeCard.loadingActions",
  "nodeCard.noActions",
] as const;

test("current node capability UI uses Action terminology instead of legacy Skill wording", () => {
  const failures: string[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const localeMessages = messages[locale];
    for (const scope of actionScopes) {
      const value = readPath(localeMessages, scope);
      for (const [path, text] of flattenStringValues(value, `${locale}.${scope}`)) {
        if (legacyTerms.test(text)) {
          failures.push(`${path}: ${text}`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("current node capability components do not hard-code legacy Skill wording", () => {
  const sourceFiles = [
    "editor/nodes/StatePortList.vue",
    "editor/nodes/PrimaryStatePort.vue",
    "layouts/AppShell.vue",
  ];
  const failures = sourceFiles.flatMap((relativePath) => {
    const source = readFileSync(resolve(sourceRoot, relativePath), "utf8");
    return source
      .split(/\r?\n/)
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => legacyTerms.test(line))
      .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
  });

  assert.deepEqual(failures, []);
});

function readPath(root: LocaleMessage, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, root);
}

function flattenStringValues(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === "string") {
    return [[path, value]];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => flattenStringValues(child, `${path}.${key}`));
}
