from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app.main import app


class HealthRouteTests(unittest.TestCase):
    def test_health_supports_get(self) -> None:
        with TestClient(app) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_supports_head(self) -> None:
        with TestClient(app) as client:
            response = client.head("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "")


if __name__ == "__main__":
    unittest.main()
