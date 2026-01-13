---
name: Generate Storyboard Packages
description: Generate storyboard packages from reviewed creative variants.
tools: []
graphite:
  skill_key: generate_storyboard_packages
  supported_value_types:
    - json
  side_effects:
    - none
  input_schema:
    - key: script_variants
      label: Script Variants
      valueType: json
      required: true
      description: Variants used to derive storyboard packages.
  output_schema:
    - key: storyboard_packages
      label: Storyboard Packages
      valueType: json
      description: Generated storyboard packages.
---
Turn reviewed variants into storyboard packages for downstream creative production.
