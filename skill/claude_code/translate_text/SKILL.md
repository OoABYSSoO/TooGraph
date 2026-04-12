---
name: Translate Text
description: Translate text between languages while preserving tone and meaning.
tools: []
graphite:
  skill_key: translate_text
  supported_value_types:
    - text
  side_effects: []
  input_schema:
    - key: text
      label: Text
      valueType: text
      required: true
      description: The text to translate.
    - key: target_language
      label: Target Language
      valueType: text
      required: true
      description: Target language code or name (e.g. "zh", "en", "Japanese").
  output_schema:
    - key: translated
      label: Translated
      valueType: text
      description: The translated text.
    - key: source_language
      label: Source Language
      valueType: text
      description: Detected source language.
---
Translate text to the specified target language, preserving original tone and meaning.
