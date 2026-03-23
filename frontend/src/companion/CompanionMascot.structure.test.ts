import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "CompanionMascot.vue"), "utf8");
function extractPathData(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing SVG path marker: ${marker}`);
  const pathTail = source.slice(markerIndex);
  const match = pathTail.match(/\sd="([^"]+)"/);
  assert.ok(match, `Missing path data after marker: ${marker}`);
  return normalizePathData(match[1]);
}

function normalizePathData(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const teardropLeftEarPath = "M-146-143 C-114-132-82-101-55-61 C-60-24-84 25-124 63 C-158 95-190 53-168-4 C-174-52-164-106-146-143Z";
const teardropRightEarPath = "M146-143 C114-132 82-101 55-61 C60-24 84 25 124 63 C158 95 190 53 168-4 C174-52 164-106 146-143Z";
const separatedHeadPath =
  "M-55-61 C-25-66 25-66 55-61 C90-61 130-43 168-4 C196 22 214 66 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 66-196 22-168-4 C-130-43-90-61-55-61Z";
const elevatedSparklePath =
  "M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z";

test("CompanionMascot renders the mascot as inline SVG animation parts", () => {
  assert.match(componentSource, /<svg[\s\S]*class="companion-mascot__svg"/);
  assert.match(componentSource, /class="companion-mascot__body"/);
  assert.match(componentSource, /class="companion-mascot__tail"/);
  assert.match(componentSource, /class="companion-mascot__sparkle"/);
  assert.match(componentSource, /class="companion-mascot__left-ear"/);
  assert.match(componentSource, /class="companion-mascot__right-ear"/);
  assert.match(componentSource, /class="companion-mascot__resting-eye/);
  assert.match(componentSource, /class="companion-mascot__drag-eye/);
});

test("CompanionMascot uses true separated head, ears, and tail layers without masks", () => {
  assert.doesNotMatch(componentSource, /<mask\b/);
  assert.doesNotMatch(componentSource, /mask="url/);
  assert.doesNotMatch(componentSource, /ear-mask/);
  assert.equal(extractPathData(componentSource, 'class="companion-mascot__left-ear"'), teardropLeftEarPath);
  assert.equal(extractPathData(componentSource, 'class="companion-mascot__right-ear"'), teardropRightEarPath);
  assert.equal(extractPathData(componentSource, 'class="companion-mascot__head"'), separatedHeadPath);
  assert.match(componentSource, /class="companion-mascot__left-ear"[\s\S]*class="companion-mascot__right-ear"[\s\S]*class="companion-mascot__head"/);
});

test("CompanionMascot keeps the sparkle above the head without entering the head layer", () => {
  assert.equal(extractPathData(componentSource, 'class="companion-mascot__sparkle"'), elevatedSparklePath);
  assert.match(componentSource, /id="companionMascotSparkleGold" cx="0" cy="-136" r="56"/);
  assert.match(componentSource, /class="companion-mascot__body"[\s\S]*class="companion-mascot__sparkle-wrap"/);
});

test("CompanionMascot supports idle, thinking, speaking, dragging, and tap animations", () => {
  assert.match(componentSource, /type CompanionMascotMood = "idle" \| "thinking" \| "speaking" \| "error";/);
  assert.match(componentSource, /dragging\?: boolean;/);
  assert.match(componentSource, /tapNonce\?: number;/);
  assert.match(componentSource, /companion-mascot--idle/);
  assert.match(componentSource, /companion-mascot--thinking/);
  assert.match(componentSource, /companion-mascot--speaking/);
  assert.match(componentSource, /companion-mascot--dragging/);
  assert.match(componentSource, /companion-mascot--tap/);
  assert.match(componentSource, /watch\(\(\) => props\.tapNonce/);
});

test("CompanionMascot changes the eyes into chevrons while dragging", () => {
  assert.match(componentSource, /d="M-104 52 L-64 82 L-104 112"/);
  assert.match(componentSource, /d="M104 52 L64 82 L104 112"/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__resting-eye[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__drag-eye[\s\S]*opacity:\s*1;/);
});

test("CompanionMascot gives the star idle sway and thinking pseudo-3D spin", () => {
  assert.match(componentSource, /@keyframes companion-mascot-star-sway/);
  assert.match(componentSource, /@keyframes companion-mascot-star-flip/);
  assert.match(componentSource, /scaleX\(0\.18\)/);
  assert.match(componentSource, /filter:\s*brightness\(1\.22\)/);
});

test("CompanionMascot keeps the tail animated while thinking and speaking", () => {
  assert.match(componentSource, /\.companion-mascot--thinking[\s\S]*\.companion-mascot__tail[\s\S]*animation:\s*companion-mascot-tail-thinking 920ms ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--speaking[\s\S]*\.companion-mascot__tail[\s\S]*animation:\s*companion-mascot-tail-speaking 560ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes companion-mascot-tail-thinking[\s\S]*rotate\(4deg\)[\s\S]*rotate\(12deg\)/);
  assert.match(componentSource, /@keyframes companion-mascot-tail-speaking[\s\S]*rotate\(-3deg\)[\s\S]*rotate\(18deg\)/);
});

test("CompanionMascot makes idle tail and ear motion visible without changing body scale", () => {
  assert.match(componentSource, /\.companion-mascot--idle[\s\S]*\.companion-mascot__tail[\s\S]*animation:\s*companion-mascot-tail-sway 3\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--idle[\s\S]*\.companion-mascot__left-ear[\s\S]*animation:\s*companion-mascot-ear-idle-left 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--idle[\s\S]*\.companion-mascot__right-ear[\s\S]*animation:\s*companion-mascot-ear-idle-right 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes companion-mascot-tail-sway[\s\S]*rotate\(-7deg\)[\s\S]*rotate\(15deg\)/);
  assert.match(componentSource, /@keyframes companion-mascot-ear-idle-left[\s\S]*rotate\(-8deg\)/);
  assert.match(componentSource, /@keyframes companion-mascot-ear-idle-right[\s\S]*rotate\(8deg\)/);
});

test("CompanionMascot gives dragging a lightly taller body, tail, and ear response", () => {
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__body[\s\S]*animation:\s*companion-mascot-drag-body 720ms ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__tail[\s\S]*animation:\s*companion-mascot-tail-drag 420ms ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__left-ear[\s\S]*animation:\s*companion-mascot-ear-drag-left 360ms ease-in-out infinite;/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__right-ear[\s\S]*animation:\s*companion-mascot-ear-drag-right 360ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes companion-mascot-drag-body[\s\S]*scaleX\(0\.96\) scaleY\(1\.04\)[\s\S]*scaleX\(0\.98\) scaleY\(1\.02\)/);
  assert.match(componentSource, /@keyframes companion-mascot-drag-body[\s\S]*rotate\(-5deg\)[\s\S]*rotate\(5deg\)/);
  assert.match(componentSource, /@keyframes companion-mascot-tail-drag[\s\S]*rotate\(18deg\)[\s\S]*rotate\(-18deg\)/);
});

test("CompanionMascot blinks occasionally while idle", () => {
  assert.match(componentSource, /\.companion-mascot--idle[\s\S]*\.companion-mascot__resting-eye[\s\S]*animation:\s*companion-mascot-blink 7\.2s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes companion-mascot-blink/);
  assert.match(componentSource, /92%\s*\{[\s\S]*scaleY\(0\.08\)/);
});

test("CompanionMascot respects reduced motion preferences", () => {
  assert.match(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(componentSource, /animation:\s*none/);
});
