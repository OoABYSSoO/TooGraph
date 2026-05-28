from __future__ import annotations

import sys
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.main import app
from app.messaging import store


@contextmanager
def _message_platform_client() -> Iterator[TestClient]:
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        with (
            patch.object(database, "DATA_DIR", data_dir),
            patch.object(database, "DB_PATH", data_dir / "toograph.db"),
            patch("app.api.routes_message_platforms.message_platform_runtime.schedule_connect_binding"),
        ):
            database.initialize_storage()
            yield TestClient(app)


def test_message_platform_catalog_route() -> None:
    with _message_platform_client() as client:
        response = client.get("/api/message-platforms/catalog")

    assert response.status_code == 200
    payload = response.json()
    by_id = {entry["platform_id"]: entry for entry in payload["platforms"]}
    assert by_id["telegram"]["support_level"] == "supported"
    assert by_id["feishu"]["support_level"] == "supported"


def test_message_platform_binding_route_redacts_secret() -> None:
    with _message_platform_client() as client:
        response = client.put(
            "/api/message-platforms/bindings/mpb_telegram",
            json={
                "platform_id": "telegram",
                "display_name": "Personal Telegram",
                "enabled": True,
                "config": {"connection_mode": "polling"},
                "secrets": {"bot_token": "123456:secret-token"},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["binding"]["configured"] is True
    assert payload["binding"]["secret_summary"]["bot_token"] == "****oken"
    assert "123456:secret-token" not in str(payload)


def test_feishu_manual_binding_saves_app_id_and_secret_without_echoing_secret() -> None:
    with _message_platform_client() as client:
        response = client.put(
            "/api/message-platforms/bindings/mpb_feishu",
            json={
                "platform_id": "feishu",
                "display_name": "TooGraph Buddy",
                "enabled": True,
                "config": {"connection_mode": "websocket", "app_id": "cli_manual"},
                "secrets": {"app_secret": "manual-secret"},
            },
        )

        secrets = store.get_platform_secrets("mpb_feishu")

    assert response.status_code == 200
    payload = response.json()
    assert payload["binding"]["config"]["app_id"] == "cli_manual"
    assert payload["binding"]["secret_summary"]["app_secret"] == "****cret"
    assert secrets == {"app_secret": "manual-secret"}
    assert "manual-secret" not in str(payload)


def test_feishu_auto_binding_registers_app_and_saves_binding() -> None:
    def fake_register_app(*, on_qr_code, on_status_change, source):
        assert source == "toograph"
        on_qr_code({"url": "https://open.feishu.cn/page/launcher?user_code=ABCD-EFGH", "expire_in": 600})
        on_status_change({"status": "polling"})
        return {
            "client_id": "cli_auto",
            "client_secret": "auto-secret",
            "user_info": {"tenant_brand": "feishu", "open_id": "ou_admin"},
        }

    with _message_platform_client() as client:
        with patch("app.messaging.feishu_auto_bind._register_feishu_app", side_effect=fake_register_app):
            response = client.post(
                "/api/message-platforms/feishu/auto-binding/start",
                json={"display_name": "TooGraph Buddy", "enabled": True},
            )
            payload = response.json()
            job_id = payload["job"]["job_id"]
            for _ in range(20):
                poll_response = client.get(f"/api/message-platforms/feishu/auto-binding/{job_id}")
                poll_payload = poll_response.json()
                if poll_payload["job"]["status"] == "completed":
                    break
                time.sleep(0.05)

        secrets = store.get_platform_secrets("mpb_feishu")

    assert response.status_code == 200
    assert payload["job"]["qr_url"].startswith("https://open.feishu.cn/page/launcher")
    assert poll_payload["job"]["status"] == "completed"
    assert poll_payload["job"]["binding"]["binding_id"] == "mpb_feishu"
    assert poll_payload["job"]["binding"]["config"]["app_id"] == "cli_auto"
    assert poll_payload["job"]["binding"]["config"]["connection_mode"] == "websocket"
    assert poll_payload["job"]["binding"]["secret_summary"]["app_secret"] == "****cret"
    assert secrets == {"app_secret": "auto-secret"}
    assert "auto-secret" not in str(poll_payload)


def test_feishu_manual_save_preserves_auto_binding_credentials_when_fields_are_blank() -> None:
    with _message_platform_client() as client:
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})

        response = client.put(
            "/api/message-platforms/bindings/mpb_feishu",
            json={
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"connection_mode": "websocket"},
                "secrets": {},
            },
        )
        bindings_response = client.get("/api/message-platforms/bindings")
        secrets = store.get_platform_secrets("mpb_feishu")

    assert response.status_code == 200
    payload = response.json()
    assert payload["binding"]["configured"] is True
    assert payload["binding"]["config"]["app_id"] == "cli_auto"
    assert payload["binding"]["secret_summary"]["app_secret"] == "****cret"
    assert secrets == {"app_secret": "auto-secret"}
    saved = bindings_response.json()["bindings"][0]
    assert saved["configured"] is True
    assert saved["config"]["app_id"] == "cli_auto"


def test_fake_ingress_route_accepts_external_message() -> None:
    with _message_platform_client() as client:
        with patch("app.api.routes_message_platforms.handle_inbound_event", return_value={"run_id": "run_fake", "final_text": "ok"}):
            response = client.post(
                "/api/message-platforms/fake/inbound",
                json={
                    "platform_id": "telegram",
                    "binding_id": "mpb_telegram",
                    "chat_id": "chat-1",
                    "sender_id": "user-1",
                    "text": "hello",
                },
            )

    assert response.status_code == 200
    assert response.json()["run_id"] == "run_fake"
