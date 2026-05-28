from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.scheduler import delivery, store


class FakeWebhookResponse:
    def __init__(self, status_code: int = 202, text: str = '{"accepted":true}') -> None:
        self.status_code = status_code
        self.text = text

    def raise_for_status(self) -> None:
        return None


class FakeWebhookClient:
    def __init__(self, *, response: FakeWebhookResponse | None = None, requests: list[dict] | None = None, **kwargs) -> None:
        self.response = response or FakeWebhookResponse()
        self.requests = requests if requests is not None else []
        self.kwargs = kwargs

    def __enter__(self) -> "FakeWebhookClient":
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        return False

    def request(self, method: str, url: str, *, headers: dict | None = None, json: dict | None = None) -> FakeWebhookResponse:
        self.requests.append({"method": method, "url": url, "headers": headers or {}, "json": json or {}})
        return self.response


class SchedulerDeliveryTests(unittest.TestCase):
    def test_approved_webhook_delivery_posts_and_records_redacted_attempt(self) -> None:
        requests: list[dict] = []

        def client_factory(**kwargs) -> FakeWebhookClient:
            return FakeWebhookClient(requests=requests, **kwargs)

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "manual",
                        "delivery_target": {
                            "kind": "webhook",
                            "url": "https://example.invalid/scheduler-hook",
                            "authorization": "Bearer secret-token",
                            "headers": {"X-Trace": "scheduler-test"},
                            "payload": {"channel": "ops"},
                        },
                    },
                    now="2026-05-27T00:00:00Z",
                )
                completed = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T06:00:00Z",
                    completed_at="2026-05-27T06:04:00Z",
                )

                result = delivery.execute_approved_scheduled_delivery(
                    completed["job_run_id"],
                    approval={"decision": "approved", "approved_by": "scheduler-test"},
                    now="2026-05-27T06:05:00Z",
                    http_client_factory=client_factory,
                )
                reloaded = store.load_scheduled_graph_job_run(completed["job_run_id"])
                attempts = store.list_scheduled_delivery_attempts(job_run_id=completed["job_run_id"])

        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["method"], "POST")
        self.assertEqual(requests[0]["url"], "https://example.invalid/scheduler-hook")
        self.assertEqual(requests[0]["headers"]["Authorization"], "Bearer secret-token")
        self.assertEqual(requests[0]["headers"]["X-Trace"], "scheduler-test")
        self.assertEqual(requests[0]["json"]["scheduler"]["job_id"], job["job_id"])
        self.assertEqual(requests[0]["json"]["scheduler"]["job_run_id"], completed["job_run_id"])
        self.assertEqual(requests[0]["json"]["payload"], {"channel": "ops"})

        self.assertEqual(result["kind"], "webhook")
        self.assertEqual(result["status"], "delivered")
        self.assertEqual(result["http_status_code"], 202)
        self.assertEqual(result["approval"]["status"], "approved")
        self.assertEqual(result["target"]["authorization"], "[redacted]")
        self.assertNotIn("secret-token", str(result))

        self.assertEqual(reloaded["metadata"]["delivery_result"]["status"], "delivered")
        self.assertEqual(reloaded["metadata"]["delivery_result"]["delivery_attempt_id"], attempts[0]["attempt_id"])
        self.assertEqual(attempts[0]["status"], "succeeded")
        self.assertEqual(attempts[0]["target"]["authorization"], "[redacted]")
        self.assertEqual(attempts[0]["request"]["headers"]["Authorization"], "[redacted]")
        self.assertEqual(attempts[0]["response"]["status_code"], 202)
        self.assertNotIn("secret-token", str(attempts[0]))


if __name__ == "__main__":
    unittest.main()
