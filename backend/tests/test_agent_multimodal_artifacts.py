from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments


class AgentMultimodalArtifactTests(unittest.TestCase):
    def test_collects_only_safe_skill_artifact_media_references(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "skill_artifacts"
            video_path = artifact_root / "run_1" / "download" / "clip.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.write_bytes(b"fake-mp4")

            with patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", artifact_root):
                attachments = collect_input_attachments(
                    {
                        "downloaded_files": [
                            {"local_path": "run_1/download/clip.mp4", "content_type": "video/mp4"},
                            {"local_path": "../secret.mp4", "content_type": "video/mp4"},
                            {"local_path": "/tmp/secret.mp4", "content_type": "video/mp4"},
                            {"local_path": "run_1/download/missing.mp4", "content_type": "video/mp4"},
                        ]
                    }
                )

        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "video")
        self.assertEqual(attachments[0]["source"], "skill_artifact")
        self.assertEqual(attachments[0]["state_key"], "downloaded_files")
        self.assertEqual(attachments[0]["local_path"], "run_1/download/clip.mp4")

    def test_prepare_large_video_artifact_uses_frame_fallback_through_same_attachment_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = Path(temp_dir) / "clip.mp4"
            video_path.write_bytes(b"fake-large-video")

            def extract_video_frame_attachments_func(attachment, *, frame_count, output_dir):
                self.assertEqual(attachment["filesystem_path"], str(video_path))
                self.assertNotIn("data_url", attachment)
                self.assertEqual(frame_count, 4)
                self.assertTrue(str(output_dir))
                frame_path = Path(output_dir) / "clip_frame_001.jpg"
                frame_path.write_bytes(b"fake-frame")
                return [
                    {
                        "type": "image",
                        "state_key": attachment["state_key"],
                        "name": "clip_frame_001.jpg",
                        "mime_type": "image/jpeg",
                        "filesystem_path": str(frame_path),
                        "file_url": frame_path.resolve().as_uri(),
                        "source": {"type": "video_frame", "video_state_key": attachment["state_key"]},
                    }
                ]

            prepared, warnings, meta = prepare_model_input_attachments(
                [
                    {
                        "type": "video",
                        "source": "skill_artifact",
                        "state_key": "downloaded_files",
                        "name": "clip.mp4",
                        "mime_type": "video/mp4",
                        "size": video_path.stat().st_size,
                        "filesystem_path": str(video_path),
                        "local_path": "run_1/download/clip.mp4",
                    }
                ],
                max_inline_video_bytes=1,
                video_frame_count=4,
                extract_video_frame_attachments_func=extract_video_frame_attachments_func,
            )

        self.assertEqual(prepared[0]["type"], "image")
        self.assertNotIn("data_url", prepared[0])
        self.assertTrue(str(prepared[0]["file_url"]).startswith("file://"))
        self.assertEqual(
            warnings,
            ["Video artifact 'clip.mp4' exceeded direct media size limit; analyzed extracted frames instead."],
        )
        self.assertEqual(meta["large_video_fallbacks"], [{"name": "clip.mp4", "frame_count": 1}])
        self.assertEqual(len(meta["cleanup_paths"]), 1)


if __name__ == "__main__":
    unittest.main()
