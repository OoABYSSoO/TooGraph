# Buddy Output Segment Trace Design

## Goal

Buddy chat should show graph execution progress as compact, inspectable trace capsules. A single user turn may produce multiple parent-graph output messages. Each group of output messages should be preceded by one trace capsule that explains which graph steps led to that output group.

The feature must reuse TooGraph run events and run records. It must not create a Buddy-only execution channel.

## Core Rule

Trace capsules are segmented by parent-graph nodes that directly connect to parent-graph `output` nodes.

- If a parent output node is directly connected from an LLM node, that LLM node is a segment boundary.
- If a parent output node is directly connected from a `subgraph` node, that subgraph node is a segment boundary.
- Do not inspect inside a subgraph to decide segment boundaries.
- A boundary node may connect to one or many output nodes; it still creates exactly one capsule.
- Output messages do not show their own process metadata. The capsule owns process display and timing.

Example:

```text
A -> B -> output_1
     B -> output_2
C -> D -> E -> output_3
          E -> output_4
          E -> output_5
          E -> output_6
```

Buddy chat renders:

```text
[Trace capsule for A, B]
B output_1
B output_2

[Trace capsule for C, D, E]
E output_3
E output_4
E output_5
E output_6
```

## Segment Membership

A segment contains the run records that occur after the previous boundary and through the current boundary, in execution order.

For the example above:

- Segment 1 includes `A` and `B`.
- Segment 2 includes `C`, `D`, and `E`.

If execution branches, membership should follow actual run event order instead of static graph layout. Static graph edges are used only to identify output boundary nodes and output groups.

## Subgraph Display

Subgraph nodes are ordinary boundary candidates at the parent graph level. Inner subgraph execution should appear inside the capsule when run events or run detail records expose it.

Display format:

```text
Parent Subgraph Name / Inner Node Name
```

When inner subgraph records are available, hide the aggregate parent subgraph completion row to avoid duplicate progress. When inner records are unavailable, display the parent subgraph node itself as the segment row and use its duration.

## Skill Display

Skill calls should appear as trace records in the same segment as the node that triggered them.

Recommended label:

```text
Node Name / Skill Name
```

For skills inside subgraphs:

```text
Subgraph Name / Node Name / Skill Name
```

Skill records should use `activity.event` where available, including status and `duration_ms`.

## Collapsed State

Capsules are collapsed by default.

Collapsed running capsule:

- Shows a green breathing dot.
- Does not show the words "正在运行".
- Shows the current record label.
- Shows a live elapsed time.

Collapsed completed capsule:

- Shows a stable green dot.
- Shows the step count and total duration.

Collapsed failed capsule:

- Shows an error dot.
- Shows the failed record label and elapsed time.

## Expanded State

Expanded capsules show the segment history from top to bottom.

Each row contains:

- Status dot.
- Node, subgraph-node, or skill label.
- Per-record duration.

Status dots:

- Running: green breathing dot.
- Completed: green stable dot.
- Failed: red dot.
- Paused or awaiting human input: warning-toned dot.

The footer shows total segment duration after all records in the segment have completed.

## Timing Semantics

Each row duration should come from existing run event or run detail data:

- During live execution, use `node.started` as start and `node.completed` / `node.failed` as end.
- For `activity.event`, use its `duration_ms` when provided.
- After refresh or run recovery, rebuild timing from `RunDetail.node_executions` and `RunDetail.artifacts.activity_events`.

Segment total duration should cover the segment's first record start through the segment boundary completion. If exact timestamps are missing, use the sum of completed row durations as a fallback.

## Data Flow

Use existing sources:

- Live: run SSE events already consumed by Buddy.
- Restored/final: `RunDetail.node_executions`, `RunDetail.artifacts.activity_events`, `RunDetail.artifacts.state_events`, `output_previews`.
- Graph shape: parent graph nodes and edges identify output boundary nodes and output groups.

Suggested frontend model:

- Build parent output bindings: `outputNode -> direct upstream parent node`.
- Build ordered segment boundary list from actual output message order.
- Reduce live run events into a `BuddyOutputTraceSegmentState`.
- Insert or update one capsule before the output messages for that boundary.
- On final run detail fetch, reconcile the live state with persisted run detail.

## UI Placement

For each segment:

1. Insert trace capsule.
2. Insert all public output messages directly produced by that boundary node.
3. Continue to the next segment.

The controller assistant message remains hidden unless it is needed for pause cards or errors. Public outputs remain the visible Buddy reply messages.

## Error And Pause Behavior

- If a segment fails before reaching a boundary, show the current segment capsule with failed status and the error row.
- If a run pauses for human input, show the pause card as today, and let the current capsule show a paused row.
- On resume, continue appending to the same segment unless the next completed boundary starts a new segment.
- If no output boundary can be resolved, fall back to one run-level capsule before the visible assistant message.

## Testing

Unit tests should cover:

- Multiple LLM nodes where only some connect to output nodes.
- One boundary node connected to multiple output nodes creates one capsule.
- A parent subgraph connected to output nodes is a boundary without inspecting inner LLM nodes.
- Inner subgraph records display as `Subgraph / Inner Node`.
- Skill `activity.event` records appear in the active segment.
- Live event reduction and final `RunDetail` reconstruction produce the same segment ordering.

Structure or component tests should cover:

- Collapsed capsule omits "正在运行" and uses a running status dot.
- Output messages do not show per-message process metadata.
- Capsules render before their output message group.
