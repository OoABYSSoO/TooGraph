from __future__ import annotations

from typing import Any


def build_capsule_projection(run_detail: dict[str, Any], *, mode: str) -> dict[str, Any]:
    resolved_mode = mode if mode in {"quiet", "summary", "debug"} else "quiet"
    run_id = str(run_detail.get("run_id") or "")
    events = run_detail.get("agent_loop_events") if isinstance(run_detail.get("agent_loop_events"), list) else []
    status = str(run_detail.get("status") or "completed")
    title = "Buddy completed" if status == "completed" else "Buddy stopped"
    details: list[str] = []
    if resolved_mode in {"summary", "debug"}:
        for event in events[:5]:
            if isinstance(event, dict):
                capability = str(event.get("selected_capability_key") or "").strip()
                decision = str(event.get("decision") or "").strip()
                details.append(capability or decision or "step")
    return {
        "mode": resolved_mode,
        "title": title,
        "summary_line": f"Run {run_id} · {len(events)} steps",
        "details": details,
    }
