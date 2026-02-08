# GraphiteUI Agent Instructions

These instructions apply to all work in this repository and should persist across new Codex sessions.

## Commit Messages

- When creating git commits for this project, always write the commit message in Chinese.

## Dev Restart Workflow

- After making code changes, restart the local dev environment by running `scripts/start.sh`.
- Treat `scripts/start.sh` as the standard restart command for this repository.
- If a task only involves documentation or other non-runtime changes, use judgment; for code changes, default to restarting with `scripts/start.sh`.

## UI Implementation Policy

- For UI work, always prefer existing component libraries already used by the project before building custom components or controls.
- Only hand-roll UI when the current libraries cannot reasonably satisfy the requirement or when custom behavior is clearly unavoidable.
- When custom UI is necessary, keep the custom layer as small as possible and build on top of existing library primitives where practical.

## Notes

- `scripts/start.sh` already handles restarting by releasing occupied frontend/backend ports before starting services again.
