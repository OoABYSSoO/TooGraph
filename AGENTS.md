# GraphiteUI Agent Instructions

These instructions apply to all work in this repository and should persist across new Codex sessions.

## Commit Messages

- When creating git commits for this project, always write the commit message in Chinese.

## Dev Restart Workflow

- After making code changes, restart the local dev environment with the repository's standard cross-platform restart command: `npm run dev`.
- Treat `node scripts/start.mjs` as the underlying standard restart command for this repository; `npm run dev` should resolve to it.
- On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd run dev`.
- `scripts/start.sh` remains the standard Bash wrapper for Linux, macOS, Git Bash, and WSL, and should stay behaviorally aligned with `scripts/start.mjs`.
- If a task only involves documentation or other non-runtime changes, use judgment; for code changes, default to restarting with the standard restart flow above.

## UI Implementation Policy

- For UI work, always prefer existing component libraries already used by the project before building custom components or controls.
- Only hand-roll UI when the current libraries cannot reasonably satisfy the requirement or when custom behavior is clearly unavoidable.
- When custom UI is necessary, keep the custom layer as small as possible and build on top of existing library primitives where practical.

## Notes

- `scripts/start.mjs` and `scripts/start.sh` should both release occupied frontend/backend ports before starting services again.
