# Vue Frontend Rebuild Design

## Goal

Replace the current React-based frontend with a new Vue-based frontend that keeps the existing backend unchanged while rebuilding the UI architecture from scratch.

The new frontend should:

- keep the current backend API contract
- keep the current product information architecture unless intentionally changed later
- replace the current React + React Flow editor with a Vue-based editor
- use a custom canvas layer instead of inheriting another node library's connector model

## Scope

This is a full frontend rebuild.

It includes:

- application shell
- routing
- API client
- editor workspace
- node canvas
- runs page
- settings page
- supporting stores and shared UI primitives

It explicitly excludes backend changes.

## Non-Goals

This migration does not:

- change backend schemas
- change backend endpoints
- redesign backend runtime behavior
- rewrite Python runtime/compiler logic

## Architecture Decision

### Chosen stack

- Vue 3
- Vite
- Pinia
- Vue Router
- custom canvas / node rendering system

### Rejected alternatives

#### Vue + existing flow library

Rejected because the project already ran into connector-model mismatch using a generic flow system. A new generic library would likely recreate the same problem under a different API.

#### LiteGraph-style canvas clone

Rejected because the project should learn from ComfyUI's current Vue direction, not reintroduce a different graph model that fights the backend protocol.

## Product Structure

The rebuilt frontend should initially preserve the current high-level entry points:

- `/`
- `/editor`
- `/editor/new`
- `/runs`
- `/settings`

Additional route structure can be refined later, but the first migration phase should preserve these entry points so the backend and existing user habits remain stable.

## Core Editor Model

The editor should be built around the current backend-native graph payload.

Frontend state should treat the backend graph as the primary source of truth:

- graph metadata
- state schema
- nodes
- edges
- conditional edges

The frontend can derive editor-specific projections, but should avoid reintroducing a separate long-lived business protocol that diverges from the backend format.

## Canvas Model

### Why custom canvas

The editor needs a connector and edge system that matches the project's own semantics:

- control flow
- projected data flow
- condition routing
- state as primary data source

This should not be forced through a third-party node system that assumes a different connector abstraction.

### Canvas responsibilities

The custom canvas layer owns:

- pan and zoom
- node positioning
- hit testing
- connector anchors
- edge rendering
- selection
- drag interactions

### Rendering layers

The canvas should be layered explicitly:

1. Background grid
2. Control-flow edges
3. Projected data-flow edges
4. Node shells
5. Connector hit areas and interaction overlays
6. Selection / execution overlays

## Connector Model

### Shared anchor system

All nodes use one anchor architecture.

Anchor families:

- `flow`
- `state`
- `route`

Anchor descriptors define:

- side
- vertical track
- key
- connector family

### Separation of concerns

Each connector is split into:

1. anchor coordinate
2. interactive hit area
3. visual dot

This avoids coupling geometry to CSS decoration.

### Node semantics

Ordinary nodes:

- title-row flow connectors
- body-row state connectors

Condition nodes:

- route input
- branch route outputs
- state inputs

Output nodes:

- flow input only
- no flow output

## Edge Semantics

### Control-flow edges

Control-flow edges are formally stored and editable.

They represent execution order.

### Data-flow edges

Projected data-flow edges are derived from:

- `reads`
- `writes`
- control-flow topology

They are not the primary persisted control structure.

They exist to make state dependencies visible.

## State Management

Pinia stores should be split by concern:

- app shell store
- editor workspace store
- graph document store
- runs store
- settings store

The graph document store should hold the backend-native graph plus UI-only view state such as:

- selection
- viewport
- panel open/close state
- transient drag state

## Recommended Project Structure

The rebuilt frontend should be organized with clear boundaries:

- `frontend/src/app/`
- `frontend/src/router/`
- `frontend/src/stores/`
- `frontend/src/api/`
- `frontend/src/editor/`
- `frontend/src/components/`
- `frontend/src/styles/`

Inside `editor/`, split by responsibility:

- `canvas/`
- `nodes/`
- `edges/`
- `anchors/`
- `panels/`
- `workspace/`

## ComfyUI Influence

The project should learn from ComfyUI in these ways:

- Vue-based frontend direction
- explicit store-driven UI state
- cleaner separation between canvas system and node content rendering
- editor as a first-class workspace rather than a page widget

It should not blindly copy ComfyUI's old LiteGraph assumptions.

GraphiteUI must preserve its own semantics:

- backend-native graph payload
- state-first model
- condition / branch semantics
- projected data-flow layer

## Migration Strategy

### Step 1: Replace the existing `frontend/`

The React frontend is removed on this branch and replaced with a Vue app scaffold.

### Step 2: Rebuild shell and API layers

Before rebuilding the editor, establish:

- routing
- layout shell
- API client
- basic navigation

### Step 3: Rebuild editor workspace

Then rebuild:

- canvas
- nodes
- connectors
- edges
- side panels
- save / validate / run controls

### Step 4: Rebuild secondary pages

After the editor works:

- runs
- settings
- home/dashboard

## Testing Strategy

### Early phases

Use:

- TypeScript checks
- build verification
- focused store and pure geometry tests

### Editor phases

Add tests for:

- anchor generation
- edge path geometry
- graph document mutations
- condition branch behavior
- projected data-flow derivation

### Acceptance

Before merge back to `main`, verify:

- app boots
- editor opens existing templates
- save / validate / run work
- runs page works
- settings page works
- visual semantics are stable

## Recommendation

Proceed with a full Vue rebuild on this dedicated branch.

The existing React frontend has already consumed significant effort in connector-level fixes without producing a stable long-term geometry architecture. A clean Vue rebuild provides the best chance to realign the frontend with the backend-native graph model and to adopt a more deliberate canvas architecture.
