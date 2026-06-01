from __future__ import annotations

from datetime import datetime, timezone
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class ModelRequestLogTests(unittest.TestCase):
    def test_appends_database_model_request_log_with_run_context(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_root"
                    run["root_run_id"] = "run_root"
                    run["run_path"] = ["run_root"]
                    run["status"] = "running"
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_root",
                        root_run_id="run_root",
                        execution_id="agent:1",
                        node_id="agent",
                        node_type="agent",
                        node_name="Answer",
                        phase="agent_response",
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="gemma",
                            path="/v1/chat/completions",
                            request_raw={
                                "model": "gemma",
                                "messages": [
                                    {"role": "system", "content": "sys"},
                                    {
                                        "role": "user",
                                        "content": [{"type": "image_url", "image_url": {"url": "data:image/png,abcd"}}],
                                    },
                                ],
                            },
                            response_raw={
                                "id": "chatcmpl_1",
                                "choices": [{"message": {"reasoning_content": "think", "content": "hello"}}],
                            },
                            duration_ms=1234,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)
                    with database.get_connection() as connection:
                        stored_count = connection.execute("SELECT COUNT(*) FROM graph_model_calls").fetchone()[0]

        self.assertEqual(stored_count, 1)
        self.assertEqual(payload["total"], 1)
        entry = payload["entries"][0]
        self.assertEqual(entry["run_id"], "run_root")
        self.assertEqual(entry["root_run_id"], "run_root")
        self.assertEqual(entry["execution_id"], "agent:1")
        self.assertEqual(entry["node_id"], "agent")
        self.assertEqual(entry["node_type"], "agent")
        self.assertEqual(entry["node_name"], "Answer")
        self.assertEqual(entry["phase"], "agent_response")
        self.assertEqual(entry["provider_id"], "local")
        self.assertEqual(entry["transport"], "openai-compatible")
        self.assertEqual(entry["model"], "gemma")
        self.assertEqual(entry["path"], "/v1/chat/completions")
        self.assertEqual(entry["request_kind"], "chat")
        self.assertEqual(entry["duration_ms"], 1234)
        self.assertEqual(entry["status_code"], 200)
        self.assertEqual(entry["messages"][0], {"role": "system", "body": "sys"})
        self.assertEqual(entry["reasoning"], "think")
        self.assertEqual(entry["content"], "hello")
        self.assertEqual(
            entry["request_raw"]["messages"][1]["content"][0]["image_url"]["url"],
            "<inline-media-reference mime=image/png chars=19>",
        )

    def test_model_request_log_preserves_provider_profile_context(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        provider_profile = {
            "request_timeout_seconds": 12.5,
            "cache_policy": "disabled",
            "cost_budget": {"limit_usd": 1.25, "window": "run"},
            "rate_profile": {"requests_per_minute": 30, "tokens_per_minute": 1200, "concurrency": 2},
        }
        provider_cache_decision = {
            "kind": "prompt_cache_policy",
            "requested_policy": "disabled",
            "mode": "disabled",
            "provider_cache_control": "disabled",
            "eligible": False,
            "reason": "node_provider_cache_policy_disabled",
        }
        provider_fallback_trace = {
            "kind": "provider_fallback_trace",
            "decision": "fallback_selected",
            "fallback_used": True,
            "requested": {"provider_id": "openai", "model": "gpt-primary", "model_ref": "openai/gpt-primary"},
            "selected": {"provider_id": "local", "model": "gemma", "model_ref": "local/gemma"},
            "failed_candidates": [
                {
                    "provider_id": "openai",
                    "model": "gpt-primary",
                    "model_ref": "openai/gpt-primary",
                    "error_type": "provider_timeout",
                },
            ],
            "fallback_candidates": [
                {
                    "provider_id": "local",
                    "model": "gemma",
                    "model_ref": "local/gemma",
                    "reason": "compatible_fallback",
                },
            ],
            "rejected_candidates": [
                {
                    "provider_id": "web-gateway",
                    "model": "browsing-model",
                    "model_ref": "web-gateway/browsing-model",
                    "reason": "permission_scope_expanded",
                },
            ],
            "required_capabilities": ["chat", "structured_output"],
            "required_permissions": ["text_generation"],
            "warnings": ["primary provider timed out"],
        }
        provider_cost_budget_approval = {
            "kind": "capability_permission_approval",
            "approval_type": "provider_cost_budget",
            "approval_id": "budget_approval",
            "status": "approved",
            "provider_cost_budget_preflight": {
                "kind": "provider_cost_budget_preflight",
                "status": "blocked",
                "budget_window_scope": {"window": "run", "root_run_id": "run_provider_profile"},
            },
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_provider_profile"
                    run["root_run_id"] = "run_provider_profile"
                    run["run_path"] = ["run_provider_profile"]
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_provider_profile",
                        root_run_id="run_provider_profile",
                        node_id="agent",
                        node_type="agent",
                        phase="agent_response",
                        provider_profile=provider_profile,
                        provider_request_timeout_seconds=12.5,
                        provider_cache_policy="disabled",
                        provider_cache_decision=provider_cache_decision,
                        provider_fallback_trace=provider_fallback_trace,
                        provider_cost_budget={"limit_usd": 1.25, "window": "run"},
                        provider_cost_budget_approval=provider_cost_budget_approval,
                        provider_rate_profile={"requests_per_minute": 30, "tokens_per_minute": 1200, "concurrency": 2},
                        provider_credential={
                            "credential_id": "primary",
                            "status": "active",
                            "source": "credential_pool",
                        },
                        provider_credential_state_update={
                            "kind": "provider_credential_state_update",
                            "credential_id": "primary",
                            "outcome": "failure",
                            "previous_status": "cooling_down",
                            "status": "exhausted",
                            "previous_failure_count": 4,
                            "failure_count": 5,
                            "cooldown_until": None,
                        },
                        provider_rate_reservation={
                            "kind": "provider_rate_reservation",
                            "status": "reserved",
                            "reservation_id": "rate_res_primary",
                            "provider_id": "local",
                            "estimated_request_tokens": 42,
                        },
                        provider_pricing={
                            "input_per_million_usd": 2.0,
                            "output_per_million_usd": 8.0,
                        },
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="gemma",
                            path="/v1/chat/completions",
                            request_raw={"model": "gemma", "messages": [{"role": "user", "content": "hello"}]},
                            response_raw={
                                "choices": [{"message": {"content": "hello"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)

        entry = payload["entries"][0]
        self.assertEqual(entry["provider_profile"], provider_profile)
        self.assertEqual(entry["provider_request_timeout_seconds"], 12.5)
        self.assertEqual(entry["provider_cache_policy"], "disabled")
        self.assertEqual(entry["provider_cache_decision"], provider_cache_decision)
        self.assertEqual(entry["provider_fallback_trace"], provider_fallback_trace)
        self.assertEqual(entry["provider_cost_budget"], {"limit_usd": 1.25, "window": "run"})
        self.assertEqual(entry["provider_cost_budget_approval"], provider_cost_budget_approval)
        self.assertEqual(
            entry["provider_rate_profile"],
            {"requests_per_minute": 30, "tokens_per_minute": 1200, "concurrency": 2},
        )
        self.assertEqual(
            entry["provider_credential"],
            {
                "credential_id": "primary",
                "status": "active",
                "source": "credential_pool",
            },
        )
        self.assertEqual(
            entry["provider_credential_state_update"],
            {
                "kind": "provider_credential_state_update",
                "credential_id": "primary",
                "outcome": "failure",
                "previous_status": "cooling_down",
                "status": "exhausted",
                "previous_failure_count": 4,
                "failure_count": 5,
                "cooldown_until": None,
            },
        )
        self.assertEqual(
            entry["provider_rate_reservation"],
            {
                "kind": "provider_rate_reservation",
                "status": "reserved",
                "reservation_id": "rate_res_primary",
                "provider_id": "local",
                "estimated_request_tokens": 42,
            },
        )
        self.assertEqual(
            entry["provider_cost_estimate"],
            {
                "kind": "provider_cost_estimate",
                "version": 1,
                "currency": "USD",
                "status": "estimated",
                "input_tokens": 1000,
                "output_tokens": 500,
                "total_tokens": 1500,
                "input_cost_usd": 0.002,
                "output_cost_usd": 0.004,
                "estimated_cost_usd": 0.006,
                "pricing": {
                    "input_per_million_usd": 2.0,
                    "output_per_million_usd": 8.0,
                },
                "budget_limit_usd": 1.25,
                "budget_window": "run",
                "budget_status": "within_budget",
                "single_call_budget_status": "within_budget",
                "previous_window_cost_usd": 0,
                "cumulative_cost_usd": 0.006,
                "cumulative_budget_status": "within_budget",
                "budget_window_scope": {
                    "window": "run",
                    "root_run_id": "run_provider_profile",
                },
            },
        )
        self.assertEqual(
            entry["provider_rate_decision"],
            {
                "kind": "provider_rate_decision",
                "version": 1,
                "mode": "audit_only",
                "scope": "single_call",
                "status": "over_limit",
                "requests_per_minute": 30,
                "tokens_per_minute": 1200,
                "concurrency": 2,
                "observed_requests": 1,
                "observed_total_tokens": 1500,
                "limit_exceeded": ["tokens_per_minute"],
                "reason": "single_call_tokens_exceed_profile",
            },
        )

    def test_model_request_logs_report_provider_cache_hit_rate_and_resources(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs
        from app.core.storage.provider_prompt_cache_store import (
            build_provider_prompt_cache_scope_fingerprint,
            remember_provider_prompt_cache_resource,
        )

        created_decision = {
            "kind": "provider_prompt_cache_result",
            "requested_policy": "prefer",
            "mode": "provider_applied",
            "provider_cache_control": "gemini_cached_content",
            "eligible": True,
            "reason": "gemini_cached_content_applied",
            "cache_resource_status": "created",
            "cached_content_name": "cachedContents/toograph-created",
            "usage": {"cache_creation_input_tokens": 1000, "cache_read_input_tokens": 1000},
        }
        reused_decision = {
            "kind": "provider_prompt_cache_result",
            "requested_policy": "prefer",
            "mode": "provider_applied",
            "provider_cache_control": "gemini_cached_content",
            "eligible": True,
            "reason": "gemini_cached_content_reused",
            "cache_resource_status": "reused",
            "cached_content_name": "cachedContents/toograph-created",
            "usage": {"cache_read_input_tokens": 1000},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    credential_fingerprint = build_provider_prompt_cache_scope_fingerprint(
                        base_url="https://generativelanguage.googleapis.com/v1beta",
                        api_key="gemini-key",
                    )
                    remember_provider_prompt_cache_resource(
                        provider_id="gemini",
                        transport="gemini-generate-content",
                        base_url="https://generativelanguage.googleapis.com/v1beta",
                        model="gemini-2.0-flash",
                        credential_fingerprint=credential_fingerprint,
                        cache_key="sha256:cache-active",
                        stable_prefix_hash="sha256:stable-active",
                        resource_name="cachedContents/toograph-active",
                        expires_at="2099-05-30T00:00:00Z",
                    )
                    remember_provider_prompt_cache_resource(
                        provider_id="gemini",
                        transport="gemini-generate-content",
                        base_url="https://generativelanguage.googleapis.com/v1beta",
                        model="gemini-2.0-flash",
                        credential_fingerprint=credential_fingerprint,
                        cache_key="sha256:cache-expired",
                        stable_prefix_hash="sha256:stable-expired",
                        resource_name="cachedContents/toograph-expired",
                        expires_at="2000-05-30T00:00:00Z",
                    )
                    with patch("app.core.storage.model_log_store.prune_provider_prompt_cache_resources", return_value={}):
                        for run_id, decision, response_text in (
                            ("run_cache_created", created_decision, "created"),
                            ("run_cache_reused", reused_decision, "reused"),
                        ):
                            run = create_initial_run_state("graph_root", "Root Graph")
                            run["run_id"] = run_id
                            run["root_run_id"] = run_id
                            run["run_path"] = [run_id]
                            run_store.save_run(run)
                            with use_model_call_context(
                                run_id=run_id,
                                root_run_id=run_id,
                                node_id="agent",
                                node_type="agent",
                                phase="agent_response",
                                provider_cache_policy="prefer",
                                provider_cache_decision=decision,
                            ):
                                append_model_request_log(
                                    provider_id="gemini",
                                    transport="gemini-generate-content",
                                    model="gemini-2.0-flash",
                                    path="/models/gemini-2.0-flash:generateContent",
                                    request_raw={"contents": [{"role": "user", "parts": [{"text": "hello"}]}]},
                                    response_raw={"candidates": [{"content": {"parts": [{"text": response_text}]}}]},
                                    duration_ms=10,
                                    status_code=200,
                                )

                    payload = list_model_request_logs(page=1, size=10)

        summary = payload["provider_cache_summary"]
        self.assertEqual(summary["kind"], "provider_cache_summary")
        self.assertEqual(summary["decision_count"], 2)
        self.assertEqual(summary["provider_applied_count"], 2)
        self.assertEqual(summary["resource_created_count"], 1)
        self.assertEqual(summary["resource_reused_count"], 1)
        self.assertEqual(summary["resource_hit_rate"], 0.5)
        self.assertEqual(summary["cache_creation_input_tokens"], 1000)
        self.assertEqual(summary["cache_read_input_tokens"], 2000)
        self.assertEqual(summary["resource_status_counts"]["active"], 1)
        self.assertEqual(summary["resource_status_counts"]["expired"], 1)
        self.assertEqual(summary["resource_total"], 2)

    def test_model_request_log_metadata_update_attaches_provider_fallback_trace(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import (
            append_model_request_log,
            list_model_request_logs,
            update_model_request_log_metadata,
        )

        provider_fallback_trace = {
            "kind": "provider_fallback_trace",
            "decision": "fallback_selected",
            "fallback_used": True,
            "requested": {"provider_id": "openai", "model": "gpt-primary", "model_ref": "openai/gpt-primary"},
            "selected": {"provider_id": "local", "model": "gemma", "model_ref": "local/gemma"},
            "failed_candidates": [
                {
                    "provider_id": "openai",
                    "model": "gpt-primary",
                    "model_ref": "openai/gpt-primary",
                    "error_type": "provider_timeout",
                },
            ],
            "fallback_candidates": [
                {
                    "provider_id": "local",
                    "model": "gemma",
                    "model_ref": "local/gemma",
                    "reason": "compatible_fallback",
                },
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_provider_fallback"
                    run["root_run_id"] = "run_provider_fallback"
                    run["run_path"] = ["run_provider_fallback"]
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_provider_fallback",
                        root_run_id="run_provider_fallback",
                        node_id="agent",
                        node_type="agent",
                        phase="agent_response",
                    ):
                        created = append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="gemma",
                            path="/v1/chat/completions",
                            request_raw={"model": "gemma", "messages": [{"role": "user", "content": "hello"}]},
                            response_raw={"choices": [{"message": {"content": "hello"}}]},
                            duration_ms=10,
                            status_code=200,
                        )

                    updated = update_model_request_log_metadata(
                        created["id"],
                        {"provider_fallback_trace": provider_fallback_trace},
                    )
                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(updated["provider_fallback_trace"], provider_fallback_trace)
        self.assertEqual(payload["entries"][0]["provider_fallback_trace"], provider_fallback_trace)

    def test_provider_cost_budget_accumulates_across_root_run_model_calls(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.run_tree import create_child_run_state
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    root = create_initial_run_state("graph_root", "Root Graph")
                    root["run_id"] = "run_budget_root"
                    root["root_run_id"] = "run_budget_root"
                    root["run_path"] = ["run_budget_root"]
                    child = create_child_run_state(
                        root,
                        graph_id="graph_child",
                        graph_name="Child Graph",
                        parent_node_id="subgraph",
                        invocation_kind="subgraph_node",
                        invocation_key="embedded:Child",
                    )
                    child["run_id"] = "run_budget_child"
                    child["run_path"] = ["run_budget_root", "run_budget_child"]
                    run_store.save_run(root)
                    run_store.save_run(child)

                    common_provider_context = {
                        "provider_cost_budget": {"limit_usd": 0.01, "window": "run"},
                        "provider_pricing": {
                            "input_per_million_usd": 2.0,
                            "output_per_million_usd": 8.0,
                        },
                    }
                    with use_model_call_context(
                        run_id="run_budget_root",
                        root_run_id="run_budget_root",
                        node_id="root_agent",
                        node_type="agent",
                        phase="agent_response",
                        **common_provider_context,
                    ):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "one"}]},
                            response_raw={
                                "choices": [{"message": {"content": "one"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )
                    with use_model_call_context(
                        run_id="run_budget_child",
                        root_run_id="run_budget_root",
                        parent_run_id="run_budget_root",
                        parent_node_id="subgraph",
                        node_id="child_agent",
                        node_type="agent",
                        phase="agent_response",
                        **common_provider_context,
                    ):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "two"}]},
                            response_raw={
                                "choices": [{"message": {"content": "two"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)

        entries_by_run = {entry["run_id"]: entry for entry in payload["entries"]}
        root_estimate = entries_by_run["run_budget_root"]["provider_cost_estimate"]
        child_estimate = entries_by_run["run_budget_child"]["provider_cost_estimate"]
        self.assertEqual(root_estimate["estimated_cost_usd"], 0.006)
        self.assertEqual(root_estimate["previous_window_cost_usd"], 0)
        self.assertEqual(root_estimate["cumulative_cost_usd"], 0.006)
        self.assertEqual(root_estimate["budget_status"], "within_budget")
        self.assertEqual(child_estimate["estimated_cost_usd"], 0.006)
        self.assertEqual(child_estimate["previous_window_cost_usd"], 0.006)
        self.assertEqual(child_estimate["cumulative_cost_usd"], 0.012)
        self.assertEqual(child_estimate["budget_status"], "over_budget")
        self.assertEqual(child_estimate["cumulative_budget_status"], "over_budget")
        self.assertEqual(
            child_estimate["budget_window_scope"],
            {"window": "run", "root_run_id": "run_budget_root"},
        )

    def test_provider_cost_budget_preflight_blocks_when_window_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, evaluate_provider_cost_budget_preflight

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_budget_guard"
                    run["root_run_id"] = "run_budget_guard"
                    run["run_path"] = ["run_budget_guard"]
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_budget_guard",
                        root_run_id="run_budget_guard",
                        node_id="agent",
                        node_type="agent",
                        phase="agent_response",
                        provider_cost_budget={"limit_usd": 0.005, "window": "run"},
                        provider_pricing={
                            "input_per_million_usd": 2.0,
                            "output_per_million_usd": 8.0,
                        },
                    ):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "one"}]},
                            response_raw={
                                "choices": [{"message": {"content": "one"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )

                    preflight = evaluate_provider_cost_budget_preflight(
                        {
                            "run_id": "run_budget_guard",
                            "root_run_id": "run_budget_guard",
                            "node_id": "agent",
                        },
                        {"limit_usd": 0.005, "window": "run"},
                    )

        self.assertEqual(
            preflight,
            {
                "kind": "provider_cost_budget_preflight",
                "version": 1,
                "mode": "enforce_existing_window",
                "currency": "USD",
                "status": "blocked",
                "reason": "provider_cost_budget_already_exhausted",
                "budget_limit_usd": 0.005,
                "budget_window": "run",
                "previous_window_cost_usd": 0.006,
                "budget_window_scope": {"window": "run", "root_run_id": "run_budget_guard"},
            },
        )

    def test_provider_cost_budget_preflight_marks_approval_strategy_when_window_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, evaluate_provider_cost_budget_preflight

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_budget_approval"
                    run["root_run_id"] = "run_budget_approval"
                    run["run_path"] = ["run_budget_approval"]
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_budget_approval",
                        root_run_id="run_budget_approval",
                        node_id="agent",
                        node_type="agent",
                        phase="agent_response",
                        provider_cost_budget={"limit_usd": 0.005, "window": "run"},
                        provider_pricing={
                            "input_per_million_usd": 2.0,
                            "output_per_million_usd": 8.0,
                        },
                    ):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "one"}]},
                            response_raw={
                                "choices": [{"message": {"content": "one"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )

                    preflight = evaluate_provider_cost_budget_preflight(
                        {
                            "run_id": "run_budget_approval",
                            "root_run_id": "run_budget_approval",
                            "node_id": "agent",
                        },
                        {"limit_usd": 0.005, "window": "run", "on_exceeded": "request_approval"},
                    )
                    degradation_preflight = evaluate_provider_cost_budget_preflight(
                        {
                            "run_id": "run_budget_approval",
                            "root_run_id": "run_budget_approval",
                            "node_id": "agent",
                        },
                        {"limit_usd": 0.005, "window": "run", "on_exceeded": "degrade_model"},
                    )

        self.assertEqual(preflight["status"], "blocked")
        self.assertEqual(preflight["on_exceeded"], "request_approval")
        self.assertTrue(preflight["requires_approval"])
        self.assertEqual(
            preflight["approval_request"],
            {
                "kind": "provider_cost_budget_approval_request",
                "version": 1,
                "reason": "provider_cost_budget_already_exhausted",
                "budget_limit_usd": 0.005,
                "previous_window_cost_usd": 0.006,
                "budget_window": "run",
                "budget_window_scope": {"window": "run", "root_run_id": "run_budget_approval"},
                "requested_action": "approve_budget_overrun_or_degrade_model",
            },
        )
        self.assertEqual(degradation_preflight["status"], "blocked")
        self.assertEqual(degradation_preflight["on_exceeded"], "degrade_model")
        self.assertTrue(degradation_preflight["requires_degradation"])
        self.assertNotIn("approval_request", degradation_preflight)

    def test_provider_rate_profile_preflight_blocks_when_minute_window_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, evaluate_provider_rate_profile_preflight

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_rate_guard"
                    run["root_run_id"] = "run_rate_guard"
                    run["run_path"] = ["run_rate_guard"]
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_rate_guard",
                        root_run_id="run_rate_guard",
                        node_id="agent",
                        node_type="agent",
                        phase="agent_response",
                        provider_rate_profile={"requests_per_minute": 1, "tokens_per_minute": 1200, "concurrency": 2},
                    ):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "one"}]},
                            response_raw={
                                "choices": [{"message": {"content": "one"}}],
                                "usage": {"input_tokens": 1000, "output_tokens": 500},
                            },
                            duration_ms=10,
                            status_code=200,
                        )

                    preflight = evaluate_provider_rate_profile_preflight(
                        {
                            "run_id": "run_rate_guard",
                            "root_run_id": "run_rate_guard",
                            "node_id": "agent",
                            "provider_id": "openai",
                        },
                        {"requests_per_minute": 1, "tokens_per_minute": 1200, "concurrency": 2},
                    )

        self.assertEqual(preflight["kind"], "provider_rate_profile_preflight")
        self.assertEqual(preflight["version"], 1)
        self.assertEqual(preflight["mode"], "enforce_recent_window")
        self.assertEqual(preflight["status"], "blocked")
        self.assertEqual(preflight["reason"], "provider_rate_profile_already_exhausted")
        self.assertEqual(preflight["requests_per_minute"], 1)
        self.assertEqual(preflight["tokens_per_minute"], 1200)
        self.assertEqual(preflight["concurrency"], 2)
        self.assertEqual(preflight["observed_requests"], 1)
        self.assertEqual(preflight["observed_total_tokens"], 1500)
        self.assertEqual(preflight["limit_exceeded"], ["requests_per_minute", "tokens_per_minute"])
        self.assertEqual(preflight["window_seconds"], 60)
        self.assertEqual(preflight["scope"]["provider_id"], "openai")

    def test_provider_rate_profile_preflight_blocks_when_projected_request_tokens_exceed_window(self) -> None:
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import evaluate_provider_rate_profile_preflight

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_rate_projection"
                    run["root_run_id"] = "run_rate_projection"
                    run["run_path"] = ["run_rate_projection"]
                    run_store.save_run(run)

                    preflight = evaluate_provider_rate_profile_preflight(
                        {
                            "run_id": "run_rate_projection",
                            "root_run_id": "run_rate_projection",
                            "node_id": "agent",
                            "provider_id": "openai",
                        },
                        {"tokens_per_minute": 1200},
                        estimated_request_tokens=1201,
                    )

        self.assertEqual(preflight["kind"], "provider_rate_profile_preflight")
        self.assertEqual(preflight["mode"], "enforce_recent_window")
        self.assertEqual(preflight["status"], "blocked")
        self.assertEqual(preflight["reason"], "provider_rate_profile_projected_window_exhausted")
        self.assertEqual(preflight["tokens_per_minute"], 1200)
        self.assertEqual(preflight["observed_total_tokens"], 0)
        self.assertEqual(preflight["estimated_request_tokens"], 1201)
        self.assertEqual(preflight["projected_total_tokens"], 1201)
        self.assertEqual(preflight["limit_exceeded"], ["tokens_per_minute"])

    def test_provider_rate_profile_preflight_reports_retry_after_for_recent_window_exhaustion(self) -> None:
        from datetime import datetime, timedelta, timezone

        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, evaluate_provider_rate_profile_preflight

        now = datetime(2026, 5, 28, 12, 0, 0, tzinfo=timezone.utc)
        recent_completed_at = now - timedelta(seconds=50)
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_rate_retry_after"
                    run["root_run_id"] = "run_rate_retry_after"
                    run["run_path"] = ["run_rate_retry_after"]
                    run_store.save_run(run)

                    with use_model_call_context(run_id="run_rate_retry_after", root_run_id="run_rate_retry_after", node_id="agent"):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={"model": "gpt-4.1", "messages": [{"role": "user", "content": "one"}]},
                            response_raw={"choices": [{"message": {"content": "one"}}], "usage": {"input_tokens": 10}},
                            duration_ms=10,
                            status_code=200,
                        )

                    with database.get_connection() as connection:
                        connection.execute(
                            "UPDATE graph_model_calls SET completed_at = ?, started_at = ? WHERE run_id = ?",
                            (recent_completed_at.isoformat(), recent_completed_at.isoformat(), "run_rate_retry_after"),
                        )

                    preflight = evaluate_provider_rate_profile_preflight(
                        {
                            "run_id": "run_rate_retry_after",
                            "root_run_id": "run_rate_retry_after",
                            "node_id": "agent",
                            "provider_id": "openai",
                        },
                        {"requests_per_minute": 1},
                        now=now,
                    )

        self.assertEqual(preflight["status"], "blocked")
        self.assertEqual(preflight["limit_exceeded"], ["requests_per_minute"])
        self.assertEqual(preflight["retry_after_seconds"], 10)
        self.assertEqual(preflight["retry_after_at"], (now + timedelta(seconds=10)).isoformat())

    def test_provider_rate_profile_preflight_counts_active_reservations(self) -> None:
        from datetime import datetime, timezone

        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import (
            evaluate_provider_rate_profile_preflight,
            release_provider_rate_reservation,
            reserve_provider_rate_profile_capacity,
        )

        now = datetime(2026, 5, 28, 12, 0, 0, tzinfo=timezone.utc)
        call_context = {
            "run_id": "run_rate_reservation",
            "root_run_id": "run_rate_reservation",
            "node_id": "agent",
            "provider_id": "openai",
            "model": "gpt-4.1",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_rate_reservation"
                    run["root_run_id"] = "run_rate_reservation"
                    run["run_path"] = ["run_rate_reservation"]
                    run_store.save_run(run)

                    reservation = reserve_provider_rate_profile_capacity(
                        call_context,
                        {"requests_per_minute": 1, "tokens_per_minute": 20},
                        estimated_request_tokens=15,
                        now=now,
                    )
                    blocked = evaluate_provider_rate_profile_preflight(
                        call_context,
                        {"requests_per_minute": 1, "tokens_per_minute": 20},
                        estimated_request_tokens=1,
                        now=now,
                    )
                    release_provider_rate_reservation(reservation["reservation_id"], released_at=now)
                    released = evaluate_provider_rate_profile_preflight(
                        call_context,
                        {"requests_per_minute": 1, "tokens_per_minute": 20},
                        estimated_request_tokens=1,
                        now=now,
                    )

        self.assertEqual(reservation["kind"], "provider_rate_reservation")
        self.assertEqual(reservation["status"], "reserved")
        self.assertEqual(reservation["provider_id"], "openai")
        self.assertEqual(reservation["estimated_request_tokens"], 15)
        self.assertEqual(blocked["status"], "blocked")
        self.assertEqual(blocked["observed_requests"], 0)
        self.assertEqual(blocked["reserved_requests"], 1)
        self.assertEqual(blocked["reserved_total_tokens"], 15)
        self.assertEqual(blocked["projected_total_tokens"], 16)
        self.assertEqual(blocked["limit_exceeded"], ["requests_per_minute"])
        self.assertEqual(released["status"], "within_profile")
        self.assertEqual(released["reserved_requests"], 0)

    def test_provider_rate_wait_queue_claims_fifo_turns_from_database(self) -> None:
        from datetime import datetime, timedelta, timezone

        from app.core.storage import database
        from app.core.storage.model_log_store import (
            claim_provider_rate_wait_queue_turn,
            enqueue_provider_rate_wait_queue_entry,
            release_provider_rate_wait_queue_entry,
        )

        now = datetime(2026, 5, 28, 12, 0, 0, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()

                    first = enqueue_provider_rate_wait_queue_entry(
                        "provider:openai",
                        {"run_id": "run_queue_a", "provider_id": "openai", "model": "gpt-4.1"},
                        now=now,
                        ttl_seconds=30,
                    )
                    second = enqueue_provider_rate_wait_queue_entry(
                        "provider:openai",
                        {"run_id": "run_queue_b", "provider_id": "openai", "model": "gpt-4.1"},
                        now=now + timedelta(milliseconds=1),
                        ttl_seconds=30,
                    )
                    first_turn = claim_provider_rate_wait_queue_turn(
                        first["queue_entry_id"],
                        now=now + timedelta(milliseconds=2),
                    )
                    second_wait = claim_provider_rate_wait_queue_turn(
                        second["queue_entry_id"],
                        now=now + timedelta(milliseconds=3),
                    )
                    release = release_provider_rate_wait_queue_entry(
                        first["queue_entry_id"],
                        released_at=now + timedelta(milliseconds=4),
                    )
                    second_turn = claim_provider_rate_wait_queue_turn(
                        second["queue_entry_id"],
                        now=now + timedelta(milliseconds=5),
                    )

                    rows = database.get_connection().execute(
                        """
                        SELECT queue_entry_id, status
                        FROM provider_rate_wait_queue
                        ORDER BY enqueued_at ASC
                        """
                    ).fetchall()

        self.assertEqual(first["kind"], "provider_rate_wait_queue_entry")
        self.assertEqual(first["status"], "waiting")
        self.assertEqual(second["status"], "waiting")
        self.assertEqual(first_turn["status"], "acquired")
        self.assertEqual(first_turn["position"], 0)
        self.assertEqual(second_wait["status"], "waiting")
        self.assertEqual(second_wait["position"], 1)
        self.assertEqual(release["status"], "released")
        self.assertEqual(second_turn["status"], "acquired")
        self.assertEqual(second_turn["position"], 0)
        self.assertEqual([row["status"] for row in rows], ["released", "acquired"])

    def test_provider_rate_wait_queue_expires_abandoned_head(self) -> None:
        from datetime import datetime, timedelta, timezone

        from app.core.storage import database
        from app.core.storage.model_log_store import (
            claim_provider_rate_wait_queue_turn,
            enqueue_provider_rate_wait_queue_entry,
        )

        now = datetime(2026, 5, 28, 12, 0, 0, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()

                    first = enqueue_provider_rate_wait_queue_entry(
                        "provider:openai",
                        {"run_id": "run_expired_queue_a", "provider_id": "openai"},
                        now=now,
                        ttl_seconds=1,
                    )
                    second = enqueue_provider_rate_wait_queue_entry(
                        "provider:openai",
                        {"run_id": "run_expired_queue_b", "provider_id": "openai"},
                        now=now + timedelta(milliseconds=1),
                        ttl_seconds=60,
                    )
                    second_turn = claim_provider_rate_wait_queue_turn(
                        second["queue_entry_id"],
                        now=now + timedelta(seconds=2),
                    )

                    rows = database.get_connection().execute(
                        """
                        SELECT queue_entry_id, status
                        FROM provider_rate_wait_queue
                        ORDER BY enqueued_at ASC
                        """
                    ).fetchall()

        self.assertEqual(first["status"], "waiting")
        self.assertEqual(second_turn["status"], "acquired")
        self.assertEqual(second_turn["position"], 0)
        self.assertEqual(second_turn["expired_count"], 1)
        self.assertEqual([row["status"] for row in rows], ["expired", "acquired"])

    def test_lists_model_request_logs_as_run_tree_without_legacy_jsonl(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.run_tree import create_child_run_state
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    root = create_initial_run_state("graph_root", "Root Graph")
                    root["run_id"] = "run_root"
                    root["root_run_id"] = "run_root"
                    root["run_path"] = ["run_root"]
                    root["node_executions"] = [
                        {"execution_id": "plan:1", "node_id": "plan", "node_type": "agent", "status": "success", "duration_ms": 10},
                        {"execution_id": "nested:2", "node_id": "nested", "node_type": "subgraph", "status": "success", "duration_ms": 20},
                        {"execution_id": "draft:3", "node_id": "draft", "node_type": "new_llm", "status": "success", "duration_ms": 15},
                    ]
                    child = create_child_run_state(
                        root,
                        graph_id="graph_child",
                        graph_name="Child Graph",
                        parent_node_id="nested",
                        invocation_kind="subgraph_node",
                        invocation_key="embedded:Nested",
                    )
                    child["run_id"] = "run_child"
                    child["run_path"] = ["run_root", "run_child"]
                    child["node_executions"] = [
                        {"execution_id": "child_agent:1", "node_id": "child_agent", "node_type": "agent", "status": "success", "duration_ms": 30},
                    ]
                    run_store.save_run(root)
                    run_store.save_run(child)

                    with use_model_call_context(run_id="run_root", root_run_id="run_root", execution_id="plan:1", node_id="plan", node_type="agent", phase="agent_response"):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="root-model",
                            path="/chat/completions",
                            request_raw={"model": "root-model", "messages": [{"role": "user", "content": "root"}]},
                            response_raw={"choices": [{"message": {"content": "root reply"}}]},
                            duration_ms=10,
                            status_code=200,
                        )
                    with use_model_call_context(
                        run_id="run_child",
                        root_run_id="run_root",
                        execution_id="child_agent:1",
                        node_id="child_agent",
                        node_type="agent",
                        phase="agent_response",
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="child-model",
                            path="/chat/completions",
                            request_raw={"model": "child-model", "messages": [{"role": "user", "content": "child"}]},
                            response_raw={"choices": [{"message": {"content": "child reply"}}]},
                            duration_ms=20,
                            status_code=200,
                        )
                    with use_model_call_context(
                        run_id="run_root",
                        root_run_id="run_root",
                        execution_id="draft:3",
                        node_id="draft",
                        node_type="new_llm",
                        phase="agent_response",
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="new-llm-model",
                            path="/chat/completions",
                            request_raw={"model": "new-llm-model", "messages": [{"role": "user", "content": "draft"}]},
                            response_raw={"choices": [{"message": {"content": "draft reply"}}]},
                            duration_ms=15,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 3)
        self.assertEqual([root["run_id"] for root in payload["run_trees"]], ["run_root"])
        tree = payload["run_trees"][0]
        self.assertEqual(tree["kind"], "run")
        self.assertEqual(tree["label"], "Root Graph")
        self.assertEqual([child["id"] for child in tree["children"]], ["node:run_root:plan", "node:run_root:nested", "node:run_root:draft"])
        root_entry = next(entry for entry in payload["entries"] if entry["model"] == "root-model")
        child_entry = next(entry for entry in payload["entries"] if entry["model"] == "child-model")
        new_llm_entry = next(entry for entry in payload["entries"] if entry["model"] == "new-llm-model")
        plan_node = tree["children"][0]
        self.assertEqual(plan_node["kind"], "graph_node")
        self.assertEqual(plan_node["model_log_ids"], [root_entry["id"]])
        nested_node = tree["children"][1]
        self.assertEqual(nested_node["node_type"], "subgraph")
        self.assertEqual(nested_node["children"][0]["kind"], "run")
        self.assertEqual(nested_node["children"][0]["run_id"], "run_child")
        self.assertEqual(nested_node["children"][0]["children"][0]["model_log_ids"], [child_entry["id"]])
        new_llm_node = tree["children"][2]
        self.assertEqual(new_llm_node["node_type"], "new_llm")
        self.assertEqual(new_llm_node["model_log_ids"], [new_llm_entry["id"]])

    def test_prunes_model_request_logs_by_latest_root_runs(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs, prune_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    for index, run_id in enumerate(["run_old", "run_mid", "run_new"]):
                        run = create_initial_run_state(f"graph_{index}", f"Graph {index}")
                        run["run_id"] = run_id
                        run["root_run_id"] = run_id
                        run["run_path"] = [run_id]
                        run["started_at"] = f"2026-05-26T00:00:0{index}Z"
                        run_store.save_run(run)
                        with use_model_call_context(run_id=run_id, root_run_id=run_id, node_id="agent", node_type="agent"):
                            append_model_request_log(
                                provider_id="local",
                                transport="openai-compatible",
                                model=run_id,
                                path="/chat/completions",
                                request_raw={"model": run_id, "messages": [{"role": "user", "content": run_id}]},
                                response_raw={"choices": [{"message": {"content": run_id}}]},
                                duration_ms=1,
                                status_code=200,
                            )

                    removed = prune_model_request_logs(max_root_runs=2)
                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(removed, 1)
        self.assertEqual([entry["root_run_id"] for entry in payload["entries"]], ["run_new", "run_mid"])
        self.assertEqual([tree["run_id"] for tree in payload["run_trees"]], ["run_new", "run_mid"])

    def test_saving_model_log_retention_prunes_existing_history(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs, save_model_log_retention_settings

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    for index, run_id in enumerate(["run_old", "run_new"]):
                        run = create_initial_run_state(f"graph_{index}", f"Graph {index}")
                        run["run_id"] = run_id
                        run["root_run_id"] = run_id
                        run["run_path"] = [run_id]
                        run["started_at"] = f"2026-05-26T00:00:0{index}Z"
                        run_store.save_run(run)
                        with use_model_call_context(run_id=run_id, root_run_id=run_id, node_id="agent", node_type="agent"):
                            append_model_request_log(
                                provider_id="local",
                                transport="openai-compatible",
                                model=run_id,
                                path="/chat/completions",
                                request_raw={"model": run_id, "messages": [{"role": "user", "content": run_id}]},
                                response_raw={"choices": [{"message": {"content": run_id}}]},
                                duration_ms=1,
                                status_code=200,
                            )

                    with patch("app.core.storage.model_log_store.load_app_settings", return_value={}):
                        with patch("app.core.storage.model_log_store.save_app_settings", return_value=None):
                            saved = save_model_log_retention_settings(max_root_runs=1)
                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(saved, {"max_root_runs": 1, "cache_resource_retention_days": 30})
        self.assertEqual([entry["root_run_id"] for entry in payload["entries"]], ["run_new"])

    def test_saving_model_log_retention_prunes_prompt_cache_resources(self) -> None:
        from app.core.storage.model_log_store import save_model_log_retention_settings

        with patch("app.core.storage.model_log_store.load_app_settings", return_value={}):
            with patch("app.core.storage.model_log_store.save_app_settings", return_value=None):
                with patch("app.core.storage.model_log_store.prune_model_request_logs") as prune_logs:
                    with patch("app.core.storage.model_log_store.prune_provider_prompt_cache_resources") as prune_cache:
                        saved = save_model_log_retention_settings(
                            max_root_runs=7,
                            cache_resource_retention_days=45,
                        )

        self.assertEqual(saved, {"max_root_runs": 7, "cache_resource_retention_days": 45})
        prune_logs.assert_called_once_with(max_root_runs=7)
        prune_cache.assert_called_once_with(max_terminal_age_days=45)

    def test_prunes_old_terminal_prompt_cache_resources(self) -> None:
        from app.core.storage import database
        from app.core.storage.provider_prompt_cache_store import (
            build_provider_prompt_cache_scope_fingerprint,
            prune_provider_prompt_cache_resources,
            remember_provider_prompt_cache_resource,
            summarize_provider_prompt_cache_resources,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    credential_fingerprint = build_provider_prompt_cache_scope_fingerprint(
                        base_url="https://generativelanguage.googleapis.com/v1beta",
                        api_key="gemini-key",
                    )
                    common = {
                        "provider_id": "gemini",
                        "transport": "gemini-generate-content",
                        "base_url": "https://generativelanguage.googleapis.com/v1beta",
                        "model": "models/gemini-2.0-flash",
                        "credential_fingerprint": credential_fingerprint,
                    }
                    remember_provider_prompt_cache_resource(
                        **common,
                        cache_key="sha256:active",
                        stable_prefix_hash="sha256:stable-active",
                        resource_name="cachedContents/toograph-active",
                        expires_at="2099-05-30T00:00:00Z",
                        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
                    )
                    remember_provider_prompt_cache_resource(
                        **common,
                        cache_key="sha256:expired",
                        stable_prefix_hash="sha256:stable-expired",
                        resource_name="cachedContents/toograph-expired",
                        expires_at="2026-04-02T00:00:00Z",
                        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
                    )
                    remember_provider_prompt_cache_resource(
                        **common,
                        cache_key="sha256:superseded",
                        stable_prefix_hash="sha256:stable-superseded",
                        resource_name="cachedContents/toograph-superseded-old",
                        expires_at="2099-05-30T00:00:00Z",
                        now=datetime(2026, 4, 3, tzinfo=timezone.utc),
                    )
                    remember_provider_prompt_cache_resource(
                        **common,
                        cache_key="sha256:superseded",
                        stable_prefix_hash="sha256:stable-superseded",
                        resource_name="cachedContents/toograph-superseded-current",
                        expires_at="2099-05-30T00:00:00Z",
                        now=datetime(2026, 4, 4, tzinfo=timezone.utc),
                    )

                    result = prune_provider_prompt_cache_resources(
                        max_terminal_age_days=14,
                        now=datetime(2026, 5, 29, tzinfo=timezone.utc),
                    )
                    summary = summarize_provider_prompt_cache_resources(now=datetime(2026, 5, 29, tzinfo=timezone.utc))
                    with database.get_connection() as connection:
                        names = [
                            row["resource_name"]
                            for row in connection.execute(
                                "SELECT resource_name FROM provider_prompt_cache_resources ORDER BY resource_name"
                            ).fetchall()
                        ]

        self.assertEqual(result["pruned_count"], 2)
        self.assertEqual(summary["status_counts"], {"active": 2})
        self.assertEqual(
            names,
            [
                "cachedContents/toograph-active",
                "cachedContents/toograph-superseded-current",
            ],
        )

    def test_ignores_model_request_logs_without_run_context(self) -> None:
        from app.core.storage import database
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    append_model_request_log(
                        provider_id="local",
                        transport="openai-compatible",
                        model="gemma",
                        path="/v1/chat/completions",
                        request_raw={"model": "gemma", "messages": [{"role": "user", "content": "hello"}]},
                        response_raw={"choices": [{"message": {"content": "hello"}}]},
                        duration_ms=1,
                        status_code=200,
                    )

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 0)
        self.assertEqual(payload["entries"], [])
        self.assertEqual(payload["run_trees"], [])

    def test_langgraph_runtime_attaches_model_call_context(self) -> None:
        from app.core.langgraph.runtime import execute_node_system_graph_langgraph
        from app.core.runtime.state import create_initial_run_state
        from app.core.schemas.node_system import NodeSystemGraphDocument
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_context",
                "name": "Context Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "hello"},
                    "answer": {"name": "Answer", "type": "text"},
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "question"}],
                    },
                    "agent_answer": {
                        "kind": "agent",
                        "name": "Answer Agent",
                        "ui": {"position": {"x": 200, "y": 0}},
                        "reads": [{"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {
                            "taskInstruction": "Answer.",
                            "actionKey": "",
                            "modelSource": "override",
                            "model": "local/context-model",
                            "thinkingMode": "off",
                            "temperature": 0.2,
                        },
                    },
                },
                "edges": [{"source": "input_question", "target": "agent_answer"}],
                "conditional_edges": [],
            }
        )

        def fake_chat(**_kwargs):
            append_model_request_log(
                provider_id="local",
                transport="openai-compatible",
                model="context-model",
                path="/chat/completions",
                request_raw={"model": "context-model", "messages": [{"role": "user", "content": "hello"}]},
                response_raw={"choices": [{"message": {"content": "{\"answer\":\"ok\"}"}}]},
                duration_ms=5,
                status_code=200,
            )
            return '{"answer":"ok"}', {"model": "context-model", "provider_id": "local", "warnings": []}

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    initial_state = create_initial_run_state(graph.graph_id, graph.name)
                    initial_state["run_id"] = "run_context"
                    initial_state["root_run_id"] = "run_context"
                    initial_state["run_path"] = ["run_context"]
                    initial_state["runtime_backend"] = "langgraph"
                    initial_state["graph_snapshot"] = graph.model_dump(by_alias=True)
                    initial_state["node_status_map"] = {node_id: "idle" for node_id in graph.nodes}
                    run_store.save_run(initial_state)
                    with patch("app.core.runtime.node_system_executor._chat_with_local_model_with_meta", side_effect=fake_chat):
                        execute_node_system_graph_langgraph(graph, initial_state, persist_progress=True)

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 1)
        entry = payload["entries"][0]
        self.assertEqual(entry["run_id"], "run_context")
        self.assertEqual(entry["root_run_id"], "run_context")
        self.assertEqual(entry["node_id"], "agent_answer")
        self.assertEqual(entry["node_type"], "agent")
        self.assertEqual(entry["node_name"], "Answer Agent")
        self.assertEqual(entry["phase"], "agent_response")
        self.assertEqual(payload["run_trees"][0]["children"][0]["model_log_ids"], [entry["id"]])

    def test_sanitizes_large_inline_media_payloads(self) -> None:
        from app.core.storage.model_log_store import sanitize_payload_for_log

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "video/mp4",
                                "data": "A" * 2048,
                            }
                        }
                    ],
                }
            ]
        }

        sanitized = sanitize_payload_for_log(payload)

        self.assertEqual(
            sanitized["contents"][0]["parts"][0]["inline_data"]["data"],
            "<inline-media-data mime=video/mp4 chars=2048>",
        )

    def test_appended_model_request_log_redacts_secret_values(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        request_secret = "sk-requestsecretvalue1234567890"
        response_secret = "sk-responsesecretvalue1234567890"
        error_secret = "sk-errorsecretvalue1234567890"
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_secret", "Secret Graph")
                    run["run_id"] = "run_secret"
                    run["root_run_id"] = "run_secret"
                    run["run_path"] = ["run_secret"]
                    run_store.save_run(run)
                    with use_model_call_context(run_id="run_secret", root_run_id="run_secret", node_id="agent", node_type="agent"):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={
                                "model": "gpt-4.1",
                                "messages": [
                                    {"role": "user", "content": f"OPENAI_API_KEY={request_secret}"},
                                ],
                            },
                            response_raw={"error": f"provider returned token {response_secret}"},
                            duration_ms=20,
                            status_code=500,
                            error=f"request failed with token {error_secret}",
                        )
                    payload = list_model_request_logs(page=1, size=10)

        entry = payload["entries"][0]
        serialized_entry = str(entry)
        self.assertNotIn(request_secret, serialized_entry)
        self.assertNotIn(response_secret, serialized_entry)
        self.assertNotIn(error_secret, serialized_entry)
        self.assertIn("[REDACTED_SECRET]", entry["request_raw"]["messages"][0]["content"])
        self.assertIn("[REDACTED_SECRET]", entry["response_raw"]["error"])
        self.assertIn("[REDACTED_SECRET]", entry["error"])

    def test_model_logs_route_returns_paginated_payload(self) -> None:
        with patch(
            "app.api.routes_model_logs.list_model_request_logs",
            return_value={
                "entries": [],
                "run_trees": [],
                "total": 0,
                "page": 2,
                "size": 5,
                "pages": 0,
                "retention": {"max_root_runs": 200, "cache_resource_retention_days": 30},
            },
        ) as list_logs:
            with TestClient(app) as client:
                response = client.get("/api/model-logs?page=2&size=5&q=gemma")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["page"], 2)
        list_logs.assert_called_once_with(page=2, size=5, query="gemma")

    def test_provider_chat_records_raw_request_and_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        def fake_streaming_request(**kwargs):
            return (
                {"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]},
                kwargs["stream_payload"],
                None,
                True,
            )

        with patch("app.tools.model_provider_client.post_streaming_json_with_fallback", side_effect=fake_streaming_request):
            with patch("app.tools.model_provider_client.append_model_request_log") as append_log:
                content, _meta = chat_with_model_provider(
                    provider_id="openai",
                    transport="openai-compatible",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-test",
                    model="gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "openai")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["messages"][0], {"role": "system", "content": "sys"})
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_1")

    def test_local_chat_records_raw_request_and_response(self) -> None:
        from app.tools.local_llm import _chat_with_local_model_with_meta

        with patch(
            "app.tools.local_llm._request_local_chat_completion",
            return_value={"id": "chatcmpl_local", "model": "gemma", "choices": [{"message": {"content": "hello"}}]},
        ):
            with patch("app.tools.local_llm.append_model_request_log") as append_log:
                content, _meta = _chat_with_local_model_with_meta(
                    system_prompt="sys",
                    user_prompt="user",
                    model="gemma",
                    provider_id="local",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "local")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["model"], "gemma")
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_local")


if __name__ == "__main__":
    unittest.main()
