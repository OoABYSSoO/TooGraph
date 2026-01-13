---
name: Prepare Image Generation TODO
description: Prepare image generation todo items from review results and storyboard packages.
tools: []
graphite:
  skill_key: prepare_image_generation_todo
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
    - key: storyboard_packages
      label: Storyboard Packages
      valueType: json
      description: Storyboard packages for image todo derivation.
  output_schema:
    - key: image_generation_todo
      label: Image Generation TODO
      valueType: json
      description: Prepared image generation todo payload.
---
Prepare image generation todo payloads from the best variant and storyboard packages.
