from fastapi import FastAPI

from app.api.routes_graphs import router as graphs_router
from app.api.routes_runs import router as runs_router

app = FastAPI(
    title="GraphiteUI Backend",
    version="0.1.0",
    description="Backend scaffold for GraphiteUI.",
)

app.include_router(graphs_router)
app.include_router(runs_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
