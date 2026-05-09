from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sys
import tempfile
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.main import app
from app.memory import store


@contextmanager
def isolated_memory_database():
    old_data_dir = database.DATA_DIR
    old_db_path = database.DB_PATH
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        database.DATA_DIR = data_dir
        database.DB_PATH = data_dir / "toograph.db"
        try:
            yield
        finally:
            database.DATA_DIR = old_data_dir
            database.DB_PATH = old_db_path


class PlatformMemoryStoreTests(unittest.TestCase):
    def test_memory_store_records_scope_layers_revisions_events_and_budgeted_recall(self) -> None:
        self.assertTrue(hasattr(store, "create_memory"), "memory.store should expose create_memory")
        self.assertTrue(hasattr(store, "recall_memories"), "memory.store should expose recall_memories")

        with isolated_memory_database():
            first = store.create_memory(
                {
                    "scope": "project",
                    "layer": "procedural",
                    "type": "preference",
                    "summary": "Prefers concise status updates",
                    "content": "Use short factual updates with verification evidence.",
                    "confidence": 0.8,
                    "importance": 0.9,
                    "evidence": [{"run_id": "run_1", "node_id": "answer"}],
                    "artifact_refs": [{"path": "runs/run_1/report.md", "content_type": "text/markdown"}],
                    "source": {"run_id": "run_1", "node_id": "answer", "template_id": "buddy_autonomous_loop"},
                    "status": "active",
                    "supersedes": ["mem_old"],
                },
                changed_by="test",
                change_reason="seed preference",
            )
            second = store.create_memory(
                {
                    "scope": "project",
                    "layer": "semantic",
                    "type": "fact",
                    "summary": "Concise long archive",
                    "content": "concise " + ("X" * 200),
                    "importance": 0.1,
                    "status": "active",
                },
                changed_by="test",
                change_reason="seed large memory",
            )

            self.assertTrue(first["id"].startswith("mem_"))
            self.assertEqual(first["scope"], "project")
            self.assertEqual(first["layer"], "procedural")
            self.assertEqual(first["type"], "preference")
            self.assertEqual(first["status"], "active")
            self.assertEqual(first["evidence"][0]["run_id"], "run_1")
            self.assertEqual(first["artifact_refs"][0]["path"], "runs/run_1/report.md")
            self.assertEqual(first["supersedes"], ["mem_old"])

            listed = store.list_memories(scope="project", layer="procedural", memory_type="preference")
            self.assertEqual([memory["id"] for memory in listed], [first["id"]])
            self.assertEqual([memory["id"] for memory in store.load_memories("preference")], [first["id"]])

            recalled = store.recall_memories(query="concise verification", scope="project", top_k=5, max_chars=120)
            self.assertEqual(recalled["included_count"], 1)
            self.assertEqual(recalled["memories"][0]["id"], first["id"])
            self.assertEqual(recalled["omitted"][0]["id"], second["id"])
            self.assertGreater(recalled["omitted"][0]["char_count"], 120)

            revisions = store.list_memory_revisions(first["id"])
            self.assertEqual(len(revisions), 1)
            self.assertEqual(revisions[0]["action"], "create")
            self.assertEqual(revisions[0]["next_value"]["summary"], "Prefers concise status updates")

            events = store.list_memory_events(first["id"])
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["action"], "create")
            self.assertEqual(events[0]["actor"], "test")

    def test_candidate_lifecycle_routes_apply_reject_archive_degrade_and_restore_revision(self) -> None:
        with isolated_memory_database():
            candidate = store.create_memory(
                {
                    "scope": "project",
                    "layer": "procedural",
                    "type": "preference",
                    "summary": "Candidate reply preference",
                    "content": "Include verification evidence in completion reports.",
                    "evidence": [{"run_id": "run_review_1", "node_id": "self_review"}],
                    "status": "candidate",
                    "importance": 0.8,
                },
                changed_by="test",
            )
            rejected_candidate = store.create_memory(
                {
                    "scope": "project",
                    "layer": "semantic",
                    "type": "fact",
                    "summary": "Unsupported candidate",
                    "content": "This candidate should be rejected.",
                    "evidence": [{"run_id": "run_review_2"}],
                    "status": "candidate",
                },
                changed_by="test",
            )

            with TestClient(app) as client:
                list_response = client.get("/api/memories", params={"scope": "project", "status": "candidate"})
                apply_response = client.post(
                    f"/api/memories/{candidate['id']}/apply",
                    json={"change_reason": "User approved the candidate."},
                )
                degrade_response = client.post(
                    f"/api/memories/{candidate['id']}/degrade",
                    json={"amount": 0.25, "change_reason": "Lower confidence after review."},
                )
                archive_response = client.post(
                    f"/api/memories/{candidate['id']}/archive",
                    json={"change_reason": "Archive after superseding."},
                )
                reject_response = client.post(
                    f"/api/memories/{rejected_candidate['id']}/reject",
                    json={"change_reason": "Evidence was not useful."},
                )
                revisions_response = client.get(f"/api/memories/{candidate['id']}/revisions")
                archive_revision_id = revisions_response.json()[-1]["revision_id"]
                restore_response = client.post(
                    f"/api/memories/{candidate['id']}/revisions/{archive_revision_id}/restore",
                    json={"target": "previous", "change_reason": "Restore archived candidate review result."},
                )
                events_response = client.get(f"/api/memories/{candidate['id']}/events")

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual({item["id"] for item in list_response.json()}, {candidate["id"], rejected_candidate["id"]})
        self.assertEqual(apply_response.status_code, 200)
        self.assertEqual(apply_response.json()["status"], "active")
        self.assertEqual(degrade_response.status_code, 200)
        self.assertAlmostEqual(degrade_response.json()["importance"], 0.55)
        self.assertEqual(archive_response.status_code, 200)
        self.assertEqual(archive_response.json()["status"], "archived")
        self.assertEqual(reject_response.status_code, 200)
        self.assertEqual(reject_response.json()["status"], "rejected")
        self.assertEqual([revision["action"] for revision in revisions_response.json()], ["create", "apply", "degrade", "archive"])
        self.assertEqual(restore_response.status_code, 200)
        self.assertEqual(restore_response.json()["current_value"]["status"], "active")
        self.assertAlmostEqual(restore_response.json()["current_value"]["importance"], 0.55)
        self.assertEqual(
            [event["action"] for event in events_response.json()],
            ["create", "apply", "degrade", "archive", "restore"],
        )


if __name__ == "__main__":
    unittest.main()
