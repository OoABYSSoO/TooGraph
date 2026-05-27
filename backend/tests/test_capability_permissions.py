from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.capability_permissions import build_capability_permission_profile, permission_tier_for_permissions


class CapabilityPermissionProfileTests(unittest.TestCase):
    def test_profile_classifies_route_map_permissions(self) -> None:
        profile = build_capability_permission_profile(
            [
                "network",
                "file_read",
                "file_write",
                "execute",
                "graph_write",
                "memory_write",
                "cost",
                "external_delivery",
            ]
        )

        self.assertEqual(profile["permission_tier"], "risky")
        self.assertEqual(
            profile["operations"],
            [
                "network",
                "file_read",
                "file_write",
                "execute",
                "graph_write",
                "memory_write",
                "cost",
                "external_delivery",
            ],
        )
        self.assertEqual(
            profile["risky_permissions"],
            ["file_write", "execute", "graph_write", "memory_write", "cost", "external_delivery"],
        )
        self.assertTrue(profile["requires_approval_by_default"])

    def test_permission_tier_distinguishes_external_and_guarded(self) -> None:
        self.assertEqual(permission_tier_for_permissions(["network"]), "external")
        self.assertEqual(permission_tier_for_permissions(["file_read"]), "guarded")
        self.assertEqual(permission_tier_for_permissions([]), "none")


if __name__ == "__main__":
    unittest.main()
