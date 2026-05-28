import importlib.util


def test_feishu_sdk_is_available_for_auto_binding() -> None:
    assert importlib.util.find_spec("lark_oapi") is not None
