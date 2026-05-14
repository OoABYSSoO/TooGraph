import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "BuddyMascot.vue"), "utf8");
const publicCursorSource = readFileSync(resolve(currentDirectory, "../../public/buddy-cursor.svg"), "utf8");
const docsCursorSource = readFileSync(resolve(currentDirectory, "../../../docs/assets/buddy-cursor.svg"), "utf8");
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

function extractEyeCx(source: string, eyeClass: string) {
  const match = source.match(new RegExp(`class="${eyeClass}"[^>]*cx="(-?\\d+)"`));
  assert.ok(match, `Missing eye center for ${eyeClass}`);
  return Number.parseInt(match[1], 10);
}

function extractCssPxVariable(block: string, variableName: string) {
  const match = block.match(new RegExp(`${variableName}:\\s*(-?\\d+)px;`));
  assert.ok(match, `Missing CSS variable ${variableName}`);
  return Number.parseInt(match[1], 10);
}

function countMatches(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}

function extractFunctionBlock(source: string, functionName: string) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Missing function body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  assert.fail(`Unclosed function ${functionName}`);
}

const teardropLeftEarPath = "M-146-143 C-114-132-82-101-55-61 C-60-24-84 25-124 63 C-158 95-190 53-168-4 C-174-52-164-106-146-143Z";
const teardropRightEarPath = "M146-143 C114-132 82-101 55-61 C60-24 84 25 124 63 C158 95 190 53 168-4 C174-52 164-106 146-143Z";
const separatedHeadPath =
  "M-55-61 C-25-66 25-66 55-61 C90-61 130-43 168-4 C196 22 214 66 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 66-196 22-168-4 C-130-43-90-61-55-61Z";
const elevatedSparklePath =
  "M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z";
const cursorSparklePath =
  "M0-184 C14-147 33-107 52-78 C27-77 13-66 0-48 C-13-66 -27-77 -52-78 C-33-107 -14-147 0-184Z";

test("BuddyMascot renders the mascot as inline SVG animation parts", () => {
  assert.match(componentSource, /<svg[\s\S]*class="buddy-mascot__svg"/);
  assert.match(componentSource, /viewBox="-320 -180 640 560"/);
  assert.match(componentSource, /id="buddyMascotSoftness" x="-340" y="-210" width="680" height="640"/);
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
  assert.match(componentSource, new RegExp(`const SPARKLE_STAR_PATH = "${elevatedSparklePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(componentSource, /class="buddy-mascot__sparkle"[\s\S]*:d="sparklePath"/);
  assert.match(componentSource, /id="buddyMascotSparkleGold" cx="0" cy="-136" r="56"/);
  assert.match(componentSource, /class="buddy-mascot__body"[\s\S]*class="buddy-mascot__sparkle-wrap"/);
});

test("BuddyMascot morphs the head sparkle into the selected virtual cursor shape", () => {
  assert.match(componentSource, /virtualCursor\?: boolean;/);
  assert.match(componentSource, /hideSparkle\?: boolean;/);
  assert.match(componentSource, /v-show="!props\.hideSparkle"/);
  assert.match(componentSource, /SPARKLE_STAR_PATH/);
  assert.match(componentSource, /SPARKLE_CURSOR_PATH/);
  assert.match(componentSource, /const sparklePath = ref<string>\(SPARKLE_STAR_PATH\);/);
  assert.match(componentSource, /ref="sparkleAnimateElement"/);
  assert.match(componentSource, /:d="sparklePath"/);
  assert.match(componentSource, /v-if="sparkleMorphAnimation"/);
  assert.match(componentSource, /sparkleAnimateElement\.value\?\.beginElement\(\);/);
  assert.match(componentSource, /buddy-mascot--virtual-cursor/);
  assert.match(componentSource, new RegExp(cursorSparklePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("BuddyMascot keeps the transformed virtual cursor visible instead of fading it out", () => {
  const virtualCursorSparkleBlock = extractCssBlock(
    componentSource,
    ".buddy-mascot.buddy-mascot--virtual-cursor .buddy-mascot__sparkle-wrap",
  );
  const virtualCursorSparkleShapeBlock = extractCssBlock(
    componentSource,
    ".buddy-mascot.buddy-mascot--virtual-cursor .buddy-mascot__sparkle",
  );
  assert.match(componentSource, /buddy-mascot-cursor-ready/);
  assert.doesNotMatch(componentSource, /buddy-mascot-cursor-depart/);
  assert.doesNotMatch(virtualCursorSparkleBlock, /opacity:\s*0;/);
  assert.match(virtualCursorSparkleShapeBlock, /transform:\s*translateY\(-2px\) rotate\(-14deg\) scale\(1\.04\);/);
});

test("BuddyMascot gives the transformed virtual cursor the same black outline as the standalone asset", () => {
  const virtualCursorSparkleBlock = extractCssBlock(
    componentSource,
    ".buddy-mascot.buddy-mascot--virtual-cursor .buddy-mascot__sparkle",
  );
  assert.match(virtualCursorSparkleBlock, /stroke:\s*#171818;/);
  assert.match(virtualCursorSparkleBlock, /stroke-width:\s*16px;/);
  assert.match(virtualCursorSparkleBlock, /paint-order:\s*stroke fill;/);
  assert.match(publicCursorSource, /stroke="#171818"/);
  assert.match(docsCursorSource, /stroke="#171818"/);
});

test("Buddy cursor assets reuse the mascot sparkle gold gradient", () => {
  assert.match(componentSource, /id="buddyMascotSparkleGold" cx="0" cy="-136" r="56" gradientUnits="userSpaceOnUse"/);
  for (const source of [publicCursorSource, docsCursorSource]) {
    assert.match(source, /id="buddyCursorGold" cx="0" cy="-24" r="56" gradientUnits="userSpaceOnUse"/);
    assert.match(source, /stop-color="#f2c968"/);
    assert.match(source, /stop-color="#dfad50"/);
    assert.match(source, /stop-color="#c89136"/);
    assert.doesNotMatch(source, /stop-color="#ffe08a"/);
    assert.doesNotMatch(source, /stop-color="#e4b65b"/);
    assert.doesNotMatch(source, /stop-color="#c68b32"/);
  }
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
  const resolveTailSideForFacingFunction = extractFunctionBlock(componentSource, "resolveTailSideForFacing");
  assert.match(componentSource, /class="buddy-mascot__tail-root"[\s\S]*class="buddy-mascot__tail buddy-mascot__tail-rig"/);
  assert.match(componentSource, /class="buddy-mascot__tail buddy-mascot__tail-rig"/);
  assert.equal(countMatches(componentSource, /class="buddy-mascot__tail-pose"/g), 1);
  assert.match(componentSource, /class="buddy-mascot__tail-pose"[\s\S]*:d="tailBasePath"/);
  assert.match(componentSource, /:d="tailBasePath"/);
  assert.match(componentSource, /v-if="tailSwingAnimation"/);
  assert.match(componentSource, /:key="tailSwingAnimation\.key"/);
  assert.match(componentSource, /:values="tailSwingAnimation\.values"/);
  assert.match(componentSource, /:dur="`\$\{tailSwingAnimation\.durationMs\}ms`"/);
  assert.match(componentSource, /class="buddy-mascot__body-turn"/);
  assert.match(componentSource, /\.buddy-mascot\s*\{[\s\S]*--buddy-mascot-tail-root-x:\s*0px;/);
  assert.match(componentSource, /\.buddy-mascot__tail-root\s*\{[\s\S]*transform:\s*translateX\(var\(--buddy-mascot-tail-root-x\)\);[\s\S]*transition:\s*transform 180ms ease;/);
  assert.match(componentSource, /\.buddy-mascot--facing-left\s*\{[\s\S]*--buddy-mascot-tail-root-x:\s*12px;[\s\S]*--buddy-mascot-left-eye-facing-x:\s*-70px;[\s\S]*--buddy-mascot-right-eye-facing-x:\s*-110px;[\s\S]*--buddy-mascot-left-ear-x:\s*18px;[\s\S]*--buddy-mascot-right-ear-x:\s*12px;/);
  assert.match(componentSource, /\.buddy-mascot--facing-right\s*\{[\s\S]*--buddy-mascot-tail-root-x:\s*-12px;[\s\S]*--buddy-mascot-left-eye-facing-x:\s*110px;[\s\S]*--buddy-mascot-right-eye-facing-x:\s*70px;[\s\S]*--buddy-mascot-left-ear-x:\s*-12px;[\s\S]*--buddy-mascot-right-ear-x:\s*-18px;/);
  assert.match(componentSource, /function resolveTailSideForFacing\(facing: BuddyMascotFacing\): TailSide/);
  assert.match(resolveTailSideForFacingFunction, /if \(facing === "left"\) \{[\s\S]*return "right";[\s\S]*if \(facing === "right"\) \{[\s\S]*return "left";/);
  assert.match(componentSource, /\.buddy-mascot__tail-pose\s*\{[\s\S]*opacity:\s*1;/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--facing-left \.buddy-mascot__body-turn/);
  assert.doesNotMatch(componentSource, /\.buddy-mascot--facing-right \.buddy-mascot__body-turn/);
  assert.doesNotMatch(componentSource, /buddy-mascot__tail-pose--right/);
  assert.doesNotMatch(componentSource, /buddy-mascot__tail-pose--left/);
  assert.doesNotMatch(componentSource, /buddy-mascot__tail-pose--front-swing/);
  assert.doesNotMatch(componentSource, /buddy-mascot-front-tail-right/);
  assert.doesNotMatch(componentSource, /buddy-mascot-front-tail-left/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-front-tail/);
  assert.doesNotMatch(componentSource, /scaleX\(0\.92\) rotate/);
});

test("BuddyMascot changes tail side after a random idle dwell instead of continuously swinging", () => {
  assert.match(componentSource, /type TailSide = "left" \| "right";/);
  assert.match(componentSource, /const TAIL_IDLE_SWITCH_DURATION_MS = 1000;/);
  assert.match(componentSource, /const TAIL_IDLE_MIN_DWELL_MS = 5200;/);
  assert.match(componentSource, /const TAIL_IDLE_MAX_DWELL_MS = 9000;/);
  assert.match(componentSource, /import \{ computed, nextTick, onBeforeUnmount, ref, watch \} from "vue";/);
  assert.match(componentSource, /ref="tailAnimateElement"/);
  assert.match(componentSource, /const tailBasePath = ref<string>\(TAIL_POSE_PATHS\.right\);/);
  assert.match(componentSource, /const tailSide = ref<TailSide>\("right"\);/);
  assert.match(componentSource, /const tailSwingAnimation = ref<\{ key: number; values: string; durationMs: number; keyTimes: string; keySplines: string \} \| null>\(null\);/);
  assert.match(componentSource, /const tailAnimateElement = ref<SVGAnimationElement \| null>\(null\);/);
  assert.match(componentSource, /watch\(\[effectiveMood, \(\) => props\.facing, \(\) => props\.dragging\], syncTailTarget, \{ immediate: true \}\);/);
  assert.match(componentSource, /function scheduleIdleTailSideSwitch\(\)/);
  assert.match(componentSource, /randomBetween\(TAIL_IDLE_MIN_DWELL_MS, TAIL_IDLE_MAX_DWELL_MS\)/);
  assert.match(componentSource, /tailSide\.value === "right" \? "left" : "right"/);
  assert.match(componentSource, /function transitionTailTo\(targetSide: TailSide, durationMs = TAIL_IDLE_SWITCH_DURATION_MS, forceSwitch = false\)/);
  assert.match(componentSource, /tailSwingAnimation\.value = \{[\s\S]*key: tailAnimationKey,[\s\S]*values: buildTailPoseValues\(route\),[\s\S]*durationMs,[\s\S]*keyTimes: buildTailKeyTimes\(route\.length\),[\s\S]*keySplines: buildTailKeySplines\(route\.length\),[\s\S]*\};/);
  assert.match(componentSource, /void nextTick\(\(\) => \{[\s\S]*tailAnimateElement\.value\?\.beginElement\(\);[\s\S]*\}\);/);
  assert.match(componentSource, /tailTransitionTimerId = window\.setTimeout\(\(\) => \{[\s\S]*tailBasePath\.value = TAIL_POSE_PATHS\[targetSide\];[\s\S]*tailSide\.value = targetSide;[\s\S]*\}, durationMs\);/);
  assert.match(componentSource, /function buildTailTransitionValues\(fromSide: TailSide, toSide: TailSide\)/);
  assert.match(componentSource, /TAIL_TRANSITION_PATHS\.rightToLeft/);
  assert.match(componentSource, /TAIL_TRANSITION_PATHS\.leftToRight/);
});

test("BuddyMascot accelerates tail correction when facing changes without snapping", () => {
  assert.match(componentSource, /const TAIL_FACING_SWITCH_DURATION_MS = 320;/);
  assert.match(componentSource, /:dur="`\$\{tailSwingAnimation\.durationMs\}ms`"/);
  assert.match(componentSource, /:keyTimes="tailSwingAnimation\.keyTimes"/);
  assert.match(componentSource, /:keySplines="tailSwingAnimation\.keySplines"/);
  assert.match(componentSource, /let previousFacing: BuddyMascotFacing = props\.facing;/);
  assert.match(componentSource, /const crossedLateralFacing = isOppositeSideFacing\(previousFacing, props\.facing\);[\s\S]*previousFacing = props\.facing;/);
  assert.match(componentSource, /if \(props\.facing !== "front"\) \{[\s\S]*transitionTailTo\(targetSide, TAIL_FACING_SWITCH_DURATION_MS, crossedLateralFacing\);[\s\S]*return;/);
  assert.match(componentSource, /transitionTailTo\(tailSide\.value === "right" \? "left" : "right", TAIL_IDLE_SWITCH_DURATION_MS\);/);
  assert.match(componentSource, /type TailPose = \(typeof TAIL_POSE_ORDER\)\[number\];/);
  assert.match(componentSource, /const TAIL_POSE_ORDER = \["right", "backRight", "backCenter", "backLeft", "left"\] as const;/);
  assert.match(componentSource, /const startPose = tailSwingAnimation\.value \? estimateCurrentTailPose\(\) : poseFromSide\(tailSide\.value\);/);
  assert.match(componentSource, /if \(!forceSwitch && targetSide === tailSide\.value && startPose === poseFromSide\(targetSide\)\)/);
  assert.match(componentSource, /tailBasePath\.value = TAIL_POSE_PATHS\[startPose\];/);
  assert.match(componentSource, /function estimateCurrentTailPose\(\): TailPose/);
  assert.match(componentSource, /Math\.round\(progress \* \(route\.length - 1\)\)/);
  assert.match(componentSource, /function buildTailTransitionPoseRoute\(fromPose: TailPose, toSide: TailSide\)/);
  assert.match(componentSource, /function buildTailKeyTimes\(poseCount: number\)/);
  assert.match(componentSource, /function buildTailKeySplines\(poseCount: number\)/);
  assert.match(componentSource, /function isOppositeSideFacing\(previous: BuddyMascotFacing, next: BuddyMascotFacing\)/);
  assert.match(componentSource, /return \(\s*previous === "left" && next === "right"\s*\) \|\| \(\s*previous === "right" && next === "left"\s*\);/);
});

test("BuddyMascot switches the front tail side once from the previous lateral facing", () => {
  const resolveTailSideForFacingFunction = extractFunctionBlock(componentSource, "resolveTailSideForFacing");
  const resolveFrontTailSideFromPreviousFacingFunction = extractFunctionBlock(componentSource, "resolveFrontTailSideFromPreviousFacing");
  assert.match(resolveTailSideForFacingFunction, /if \(facing === "left"\) \{[\s\S]*return "right";[\s\S]*if \(facing === "right"\) \{[\s\S]*return "left";/);
  assert.match(componentSource, /const enteredFrontFromLateral = props\.facing === "front" && isLateralFacing\(previousFacing\);/);
  assert.match(componentSource, /const targetSide = enteredFrontFromLateral\s*\?\s*resolveFrontTailSideFromPreviousFacing\(previousFacing\)\s*:\s*resolveTailSideForFacing\(props\.facing\);/);
  assert.match(componentSource, /if \(enteredFrontFromLateral\) \{[\s\S]*transitionTailTo\(targetSide, TAIL_FACING_SWITCH_DURATION_MS, true\);[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /function resolveFrontTailSideFromPreviousFacing\(facing: BuddyMascotFacing\): TailSide/);
  assert.match(resolveFrontTailSideFromPreviousFacingFunction, /if \(facing === "left"\) \{[\s\S]*return "left";[\s\S]*if \(facing === "right"\) \{[\s\S]*return "right";/);
  assert.match(componentSource, /function isLateralFacing\(facing: BuddyMascotFacing\)/);
  assert.match(componentSource, /return facing === "left" \|\| facing === "right";/);
});

test("BuddyMascot keeps directional eyes readable while shifting them toward the facing side", () => {
  const frontLeftCx = extractEyeCx(componentSource, "buddy-mascot__resting-eye buddy-mascot__resting-eye--left");
  const frontRightCx = extractEyeCx(componentSource, "buddy-mascot__resting-eye buddy-mascot__resting-eye--right");
  const frontCenter = (frontLeftCx + frontRightCx) / 2;
  const frontDistance = Math.abs(frontRightCx - frontLeftCx);
  const leftBlock = extractCssBlock(componentSource, ".buddy-mascot--facing-left");
  const rightBlock = extractCssBlock(componentSource, ".buddy-mascot--facing-right");

  const facingLeftEyeCenters = [
    frontLeftCx + extractCssPxVariable(leftBlock, "--buddy-mascot-left-eye-facing-x"),
    frontRightCx + extractCssPxVariable(leftBlock, "--buddy-mascot-right-eye-facing-x"),
  ];
  const facingRightEyeCenters = [
    frontLeftCx + extractCssPxVariable(rightBlock, "--buddy-mascot-left-eye-facing-x"),
    frontRightCx + extractCssPxVariable(rightBlock, "--buddy-mascot-right-eye-facing-x"),
  ];

  assert.equal(frontDistance, 160);
  assert.equal(Math.abs(facingLeftEyeCenters[1] - facingLeftEyeCenters[0]), 120);
  assert.equal(Math.abs(facingRightEyeCenters[1] - facingRightEyeCenters[0]), 120);
  assert.equal((facingLeftEyeCenters[0] + facingLeftEyeCenters[1]) / 2, -90);
  assert.equal((facingRightEyeCenters[0] + facingRightEyeCenters[1]) / 2, 90);
  assert.ok((facingLeftEyeCenters[0] + facingLeftEyeCenters[1]) / 2 < frontCenter);
  assert.ok((facingRightEyeCenters[0] + facingRightEyeCenters[1]) / 2 > frontCenter);
});

test("BuddyMascot keeps one dynamic tail path rooted under the body", () => {
  assert.equal(countMatches(componentSource, /class="buddy-mascot__tail-pose"/g), 1);
  assert.match(componentSource, /const TAIL_POSE_PATHS = \{[\s\S]*right:\s*"M0 176 C54[\s\S]*backRight:\s*"M0 176 C36[\s\S]*backCenter:\s*"M0 176 C-24[\s\S]*backLeft:\s*"M0 176 C-36[\s\S]*left:\s*"M0 176 C-54/);
  assert.match(componentSource, /class="buddy-mascot__tail buddy-mascot__tail-rig"[\s\S]*class="buddy-mascot__body-turn"/);
});

test("BuddyMascot swings the single tail through back poses when changing sides", () => {
  assert.match(componentSource, /const TAIL_TRANSITION_PATHS = \{[\s\S]*rightToLeft:\s*\[[\s\S]*TAIL_POSE_PATHS\.right,[\s\S]*TAIL_POSE_PATHS\.backRight,[\s\S]*TAIL_POSE_PATHS\.backCenter,[\s\S]*TAIL_POSE_PATHS\.backLeft,[\s\S]*TAIL_POSE_PATHS\.left,[\s\S]*\]/);
  assert.match(componentSource, /leftToRight:\s*\[[\s\S]*TAIL_POSE_PATHS\.left,[\s\S]*TAIL_POSE_PATHS\.backLeft,[\s\S]*TAIL_POSE_PATHS\.backCenter,[\s\S]*TAIL_POSE_PATHS\.backRight,[\s\S]*TAIL_POSE_PATHS\.right,[\s\S]*\]/);
  assert.match(componentSource, /function buildTailTransitionValues\(fromSide: TailSide, toSide: TailSide\)[\s\S]*return paths\.join\(";"\);/);
});

test("BuddyMascot keeps tail curve breathing after large side transitions", () => {
  assert.match(componentSource, /const TAIL_CURVE_MICRO_DURATION_MS = 6800;/);
  assert.match(componentSource, /const TAIL_CURVE_MICRO_PATHS = \{[\s\S]*right:\s*\[[\s\S]*TAIL_POSE_PATHS\.right,[\s\S]*left:\s*\[[\s\S]*TAIL_POSE_PATHS\.left,/);
  assert.match(componentSource, /"M0 176 C72 234 98 142 158 154 C222 166 230 96 260 80 C274 64 286 54 292 58"/);
  assert.match(componentSource, /"M0 176 C70 148 124 122 174 104 C218 86 252 70 286 58 C288 58 290 58 292 58"/);
  assert.match(componentSource, /"M0 176 C34 214 124 190 154 164 C196 130 244 122 260 86 C270 72 272 58 278 54"/);
  assert.match(componentSource, /const tailCurveAnimationValues = computed\(\(\) => buildTailCurveMicroValues\(tailSide\.value\)\);/);
  assert.match(componentSource, /v-if="!tailSwingAnimation"/);
  assert.match(componentSource, /:key="`tail-curve-\$\{tailSide\}`"/);
  assert.match(componentSource, /repeatCount="indefinite"/);
  assert.match(componentSource, /:dur="`\$\{TAIL_CURVE_MICRO_DURATION_MS\}ms`"/);
  assert.match(componentSource, /:values="tailCurveAnimationValues"/);
  assert.match(componentSource, /keyTimes="0;0\.125;0\.25;0\.375;0\.5;0\.625;0\.75;0\.875;1"/);
  assert.match(componentSource, /keySplines="0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1;0\.42 0 0\.58 1"/);
  assert.match(componentSource, /function buildTailCurveMicroValues\(side: TailSide\)/);
  assert.match(componentSource, /const route = TAIL_CURVE_MICRO_PATHS\[side\];[\s\S]*return \[route\[0\], route\[1\], route\[2\], route\[3\], route\[4\], route\[3\], route\[2\], route\[1\], route\[0\]\]\.join\(";"\);/);
});

test("BuddyMascot moves eye wrapper layers toward the pointer without replacing blink transforms", () => {
  assert.match(componentSource, /lookX\?: number;/);
  assert.match(componentSource, /lookY\?: number;/);
  assert.match(componentSource, /:style="eyeLookStyle"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--left"/);
  assert.match(componentSource, /class="buddy-mascot__look-eye buddy-mascot__look-eye--right"/);
  assert.match(componentSource, /--buddy-mascot-look-x/);
  assert.match(componentSource, /--buddy-mascot-look-y/);
  assert.match(componentSource, /cx="-80" cy="82"/);
  assert.match(componentSource, /cx="80" cy="82"/);
  assert.match(componentSource, /const shouldTrackPointer = props\.facing === "front";/);
  assert.match(componentSource, /const x = shouldTrackPointer \? clampLookAxis\(props\.lookX\) \* 16 : 0;/);
  assert.match(componentSource, /const y = shouldTrackPointer \? clampLookAxis\(props\.lookY\) \* 10 : 0;/);
  assert.match(
    componentSource,
    /\.buddy-mascot__look-eye--left\s*\{[\s\S]*transform:\s*translate\(\s*calc\(var\(--buddy-mascot-look-x,\s*0px\) \+ var\(--buddy-mascot-left-eye-facing-x,\s*0px\)\),\s*calc\(var\(--buddy-mascot-look-y,\s*0px\) \+ var\(--buddy-mascot-eye-facing-y,\s*0px\)\)\s*\);/,
  );
  assert.match(
    componentSource,
    /\.buddy-mascot__look-eye--right\s*\{[\s\S]*transform:\s*translate\(\s*calc\(var\(--buddy-mascot-look-x,\s*0px\) \+ var\(--buddy-mascot-right-eye-facing-x,\s*0px\)\),\s*calc\(var\(--buddy-mascot-look-y,\s*0px\) \+ var\(--buddy-mascot-eye-facing-y,\s*0px\)\)\s*\);/,
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

test("BuddyMascot keeps the body stable except for small speaking, tap, and drag motion", () => {
  assert.equal(extractCssBlock(componentSource, ".buddy-mascot--idle .buddy-mascot__body").trim(), "");
  assert.equal(extractCssBlock(componentSource, ".buddy-mascot--motion-roam .buddy-mascot__body-turn").trim(), "");
  assert.equal(extractCssBlock(componentSource, ".buddy-mascot--motion-hop .buddy-mascot__body-turn").trim(), "");
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-idle-body/);
  assert.doesNotMatch(componentSource, /@keyframes buddy-mascot-roam-hop/);
  assert.match(extractCssBlock(componentSource, ".buddy-mascot--speaking .buddy-mascot__body-turn"), /animation:\s*buddy-mascot-speaking-hop 1\.04s ease-in-out infinite;/);
  assert.match(extractCssBlock(componentSource, ".buddy-mascot--speaking .buddy-mascot__body"), /animation:\s*buddy-mascot-speaking-body-squash 1\.04s ease-in-out infinite;/);
  assert.match(extractCssBlock(componentSource, ".buddy-mascot--dragging .buddy-mascot__body-turn"), /animation:\s*buddy-mascot-drag-body-wobble 860ms ease-in-out infinite;/);
  assert.match(extractCssBlock(componentSource, ".buddy-mascot--tap .buddy-mascot__body-turn"), /animation:\s*buddy-mascot-tap-hop 520ms ease-out both;/);
  assert.match(extractCssBlock(componentSource, ".buddy-mascot--tap .buddy-mascot__body"), /animation:\s*buddy-mascot-tap-body-squash 520ms ease-out both;/);
  assert.match(componentSource, /@keyframes buddy-mascot-speaking-hop[\s\S]*translateY\(-5px\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-speaking-body-squash[\s\S]*scale\(1\.025,\s*0\.975\)[\s\S]*scale\(0\.982,\s*1\.025\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-drag-body-wobble[\s\S]*rotate\(-3deg\)[\s\S]*rotate\(3deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tap-hop[\s\S]*translateY\(-10px\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tap-body-squash[\s\S]*scale\(1\.04,\s*0\.96\)[\s\S]*scale\(0\.97,\s*1\.04\)/);
});

test("BuddyMascot keeps idle tail sway slower than thinking with the same amplitude", () => {
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-sway 1\.8s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-left 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--idle[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-idle-right 4\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--thinking[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-thinking 1\.45s ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-sway[\s\S]*rotate\(-2deg\)[\s\S]*rotate\(7deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-thinking[\s\S]*rotate\(-2deg\)[\s\S]*rotate\(7deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-left[\s\S]*rotate\(-8deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-ear-idle-right[\s\S]*rotate\(8deg\)/);
});

test("BuddyMascot gives dragging a subtle tail, ear, and body response", () => {
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__tail[\s\S]*animation:\s*buddy-mascot-tail-drag 1\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__body-turn[\s\S]*animation:\s*buddy-mascot-drag-body-wobble 860ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__left-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-left 360ms ease-in-out infinite;/);
  assert.match(componentSource, /\.buddy-mascot--dragging[\s\S]*\.buddy-mascot__right-ear[\s\S]*animation:\s*buddy-mascot-ear-drag-right 360ms ease-in-out infinite;/);
  assert.match(componentSource, /@keyframes buddy-mascot-tail-drag[\s\S]*rotate\(4deg\)[\s\S]*rotate\(-4deg\)/);
  assert.match(componentSource, /@keyframes buddy-mascot-drag-body-wobble[\s\S]*rotate\(-3deg\)[\s\S]*rotate\(3deg\)/);
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
