---
name: Search Knowledge Base
description: Search a specified knowledge base folder and return grounded document snippets for downstream GraphiteUI workflows.
tools: []
graphite:
  skill_key: search_knowledge_base
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
      description: The user question or retrieval query to search for.
    - key: knowledge_base
      label: Knowledge Base
      valueType: text
      required: false
      description: Knowledge base folder name under the repository-level knowledge directory.
  output_schema:
    - key: knowledge_base
      label: Knowledge Base
      valueType: text
      description: The knowledge base that was searched.
    - key: results
      label: Results
      valueType: json
      description: Ranked retrieval results with titles, summaries, and sources.
    - key: context
      label: Context
      valueType: text
      description: Combined source excerpts for downstream answer generation.
---
Search the specified repository knowledge base and return concise retrieval results plus combined context text for downstream grounded answering.
