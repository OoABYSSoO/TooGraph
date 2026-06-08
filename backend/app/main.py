from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes_buddy import router as buddy_router
from app.api.routes_graphs import router as graphs_router
from app.api.routes_knowledge import router as knowledge_router
from app.api.routes_local_input_sources import router as local_input_sources_router
from app.api.routes_message_platforms import router as message_platforms_router
from app.api.routes_model_logs import router as model_logs_router
from app.api.routes_operation_journal import router as operation_journal_router
from app.api.routes_presets import router as presets_router
from app.api.routes_runs import router as runs_router
from app.api.routes_scheduler import router as scheduler_router
from app.api.routes_settings import router as settings_router
from app.api.routes_actions import router as actions_router
from app.api.routes_capability_artifacts import router as capability_artifacts_router
from app.api.routes_templates import router as templates_router
from app.api.routes_tools import router as tools_router
from app.buddy.store import initialize_buddy_home
from app.core.runtime.run_recovery import mark_interrupted_active_runs
from app.core.storage.database import initialize_storage
from app.messaging.runtime import message_platform_runtime
from app.scheduler.official_seed import seed_official_scheduled_graph_jobs
from app.scheduler.service import start_scheduler_service, stop_scheduler_service
from app.tools.openai_codex_client import restore_pending_codex_browser_login_sessions

ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = Path(os.environ.get("TOOGRAPH_FRONTEND_DIST", ROOT_DIR / "frontend" / "dist"))


def startup() -> None:
    initialize_storage()
    seed_official_scheduled_graph_jobs()
    initialize_buddy_home()
    mark_interrupted_active_runs()
    restore_pending_codex_browser_login_sessions()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    startup()
    start_scheduler_service()
    message_platform_runtime.schedule_enabled_bindings()
    try:
        yield
    finally:
        await message_platform_runtime.stop()
        stop_scheduler_service()


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
    title="TooGraph Backend",
    version="0.1.0",
    description="Backend scaffold for TooGraph.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3477", "http://127.0.0.1:3477"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(buddy_router)
app.include_router(graphs_router)
app.include_router(knowledge_router)
app.include_router(local_input_sources_router)
app.include_router(message_platforms_router)
app.include_router(model_logs_router)
app.include_router(operation_journal_router)
app.include_router(presets_router)
app.include_router(runs_router)
app.include_router(scheduler_router)
app.include_router(settings_router)
app.include_router(capability_artifacts_router)
app.include_router(actions_router)
app.include_router(tools_router)
app.include_router(templates_router)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}


configure_frontend_static(app)
