---
name: Clean Market News
description: Normalize fetched market news into cleaned items and a text research context.
tools: []
graphite:
  skill_key: clean_market_news
  supported_value_types:
    - json
    - text
  side_effects:
    - none
  input_schema:
    - key: rss_items
      label: RSS Items
      valueType: json
      required: true
      description: Raw fetched market news records.
  output_schema:
    - key: clean_news_items
      label: Clean News Items
      valueType: json
      description: Normalized news items used by downstream research nodes.
    - key: news_context
      label: News Context
      valueType: text
      description: Concise text context distilled from cleaned news items.
---
Normalize raw market news into cleaned records and a concise text summary.
