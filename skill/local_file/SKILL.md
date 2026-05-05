# Local File

This is a basic GraphiteUI file IO skill for graph templates.

It only reads and writes text or JSON files after resolving a repository-relative path through a built-in allowlist. It does not own companion memory policy, persona rules, routing decisions, summarization, or any product-specific behavior.

Supported operations:

- `read_json`
- `read_text`
- `write_json`
- `write_text`

Templates can provide fixed paths, defaults, prompt section tags, and revision metadata through skill binding config. Agent nodes should produce structured state first; this skill should then execute the explicit file operation.

Do not use this skill to read secrets, local settings, runtime logs, build output, `.git`, `node_modules`, or machine-specific configuration.
