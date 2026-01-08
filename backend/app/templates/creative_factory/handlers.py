SUPPORTED_NODE_TYPES = [
    "start",
    "research",
    "collect_assets",
    "normalize_assets",
    "select_assets",
    "analyze_assets",
    "extract_patterns",
    "build_brief",
    "generate_variants",
    "generate_storyboards",
    "generate_video_prompts",
    "review_variants",
    "condition",
    "prepare_image_todo",
    "prepare_video_todo",
    "finalize",
    "end",
]


def get_creative_factory_supported_node_types() -> list[str]:
    return list(SUPPORTED_NODE_TYPES)
