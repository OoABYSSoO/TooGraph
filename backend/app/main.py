from fastapi import FastAPI


app = FastAPI(
    title="GraphiteUI Backend",
    version="0.1.0",
    description="Minimal backend scaffold for GraphiteUI.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

