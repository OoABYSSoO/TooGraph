"use client";

import type { GraphCanvasNode } from "@/types/editor";

type Props = {
  node: GraphCanvasNode;
  onParamChange: (paramKey: string, value: unknown) => void;
};

function toNumberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function NodeParamsForm({ node, onParamChange }: Props) {
  const kind = node.data.kind;
  const params = node.data.params;

  if (kind === "generate_variants") {
    return (
      <>
        <label className="field">
          <span>Variant Count</span>
          <input
            className="text-input"
            min={1}
            type="number"
            value={String(params.variantCount ?? 2)}
            onChange={(event) => onParamChange("variantCount", Math.max(1, toNumberOrZero(event.target.value)))}
          />
        </label>
      </>
    );
  }

  if (kind === "review_variants") {
    return (
      <label className="field">
        <span>Score Threshold</span>
        <input
          className="text-input"
          max={10}
          min={0}
          step="0.1"
          type="number"
          value={String(params.scoreThreshold ?? 7.8)}
          onChange={(event) => onParamChange("scoreThreshold", toNumberOrZero(event.target.value))}
        />
      </label>
    );
  }

  if (kind === "select_assets") {
    return (
      <label className="field">
        <span>Top N</span>
        <input
          className="text-input"
          min={1}
          type="number"
          value={String(params.top_n ?? 2)}
          onChange={(event) => onParamChange("top_n", Math.max(1, toNumberOrZero(event.target.value)))}
        />
      </label>
    );
  }

  if (kind === "condition") {
    return (
      <label className="field">
        <span>Decision Path</span>
        <input
          className="text-input"
          value={String(params.decision_key ?? "evaluation_result.decision")}
          onChange={(event) => onParamChange("decision_key", event.target.value)}
        />
      </label>
    );
  }

  if (kind === "research") {
    const sources = Array.isArray(params.sources) ? params.sources.join(", ") : "";
    return (
      <label className="field">
        <span>Sources</span>
        <input
          className="text-input"
          placeholder="rss, ad_library"
          value={sources}
          onChange={(event) =>
            onParamChange(
              "sources",
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
    );
  }

  return <p className="muted">This node currently has no dedicated structured params. Use advanced JSON if needed.</p>;
}
