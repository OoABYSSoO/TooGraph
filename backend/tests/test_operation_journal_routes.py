from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.operation_journal_store import record_operation_journal_event
from app.main import app


class OperationJournalRouteTests(unittest.TestCase):
    def test_operation_journal_endpoint_filters_entries_by_run_and_operation_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            journal_path = Path(temp_dir) / "operation_journal.jsonl"
            with patch("app.core.storage.operation_journal_store.OPERATION_JOURNAL_PATH", journal_path):
                record_operation_journal_event(
                    run_id="run_parent",
                    event={
                        "sequence": 1,
                        "kind": "virtual_ui_operation",
                        "summary": "Requested virtual template run.",
                        "node_id": "run_visible_template_operation",
                        "status": "requested",
                        "created_at": "2026-05-18T10:00:00Z",
                        "detail": {
                            "operation_request_id": "vop_template",
                            "operation": {
                                "kind": "run_template",
                                "target_id": "library.template.advanced_web_research_loop.open",
                                "input_text": "鸣潮最新资讯",
                            },
                        },
                    },
                )
                record_operation_journal_event(
                    run_id="other_run",
                    event={
                        "sequence": 1,
                        "kind": "virtual_ui_operation",
                        "summary": "Requested virtual click.",
                        "status": "requested",
                        "created_at": "2026-05-18T10:01:00Z",
                        "detail": {
                            "operation_request_id": "vop_other",
                            "operation": {"kind": "click", "target_id": "editor.action.runActiveGraph"},
                        },
                    },
                )

                with TestClient(app) as client:
                    response = client.get(
                        "/api/operation-journal",
                        params={"run_id": "run_parent", "operation_request_id": "vop_template"},
                    )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["entries"][0]["run_id"], "run_parent")
        self.assertEqual(payload["entries"][0]["operation_request_id"], "vop_template")
        self.assertEqual(payload["entries"][0]["operation"]["kind"], "run_template")


if __name__ == "__main__":
    unittest.main()
