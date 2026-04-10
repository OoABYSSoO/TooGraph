---
name: Output Usage Introduction
description: Return the local GraphiteUI usage introduction markdown as the node output.
tools: []
graphite:
  skill_key: output_usage_introduction
  supported_value_types:
    - text
  side_effects:
    - local_file_read
  input_schema: []
  output_schema:
    - key: greeting
      label: Usage Introduction
      valueType: text
      description: The local usage introduction markdown content.
---
Read the local `使用介绍.md` file from the project root and return its contents as the output text.
