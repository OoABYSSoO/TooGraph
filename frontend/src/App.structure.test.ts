import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const appSource = readFileSync(resolve(currentDirectory, "App.vue"), "utf8");
const mainSource = readFileSync(resolve(currentDirectory, "main.ts"), "utf8");

test("App wires application and Element Plus locales through the root provider", () => {
  assert.match(appSource, /<ElConfigProvider :locale="elementPlusLocale">/);
  assert.match(appSource, /useLocaleStore/);
  assert.match(appSource, /resolveElementPlusLocale/);
});

test("App mounts the companion pet at the application root", () => {
  assert.match(appSource, /import CompanionPet from "\.\/companion\/CompanionPet\.vue";/);
  assert.match(appSource, /<CompanionPet \/>/);
});

test("main registers vue-i18n before mounting the app", () => {
  assert.match(mainSource, /import \{ i18n \} from "\.\/i18n";/);
  assert.match(mainSource, /app\.use\(i18n\);/);
});
