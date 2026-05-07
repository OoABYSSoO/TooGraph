from __future__ import annotations

from contextlib import ExitStack, contextmanager
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


class LocalExecutorPolicyRouteTests(unittest.TestCase):
    def test_policy_endpoint_exposes_default_read_broad_write_narrow_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            policy_path = Path(temp_dir) / "settings" / "security" / "local_executor_policy.json"
            with _client_with_policy_path(policy_path) as client:
                response = client.get("/api/local-executor-policy")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["read_roots"], ["."])
        self.assertEqual(payload["write_roots"], ["backend/data"])
        self.assertEqual(payload["execute_roots"], ["backend/data/skills/user", "backend/data/tmp"])
        self.assertIn("backend/data/settings/security", payload["denied_roots"])
        self.assertIn("python", payload["allowed_commands"])
        self.assertIn(".ps1", payload["allowed_script_extensions"])

    def test_policy_endpoint_adds_allowed_root_without_allowing_protected_policy_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            policy_path = Path(temp_dir) / "settings" / "security" / "local_executor_policy.json"
            with _client_with_policy_path(policy_path) as client:
                add_response = client.post(
                    "/api/local-executor-policy/allow-root",
                    json={"kind": "write", "path": "workspace/generated"},
                )
                blocked_response = client.post(
                    "/api/local-executor-policy/allow-root",
                    json={"kind": "write", "path": "backend/data/settings/security"},
                )

        self.assertEqual(add_response.status_code, 200)
        self.assertIn("workspace/generated", add_response.json()["write_roots"])
        self.assertEqual(blocked_response.status_code, 400)
        self.assertIn("protected", blocked_response.json()["detail"])


@contextmanager
def _client_with_policy_path(policy_path: Path):
    with ExitStack() as stack:
        stack.enter_context(patch("app.core.storage.local_executor_policy.LOCAL_EXECUTOR_POLICY_PATH", policy_path))
        yield stack.enter_context(TestClient(app))


if __name__ == "__main__":
    unittest.main()
