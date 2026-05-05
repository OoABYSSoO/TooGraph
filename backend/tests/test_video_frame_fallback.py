from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tools.video_frame_fallback import extract_video_frame_attachments


class VideoFrameFallbackTests(unittest.TestCase):
    def test_extracts_image_attachments_from_local_video_file(self) -> None:
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg and ffprobe are required for video frame fallback.")

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = Path(temp_dir) / "clip.mp4"
            frame_dir = Path(temp_dir) / "frames"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=64x64:rate=4:duration=1",
                    "-pix_fmt",
                    "yuv420p",
                    "-y",
                    str(video_path),
                ],
                check=True,
            )
            frames = extract_video_frame_attachments(
                {
                    "type": "video",
                    "state_key": "clip",
                    "name": "clip.mp4",
                    "mime_type": "video/mp4",
                    "filesystem_path": str(video_path),
                    "file_url": video_path.resolve().as_uri(),
                },
                frame_count=2,
                output_dir=frame_dir,
            )

            self.assertGreaterEqual(len(frames), 1)
            self.assertLessEqual(len(frames), 2)
            self.assertEqual(frames[0]["type"], "image")
            self.assertEqual(frames[0]["mime_type"], "image/jpeg")
            self.assertTrue(frames[0]["file_url"].startswith("file://"))
            self.assertTrue(Path(frames[0]["filesystem_path"]).is_file())
        self.assertEqual(frames[0]["source"]["type"], "video_frame")


if __name__ == "__main__":
    unittest.main()
