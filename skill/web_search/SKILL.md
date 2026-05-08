---
name: web_search
description: Search the public web and return successful source URLs, local readable page artifacts, and URL-specific errors for downstream graph nodes.
---

Use this skill when a workflow or companion agent needs current public web information, recent news, version details, price checks, external fact verification, or cited web evidence. It prefers Tavily when `TAVILY_API_KEY` is configured and falls back to DuckDuckGo HTML search when no key is available.

The skill asks the search provider for extra candidates, then keeps fetching candidates until it saves the target number of readable local documents or runs out of candidates. It first uses a fast HTTP fetch; if that fails or produces no readable text, it uses Playwright browser rendering as a fallback.

Lifecycle:
- `before_llm.py` adds the current local date to the skill-input planning context.
- `after_llm.py` receives the LLM-generated `query`, performs the search and page download, and returns structured outputs.

Input:
- `query`: required public web search query.

Outputs:
- `query`: actual query sent to the search provider.
- `source_urls`: final source URL list for successfully saved local source documents.
- `artifact_paths`: final local artifact path list for successfully fetched readable pages.
- `errors`: final URL-specific error list collected during search or page fetch.

Runtime requirements:
- Python package: `playwright`
- Browser runtime: `python -m playwright install chromium`

When `artifact_paths` contains paths, those paths are relative to GraphiteUI's whitelisted skill artifact directory and can be opened by the Output viewer. Downstream LLM nodes can receive the file state and read text documents into model context.
