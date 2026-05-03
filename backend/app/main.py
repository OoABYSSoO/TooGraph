from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from app.core.storage.database import initialize_storage

app = FastAPI(
    title="GraphiteUI Backend",
    version="0.1.0",
    description="Backend scaffold for GraphiteUI.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3477", "http://127.0.0.1:3477"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.on_event("startup")
def startup() -> None:
    initialize_storage()


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}
