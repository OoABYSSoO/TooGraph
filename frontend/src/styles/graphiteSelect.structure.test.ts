import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const stylesDirectory = dirname(currentFilePath);
const srcDirectory = resolve(stylesDirectory, "..");
const mainSource = readFileSync(resolve(srcDirectory, "main.ts"), "utf8");
const selectThemeSource = readFileSync(resolve(stylesDirectory, "graphite-select.css"), "utf8");

function listVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listVueFiles(path);
    }
    return extname(entry.name) === ".vue" ? [path] : [];
  });
}

test("the app imports the global Graphite select theme", () => {
  assert.match(mainSource, /import "\.\/styles\/graphite-select\.css";/);
});

test("Graphite select theme matches the warm state-editor dropdown style", () => {
  assert.match(selectThemeSource, /\.graphite-select \{[\s\S]*min-width:\s*0;/);
  assert.match(selectThemeSource, /\.graphite-select \.el-select__wrapper \{[\s\S]*min-width:\s*0;/);
  assert.match(selectThemeSource, /\.graphite-select-popper\.el-popper \{[\s\S]*border-radius:\s*16px;/);
  assert.match(selectThemeSource, /\.graphite-select-popper\.el-popper \{[\s\S]*background:\s*rgba\(255,\s*248,\s*240,\s*0\.98\);/);
  assert.match(selectThemeSource, /\.graphite-select-popper \.el-select-dropdown__item\.is-selected \{[\s\S]*color:\s*#9a3412;/);
  assert.match(selectThemeSource, /\.graphite-select \.el-select__wrapper \{[\s\S]*background:\s*rgba\(255,\s*251,\s*246,\s*0\.88\);/);
  assert.doesNotMatch(selectThemeSource, /\.node-card__agent-skill-popper\.el-popper \{[\s\S]*min-width:/);
  assert.doesNotMatch(selectThemeSource, /\.node-card__agent-skill-popper\.el-popper \{[\s\S]*max-width:/);
  assert.match(selectThemeSource, /\.node-card__agent-skill-popper\.el-popper \{[\s\S]*background:\s*rgba\(248,\s*251,\s*255,\s*0\.98\);/);
  assert.match(selectThemeSource, /\.node-card__agent-skill-popper \.el-select-dropdown__item\.is-selected \{[\s\S]*color:\s*#1d4ed8;/);
});

test("Vue files use themed Element Plus selects instead of native select dropdowns", () => {
  const offenders: string[] = [];

  for (const path of listVueFiles(srcDirectory)) {
    const source = readFileSync(path, "utf8");
    if (/<select(\s|>)/.test(source)) {
      offenders.push(path.replace(`${srcDirectory}/`, ""));
    }
    if (/<ElSelect[\s\S]*?>/.test(source)) {
      const selectBlocks = source.match(/<ElSelect[\s\S]*?>/g) ?? [];
      for (const block of selectBlocks) {
        if (!/class="[^"]*graphite-select/.test(block) || !/popper-class="[^"]*graphite-select-popper/.test(block)) {
          offenders.push(`${path.replace(`${srcDirectory}/`, "")}: unthemed ElSelect`);
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});
