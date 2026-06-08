from __future__ import annotations

from typing import Any

from app.core.model_catalog import build_model_ref, normalize_model_embedding_settings, split_model_ref
from app.core.storage import settings_store
from app.core.storage.embedding_store import embedding_model_has_vectors, register_embedding_model, resolve_embedding_model


DEFAULT_EMBEDDING_MODEL_DIMENSIONS = 384


def sync_default_embedding_model_from_settings(
    settings: dict[str, Any] | None = None,
    model_ref: str = "",
) -> dict[str, Any] | None:
    source_settings = settings if isinstance(settings, dict) else settings_store.load_app_settings()
    selected_model_ref = str(model_ref or source_settings.get("embedding_model_ref") or "").strip()
    if not selected_model_ref:
        return None

    provider_key, model_name = split_model_ref(selected_model_ref, default_provider="local")
    provider = _find_provider(source_settings, provider_key)
    if provider is None:
        return None
    model = _find_provider_model(provider, model_name)
    if model is None or not _model_supports_embedding(model):
        return None

    normalized_model_ref = build_model_ref(provider_key, model_name)
    dimensions, dimensions_source = _embedding_dimensions_with_source(model)
    metadata = {
        "source": "model_providers.default_embedding_model_ref",
        "model_ref": normalized_model_ref,
        "provider_label": str(provider.get("label") or provider_key),
        "model_label": str(model.get("label") or model_name),
        "dimensions_source": dimensions_source,
    }
    existing_model = _resolve_existing_embedding_model(normalized_model_ref)
    if (
        dimensions_source == "default"
        and existing_model is not None
        and embedding_model_has_vectors(str(existing_model["embedding_model_id"]))
    ):
        existing_metadata = dict(existing_model.get("metadata") or {})
        if existing_metadata.get("dimensions_source") != "default":
            dimensions = int(existing_model["dimensions"] or dimensions)
            metadata = {
                **existing_metadata,
                "source": metadata["source"],
                "model_ref": metadata["model_ref"],
                "provider_label": metadata["provider_label"],
                "model_label": metadata["model_label"],
                "dimensions_source": str(existing_metadata.get("dimensions_source") or "provider_probe"),
            }
    return register_embedding_model(
        provider_key=provider_key,
        model=model_name,
        dimensions=dimensions,
        enabled=True,
        metadata=metadata,
    )


def get_default_embedding_model_ref_from_settings(settings: dict[str, Any] | None = None) -> str:
    model = sync_default_embedding_model_from_settings(settings=settings)
    if not model:
        return ""
    return build_model_ref(str(model["provider_key"]), str(model["model"]))


def get_default_embedding_model_refs_from_settings(settings: dict[str, Any] | None = None) -> list[str]:
    model_ref = get_default_embedding_model_ref_from_settings(settings=settings)
    return [model_ref] if model_ref else []


def _find_provider(settings: dict[str, Any], provider_key: str) -> dict[str, Any] | None:
    providers = settings.get("model_providers")
    if not isinstance(providers, dict):
        return None
    provider = providers.get(provider_key)
    return provider if isinstance(provider, dict) else None


def _find_provider_model(provider: dict[str, Any], model_name: str) -> dict[str, Any] | None:
    models = provider.get("models")
    if not isinstance(models, list):
        return None
    for model in models:
        if not isinstance(model, dict):
            continue
        candidate_name = str(model.get("model") or model.get("id") or "").strip()
        if candidate_name == model_name:
            return model
    return None


def _model_supports_embedding(model: dict[str, Any]) -> bool:
    capabilities = model.get("capabilities")
    return isinstance(capabilities, dict) and bool(capabilities.get("embedding"))


def _embedding_dimensions(model: dict[str, Any]) -> int:
    dimensions, _source = _embedding_dimensions_with_source(model)
    return dimensions


def _embedding_dimensions_with_source(model: dict[str, Any]) -> tuple[int, str]:
    embedding = normalize_model_embedding_settings(model.get("embedding"))
    dimensions = embedding.get("dimensions")
    if isinstance(dimensions, int) and dimensions > 0:
        return dimensions, "configured"
    return DEFAULT_EMBEDDING_MODEL_DIMENSIONS, "default"


def _resolve_existing_embedding_model(model_ref: str) -> dict[str, Any] | None:
    try:
        return resolve_embedding_model(model_ref)
    except FileNotFoundError:
        return None
