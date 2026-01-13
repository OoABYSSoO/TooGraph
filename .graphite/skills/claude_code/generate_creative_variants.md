---
name: Generate Creative Variants
description: Generate structured creative variants from the current task and brief.
tools: []
graphite:
  skill_key: generate_creative_variants
  supported_value_types:
    - text
    - json
  side_effects:
    - model_call
  input_schema:
    - key: task_input
      label: Task Input
      valueType: text
      description: Creative task or campaign goal.
    - key: creative_brief
      label: Creative Brief
      valueType: text
      required: true
      description: Brief used to generate variants.
    - key: theme_config
      label: Theme Config
      valueType: json
      description: Theme configuration used by the generator.
    - key: variant_count
      label: Variant Count
      valueType: json
      description: How many variants to generate.
  output_schema:
    - key: script_variants
      label: Script Variants
      valueType: json
      description: Generated creative variants.
---
Generate multiple structured creative variants from the task and brief.
