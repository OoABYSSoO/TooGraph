---
name: Generate Video Prompt Packages
description: Generate video prompt packages from variants and storyboard packages.
tools: []
graphite:
  skill_key: generate_video_prompt_packages
  supported_value_types:
    - json
  side_effects:
    - none
  input_schema:
    - key: script_variants
      label: Script Variants
      valueType: json
      required: true
      description: Variants used to derive prompt packages.
    - key: storyboard_packages
      label: Storyboard Packages
      valueType: json
      required: true
      description: Storyboard packages used to derive prompt packages.
  output_schema:
    - key: video_prompt_packages
      label: Video Prompt Packages
      valueType: json
      description: Generated video prompt packages.
---
Build video prompt packages from storyboard and variant inputs.
