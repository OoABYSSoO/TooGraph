---
name: web_search
description: Search the public web and return cited results for agent reasoning.
---

Use this skill when a workflow or companion agent needs current public web information. It prefers Tavily when `TAVILY_API_KEY` is configured and falls back to DuckDuckGo HTML search when no key is available.

Inputs:
- `query`: required public web search query.
- `max_results`: optional result count, default 5, capped at 20.
- `search_depth`: optional Tavily depth, one of `basic`, `advanced`, `fast`, or `ultra-fast`.
- `include_raw_content`: optional Tavily raw content flag.
- `fetch_pages`: optional flag. When true, fetches result pages and stores extracted readable text as local skill artifacts.
- `max_pages`: optional page fetch count, default 5, capped at 10.
- `max_chars_per_page`: optional extracted text cap per page, default 200000, capped at 1500000.

Outputs include `summary`, `context`, `results`, `citations`, and `source_documents`. Treat `context` as the agent-facing evidence block and cite URLs from `citations` in final answers. When `source_documents` contains `local_path` entries, those paths are relative to GraphiteUI's whitelisted skill artifact directory and can be opened by the Output viewer without sending the full page text back through the model.
