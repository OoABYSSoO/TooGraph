from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.capsule_projection import build_capsule_projection


def test_quiet_projection_keeps_short_summary() -> None:
    projection = build_capsule_projection(
        {
            "run_id": "run_1",
            "status": "completed",
            "agent_loop_events": [{"decision": "continue"}, {"decision": "stop", "stop_reason": "completed"}],
            "outputs": [{"node_id": "final", "content": "answer"}],
        },
        mode="quiet",
    )

    assert projection["mode"] == "quiet"
    assert projection["title"] == "Buddy completed"
    assert projection["summary_line"] == "Run run_1 · 2 steps"
    assert projection["details"] == []


def test_summary_projection_limits_details() -> None:
    projection = build_capsule_projection(
        {
            "run_id": "run_1",
            "status": "completed",
            "agent_loop_events": [{"selected_capability_key": f"tool_{index}"} for index in range(8)],
        },
        mode="summary",
    )

    assert len(projection["details"]) == 5
