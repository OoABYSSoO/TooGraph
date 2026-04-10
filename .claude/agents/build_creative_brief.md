---
name: Build Creative Brief
description: Assemble a creative brief from structured research and pattern inputs.
tools: []
graphite:
  skill_key: build_creative_brief
  supported_value_types:
    - text
    - json
  side_effects:
    - model_call
  input_schema:
    - key: task_input
      label: Task Input
      valueType: text
      description: Creative task or campaign brief goal.
    - key: news_context
      label: News Context
      valueType: text
      description: Normalized text research context used to shape the brief.
    - key: theme_config
      label: Theme Config
      valueType: json
      description: Theme configuration used to shape genre, tone, and evaluation focus.
    - key: pattern_summary
      label: Pattern Summary
      valueType: text
      description: Optional extracted pattern summary used by the brief builder.
  output_schema:
    - key: creative_brief
      label: Creative Brief
      valueType: text
      description: Structured creative brief payload.
---
Turn research signals into a concise creative brief for downstream generation steps.
