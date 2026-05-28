from __future__ import annotations

from copy import deepcopy
from threading import Event, Lock, Thread
from typing import Any, Callable
from uuid import uuid4

from app.messaging import store


DEFAULT_FEISHU_BINDING_ID = "mpb_feishu"
DEFAULT_FEISHU_CONNECTION_MODE = "websocket"

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = Lock()


def _mask_secret(value: str) -> str:
    normalized = str(value or "").strip()
    return f"****{normalized[-4:]}" if normalized else ""


def _job_snapshot(job: dict[str, Any]) -> dict[str, Any]:
    snapshot_source = {key: value for key, value in job.items() if not key.startswith("_")}
    snapshot = deepcopy(snapshot_source)
    snapshot.pop("_qr_ready", None)
    return snapshot


def _set_job_fields(job_id: str, **fields: Any) -> dict[str, Any]:
    with _LOCK:
        job = _JOBS[job_id]
        job.update(fields)
        return _job_snapshot(job)


def _register_feishu_app(
    *,
    on_qr_code: Callable[[dict[str, Any]], None],
    on_status_change: Callable[[dict[str, Any]], None],
    source: str,
) -> dict[str, Any]:
    try:
        import lark_oapi as lark  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Feishu SDK is unavailable: {exc}") from exc
    return lark.register_app(
        on_qr_code=on_qr_code,
        on_status_change=on_status_change,
        source=source,
    )


def start_feishu_auto_binding(
    *,
    display_name: str = "Feishu/Lark",
    enabled: bool = True,
    connection_mode: str = DEFAULT_FEISHU_CONNECTION_MODE,
    source: str = "toograph",
    qr_wait_seconds: float = 5.0,
) -> dict[str, Any]:
    job_id = f"mpfab_{uuid4().hex[:12]}"
    qr_ready = Event()
    job = {
        "job_id": job_id,
        "platform_id": "feishu",
        "binding_id": DEFAULT_FEISHU_BINDING_ID,
        "status": "starting",
        "qr_url": "",
        "qr_expires_in": 0,
        "provider_status": "",
        "error": "",
        "binding": None,
        "_qr_ready": qr_ready,
    }
    with _LOCK:
        _JOBS[job_id] = job
    worker = Thread(
        target=_run_auto_binding_worker,
        kwargs={
            "job_id": job_id,
            "display_name": display_name,
            "enabled": enabled,
            "connection_mode": connection_mode or DEFAULT_FEISHU_CONNECTION_MODE,
            "source": source,
        },
        daemon=True,
    )
    worker.start()
    qr_ready.wait(timeout=qr_wait_seconds)
    return get_feishu_auto_binding_job(job_id)


def get_feishu_auto_binding_job(job_id: str) -> dict[str, Any]:
    normalized_job_id = str(job_id or "").strip()
    with _LOCK:
        job = _JOBS.get(normalized_job_id)
        if job is None:
            raise KeyError(normalized_job_id)
        return _job_snapshot(job)


def _run_auto_binding_worker(
    *,
    job_id: str,
    display_name: str,
    enabled: bool,
    connection_mode: str,
    source: str,
) -> None:
    qr_ready = _JOBS[job_id]["_qr_ready"]

    def on_qr_code(info: dict[str, Any]) -> None:
        _set_job_fields(
            job_id,
            status="waiting_for_scan",
            qr_url=str(info.get("url") or ""),
            qr_expires_in=int(info.get("expire_in") or info.get("expireIn") or 0),
        )
        qr_ready.set()

    def on_status_change(info: dict[str, Any]) -> None:
        _set_job_fields(job_id, provider_status=str(info.get("status") or ""))

    try:
        result = _register_feishu_app(
            on_qr_code=on_qr_code,
            on_status_change=on_status_change,
            source=source,
        )
        app_id = str(result.get("client_id") or result.get("app_id") or "").strip()
        app_secret = str(result.get("client_secret") or result.get("app_secret") or "").strip()
        if not app_id or not app_secret:
            raise RuntimeError("Feishu did not return App ID and App Secret.")
        user_info = result.get("user_info") if isinstance(result.get("user_info"), dict) else {}
        binding = store.upsert_platform_binding(
            {
                "binding_id": DEFAULT_FEISHU_BINDING_ID,
                "platform_id": "feishu",
                "display_name": str(display_name or "Feishu/Lark"),
                "enabled": enabled,
                "config": {
                    "app_id": app_id,
                    "connection_mode": connection_mode or DEFAULT_FEISHU_CONNECTION_MODE,
                    "binding_method": "auto_register",
                    "tenant_brand": str(user_info.get("tenant_brand") or ""),
                    "admin_open_id": str(user_info.get("open_id") or ""),
                },
                "secret_summary": {"app_secret": _mask_secret(app_secret)},
            }
        )
        store.upsert_platform_secrets(DEFAULT_FEISHU_BINDING_ID, {"app_secret": app_secret})
        status_name = "not_connected" if enabled else "disabled"
        store.update_connection_status(DEFAULT_FEISHU_BINDING_ID, status=status_name)
        store.append_audit_event(
            binding_id=DEFAULT_FEISHU_BINDING_ID,
            platform_id="feishu",
            event_type="binding.auto_registered",
            severity="info",
            message="Feishu app was registered from QR authorization.",
            payload={"connection_mode": connection_mode, "tenant_brand": str(user_info.get("tenant_brand") or "")},
        )
        _set_job_fields(job_id, status="completed", binding=binding, error="")
    except Exception as exc:
        _set_job_fields(job_id, status="failed", error=str(exc))
        qr_ready.set()
