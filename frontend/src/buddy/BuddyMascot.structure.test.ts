import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "BuddyMascot.vue"), "utf8");
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

function extractCssBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

const teardropLeftEarPath = "M-146-143 C-114-132-82-101-55-61 C-60-24-84 25-124 63 C-158 95-190 53-168-4 C-174-52-164-106-146-143Z";
const teardropRightEarPath = "M146-143 C114-132 82-101 55-61 C60-24 84 25 124 63 C158 95 190 53 168-4 C174-52 164-106 146-143Z";
const separatedHeadPath =
  "M-55-61 C-25-66 25-66 55-61 C90-61 130-43 168-4 C196 22 214 66 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 66-196 22-168-4 C-130-43-90-61-55-61Z";
const elevatedSparklePath =
  "M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z";

test("BuddyMascot renders the mascot as inline SVG animation parts", () => {
  assert.match(componentSource, /<svg[\s\S]*class="buddy-mascot__svg"/);
  assert.match(componentSource, /class="buddy-mascot__body"/);
  assert.match(componentSource, /class="buddy-mascot__tail"/);
  assert.match(componentSource, /class="buddy-mascot__sparkle"/);
  assert.match(componentSource, /class="buddy-mascot__left-ear"/);
  assert.match(componentSource, /class="buddy-mascot__right-ear"/);
  assert.match(componentSource, /class="buddy-mascot__resting-eye/);
  assert.match(componentSource, /class="buddy-mascot__drag-eye/);
});

test("BuddyMascot uses true separated head, ears, and tail layers without masks", () => {
  assert.doesNotMatch(componentSource, /<mask\b/);
  assert.doesNotMatch(componentSource, /mask="url/);
  assert.doesNotMatch(componentSource, /ear-mask/);
  assert.equal(extractPathData(componentSource, 'class="buddy-mascot__left-ear"'), teardropLeftEarPath);
  assert.equal(extractPathData(componentSource, 'class="buddy-mascot__right-ear"'), teardropRightEarPath);
  assert.equal(extractPathData(componentSource, 'class="buddy-mascot__head"'), separatedHeadPath);
  assert.match(componentSource, /class="buddy-mascot__left-ear"[\s\S]*class="buddy-mascot__right-ear"[\s\S]*class="buddy-mascot__head"/);
});

test("BuddyMascot keeps the sparkle above the head without entering the head layer", () => {
  assert.equal(extractPathData(componentSource, 'class="buddy-mascot__sparkle"'), elevatedSparklePath);
  assert.match(componentSource, /id="buddyMascotSparkleGold" cx="0" cy="-136" r="56"/);
  assert.match(componentSource, /class="buddy-mascot__body"[\s\S]*class="buddy-mascot__sparkle-wrap"/);
});

test("BuddyMascot supports idle, thinking, speaking, dragging, and tap animations", () => {
  assert.match(componentSource, /type BuddyMascotMood = "idle" \| "thinking" \| "speaking" \| "error";/);
  assert.match(componentSource, /dragging\?: boolean;/);
  assert.match(componentSource, /tapNonce\?: number;/);
  assert.match(componentSource, /buddy-mascot--idle/);
  assert.match(componentSource, /buddy-mascot--thinking/);
  assert.match(componentSource, /buddy-mascot--speaking/);
  assert.match(componentSource, /buddy-mascot--dragging/);
  assert.match(componentSource, /buddy-mascot--tap/);
  assert.match(componentSource, /watch\(\(\) => props\.tapNonce/);
});

test("BuddyMascot moves eye wrapper layers toward the pointer without replacing blink transforms", () => {
  assert.match(componentSource, /lookX\?: number;/);
  assert.match(componentSource, /lookY\?: number;/);
  assert.match(componentSource, /:style="eyeLookStyle"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--left"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--right"/);
  assert.match(componentSource, /--buddy-mascot-look-x/);
  assert.match(componentSource, /--buddy-mascot-look-y/);
  assert.match(componentSource, /const x = clampLookAxis\(props\.lookX\) \* 11;/);
  assert.match(componentSource, /const y = clampLookAxis\(props\.lookY\) \* 7;/);
  assert.match(
    componentSource,
    /\.buddy-mascot__look-eye\s*\{[\s\S]*transform:\s*translate\(var\(--buddy-mascot-look-x,\s*0px\),\s*var\(--buddy-mascot-look-y,\s*0px\)\);/,
  );
  assert.match(
    componentSource,
    /@keyframes buddy-mascot-blink[\s\S]*transform:\s*scaleY\(1\);[\s\S]*transform:\s*scaleY\(0\.08\);/,
  );
});

test("BuddyMascot changes the eyes into chevrons while dragging", () => {
  assert.match(componentSource, /d="M-104 52 L-64 82 L-104 112"/);
  assert.match(componentSource, /d="M104 52 L64 82 L104 112"/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__look-eye[\s\S]*transform:\s*translate\(0px,\s*0px\);/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__resting-eye[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__drag-eye[\s\S]*opacity:\s*1;/);
});

test("BuddyMascot gives the star idle sway and thinking pseudo-3D spin", () => {
  assert.match(componentSource, /@keyframes buddy-mascot-star-sway/);
  assert.match(componentSource, /@keyframes buddy-mascot-star-flip/);
  assert.match(componentSource, /scaleX\(0\.12\)/);
  assert.match(componentSource, /rotate\(18deg\)/);
  assert.match(componentSource, /filter:\s*brightness\(1\.35\)/);
});

test("BuddyMascot keeps the tail animated while thinking and speaking", () => {
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-thinking 760ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--speaking[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-speaking 430ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-thinking[\s\S]*rotate\(-8deg\)[\s\S]*rotate\(24deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-speaking[\s\S]*rotate\(-12deg\)[\s\S]*rotate\(28deg\)/);
});

test("BuddyMascot keeps the thinking body steady while ears, tail, and sparkle move", () => {
  assert.equal(extractCssBlock(componentSource, ".buddy-mascot--thinking .buddy-mascot__body").trim(), "");
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__sparkle-wrap[\s\S]*animation:\s*buddy-mascot-thinking-orbit 1\.6s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-think-left 860ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-think-right 860ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-thinking-orbit/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-thinking-body/);
});

test("BuddyMascot keeps speaking body motion visibly distinct", () => {
  assert.match(componentSource, /\.buddy-mascot--speaking[\s\S]*\.buddy-mascot__body[\s\S]*animation:\s*buddy-mascot-speaking-body 460ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-speaking-body[\s\S]*scaleX\(1\.06\) scaleY\(0\.95\)[\s\S]*scaleX\(0\.96\) scaleY\(1\.05\)/);
});

test("BuddyMascot makes idle tail and ear motion visible without changing body scale", () => {
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-sway 3\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-left 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-right 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-sway[\s\S]*rotate\(-7deg\)[\s\S]*rotate\(15deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-left[\s\S]*rotate\(-8deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-right[\s\S]*rotate\(8deg\)/);
});

test("BuddyMascot gives dragging a lightly taller body, tail, and ear response", () => {
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__body[\s\S]*animation:\s*buddy-mascot-drag-body 720ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-drag 420ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-left 360ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-right 360ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-drag-body[\s\S]*scaleX\(0\.96\) scaleY\(1\.04\)[\s\S]*scaleX\(0\.98\) scaleY\(1\.02\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-drag-body[\s\S]*rotate\(-5deg\)[\s\S]*rotate\(5deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-drag[\s\S]*rotate\(18deg\)[\s\S]*rotate\(-18deg\)/);
});

test("BuddyMascot blinks occasionally while idle", () => {
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__resting-eye[\s\S]*animation:\s*buddy-mascot-blink 7\.2s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-blink/);
  assert.match(componentSource, /92%\s*\{[\s\S]*scaleY\(0\.08\)/);
});

test("BuddyMascot keeps full animation effects even when reduced motion is enabled", () => {
  assert.doesNotMatch(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(componentSource, /animation:\s*none/);
  assert.doesNotMatch(componentSource, /transition:\s*none/);
});
