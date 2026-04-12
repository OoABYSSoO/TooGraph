---
name: Summarize Text
description: Condense long text into a concise summary, preserving key points.
tools: []
graphite:
  skill_key: summarize_text
  supported_value_types:
    - text
  side_effects: []
  input_schema:
    - key: text
      label: Text
      valueType: text
      required: true
      description: The source text to summarize.
    - key: max_sentences
      label: Max Sentences
      valueType: text
      required: false
      description: Maximum number of sentences in the summary (default 3).
  output_schema:
    - key: summary
      label: Summary
      valueType: text
      description: The condensed summary.
    - key: key_points
      label: Key Points
      valueType: json
      description: Array of extracted key points as strings.
---
Summarize the input text into a concise result with extracted key points.
