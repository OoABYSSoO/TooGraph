import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "video_segmenter"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.graph_tools.definitions import list_tool_catalog
from app.graph_tools.registry import get_tool_registry


def _load_video_segmenter_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("video_segmenter_tool", script_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VideoSegmenterToolTests(unittest.TestCase):
    def test_official_catalog_exposes_video_segmenter_tool(self):
        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("video_segmenter")

        self.assertIsNotNone(definition)
        self.assertTrue(definition.runtime_ready)
        self.assertTrue(definition.runtime_registered)
        self.assertEqual([field.key for field in definition.input_schema], ["video"])
        self.assertEqual(definition.input_schema[0].value_type, "video")
        self.assertEqual([field.key for field in definition.output_schema], ["segments"])
        self.assertEqual(definition.output_schema[0].value_type, "json")
        self.assertIn("video_segmenter", get_tool_registry(include_disabled=True).keys())

    def test_default_segment_duration_leaves_headroom_for_llm_video_limit(self):
        module = _load_video_segmenter_module()

        self.assertLess(module.DEFAULT_SEGMENT_SECONDS, module.SHORT_LLM_VIDEO_LIMIT_SECONDS)
        self.assertEqual(module.DEFAULT_SEGMENT_SECONDS, 29.5)

    def test_segments_video_into_batch_ready_short_video_files(self):
        if not (TOOL_DIR / "run.py").is_file():
            self.skipTest("video_segmenter script has not been implemented yet")
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg and ffprobe are required for the integration test")

        module = _load_video_segmenter_module()

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source_video = tmp_path / "source.mp4"
            artifact_dir = tmp_path / "artifacts"
            relative_dir = "run/test/video_segmenter/invocation_001"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=160x90:rate=4",
                    "-t",
                    "2.2",
                    "-pix_fmt",
                    "yuv420p",
                    "-y",
                    str(source_video),
                ],
                check=True,
            )

            with patch.dict(
                os.environ,
                {
                    "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
                    "TOOGRAPH_ACTION_ARTIFACT_DIR": str(artifact_dir),
                    "TOOGRAPH_ACTION_ARTIFACT_RELATIVE_DIR": relative_dir,
                },
            ):
                result = module.video_segmenter(
                    {"filesystem_path": str(source_video), "mime_type": "video/mp4"},
                    segment_seconds=1.0,
                )

            self.assertEqual(result["status"], "succeeded")
            self.assertNotIn("frames", result)
            segments = result["segments"]
            self.assertGreaterEqual(len(segments), 2)

            previous_end = 0.0
            for expected_index, segment in enumerate(segments):
                self.assertEqual(segment["index"], expected_index)
                self.assertGreaterEqual(segment["start_sec"], previous_end)
                self.assertGreater(segment["end_sec"], segment["start_sec"])
                self.assertEqual(segment["mime_type"], "video/mp4")
                self.assertTrue(segment["local_path"].startswith(relative_dir + "/"))
                self.assertTrue((artifact_dir / Path(segment["local_path"]).name).is_file())
                previous_end = segment["end_sec"]

    def test_default_segments_remain_under_llm_limit_with_sparse_keyframes(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg and ffprobe are required for the integration test")

        module = _load_video_segmenter_module()

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source_video = tmp_path / "sparse_keyframes.mp4"
            artifact_dir = tmp_path / "artifacts"
            relative_dir = "run/test/video_segmenter/invocation_sparse"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=160x90:rate=4",
                    "-t",
                    "66.2",
                    "-pix_fmt",
                    "yuv420p",
                    "-g",
                    "60",
                    "-keyint_min",
                    "60",
                    "-sc_threshold",
                    "0",
                    "-y",
                    str(source_video),
                ],
                check=True,
            )

            with patch.dict(
                os.environ,
                {
                    "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
                    "TOOGRAPH_ACTION_ARTIFACT_DIR": str(artifact_dir),
                    "TOOGRAPH_ACTION_ARTIFACT_RELATIVE_DIR": relative_dir,
                },
            ):
                result = module.video_segmenter({"filesystem_path": str(source_video), "mime_type": "video/mp4"})

            self.assertEqual(result["status"], "succeeded")
            self.assertGreater(len(result["segments"]), 1)
            for segment in result["segments"]:
                segment_path = artifact_dir / Path(segment["local_path"]).name
                duration = _probe_duration(segment_path)
                self.assertLessEqual(duration, module.SHORT_LLM_VIDEO_LIMIT_SECONDS)

    def test_tool_runner_invokes_video_segmenter_script(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg and ffprobe are required for the integration test")

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source_video = tmp_path / "source.mp4"
            artifact_dir = tmp_path / "artifacts"
            relative_dir = "run/test/video_segmenter/invocation_002"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=160x90:rate=4",
                    "-t",
                    "0.8",
                    "-pix_fmt",
                    "yuv420p",
                    "-y",
                    str(source_video),
                ],
                check=True,
            )

            runner = get_tool_registry(include_disabled=True)["video_segmenter"]
            result = runner.invoke(
                {"video": {"filesystem_path": str(source_video), "mime_type": "video/mp4"}},
                context={"artifact_dir": str(artifact_dir), "artifact_relative_dir": relative_dir},
            )

            self.assertEqual(result["status"], "succeeded")
            self.assertEqual(len(result["segments"]), 1)
            segment = result["segments"][0]
            self.assertEqual(segment["index"], 0)
            self.assertEqual(segment["start_sec"], 0)
            self.assertLessEqual(segment["end_sec"], 30)
            self.assertEqual(segment["mime_type"], "video/mp4")
            self.assertTrue(segment["local_path"].startswith(relative_dir + "/"))
            self.assertTrue((artifact_dir / Path(segment["local_path"]).name).is_file())


def _probe_duration(path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        text=True,
        capture_output=True,
        check=True,
    )
    return float(completed.stdout.strip())


if __name__ == "__main__":
    unittest.main()
