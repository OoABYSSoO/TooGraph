---
name: Generate Hello Greeting
description: Generate a short greeting string from a provided name.
tools: []
graphite:
  skill_key: generate_hello_greeting
  supported_value_types:
    - text
  side_effects:
    - model_call
  input_schema:
    - key: name
      label: Name
      valueType: text
      required: true
      description: Name to greet.
  output_schema:
    - key: greeting
      label: Greeting
      valueType: text
      description: Generated greeting text.
---
Generate a short greeting for the provided name and keep the output concise.
