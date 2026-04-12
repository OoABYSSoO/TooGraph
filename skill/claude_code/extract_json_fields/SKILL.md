---
name: Extract JSON Fields
description: Parse unstructured text and extract specified fields into a structured JSON object.
tools: []
graphite:
  skill_key: extract_json_fields
  supported_value_types:
    - text
    - json
  side_effects: []
  input_schema:
    - key: text
      label: Text
      valueType: text
      required: true
      description: Source text to parse and extract fields from.
    - key: fields
      label: Fields
      valueType: text
      required: true
      description: Comma-separated field names to extract (e.g. "name, email, phone").
  output_schema:
    - key: extracted
      label: Extracted
      valueType: json
      description: Object with requested field names as keys and extracted values.
    - key: confidence
      label: Confidence
      valueType: text
      description: Extraction confidence level (high, medium, low).
---
Extract specified fields from unstructured text into a clean JSON object.
