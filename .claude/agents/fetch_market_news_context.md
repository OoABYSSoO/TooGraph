---
name: Fetch Market News Context
description: Fetch market news items to provide research context for downstream nodes.
tools: []
graphite:
  skill_key: fetch_market_news_context
  supported_value_types:
    - text
    - json
  side_effects:
    - network
  input_schema:
    - key: task_input
      label: Task Input
      valueType: text
      description: Research task or market question to guide the news fetch.
  output_schema:
    - key: rss_items
      label: RSS Items
      valueType: json
      description: Fetched market news records.
---
Collect relevant market news items that can support downstream creative research.
