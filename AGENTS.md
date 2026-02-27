# GraphiteUI Agent Instructions

These instructions apply to all work in this repository and should persist across new Codex sessions.

## Commit Messages

- When creating git commits for this project, always write the commit message in Chinese.
- After making repository changes, commit and push the changes unless the user explicitly asks not to.

## Dev Restart Workflow

- After making code changes, restart the local dev environment with the repository's standard cross-platform restart command: `npm run dev`.
- Treat `node scripts/start.mjs` as the underlying standard restart command for this repository; `npm run dev` should resolve to it.
- On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd run dev`.
- `scripts/start.sh` remains the standard Bash wrapper for Linux, macOS, Git Bash, and WSL, and should stay behaviorally aligned with `scripts/start.mjs`.
- If a task only involves documentation or other non-runtime changes, use judgment; for code changes, default to restarting with the standard restart flow above.

## Local LLM Runtime

- Standardize local LLM/runtime guidance on an OpenAI-compatible custom provider.
- Preferred local or private gateway flow:
  - Start the OpenAI-compatible gateway you want to use.
  - Use the base URL configured in the Model Providers page when one exists; the current local default is `http://127.0.0.1:8888/v1`.
  - `LOCAL_BASE_URL=<OpenAI-compatible base URL, for example http://127.0.0.1:8888/v1>`
  - `LOCAL_API_KEY=<optional api key>`
  - `LOCAL_TEXT_MODEL=<model name exposed by your gateway>`
- Keep GraphiteUI's own dev startup guidance on `npm run dev` and `node scripts/start.mjs`; those commands are not replaced by local runtime instructions.

## UI Implementation Policy

- For UI work, always prefer existing component libraries already used by the project before building custom components or controls.
- Only hand-roll UI when the current libraries cannot reasonably satisfy the requirement or when custom behavior is clearly unavoidable.
- When custom UI is necessary, keep the custom layer as small as possible and build on top of existing library primitives where practical.

## User Experience and Visual Quality

- User experience and visual quality are required parts of every user-facing change, not optional polish.
- Before changing UI, inspect nearby screens/components and follow the existing art direction, spacing rhythm, colors, typography, icon style, motion, and interaction language.
- Do not ship raw browser-default controls, crowded layouts, unclear labels, accidental visual regressions, or flows that only work because the implementer already knows what to do.
- Every user-facing flow should include clear affordances, loading/saving/success/error feedback where relevant, and avoid surprising state changes.
- For significant UI changes, verify the result visually in a browser screenshot in addition to running tests.

## Product and Engineering Quality

- Keep changes scoped to the request, but leave the touched area coherent: remove confusing duplication, stale UI states, and obvious footguns introduced or exposed by the work.
- Protect user data and local configuration. Do not commit local runtime state, logs, generated build output, credentials, or machine-specific settings unless explicitly requested.
- Treat `backend/data/settings`, `.dev_*` logs, `dist`, and `.worktrees` as local/runtime artifacts unless a task explicitly targets them.
- Prefer automatic, discoverable behavior over hidden manual steps when it improves the user's workflow, but make side effects visible and reversible.
- Before finishing, run the smallest meaningful verification set for the changed surface; for UI work, include a visual check when practical. Clearly report any skipped or failing verification.

## Notes

- `scripts/start.mjs` and `scripts/start.sh` should both release occupied frontend/backend ports before starting services again.
