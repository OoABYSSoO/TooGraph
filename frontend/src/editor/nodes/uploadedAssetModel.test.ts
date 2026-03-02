import test from "node:test";
import assert from "node:assert/strict";

import {
  createUploadedAssetEnvelope,
  detectUploadedAssetTypeFromFileName,
  resolveUploadedAssetDescription,
  tryParseUploadedAssetEnvelope,
  resolveUploadedAssetLabel,
  resolveUploadedAssetSummary,
  resolveUploadedAssetTextPreview,
  type UploadedAssetEnvelope,
} from "./uploadedAssetModel.ts";

test("detectUploadedAssetTypeFromFileName matches legacy input upload type rules", () => {
  assert.equal(detectUploadedAssetTypeFromFileName("scene.png"), "image");
  assert.equal(detectUploadedAssetTypeFromFileName("voice.mp3"), "audio");
  assert.equal(detectUploadedAssetTypeFromFileName("demo.webm"), "video");
  assert.equal(detectUploadedAssetTypeFromFileName("notes.md"), "file");
  assert.equal(detectUploadedAssetTypeFromFileName("archive.bin"), "file");
});

test("tryParseUploadedAssetEnvelope accepts legacy uploaded file payloads", () => {
  const payload = JSON.stringify({
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 12,
    detectedType: "file",
    content: "hello world",
    encoding: "text",
  });

  assert.deepEqual(tryParseUploadedAssetEnvelope(payload), {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 12,
    detectedType: "file",
    content: "hello world",
    encoding: "text",
  });
  assert.equal(tryParseUploadedAssetEnvelope("{oops"), null);
  assert.equal(tryParseUploadedAssetEnvelope({ kind: "uploaded_file", name: 123 }), null);
});

test("uploaded asset presentation helpers preserve NodeCard display text", () => {
  const textAsset: UploadedAssetEnvelope = {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 1536,
    detectedType: "file",
    content: "a".repeat(3500),
    encoding: "text",
  };

  assert.equal(resolveUploadedAssetLabel("image"), "image");
  assert.equal(resolveUploadedAssetLabel("audio"), "audio clip");
  assert.equal(resolveUploadedAssetLabel("video"), "video");
  assert.equal(resolveUploadedAssetLabel("file"), "file");
  assert.equal(resolveUploadedAssetLabel(null), "file");
  assert.equal(resolveUploadedAssetSummary(textAsset), "text/plain · 2 KB");
  assert.equal(resolveUploadedAssetTextPreview(textAsset), "a".repeat(3000));
  assert.equal(resolveUploadedAssetDescription(textAsset, "file"), "Stored as file upload. text/plain · 2 KB");
});

test("uploaded asset description helper returns empty-state copy by target type", () => {
  assert.equal(resolveUploadedAssetSummary(null), "");
  assert.equal(resolveUploadedAssetTextPreview(null), "");
  assert.equal(
    resolveUploadedAssetDescription(null, "image"),
    "Upload a reference image for this workflow.",
  );
  assert.equal(
    resolveUploadedAssetDescription(null, "audio"),
    "Upload an audio clip that this workflow should read.",
  );
  assert.equal(
    resolveUploadedAssetDescription(null, "video"),
    "Upload a video asset that this workflow should inspect.",
  );
  assert.equal(resolveUploadedAssetDescription(null, "file"), "Upload a file to seed this workflow.");
  assert.equal(resolveUploadedAssetDescription(null, null), "Upload a file to seed this workflow.");
});

test("createUploadedAssetEnvelope keeps text-like files as inline text", async () => {
  const file = new File(["hello GraphiteUI"], "notes.txt", { type: "text/plain" });

  const envelope = await createUploadedAssetEnvelope(file);

  assert.deepEqual(envelope, {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: file.size,
    detectedType: "file",
    content: "hello GraphiteUI",
    encoding: "text",
  });
});

test("createUploadedAssetEnvelope serializes media uploads as data URLs", async () => {
  const file = new File([Uint8Array.from([1, 2, 3])], "preview.png", { type: "image/png" });

  const envelope = await createUploadedAssetEnvelope(file);

  assert.equal(envelope.kind, "uploaded_file");
  assert.equal(envelope.detectedType, "image");
  assert.equal(envelope.encoding, "data_url");
  assert.match(envelope.content, /^data:image\/png;base64,/);
});
