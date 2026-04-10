from __future__ import annotations

from typing import Any

from app.templates.creative_factory.state import get_creative_factory_state_keys, get_creative_factory_state_schema
from app.templates.creative_factory.themes import get_creative_factory_theme_presets


NODE_SYSTEM_SUPPORTED_NODE_TYPES = [
    "input_boundary",
    "agent_node",
    "condition_node",
    "output_boundary",
]


def _create_default_node_system_graph(theme_preset: dict[str, Any]) -> dict[str, Any]:
    return {
        "graph_family": "node_system",
        "name": f"{theme_preset.get('graph_name') or 'Creative Factory'} Final Package Flow",
        "template_id": "creative_factory",
        "theme_config": theme_preset["theme_config"],
        "state_schema": get_creative_factory_state_schema(),
        "nodes": [
            {
                "id": "input_1",
                "type": "default",
                "position": {"x": 80, "y": 220},
                "data": {
                    "nodeId": "input_1",
                    "config": {
                        "presetId": "preset.input.task_input.v1",
                        "label": "Task Input",
                        "description": "Describe the market research task for the creative workflow.",
                        "family": "input",
                        "valueType": "text",
                        "output": {
                            "key": "task_input",
                            "label": "Task Input",
                            "valueType": "text",
                        },
                        "defaultValue": "Research current SLG mobile ad market hooks and summarize reusable signals.",
                        "placeholder": "Describe the research task",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_fetch_1",
                "type": "default",
                "position": {"x": 540, "y": 220},
                "data": {
                    "nodeId": "agent_fetch_1",
                    "config": {
                        "presetId": "preset.agent.fetch_market_news_context.v1",
                        "label": "Fetch Market News",
                        "description": "Collect raw market news and trend signals for the current creative research task.",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "task_input",
                                "label": "Task Input",
                                "valueType": "text",
                                "required": True,
                            }
                        ],
                        "outputs": [
                            {
                                "key": "rss_items",
                                "label": "RSS Items",
                                "valueType": "json",
                            }
                        ],
                        "systemInstruction": "You are a research collection agent.",
                        "taskInstruction": "Collect raw market news and trend references for the provided task.",
                        "skills": [
                            {
                                "name": "fetch_market_news",
                                "skillKey": "fetch_market_news_context",
                                "inputMapping": {
                                    "task_input": "$inputs.task_input",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "rss_items": "$skills.fetch_market_news.rss_items",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_clean_1",
                "type": "default",
                "position": {"x": 1000, "y": 220},
                "data": {
                    "nodeId": "agent_clean_1",
                    "config": {
                        "presetId": "preset.agent.clean_market_news.v1",
                        "label": "Clean Market News",
                        "description": "Normalize raw market news and produce a compact research context.",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "rss_items",
                                "label": "RSS Items",
                                "valueType": "json",
                                "required": True,
                            }
                        ],
                        "outputs": [
                            {
                                "key": "clean_news_items",
                                "label": "Clean News Items",
                                "valueType": "json",
                            },
                            {
                                "key": "news_context",
                                "label": "News Context",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "You are a research normalization agent.",
                        "taskInstruction": "Normalize fetched news into cleaned items and a concise text context.",
                        "skills": [
                            {
                                "name": "clean_market_news",
                                "skillKey": "clean_market_news",
                                "inputMapping": {
                                    "rss_items": "$inputs.rss_items",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "clean_news_items": "$skills.clean_market_news.clean_news_items",
                            "news_context": "$skills.clean_market_news.news_context",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_brief_1",
                "type": "default",
                "position": {"x": 1460, "y": 220},
                "data": {
                    "nodeId": "agent_brief_1",
                    "config": {
                        "presetId": "preset.agent.build_creative_brief.v1",
                        "label": "Build Creative Brief",
                        "description": "Assemble a concise creative brief from task input and cleaned research context.",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "task_input",
                                "label": "Task Input",
                                "valueType": "text",
                                "required": True,
                            },
                            {
                                "key": "news_context",
                                "label": "News Context",
                                "valueType": "text",
                                "required": True,
                            },
                        ],
                        "outputs": [
                            {
                                "key": "creative_brief",
                                "label": "Creative Brief",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "You are a creative strategy agent.",
                        "taskInstruction": "Build a concise creative brief from the task and research context.",
                        "skills": [
                            {
                                "name": "build_creative_brief",
                                "skillKey": "build_creative_brief",
                                "inputMapping": {
                                    "task_input": "$inputs.task_input",
                                    "news_context": "$inputs.news_context",
                                    "theme_config": "$graph.theme_config",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "creative_brief": "$skills.build_creative_brief.creative_brief",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_1",
                "type": "default",
                "position": {"x": 1900, "y": 120},
                "data": {
                    "nodeId": "output_1",
                    "config": {
                        "presetId": "preset.output.creative_brief.v1",
                        "label": "Creative Brief Output",
                        "description": "Preview the generated creative brief for downstream creative steps.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Creative Brief",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "creative_brief",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_variants_1",
                "type": "default",
                "position": {"x": 1900, "y": 360},
                "data": {
                    "nodeId": "agent_variants_1",
                    "config": {
                        "presetId": "preset.agent.generate_creative_variants.v1",
                        "label": "Generate Creative Variants",
                        "description": "Generate structured creative variants from the current task and brief.",
                        "family": "agent",
                        "inputs": [
                            {"key": "task_input", "label": "Task Input", "valueType": "text", "required": True},
                            {"key": "creative_brief", "label": "Creative Brief", "valueType": "text", "required": True},
                        ],
                        "outputs": [
                            {"key": "script_variants", "label": "Script Variants", "valueType": "json"},
                        ],
                        "systemInstruction": "You are a creative variant generator.",
                        "taskInstruction": "Generate structured creative variants from the task and brief.",
                        "skills": [
                            {
                                "name": "generate_creative_variants",
                                "skillKey": "generate_creative_variants",
                                "inputMapping": {
                                    "task_input": "$inputs.task_input",
                                    "creative_brief": "$inputs.creative_brief",
                                    "theme_config": "$graph.theme_config",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "script_variants": "$skills.generate_creative_variants.script_variants",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_review_1",
                "type": "default",
                "position": {"x": 2360, "y": 360},
                "data": {
                    "nodeId": "agent_review_1",
                    "config": {
                        "presetId": "preset.agent.review_creative_variants.v1",
                        "label": "Review Creative Variants",
                        "description": "Review generated variants and produce an evaluation result.",
                        "family": "agent",
                        "inputs": [
                            {"key": "task_input", "label": "Task Input", "valueType": "text", "required": True},
                            {"key": "creative_brief", "label": "Creative Brief", "valueType": "text", "required": True},
                            {"key": "script_variants", "label": "Script Variants", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "evaluation_result", "label": "Evaluation Result", "valueType": "json"},
                            {"key": "best_variant", "label": "Best Variant", "valueType": "json"},
                            {"key": "revision_feedback", "label": "Revision Feedback", "valueType": "json"},
                        ],
                        "systemInstruction": "You are a creative review agent.",
                        "taskInstruction": "Review generated variants and return pass or revise guidance.",
                        "skills": [
                            {
                                "name": "review_creative_variants",
                                "skillKey": "review_creative_variants",
                                "inputMapping": {
                                    "task_input": "$inputs.task_input",
                                    "creative_brief": "$inputs.creative_brief",
                                    "script_variants": "$inputs.script_variants",
                                    "theme_config": "$graph.theme_config",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "evaluation_result": "$skills.review_creative_variants.evaluation_result",
                            "best_variant": "$skills.review_creative_variants.best_variant",
                            "revision_feedback": "$skills.review_creative_variants.revision_feedback",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "condition_1",
                "type": "default",
                "position": {"x": 2820, "y": 360},
                "data": {
                    "nodeId": "condition_1",
                    "config": {
                        "presetId": "preset.condition.review_gate.v1",
                        "label": "Review Gate",
                        "description": "Route the flow according to the review decision.",
                        "family": "condition",
                        "inputs": [
                            {"key": "review_result", "label": "Review Result", "valueType": "json", "required": True},
                        ],
                        "branches": [
                            {"key": "pass", "label": "Pass"},
                            {"key": "revise", "label": "Revise"},
                        ],
                        "conditionMode": "rule",
                        "rule": {
                            "source": "$inputs.review_result.decision",
                            "operator": "==",
                            "value": "pass",
                        },
                        "branchMapping": {
                            "true": "pass",
                            "false": "revise",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_pass_1",
                "type": "default",
                "position": {"x": 3280, "y": 240},
                "data": {
                    "nodeId": "output_pass_1",
                    "config": {
                        "presetId": "preset.output.decision_signal.v1",
                        "label": "Pass Output",
                        "description": "Show the pass branch signal when review succeeds.",
                        "family": "output",
                        "input": {"key": "value", "label": "Decision Signal", "valueType": "any", "required": True},
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "review_pass",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_revise_1",
                "type": "default",
                "position": {"x": 3280, "y": 480},
                "data": {
                    "nodeId": "output_revise_1",
                    "config": {
                        "presetId": "preset.output.decision_signal.v1",
                        "label": "Revise Output",
                        "description": "Show the revise branch signal when review asks for changes.",
                        "family": "output",
                        "input": {"key": "value", "label": "Decision Signal", "valueType": "any", "required": True},
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "review_revise",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_storyboards_1",
                "type": "default",
                "position": {"x": 2820, "y": 140},
                "data": {
                    "nodeId": "agent_storyboards_1",
                    "config": {
                        "presetId": "preset.agent.generate_storyboard_packages.v1",
                        "label": "Generate Storyboards",
                        "description": "Generate storyboard packages from the current creative variants.",
                        "family": "agent",
                        "inputs": [
                            {"key": "script_variants", "label": "Script Variants", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "storyboard_packages", "label": "Storyboard Packages", "valueType": "json"},
                        ],
                        "systemInstruction": "You are a storyboard generation agent.",
                        "taskInstruction": "Generate storyboard packages from the provided variants.",
                        "skills": [
                            {
                                "name": "generate_storyboard_packages",
                                "skillKey": "generate_storyboard_packages",
                                "inputMapping": {
                                    "script_variants": "$inputs.script_variants",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "storyboard_packages": "$skills.generate_storyboard_packages.storyboard_packages",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_video_prompts_1",
                "type": "default",
                "position": {"x": 3280, "y": 140},
                "data": {
                    "nodeId": "agent_video_prompts_1",
                    "config": {
                        "presetId": "preset.agent.generate_video_prompt_packages.v1",
                        "label": "Generate Video Prompts",
                        "description": "Generate video prompt packages from variants and storyboard packages.",
                        "family": "agent",
                        "inputs": [
                            {"key": "script_variants", "label": "Script Variants", "valueType": "json", "required": True},
                            {"key": "storyboard_packages", "label": "Storyboard Packages", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "video_prompt_packages", "label": "Video Prompt Packages", "valueType": "json"},
                        ],
                        "systemInstruction": "You are a video prompt generation agent.",
                        "taskInstruction": "Generate video prompt packages from variants and storyboard packages.",
                        "skills": [
                            {
                                "name": "generate_video_prompt_packages",
                                "skillKey": "generate_video_prompt_packages",
                                "inputMapping": {
                                    "script_variants": "$inputs.script_variants",
                                    "storyboard_packages": "$inputs.storyboard_packages",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "video_prompt_packages": "$skills.generate_video_prompt_packages.video_prompt_packages",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_image_todo_1",
                "type": "default",
                "position": {"x": 3740, "y": 80},
                "data": {
                    "nodeId": "agent_image_todo_1",
                    "config": {
                        "presetId": "preset.agent.prepare_image_generation_todo.v1",
                        "label": "Prepare Image TODO",
                        "description": "Prepare image generation todo payload from review outputs.",
                        "family": "agent",
                        "inputs": [
                            {"key": "best_variant", "label": "Best Variant", "valueType": "json", "required": True},
                            {"key": "storyboard_packages", "label": "Storyboard Packages", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "image_generation_todo", "label": "Image Generation TODO", "valueType": "json"},
                        ],
                        "systemInstruction": "You are an image production prep agent.",
                        "taskInstruction": "Prepare image generation todo payload from the current review outputs.",
                        "skills": [
                            {
                                "name": "prepare_image_generation_todo",
                                "skillKey": "prepare_image_generation_todo",
                                "inputMapping": {
                                    "best_variant": "$inputs.best_variant",
                                    "storyboard_packages": "$inputs.storyboard_packages",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "image_generation_todo": "$skills.prepare_image_generation_todo.image_generation_todo",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_video_todo_1",
                "type": "default",
                "position": {"x": 3740, "y": 240},
                "data": {
                    "nodeId": "agent_video_todo_1",
                    "config": {
                        "presetId": "preset.agent.prepare_video_generation_todo.v1",
                        "label": "Prepare Video TODO",
                        "description": "Prepare video generation todo payload from review outputs.",
                        "family": "agent",
                        "inputs": [
                            {"key": "best_variant", "label": "Best Variant", "valueType": "json", "required": True},
                            {"key": "video_prompt_packages", "label": "Video Prompt Packages", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "video_generation_todo", "label": "Video Generation TODO", "valueType": "json"},
                        ],
                        "systemInstruction": "You are a video production prep agent.",
                        "taskInstruction": "Prepare video generation todo payload from the current review outputs.",
                        "skills": [
                            {
                                "name": "prepare_video_generation_todo",
                                "skillKey": "prepare_video_generation_todo",
                                "inputMapping": {
                                    "best_variant": "$inputs.best_variant",
                                    "video_prompt_packages": "$inputs.video_prompt_packages",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "video_generation_todo": "$skills.prepare_video_generation_todo.video_generation_todo",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_finalize_1",
                "type": "default",
                "position": {"x": 4200, "y": 160},
                "data": {
                    "nodeId": "agent_finalize_1",
                    "config": {
                        "presetId": "preset.agent.finalize_creative_package.v1",
                        "label": "Finalize Creative Package",
                        "description": "Assemble the final creative package artifact from downstream production inputs.",
                        "family": "agent",
                        "inputs": [
                            {"key": "creative_brief", "label": "Creative Brief", "valueType": "text", "required": True},
                            {"key": "best_variant", "label": "Best Variant", "valueType": "json", "required": True},
                            {"key": "storyboard_packages", "label": "Storyboard Packages", "valueType": "json", "required": True},
                            {"key": "video_prompt_packages", "label": "Video Prompt Packages", "valueType": "json", "required": True},
                            {"key": "image_generation_todo", "label": "Image Generation TODO", "valueType": "json", "required": True},
                            {"key": "video_generation_todo", "label": "Video Generation TODO", "valueType": "json", "required": True},
                            {"key": "evaluation_result", "label": "Evaluation Result", "valueType": "json", "required": True},
                        ],
                        "outputs": [
                            {"key": "final_package", "label": "Final Package", "valueType": "json"},
                            {"key": "final_result", "label": "Final Result", "valueType": "text"},
                        ],
                        "systemInstruction": "You are a creative packaging agent.",
                        "taskInstruction": "Assemble the final creative package from reviewed and prepared outputs.",
                        "skills": [
                            {
                                "name": "finalize_creative_package",
                                "skillKey": "finalize_creative_package",
                                "inputMapping": {
                                    "creative_brief": "$inputs.creative_brief",
                                    "best_variant": "$inputs.best_variant",
                                    "storyboard_packages": "$inputs.storyboard_packages",
                                    "video_prompt_packages": "$inputs.video_prompt_packages",
                                    "image_generation_todo": "$inputs.image_generation_todo",
                                    "video_generation_todo": "$inputs.video_generation_todo",
                                    "evaluation_result": "$inputs.evaluation_result",
                                    "theme_config": "$graph.theme_config",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "final_package": "$skills.finalize_creative_package.final_package",
                            "final_result": "$skills.finalize_creative_package.final_result",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_final_1",
                "type": "default",
                "position": {"x": 4660, "y": 160},
                "data": {
                    "nodeId": "output_final_1",
                    "config": {
                        "presetId": "preset.output.final_package.v1",
                        "label": "Final Package Output",
                        "description": "Preview the assembled final creative package.",
                        "family": "output",
                        "input": {"key": "value", "label": "Final Package", "valueType": "json", "required": True},
                        "displayMode": "json",
                        "persistEnabled": False,
                        "persistFormat": "json",
                        "fileNameTemplate": "final_package",
                    },
                    "previewText": "",
                },
            },
        ],
        "edges": [
            {
                "id": "edge_1",
                "source": "input_1",
                "target": "agent_fetch_1",
                "sourceHandle": "output:task_input",
                "targetHandle": "input:task_input",
            },
            {
                "id": "edge_2",
                "source": "agent_fetch_1",
                "target": "agent_clean_1",
                "sourceHandle": "output:rss_items",
                "targetHandle": "input:rss_items",
            },
            {
                "id": "edge_3",
                "source": "agent_clean_1",
                "target": "agent_brief_1",
                "sourceHandle": "output:news_context",
                "targetHandle": "input:news_context",
            },
            {
                "id": "edge_4",
                "source": "input_1",
                "target": "agent_brief_1",
                "sourceHandle": "output:task_input",
                "targetHandle": "input:task_input",
            },
            {
                "id": "edge_5",
                "source": "agent_brief_1",
                "target": "output_1",
                "sourceHandle": "output:creative_brief",
                "targetHandle": "input:value",
            },
            {
                "id": "edge_6",
                "source": "input_1",
                "target": "agent_variants_1",
                "sourceHandle": "output:task_input",
                "targetHandle": "input:task_input",
            },
            {
                "id": "edge_7",
                "source": "agent_brief_1",
                "target": "agent_variants_1",
                "sourceHandle": "output:creative_brief",
                "targetHandle": "input:creative_brief",
            },
            {
                "id": "edge_8",
                "source": "input_1",
                "target": "agent_review_1",
                "sourceHandle": "output:task_input",
                "targetHandle": "input:task_input",
            },
            {
                "id": "edge_9",
                "source": "agent_brief_1",
                "target": "agent_review_1",
                "sourceHandle": "output:creative_brief",
                "targetHandle": "input:creative_brief",
            },
            {
                "id": "edge_10",
                "source": "agent_variants_1",
                "target": "agent_review_1",
                "sourceHandle": "output:script_variants",
                "targetHandle": "input:script_variants",
            },
            {
                "id": "edge_11",
                "source": "agent_review_1",
                "target": "condition_1",
                "sourceHandle": "output:evaluation_result",
                "targetHandle": "input:review_result",
            },
            {
                "id": "edge_12",
                "source": "condition_1",
                "target": "output_pass_1",
                "sourceHandle": "output:pass",
                "targetHandle": "input:value",
            },
            {
                "id": "edge_13",
                "source": "condition_1",
                "target": "output_revise_1",
                "sourceHandle": "output:revise",
                "targetHandle": "input:value",
            },
            {
                "id": "edge_14",
                "source": "agent_variants_1",
                "target": "agent_storyboards_1",
                "sourceHandle": "output:script_variants",
                "targetHandle": "input:script_variants",
            },
            {
                "id": "edge_15",
                "source": "agent_variants_1",
                "target": "agent_video_prompts_1",
                "sourceHandle": "output:script_variants",
                "targetHandle": "input:script_variants",
            },
            {
                "id": "edge_16",
                "source": "agent_storyboards_1",
                "target": "agent_video_prompts_1",
                "sourceHandle": "output:storyboard_packages",
                "targetHandle": "input:storyboard_packages",
            },
            {
                "id": "edge_17",
                "source": "agent_review_1",
                "target": "agent_image_todo_1",
                "sourceHandle": "output:best_variant",
                "targetHandle": "input:best_variant",
            },
            {
                "id": "edge_18",
                "source": "agent_storyboards_1",
                "target": "agent_image_todo_1",
                "sourceHandle": "output:storyboard_packages",
                "targetHandle": "input:storyboard_packages",
            },
            {
                "id": "edge_19",
                "source": "agent_review_1",
                "target": "agent_video_todo_1",
                "sourceHandle": "output:best_variant",
                "targetHandle": "input:best_variant",
            },
            {
                "id": "edge_20",
                "source": "agent_video_prompts_1",
                "target": "agent_video_todo_1",
                "sourceHandle": "output:video_prompt_packages",
                "targetHandle": "input:video_prompt_packages",
            },
            {
                "id": "edge_21",
                "source": "agent_brief_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:creative_brief",
                "targetHandle": "input:creative_brief",
            },
            {
                "id": "edge_22",
                "source": "agent_review_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:best_variant",
                "targetHandle": "input:best_variant",
            },
            {
                "id": "edge_23",
                "source": "agent_review_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:evaluation_result",
                "targetHandle": "input:evaluation_result",
            },
            {
                "id": "edge_24",
                "source": "agent_storyboards_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:storyboard_packages",
                "targetHandle": "input:storyboard_packages",
            },
            {
                "id": "edge_25",
                "source": "agent_video_prompts_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:video_prompt_packages",
                "targetHandle": "input:video_prompt_packages",
            },
            {
                "id": "edge_26",
                "source": "agent_image_todo_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:image_generation_todo",
                "targetHandle": "input:image_generation_todo",
            },
            {
                "id": "edge_27",
                "source": "agent_video_todo_1",
                "target": "agent_finalize_1",
                "sourceHandle": "output:video_generation_todo",
                "targetHandle": "input:video_generation_todo",
            },
            {
                "id": "edge_28",
                "source": "agent_finalize_1",
                "target": "output_final_1",
                "sourceHandle": "output:final_package",
                "targetHandle": "input:value",
            },
        ],
        "metadata": {},
    }


def get_creative_factory_template() -> dict[str, Any]:
    theme_presets = get_creative_factory_theme_presets()
    default_theme_preset = "slg_launch"
    default_theme = next((preset for preset in theme_presets if preset["id"] == default_theme_preset), theme_presets[0])
    return {
        "template_id": "creative_factory",
        "label": "Creative Factory",
        "description": "Research, analyze, generate, review, and export a creative package.",
        "default_graph_name": "Creative Factory",
        "default_theme_preset": default_theme_preset,
        "supported_node_types": NODE_SYSTEM_SUPPORTED_NODE_TYPES,
        "state_keys": get_creative_factory_state_keys(),
        "state_schema": get_creative_factory_state_schema(),
        "theme_presets": theme_presets,
        "default_node_system_graph": _create_default_node_system_graph(default_theme),
    }
