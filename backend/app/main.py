from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes_companion import router as companion_router
from app.api.routes_graphs import router as graphs_router
from app.api.routes_knowledge import router as knowledge_router
from app.api.routes_memories import router as memories_router
from app.api.routes_model_logs import router as model_logs_router
from app.api.routes_presets import router as presets_router
from app.api.routes_runs import router as runs_router
from app.api.routes_settings import router as settings_router
from app.api.routes_skill_artifacts import router as skill_artifacts_router
from app.api.routes_skills import router as skills_router
from app.api.routes_templates import router as templates_router
from app.core.runtime.run_recovery import mark_interrupted_active_runs
from app.core.storage.database import initialize_storage

ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = Path(os.environ.get("GRAPHITEUI_FRONTEND_DIST", ROOT_DIR / "frontend" / "dist"))


def startup() -> None:
    initialize_storage()
    mark_interrupted_active_runs()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    startup()
    yield


def _frontend_file_path(dist_dir: Path, full_path: str) -> Path | None:
    requested_path = (dist_dir / full_path).resolve()
    try:
        requested_path.relative_to(dist_dir.resolve())
    except ValueError:
        return None

    return requested_path if requested_path.is_file() else None


def configure_frontend_static(app: FastAPI, frontend_dist_dir: str | Path = FRONTEND_DIST_DIR) -> bool:
    dist_dir = Path(frontend_dist_dir).resolve()
    index_path = dist_dir / "index.html"
    if not index_path.is_file():
        return False

    @app.api_route(
        "/api/{full_path:path}",
        methods=["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
        include_in_schema=False,
    )
    def api_not_found(full_path: str) -> None:
        raise HTTPException(status_code=404)

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        if full_path == "api":
            raise HTTPException(status_code=404)

        static_file = _frontend_file_path(dist_dir, full_path) if full_path else None
        return FileResponse(static_file or index_path)

    return True


app = FastAPI(
    title="GraphiteUI Backend",
    version="0.1.0",
    description="Backend scaffold for GraphiteUI.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3477", "http://127.0.0.1:3477"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companion_router)
app.include_router(graphs_router)
app.include_router(knowledge_router)
app.include_router(memories_router)
app.include_router(model_logs_router)
app.include_router(presets_router)
app.include_router(runs_router)
app.include_router(settings_router)
app.include_router(skill_artifacts_router)
app.include_router(skills_router)
app.include_router(templates_router)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}


configure_frontend_static(app)
