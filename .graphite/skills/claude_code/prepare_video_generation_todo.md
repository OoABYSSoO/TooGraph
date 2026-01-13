---
name: Prepare Video Generation TODO
description: Prepare video generation todo items from review results and prompt packages.
tools: []
graphite:
  skill_key: prepare_video_generation_todo
  supported_value_types:
    - json
  side_effects:
    - none
  input_schema:
    - key: best_variant
      label: Best Variant
      valueType: json
      required: true
      description: Best reviewed variant.
    - key: video_prompt_packages
      label: Video Prompt Packages
      valueType: json
      required: true
      description: Prompt packages for video todo derivation.
  output_schema:
    - key: video_generation_todo
      label: Video Generation TODO
      valueType: json
      description: Prepared video generation todo payload.
---
Prepare video generation todo payloads from the best variant and video prompts.
