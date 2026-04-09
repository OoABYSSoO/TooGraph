from __future__ import annotations

from app.core.schemas.skills import SkillDefinition, SkillIoField, SkillSideEffect


SKILL_DEFINITIONS: list[SkillDefinition] = [
    SkillDefinition(
        skillKey="generate_hello_greeting",
        label="Generate Hello Greeting",
        description="Generate a short greeting string from a provided name.",
        inputSchema=[
            SkillIoField(
                key="name",
                label="Name",
                valueType="text",
                required=True,
                description="Name to greet.",
            )
        ],
        outputSchema=[
            SkillIoField(
                key="greeting",
                label="Greeting",
                valueType="text",
                description="Generated greeting text.",
            )
        ],
        supportedValueTypes=["text"],
        sideEffects=[SkillSideEffect.MODEL_CALL],
    ),
    SkillDefinition(
        skillKey="search_docs",
        label="Search Docs",
        description="Search the local knowledge base and return concise matching references.",
        inputSchema=[
            SkillIoField(
                key="query",
                label="Query",
                valueType="text",
                required=True,
                description="Natural-language search query.",
            )
        ],
        outputSchema=[
            SkillIoField(
                key="results",
                label="Results",
                valueType="json",
                description="Matched knowledge records with title, summary, and source.",
            )
        ],
        supportedValueTypes=["text", "json"],
        sideEffects=[SkillSideEffect.KNOWLEDGE_READ],
    ),
    SkillDefinition(
        skillKey="evaluate_output",
        label="Evaluate Output",
        description="Evaluate generated content and return score, issues, and suggestions.",
        inputSchema=[
            SkillIoField(
                key="content",
                label="Content",
                valueType="text",
                required=True,
                description="Content to evaluate.",
            )
        ],
        outputSchema=[
            SkillIoField(key="score", label="Score", valueType="json", description="Evaluation score."),
            SkillIoField(key="issues", label="Issues", valueType="json", description="List of detected issues."),
            SkillIoField(
                key="suggestions",
                label="Suggestions",
                valueType="json",
                description="Improvement suggestions for the evaluated content.",
            ),
        ],
        supportedValueTypes=["text", "json"],
        sideEffects=[SkillSideEffect.MODEL_CALL],
    ),
    SkillDefinition(
        skillKey="fetch_market_news_context",
        label="Fetch Market News Context",
        description="Fetch market news items to provide research context for downstream nodes.",
        inputSchema=[],
        outputSchema=[
            SkillIoField(
                key="news_items",
                label="News Items",
                valueType="json",
                description="Fetched market news records.",
            )
        ],
        supportedValueTypes=["json"],
        sideEffects=[SkillSideEffect.NETWORK],
    ),
    SkillDefinition(
        skillKey="build_creative_brief",
        label="Build Creative Brief",
        description="Assemble a creative brief from structured research and pattern inputs.",
        inputSchema=[
            SkillIoField(
                key="research_summary",
                label="Research Summary",
                valueType="text",
                description="Normalized research summary for the brief.",
            ),
            SkillIoField(
                key="patterns",
                label="Patterns",
                valueType="json",
                description="Structured creative patterns used to build the brief.",
            ),
        ],
        outputSchema=[
            SkillIoField(
                key="brief",
                label="Brief",
                valueType="json",
                description="Structured creative brief payload.",
            )
        ],
        supportedValueTypes=["text", "json"],
        sideEffects=[SkillSideEffect.MODEL_CALL],
    ),
]


def list_skill_definitions() -> list[SkillDefinition]:
    return [definition.model_copy(deep=True) for definition in SKILL_DEFINITIONS]


def get_skill_definition_registry() -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition.model_copy(deep=True) for definition in SKILL_DEFINITIONS}
