---
name: game-ad-research-collector
description: Use when a GraphiteUI agent needs to collect game-market RSS context, build public ad-library search records, optionally discover/download public ad videos, and return local artifact paths.
---

# Game Ad Research Collector

Use this skill before creative-strategy, script, storyboard, or video-prompt agents that need current game-market inputs.

## Inputs

- `genre`: required game category, for example `SLG`, `RPG`, `puzzle`, or `4X strategy`.
- `search_terms`: optional newline/comma/JSON array terms. If omitted, the skill uses `genre`.
- `country`, `days_back`, `top_fetch_per_term`: optional ad-library search controls.
- `feed_urls`: optional RSS/Atom feeds. If omitted, public game-industry feeds are used.
- `enable_rss`, `enable_ads`, `use_playwright`: string booleans.

## Outputs

- `rss_items`: article records with title, URL, summary, publish date, and local markdown document when fetched.
- `ad_items`: public ad-library search records with search URL, discovered video URLs, local videos, and warnings.
- `downloaded_files`: local artifact records suitable for Output document preview and agent video analysis.
- `source_documents`: local markdown/json artifacts for provenance and downstream inspection.

The skill writes all generated files under the GraphiteUI skill artifact directory and returns `local_path` values only. It does not require backend changes.
