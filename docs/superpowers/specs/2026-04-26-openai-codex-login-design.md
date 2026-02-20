# OpenAI Codex Login Provider Design

Date: 2026-04-26

## Goal

Add a first-class `openai-codex` provider so GraphiteUI can use a ChatGPT/Codex subscription without an OpenAI Platform API key.

## Reference Model

OpenClaw separates direct OpenAI API-key traffic (`openai/*`) from ChatGPT/Codex OAuth traffic (`openai-codex/*`). Hermes follows the same split and stores Codex OAuth tokens in its own auth file instead of importing `~/.codex/auth.json`, avoiding refresh-token conflicts with Codex CLI or VS Code.

GraphiteUI should follow that split:

- `openai/*` remains normal OpenAI-compatible API-key access.
- `openai-codex/*` becomes ChatGPT/Codex sign-in access.
- Local/custom OpenAI-compatible gateways remain available, including `http://127.0.0.1:8888/v1`.

## Backend Design

- Add transport `codex-responses`.
- Add provider template `openai-codex` with base URL `https://chatgpt.com/backend-api/codex`.
- Store Codex OAuth credentials in a dedicated backend settings auth file, not in `app_settings.json`.
- Never include access tokens or refresh tokens in `/api/settings` responses.
- Implement a device-code login flow:
  - Start login returns verification URL and user code.
  - Poll completes token exchange and stores credentials.
  - Status reports configured/expired/authenticated state.
  - Logout clears stored credentials.
- Discover models by calling Codex model catalog with the stored access token.
- Fall back to a small built-in Codex model list when live discovery is unavailable.
- Runtime calls use non-streaming Codex Responses requests through `/responses`.
- On 401, refresh the access token once and retry the request.

## Frontend Design

- Settings page shows `OpenAI Codex / ChatGPT 登录` as an addable provider.
- Codex provider hides API-key fields and shows login controls instead:
  - Login button
  - verification URL and user code
  - open/copy controls
  - login status
  - logout button
- Model discovery for Codex can run after login and should auto-fill enabled models.
- The default model selector should include `openai-codex/<model>` once models are available.

## Testing

- Backend unit tests cover template registration, safe auth storage, device-code endpoints, model discovery fallback/parsing, Responses payload generation, and refresh-on-401 retry.
- Frontend tests cover typed API calls, provider draft handling for login providers, and save payloads that do not send API-key fields for Codex.
- Final verification runs targeted backend tests, frontend tests, frontend build, and `npm.cmd run dev`.
