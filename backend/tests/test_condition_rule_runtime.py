from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.condition_eval import evaluate_condition_rule


class ConditionRuleRuntimeTest(unittest.TestCase):
    def test_numeric_string_right_operand_is_coerced_for_ordering(self) -> None:
        self.assertTrue(evaluate_condition_rule(10, ">", "2"))
        self.assertTrue(evaluate_condition_rule(10, ">=", "10"))
        self.assertTrue(evaluate_condition_rule(2, "<", "10"))

    def test_numeric_string_left_operand_is_coerced_for_ordering(self) -> None:
        self.assertTrue(evaluate_condition_rule("10", ">", 2))
        self.assertTrue(evaluate_condition_rule("10", ">=", 10))
        self.assertTrue(evaluate_condition_rule("2", "<", 10))

    def test_numeric_string_operands_are_coerced_for_equality(self) -> None:
        self.assertTrue(evaluate_condition_rule("60", "==", 60))
        self.assertFalse(evaluate_condition_rule("60", "!=", 60))

    def test_contains_operator_matches_substrings(self) -> None:
        self.assertTrue(evaluate_condition_rule("回答是正确的", "contains", "正确"))
        self.assertFalse(evaluate_condition_rule("回答是错误的", "contains", "正确"))

    def test_not_contains_operator_rejects_present_substrings(self) -> None:
        self.assertFalse(evaluate_condition_rule("回答是正确的", "not_contains", "正确"))
        self.assertTrue(evaluate_condition_rule("回答是错误的", "not_contains", "正确"))


if __name__ == "__main__":
    unittest.main()
