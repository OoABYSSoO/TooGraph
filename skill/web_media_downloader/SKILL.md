---
name: web_media_downloader
description: Download authorized web-hosted media and return local GraphiteUI artifact paths.
---

Use this skill when a workflow or companion agent needs to download authorized media from web pages or direct URLs.

Scope:
- The skill package is self-contained in `skill/web_media_downloader/`.
- Do not modify GraphiteUI backend code, databases, settings, or other services to run it.
- Use the runtime output as the contract: downloaded files are written under GraphiteUI's skill artifact directory and returned as `local_path` values.

Allowed use:
- Public or user-authorized images, videos, audio, galleries, thumbnails, article media, and direct media URLs.
- Dynamic pages can opt into Python Playwright discovery with `use_playwright` when Playwright is installed in the runtime environment.
- Video platform pages can opt into `yt-dlp` with `use_ytdlp` when the executable is available.

Do not use this skill to bypass DRM, paywalls, login gates, access controls, private content, or site restrictions. If authorization is unclear, ask for confirmation before invoking it.

Inputs:
- `urls`: required URL, newline-separated URLs, comma-separated URLs, or JSON array.
- `media_types`: optional `image`, `video`, `audio`, or `all`.
- `max_items`: optional cap, default 100.
- `discover_only`: optional true/false; returns URL records without writing downloads.
- `use_playwright`: optional true/false; browser-rendered discovery fallback.
- `use_ytdlp`: optional true/false; yt-dlp fallback for supported media pages.

Outputs:
- `downloaded_files`: JSON array. Each item contains `url`, `kind`, `filename`, `local_path`, `size`, and `content_type`.
- `paths_file`: artifact reference for `downloaded_paths.txt`, one local path per line.
- `manifest_file`: artifact reference for `manifest.jsonl`.
- `media_items`: discovered URL records for review and debugging.

Final answers should return local paths, not raw media bytes. For large batches, return the `paths_file.local_path`, `downloaded_count`, and any warnings.
