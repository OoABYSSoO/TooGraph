import test from "node:test";
import assert from "node:assert/strict";

import {
  createUploadedAssetEnvelope,
  detectUploadedAssetTypeFromFileName,
  tryParseUploadedAssetEnvelope,
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
