from __future__ import annotations

import unittest


class ProviderFallbackResolverTests(unittest.TestCase):
    def test_resolver_selects_compatible_fallback_after_provider_failure(self) -> None:
        from app.core.provider_fallback import resolve_provider_fallback

        result = resolve_provider_fallback(
            {
                "requested_model_ref": "openai/gpt-primary",
                "required_capabilities": ["chat", "structured_output"],
                "required_permissions": ["text_generation"],
                "failure_event": {
                    "model_ref": "openai/gpt-primary",
                    "provider_id": "openai",
                    "error_type": "provider_timeout",
                    "message": "upstream timeout",
                },
                "provider_candidates": [
                    {
                        "model_ref": "openai/gpt-primary",
                        "provider_id": "openai",
                        "model": "gpt-primary",
                        "enabled": True,
                        "configured": True,
                        "capabilities": {"chat": True, "structured_output": True},
                        "permissions": ["text_generation"],
                    },
                    {
                        "model_ref": "anthropic/claude-fallback",
                        "provider_id": "anthropic",
                        "model": "claude-fallback",
                        "enabled": True,
                        "configured": True,
                        "capabilities": {"chat": True, "structured_output": True},
                        "permissions": ["text_generation"],
                    },
                    {
                        "model_ref": "web-gateway/browsing-model",
                        "provider_id": "web-gateway",
                        "model": "browsing-model",
                        "enabled": True,
                        "configured": True,
                        "capabilities": {"chat": True, "structured_output": True},
                        "permissions": ["text_generation", "network_access"],
                    },
                ],
            }
        )
        trace = result["provider_fallback_trace"]

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(trace["kind"], "provider_fallback_trace")
        self.assertTrue(trace["fallback_used"])
        self.assertEqual(trace["decision"], "fallback_selected")
        self.assertEqual(trace["requested"]["model_ref"], "openai/gpt-primary")
        self.assertEqual(trace["selected"]["model_ref"], "anthropic/claude-fallback")
        self.assertEqual(trace["failed_candidates"][0]["error_type"], "provider_timeout")
        self.assertEqual(trace["fallback_candidates"][0]["model_ref"], "anthropic/claude-fallback")
        self.assertEqual(trace["rejected_candidates"][0]["reason"], "permission_scope_expanded")
        self.assertEqual(trace["attempts"][0]["status"], "failed")
        self.assertEqual(trace["attempts"][1]["status"], "selected")


if __name__ == "__main__":
    unittest.main()
