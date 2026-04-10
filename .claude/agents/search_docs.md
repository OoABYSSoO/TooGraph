---
name: Search Docs
description: Search the local knowledge base and return concise matching references.
tools: []
graphite:
  skill_key: search_docs
  supported_value_types:
    - text
    - json
  side_effects:
    - knowledge_read
  input_schema:
    - key: query
      label: Query
      valueType: text
      required: true
      description: Natural-language search query.
  output_schema:
    - key: results
      label: Results
      valueType: json
      description: Matched knowledge records with title, summary, and source.
---
Search the local document knowledge base and return the most relevant references.
