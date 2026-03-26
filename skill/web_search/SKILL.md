---
name: web_search
description: Search the public web and return final evidence context, source URLs, artifact paths, and errors for downstream graph nodes.
---

Use this skill when a workflow or companion agent needs current public web information, recent news, version details, price checks, external fact verification, or cited web evidence. It prefers Tavily when `TAVILY_API_KEY` is configured and falls back to DuckDuckGo HTML search when no key is available.

Input:
- `query`: required public web search query.

Outputs:
- `context`: final agent-facing evidence block.
- `source_urls`: final source URL list.
- `artifact_paths`: final local artifact path list for fetched readable pages.
- `errors`: final error list.

Treat `context` as evidence for a downstream summarizer or answer node, not as the final user-facing answer. When `artifact_paths` contains paths, those paths are relative to GraphiteUI's whitelisted skill artifact directory and can be opened by the Output viewer without sending the full page text back through the model.
