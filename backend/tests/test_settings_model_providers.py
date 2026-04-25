from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class SettingsModelProviderTests(unittest.TestCase):
    def test_discovers_openai_compatible_models_from_base_url(self) -> None:
        with patch(
            "app.api.routes_settings.discover_openai_compatible_models",
            return_value=["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"],
        ) as discover:
            with TestClient(app) as client:
                response = client.post(
                    "/api/settings/model-providers/discover",
                    json={
                        "base_url": "http://127.0.0.1:8888/v1",
                        "api_key": "sk-local",
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "models": [
                    "gemma-4-26b-a4b-it",
                    "huihui-gemma-4-26b-a4b-it-abliterated",
                ]
            },
        )
        discover.assert_called_once_with(
            base_url="http://127.0.0.1:8888/v1",
            api_key="sk-local",
        )


if __name__ == "__main__":
    unittest.main()
