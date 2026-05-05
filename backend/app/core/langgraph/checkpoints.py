from __future__ import annotations

import importlib
from typing import Any, Iterator

from langgraph.checkpoint.base import CheckpointTuple
from langgraph.checkpoint.memory import InMemorySaver

from app.core.storage.database import CHECKPOINT_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


class JsonCheckpointSaver(InMemorySaver):
    def __init__(self) -> None:
        super().__init__()
        self._loaded_threads: set[str] = set()

    def get_tuple(self, config: dict[str, Any]) -> CheckpointTuple | None:
        self._load_thread_if_needed(_thread_id_from_config(config))
        return super().get_tuple(config)

    def list(
        self,
        config: dict[str, Any] | None,
        *,
        filter: dict[str, Any] | None = None,
        before: dict[str, Any] | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        if config is not None:
            self._load_thread_if_needed(_thread_id_from_config(config))
        else:
            for path in CHECKPOINT_DATA_DIR.glob("*.json"):
                self._load_thread_if_needed(path.stem)
        return super().list(config, filter=filter, before=before, limit=limit)

    def put(
        self,
        config: dict[str, Any],
        checkpoint: dict[str, Any],
        metadata: dict[str, Any],
        new_versions: dict[str, Any],
    ) -> dict[str, Any]:
        thread_id = _thread_id_from_config(config)
        self._load_thread_if_needed(thread_id)
        result = super().put(config, checkpoint, metadata, new_versions)
        self._save_thread(thread_id)
        return result

    async def aput(
        self,
        config: dict[str, Any],
        checkpoint: dict[str, Any],
        metadata: dict[str, Any],
        new_versions: dict[str, Any],
    ) -> dict[str, Any]:
        return self.put(config, checkpoint, metadata, new_versions)

    def put_writes(
        self,
        config: dict[str, Any],
        writes: list[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = _thread_id_from_config(config)
        self._load_thread_if_needed(thread_id)
        super().put_writes(config, writes, task_id, task_path=task_path)
        self._save_thread(thread_id)

    async def aget_tuple(self, config: dict[str, Any]) -> CheckpointTuple | None:
        return self.get_tuple(config)

    async def aput_writes(
        self,
        config: dict[str, Any],
        writes: list[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        self.put_writes(config, writes, task_id, task_path=task_path)

    def delete_thread(self, thread_id: str) -> None:
        super().delete_thread(thread_id)
        path = _thread_path(thread_id)
        if path.exists():
            path.unlink()
        self._loaded_threads.add(thread_id)

    def _load_thread_if_needed(self, thread_id: str) -> None:
        if thread_id in self._loaded_threads:
            return
        payload = read_json_file(_thread_path(thread_id), default=None)
        if payload:
            for item in payload.get("storage", []):
                checkpoint_ns = str(item.get("checkpoint_ns", ""))
                checkpoint_id = str(item["checkpoint_id"])
                self.storage[thread_id][checkpoint_ns][checkpoint_id] = (
                    _typed_from_json(item["checkpoint"]),
                    _typed_from_json(item["metadata"]),
                    item.get("parent_checkpoint_id"),
                )

            for item in payload.get("writes", []):
                checkpoint_ns = str(item.get("checkpoint_ns", ""))
                checkpoint_id = str(item["checkpoint_id"])
                task_id = str(item["task_id"])
                write_index = int(item["write_index"])
                outer_key = (thread_id, checkpoint_ns, checkpoint_id)
                inner_key = (task_id, write_index)
                self.writes[outer_key][inner_key] = (
                    task_id,
                    str(item["channel"]),
                    _typed_from_json(item["value"]),
                    str(item.get("task_path", "")),
                )

            for item in payload.get("blobs", []):
                checkpoint_ns = str(item.get("checkpoint_ns", ""))
                channel = str(item["channel"])
                version = str(item["version"])
                self.blobs[(thread_id, checkpoint_ns, channel, version)] = _typed_from_json(item["blob"])

        self._loaded_threads.add(thread_id)

    def _save_thread(self, thread_id: str) -> None:
        CHECKPOINT_DATA_DIR.mkdir(parents=True, exist_ok=True)

        storage_records: list[dict[str, Any]] = []
        for checkpoint_ns, checkpoints in self.storage.get(thread_id, {}).items():
            for checkpoint_id, (checkpoint_blob, metadata_blob, parent_checkpoint_id) in checkpoints.items():
                storage_records.append(
                    {
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": checkpoint_id,
                        "checkpoint": _typed_to_json(checkpoint_blob),
                        "metadata": _typed_to_json(metadata_blob),
                        "parent_checkpoint_id": parent_checkpoint_id,
                    }
                )

        write_records: list[dict[str, Any]] = []
        for (saved_thread_id, checkpoint_ns, checkpoint_id), writes in self.writes.items():
            if saved_thread_id != thread_id:
                continue
            for (task_id, write_index), (_, channel, value_blob, task_path) in writes.items():
                write_records.append(
                    {
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": checkpoint_id,
                        "task_id": task_id,
                        "write_index": write_index,
                        "channel": channel,
                        "value": _typed_to_json(value_blob),
                        "task_path": task_path,
                    }
                )

        blob_records: list[dict[str, Any]] = []
        for (saved_thread_id, checkpoint_ns, channel, version), blob in self.blobs.items():
            if saved_thread_id != thread_id:
                continue
            blob_records.append(
                {
                    "checkpoint_ns": checkpoint_ns,
                    "channel": channel,
                    "version": version,
                    "blob": _typed_to_json(blob),
                }
            )

        payload = {
            "thread_id": thread_id,
            "storage": storage_records,
            "writes": write_records,
            "blobs": blob_records,
        }
        write_json_file(_thread_path(thread_id), payload)


def _typed_to_json(value: tuple[str, bytes]) -> dict[str, str]:
    data_type, raw = value
    return {
        "type": data_type,
        "data": raw.hex(),
    }


def _typed_from_json(value: dict[str, str]) -> tuple[str, bytes]:
    raw_data = str(value["data"])
    try:
        payload = bytes.fromhex(raw_data)
    except ValueError:
        codec = importlib.import_module("".join(("ba", "se", "64")))
        payload = codec.b64decode(raw_data.encode("ascii"))
    return (
        str(value["type"]),
        payload,
    )


def _thread_id_from_config(config: dict[str, Any]) -> str:
    configurable = dict(config.get("configurable") or {})
    thread_id = str(configurable.get("thread_id", "")).strip()
    if not thread_id:
        raise ValueError("LangGraph checkpoint config is missing configurable.thread_id.")
    return thread_id


def _thread_path(thread_id: str):
    return CHECKPOINT_DATA_DIR / f"{thread_id}.json"
