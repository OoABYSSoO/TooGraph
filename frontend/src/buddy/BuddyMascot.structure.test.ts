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

function extractTailPoseBlock(source: string, poseClass: string) {
  const marker = `class="buddy-mascot__tail-pose buddy-mascot__tail-pose--${poseClass}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing tail pose marker: ${poseClass}`);
  const pathStartIndex = source.lastIndexOf("<path", markerIndex);
  assert.notEqual(pathStartIndex, -1, `Missing path start for tail pose: ${poseClass}`);
  const pathEndIndex = source.indexOf("</path>", markerIndex);
  assert.notEqual(pathEndIndex, -1, `Missing path end for tail pose: ${poseClass}`);
  return source.slice(pathStartIndex, pathEndIndex + "</path>".length);
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
  assert.match(componentSource, /class="buddy-mascot__tail buddy-mascot__tail-rig"/);
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
  assert.match(componentSource, /type BuddyMascotMotion = "idle" \| "roam" \| "hop";/);
  assert.match(componentSource, /type BuddyMascotFacing = "front" \| "left" \| "right";/);
  assert.match(componentSource, /dragging\?: boolean;/);
  assert.match(componentSource, /tapNonce\?: number;/);
  assert.match(componentSource, /motion\?: BuddyMascotMotion;/);
  assert.match(componentSource, /facing\?: BuddyMascotFacing;/);
  assert.match(componentSource, /buddy-mascot--idle/);
  assert.match(componentSource, /buddy-mascot--thinking/);
  assert.match(componentSource, /buddy-mascot--speaking/);
  assert.match(componentSource, /`buddy-mascot--motion-\$\{effectiveMotion\.value\}`/);
  assert.match(componentSource, /`buddy-mascot--facing-\$\{props\.facing\}`/);
  assert.match(componentSource, /buddy-mascot--dragging/);
  assert.match(componentSource, /buddy-mascot--tap/);
  assert.match(componentSource, /watch\(\(\) => props\.tapNonce/);
});

test("BuddyMascot exposes tail poses and directional part offsets without body mirroring", () => {
  assert.match(componentSource, /class="buddy-mascot__tail buddy-mascot__tail-rig"/);
  assert.match(componentSource, /class="buddy-mascot__tail-pose buddy-mascot__tail-pose--right"/);
  assert.match(componentSource, /class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-right"/);
  assert.match(componentSource, /class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-center"/);
  assert.match(componentSource, /class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-left"/);
  assert.match(componentSource, /class="buddy-mascot__tail-pose buddy-mascot__tail-pose--left"/);
  assert.match(componentSource, /class="buddy-mascot__body-turn"/);
  assert.match(componentSource, /\.buddy-mascot--facing-left\s*\{[\s\S]*--buddy-mascot-facing-eye-x:\s*-10px;[\s\S]*--buddy-mascot-left-ear-x:\s*-12px;[\s\S]*--buddy-mascot-right-ear-x:\s*-18px;/);
  assert.match(componentSource, /\.buddy-mascot--facing-right\s*\{[\s\S]*--buddy-mascot-facing-eye-x:\s*10px;[\s\S]*--buddy-mascot-left-ear-x:\s*18px;[\s\S]*--buddy-mascot-right-ear-x:\s*12px;/);
  assert.match(componentSource, /\.buddy-mascot--facing-left[\s\S]*\.buddy-mascot__tail-pose--left[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.buddy-mascot--facing-right[\s\S]*\.buddy-mascot__tail-pose--right[\s\S]*opacity:\s*1;/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--facing-left \.buddy-mascot__body-turn/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--facing-right \.buddy-mascot__body-turn/);
  assert.doesNotMatch(componentSource, /scaleX\(0\.92\) rotate/);
});

test("BuddyMascot draws every tail pose from the same hidden lower-body root", () => {
  const tailPoseMarkers = [
    'class="buddy-mascot__tail-pose buddy-mascot__tail-pose--right"',
    'class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-right"',
    'class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-center"',
    'class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-left"',
    'class="buddy-mascot__tail-pose buddy-mascot__tail-pose--left"',
  ];

  for (const marker of tailPoseMarkers) {
    assert.match(extractPathData(componentSource, marker), /^M0 176 C/);
  }
  assert.match(componentSource, /class="buddy-mascot__tail buddy-mascot__tail-rig"[\s\S]*class="buddy-mascot__body-turn"/);
});

test("BuddyMascot softens each tail pose with path morphing between five curve shapes", () => {
  const tailPoseClasses = ["right", "back-right", "back-center", "back-left", "left"];

  for (const poseClass of tailPoseClasses) {
    const pathBlock = extractTailPoseBlock(componentSource, poseClass);
    assert.match(pathBlock, /<animate\b/);
    assert.match(pathBlock, /attributeName="d"/);
    assert.match(pathBlock, /repeatCount="indefinite"/);
    assert.match(pathBlock, /calcMode="spline"/);
    assert.match(pathBlock, /keyTimes="0;0\.25;0\.5;0\.75;1"/);
    assert.match(pathBlock, /keySplines="[^"]+"/);

    const valuesMatch = pathBlock.match(/values="([^"]+)"/);
    assert.ok(valuesMatch, `Missing morph values for tail pose: ${poseClass}`);
    const morphPaths = valuesMatch[1].split(";").map((value) => normalizePathData(value));
    assert.equal(morphPaths.length, 5);
    assert.ok(morphPaths.every((value) => value.startsWith("M0 176 C")));
  }
});

test("BuddyMascot moves eye wrapper layers toward the pointer without replacing blink transforms", () => {
  assert.match(componentSource, /lookX\?: number;/);
  assert.match(componentSource, /lookY\?: number;/);
  assert.match(componentSource, /:style="eyeLookStyle"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--left"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--right"/);
  assert.match(componentSource, /--buddy-mascot-look-x/);
  assert.match(componentSource, /--buddy-mascot-look-y/);
  assert.match(componentSource, /cx="-62" cy="82"/);
  assert.match(componentSource, /cx="62" cy="82"/);
  assert.match(componentSource, /const x = clampLookAxis\(props\.lookX\) \* 12;/);
  assert.match(componentSource, /const y = clampLookAxis\(props\.lookY\) \* 7;/);
  assert.match(
    componentSource,
    /\.buddy-mascot__look-eye\s*\{[\s\S]*transform:\s*translate\(\s*calc\(var\(--buddy-mascot-look-x,\s*0px\) \+ var\(--buddy-mascot-facing-eye-x,\s*0px\)\),\s*calc\(var\(--buddy-mascot-look-y,\s*0px\) \+ var\(--buddy-mascot-facing-eye-y,\s*0px\)\)\s*\);/,
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

test("BuddyMascot removes the jump-turn spin motion completely", () => {
  assert.doesNotMatch(componentSource, /motion-spin/);
  assert.doesNotMatch(componentSource, /buddy-mascot-spin/);
  assert.doesNotMatch(componentSource, /tail-spin/);
  assert.doesNotMatch(componentSource, /ear-spin/);
  assert.doesNotMatch(componentSource, /look-spin/);
  assert.doesNotMatch(componentSource, /eye-spin/);
});

test("BuddyMascot keeps the tail animated while thinking and speaking", () => {
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-thinking 1\.45s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--speaking[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-speaking 1\.08s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-thinking[\s\S]*rotate\(-2deg\)[\s\S]*rotate\(7deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-speaking[\s\S]*rotate\(-3deg\)[\s\S]*rotate\(8deg\)/);
});

test("BuddyMascot keeps the thinking body steady while ears, tail, and sparkle move", () => {
  assert.equal(extractCssBlock(componentSource, ".buddy-mascot--thinking .buddy-mascot__body").trim(), "");
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__sparkle-wrap[\s\S]*animation:\s*buddy-mascot-thinking-orbit 1\.6s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-think-left 860ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-think-right 860ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-thinking-orbit/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-thinking-body/);
});

test("BuddyMascot keeps the body stable across idle, speaking, dragging, tap, and movement", () => {
  assert.doesNotMatch(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__body[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--speaking[\s\S]*\.buddy-mascot__body[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__body[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--tap[\s\S]*\.buddy-mascot__body[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--motion-roam[\s\S]*\.buddy-mascot__body-turn[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--motion-hop[\s\S]*\.buddy-mascot__body-turn[\s\S]*animation:/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-idle-body/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-speaking-body/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-drag-body/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-tap-body/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-roam-hop/);
});

test("BuddyMascot makes idle tail motion subtle so path morphing carries the expression", () => {
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-sway 7\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-left 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-right 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-sway[\s\S]*rotate\(-1deg\)[\s\S]*rotate\(2deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-left[\s\S]*rotate\(-8deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-right[\s\S]*rotate\(8deg\)/);
});

test("BuddyMascot gives dragging a subtle tail and ear response without body wobble", () => {
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-drag 1\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-left 360ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-right 360ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-drag[\s\S]*rotate\(4deg\)[\s\S]*rotate\(-4deg\)/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-drag-body/);
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
