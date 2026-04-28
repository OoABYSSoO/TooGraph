# HTML State, Output, And Buddy Rendering Design

## Goal

Add `html` as a first-class graph state type, let Output nodes render complete HTML pages, and let Buddy replies render Markdown or HTML while keeping untrusted content isolated from the main TooGraph app.

## Approach

HTML state remains part of the existing `node_system` / `state_schema` protocol. The backend accepts `html` state definitions and output display mode `html`; frontend state editors and output controls expose the type and mode through existing state and node-card primitives.

HTML rendering uses a shared sandboxed iframe component. Output nodes and Buddy reply surfaces pass HTML through `srcdoc` with `sandbox=""` and `referrerpolicy="no-referrer"`, so full page structure and CSS render inside an isolated frame while scripts, form submission, popups, top-level navigation, and same-origin access are blocked by default.

Markdown rendering continues to use the existing safe Markdown renderer. Buddy panel replies default to Markdown, but render as HTML when their output metadata declares `stateType: "html"` / `displayMode: "html"` or when a direct assistant reply is a complete HTML document.

## UI

Output node display mode gets an `HTML` option. Auto mode resolves HTML when the connected state type is `html` or a result-package output declares `type: "html"`.

Buddy's closed small reply box is widened and can render Markdown or sandboxed HTML. Long rendered content scrolls inside the bubble instead of expanding across the page.

## Tests

Coverage should include backend schema acceptance, output-boundary display-mode resolution, frontend preview model rendering, state type editor options, output config options, Output node structure, and Buddy structure/model behavior.
