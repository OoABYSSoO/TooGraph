from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.run_tree import create_child_run_state
from app.core.runtime.state import create_initial_run_state
from app.core.storage import database
from app.core.storage import run_store


def test_create_child_run_state_records_parent_root_and_invocation_metadata() -> None:
    root = create_initial_run_state("graph_root", "Root Graph")
    root["run_id"] = "run_root"
    root["root_run_id"] = "run_root"
    root["run_path"] = ["run_root"]

    child = create_child_run_state(
        root,
        graph_id="graph_child",
        graph_name="Child Graph",
        parent_node_id="nested_research",
        invocation_kind="subgraph_node",
        invocation_key="embedded:Nested Research",
    )

    assert child["parent_run_id"] == "run_root"
    assert child["root_run_id"] == "run_root"
    assert child["parent_node_id"] == "nested_research"
    assert child["invocation_kind"] == "subgraph_node"
    assert child["invocation_key"] == "embedded:Nested Research"
    assert child["run_depth"] == 1
    assert child["run_path"] == ["run_root", child["run_id"]]


def test_build_run_tree_returns_nested_children(tmp_path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setattr(database, "DATA_DIR", data_dir)
    monkeypatch.setattr(database, "DB_PATH", data_dir / "toograph.db")
    monkeypatch.setattr(run_store, "RUN_DATA_DIR", tmp_path / "legacy_runs", raising=False)
    database.initialize_storage()
    root = create_initial_run_state("graph_root", "Root Graph")
    root["run_id"] = "run_root"
    root["root_run_id"] = "run_root"
    root["run_path"] = ["run_root"]
    child = create_child_run_state(
        root,
        graph_id="graph_child",
        graph_name="Child Graph",
        parent_node_id="run_selected_subgraph",
        invocation_kind="dynamic_subgraph_capability",
        invocation_key="advanced_web_research_loop",
    )
    child["run_id"] = "run_child"
    child["run_path"] = ["run_root", "run_child"]
    grandchild = create_child_run_state(
        child,
        graph_id="graph_grandchild",
        graph_name="Grandchild Graph",
        parent_node_id="batch_worker",
        invocation_kind="batch_subgraph_worker",
        invocation_key="worker_template",
        batch_group_id="batch_worker",
        batch_item_index=2,
        batch_item_label="item-3",
    )
    grandchild["run_id"] = "run_grandchild"
    grandchild["run_path"] = ["run_root", "run_child", "run_grandchild"]

    run_store.save_run(root)
    run_store.save_run(grandchild)
    run_store.save_run(child)

    tree = run_store.build_run_tree("run_root")

    assert tree["run_id"] == "run_root"
    assert tree["root_run_id"] == "run_root"
    assert [item["run_id"] for item in tree["children"]] == ["run_child"]
    child_node = tree["children"][0]
    assert child_node["parent_run_id"] == "run_root"
    assert child_node["invocation_kind"] == "dynamic_subgraph_capability"
    assert child_node["children"][0]["run_id"] == "run_grandchild"
    assert child_node["children"][0]["batch_group_id"] == "batch_worker"
    assert child_node["children"][0]["batch_item_index"] == 2
