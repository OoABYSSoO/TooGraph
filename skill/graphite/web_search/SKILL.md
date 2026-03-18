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

Outputs include `summary`, `context`, `results`, and `citations`. Treat `context` as the agent-facing evidence block and cite URLs from `citations` in final answers.
