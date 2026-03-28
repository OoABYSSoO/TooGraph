import test from "node:test";
import assert from "node:assert/strict";

import {
  createUploadedAssetEnvelope,
  detectUploadedAssetTypeFromFileName,
  resolveUploadedAssetDescription,
  resolveUploadedAssetInputAccept,
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
  assert.equal(detectUploadedAssetTypeFromFileName("mobile-upload", "video/mp4"), "video");
  assert.equal(detectUploadedAssetTypeFromFileName("IMG_0001", "video/quicktime"), "video");
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
    localPath: "uploads/notes.txt",
    contentType: "text/plain",
    textPreview: "hello world",
    encoding: "local_path",
  });

  assert.deepEqual(tryParseUploadedAssetEnvelope(payload), {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 12,
    detectedType: "file",
    localPath: "uploads/notes.txt",
    contentType: "text/plain",
    textPreview: "hello world",
    encoding: "local_path",
  });
  assert.equal(tryParseUploadedAssetEnvelope("{oops"), null);
  assert.equal(tryParseUploadedAssetEnvelope({ kind: "uploaded_file", name: 123 }), null);
});

test("tryParseUploadedAssetEnvelope builds asset metadata for plain local paths", () => {
  assert.deepEqual(tryParseUploadedAssetEnvelope("uploads/reference.png", "image"), {
    kind: "uploaded_file",
    name: "reference.png",
    mimeType: "image/png",
    size: 0,
    detectedType: "image",
    localPath: "uploads/reference.png",
    contentType: "image/png",
    encoding: "local_path",
  });
  assert.equal(tryParseUploadedAssetEnvelope("uploads/reference.png"), null);
});

test("uploaded asset presentation helpers preserve NodeCard display text", () => {
  const textAsset: UploadedAssetEnvelope = {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 1536,
    detectedType: "file",
    localPath: "uploads/notes.txt",
    contentType: "text/plain",
    textPreview: "a".repeat(3500),
    encoding: "local_path",
  };

  assert.equal(resolveUploadedAssetLabel("image"), "image");
  assert.equal(resolveUploadedAssetLabel("audio"), "audio clip");
  assert.equal(resolveUploadedAssetLabel("video"), "video");
  assert.equal(resolveUploadedAssetLabel("file"), "file");
  assert.equal(resolveUploadedAssetLabel(null), "file");
  assert.match(resolveUploadedAssetInputAccept("video"), /video\/\*/);
  assert.match(resolveUploadedAssetInputAccept("video"), /\.mov/);
  assert.match(resolveUploadedAssetInputAccept("image"), /\.heic/);
  assert.match(resolveUploadedAssetInputAccept("file"), /image\/\*/);
  assert.match(resolveUploadedAssetInputAccept("file"), /video\/\*/);
  assert.match(resolveUploadedAssetInputAccept("file"), /application\/pdf/);
  assert.match(resolveUploadedAssetInputAccept("file"), /\.docx/);
  assert.match(resolveUploadedAssetInputAccept(null), /image\/\*/);
  assert.match(resolveUploadedAssetInputAccept(null), /video\/\*/);
  assert.match(resolveUploadedAssetInputAccept(null), /application\/pdf/);
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

test("createUploadedAssetEnvelope stores text-like files as local upload records with preview text", async () => {
  const file = new File(["hello GraphiteUI"], "notes.txt", { type: "text/plain" });

  const envelope = await createUploadedAssetEnvelope(file, async (uploadFile) => ({
    local_path: `uploads/${uploadFile.name}`,
    filename: uploadFile.name,
    content_type: uploadFile.type,
    size: uploadFile.size,
  }));

  assert.deepEqual(envelope, {
    kind: "uploaded_file",
    name: "notes.txt",
    mimeType: "text/plain",
    size: file.size,
    detectedType: "file",
    localPath: "uploads/notes.txt",
    contentType: "text/plain",
    textPreview: "hello GraphiteUI",
    encoding: "local_path",
  });
});

test("createUploadedAssetEnvelope stores binary documents as local upload records", async () => {
  const file = new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46])], "brief.pdf", { type: "application/pdf" });

  const envelope = await createUploadedAssetEnvelope(file, async (uploadFile) => ({
    local_path: `uploads/${uploadFile.name}`,
    filename: uploadFile.name,
    content_type: uploadFile.type,
    size: uploadFile.size,
  }));

  assert.equal(envelope.kind, "uploaded_file");
  assert.equal(envelope.detectedType, "file");
  assert.equal(envelope.encoding, "local_path");
  assert.equal(envelope.localPath, "uploads/brief.pdf");
  assert.equal("content" in envelope, false);
});

test("createUploadedAssetEnvelope stores media uploads as local upload records", async () => {
  const file = new File([Uint8Array.from([1, 2, 3])], "preview.png", { type: "image/png" });

  const envelope = await createUploadedAssetEnvelope(file, async (uploadFile) => ({
    local_path: `uploads/${uploadFile.name}`,
    filename: uploadFile.name,
    content_type: uploadFile.type,
    size: uploadFile.size,
  }));

  assert.equal(envelope.kind, "uploaded_file");
  assert.equal(envelope.detectedType, "image");
  assert.equal(envelope.encoding, "local_path");
  assert.equal(envelope.localPath, "uploads/preview.png");
  assert.equal("content" in envelope, false);
});

test("createUploadedAssetEnvelope detects mobile videos from MIME type when names lack extensions", async () => {
  const file = new File([Uint8Array.from([1, 2, 3])], "mobile-upload", { type: "video/mp4" });

  const envelope = await createUploadedAssetEnvelope(file, async (uploadFile) => ({
    local_path: `uploads/${uploadFile.name}`,
    filename: uploadFile.name,
    content_type: uploadFile.type,
    size: uploadFile.size,
  }));

  assert.equal(envelope.detectedType, "video");
  assert.equal(envelope.encoding, "local_path");
  assert.equal(envelope.localPath, "uploads/mobile-upload");
});
