---
name: Finalize Creative Package
description: Assemble the final creative package artifact from downstream production inputs.
tools: []
graphite:
  skill_key: finalize_creative_package
  supported_value_types:
    - text
    - json
  side_effects:
    - file_read
  input_schema:
    - key: creative_brief
      label: Creative Brief
      valueType: text
      required: true
      description: Creative brief text.
    - key: best_variant
      label: Best Variant
      valueType: json
      required: true
      description: Best reviewed variant.
    - key: storyboard_packages
      label: Storyboard Packages
      valueType: json
      description: Storyboard packages to include.
    - key: video_prompt_packages
      label: Video Prompt Packages
      valueType: json
      description: Video prompt packages to include.
    - key: image_generation_todo
      label: Image Generation TODO
      valueType: json
      description: Prepared image generation todo payload.
    - key: video_generation_todo
      label: Video Generation TODO
      valueType: json
      description: Prepared video generation todo payload.
    - key: evaluation_result
      label: Evaluation Result
      valueType: json
      required: true
      description: Evaluation result used to mark decision.
    - key: theme_config
      label: Theme Config
      valueType: json
      description: Theme configuration used by the workflow.
  output_schema:
    - key: final_package
      label: Final Package
      valueType: json
      description: Final assembled creative package.
    - key: final_result
      label: Final Result
      valueType: text
      description: Final result summary.
---
Assemble a final creative package artifact from the reviewed and production-ready inputs.
