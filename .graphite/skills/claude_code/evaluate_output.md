---
name: Evaluate Output
description: Evaluate generated content and return score, issues, and suggestions.
tools: []
graphite:
  skill_key: evaluate_output
  supported_value_types:
    - text
    - json
  side_effects:
    - model_call
  input_schema:
    - key: content
      label: Content
      valueType: text
      required: true
      description: Content to evaluate.
  output_schema:
    - key: score
      label: Score
      valueType: json
      description: Evaluation score.
    - key: issues
      label: Issues
      valueType: json
      description: List of detected issues.
    - key: suggestions
      label: Suggestions
      valueType: json
      description: Improvement suggestions for the evaluated content.
---
Review the provided content and produce a score, key issues, and practical suggestions.
