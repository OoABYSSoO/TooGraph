# OpenAI Codex Login Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add no-API-key ChatGPT/Codex sign-in as the `openai-codex` model provider.

**Architecture:** Backend owns OAuth device-code credentials, Codex model discovery, token refresh, and Codex Responses calls. Frontend settings exposes a login-oriented provider card while the rest of GraphiteUI continues using `provider/model` refs.

**Tech Stack:** FastAPI, Pydantic, httpx, unittest, Vue 3, Element Plus, TypeScript node tests, Vite.

---

## Tasks

- [ ] Add failing backend tests for `openai-codex` template and transport support.
- [ ] Add failing backend tests for Codex auth store and routes.
- [ ] Add failing backend tests for Codex model discovery and Responses runtime calls.
- [ ] Implement backend template, auth module, routes, discovery, and runtime dispatch.
- [ ] Add failing frontend tests for Codex API helpers and login-provider draft behavior.
- [ ] Implement frontend types, API helpers, settings model helpers, and settings UI login controls.
- [ ] Run targeted tests, build frontend, restart with `npm.cmd run dev`, then commit.
