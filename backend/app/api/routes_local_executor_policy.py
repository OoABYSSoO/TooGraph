from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.storage.local_executor_policy import add_local_executor_allowed_root, load_local_executor_policy


router = APIRouter(prefix="/api/local-executor-policy", tags=["local-executor-policy"])


class LocalExecutorAllowRootRequest(BaseModel):
    kind: Literal["read", "write", "execute"]
    path: str = Field(..., min_length=1)

    model_config = ConfigDict(str_strip_whitespace=True)


@router.get("")
def get_local_executor_policy_endpoint() -> dict:
    return load_local_executor_policy()


@router.post("/allow-root")
def add_local_executor_allowed_root_endpoint(payload: LocalExecutorAllowRootRequest) -> dict:
    try:
        return add_local_executor_allowed_root(kind=payload.kind, path=payload.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
