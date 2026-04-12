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
      description: Name of the knowledge base directory to search.
  output_schema:
    - key: context
      label: Context
      valueType: text
      description: Combined document excerpts for grounded reasoning.
    - key: results
      label: Results
      valueType: json
      description: Array of matched documents with title, summary, and source.
---
Search a local knowledge base by query and return ranked document excerpts as grounded context.
