---
name: Rewrite Text
description: Rewrite text with a specified style, tone, or constraint.
tools: []
graphite:
  skill_key: rewrite_text
  supported_value_types:
    - text
  side_effects: []
  input_schema:
    - key: text
      label: Text
      valueType: text
      required: true
      description: The original text to rewrite.
    - key: instruction
      label: Instruction
      valueType: text
      required: true
      description: How to rewrite (e.g. "make it formal", "simplify for a 10-year-old").
  output_schema:
    - key: rewritten
      label: Rewritten
      valueType: text
      description: The rewritten text.
---
Rewrite text according to a style or constraint instruction.
