---
name: Search Knowledge Base
description: Search a knowledge base and return grounded context for the agent to reason over.
tools: []
graphite:
  skill_key: search_knowledge_base
  supported_value_types:
    - text
    - knowledge_base
  side_effects:
    - knowledge_read
  input_schema:
    - key: query
      label: Query
      valueType: text
      required: true
      description: Search query or question to retrieve relevant documents.
    - key: knowledge_base
      label: Knowledge Base
      valueType: knowledge_base
      required: false
      description: Stable knowledge base id to search.
    - key: limit
      label: Result Limit
      valueType: text
      required: false
      description: Maximum number of retrieved passages to include.
  output_schema:
    - key: knowledge_base
      label: Knowledge Base
      valueType: text
      description: Resolved knowledge base id used for retrieval.
    - key: query
      label: Query
      valueType: text
      description: Final query string used for retrieval.
    - key: result_count
      label: Result Count
      valueType: text
      description: Number of matched passages returned by the search.
    - key: context
      label: Context
      valueType: text
      description: Ranked grounded excerpts formatted for direct agent reasoning.
    - key: results
      label: Results
      valueType: json
      description: Structured retrieval results with section, url, summary, and score.
    - key: citations
      label: Citations
      valueType: json
      description: Compact source list suitable for run detail and answer citations.
---
Search a formal indexed knowledge base by query and return grounded context plus citations.
