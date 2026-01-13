---
name: Review Creative Variants
description: Review generated variants and return pass or revise guidance.
tools: []
graphite:
  skill_key: review_creative_variants
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
      description: Brief used for evaluation.
    - key: script_variants
      label: Script Variants
      valueType: json
      required: true
      description: Variants to review.
    - key: theme_config
      label: Theme Config
      valueType: json
      description: Theme configuration used by the reviewer.
    - key: pass_threshold
      label: Pass Threshold
      valueType: json
      description: Score threshold for pass.
  output_schema:
    - key: review_results
      label: Review Results
      valueType: json
      description: Per-variant review results.
    - key: best_variant
      label: Best Variant
      valueType: json
      description: Best reviewed variant.
    - key: revision_feedback
      label: Revision Feedback
      valueType: json
      description: Feedback for revise path.
    - key: evaluation_result
      label: Evaluation Result
      valueType: json
      description: Decision payload used by condition nodes.
---
Review generated variants and determine whether the workflow should pass or revise.
