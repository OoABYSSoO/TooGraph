from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FfmpegResolverTests(unittest.TestCase):
    def test_resolves_system_ffmpeg_before_private_runtime_tools(self) -> None:
        from app.tools.ffmpeg_resolver import resolve_ffmpeg_tools

        def fake_which(name: str) -> str | None:
            return {"ffmpeg": "/usr/bin/ffmpeg", "ffprobe": "/usr/bin/ffprobe"}.get(name)

        def fake_run(command: list[str], **_kwargs: Any) -> subprocess.CompletedProcess[str]:
            self.assertIn(command[0], {"/usr/bin/ffmpeg", "/usr/bin/ffprobe"})
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

        with tempfile.TemporaryDirectory() as temp_dir:
            private_ffmpeg = Path(temp_dir) / "ffmpeg" / "linux-x86_64" / "ffmpeg"
            private_ffmpeg.parent.mkdir(parents=True)
            private_ffmpeg.write_text("#!/bin/sh\n", encoding="utf-8")

            tools = resolve_ffmpeg_tools(
                runtime_root=Path(temp_dir),
                which_func=fake_which,
                run_func=fake_run,
                environ={},
            )

        self.assertEqual(tools.ffmpeg, "/usr/bin/ffmpeg")
        self.assertEqual(tools.ffprobe, "/usr/bin/ffprobe")
        self.assertEqual(tools.source, "system")

    def test_resolves_private_runtime_ffmpeg_when_system_binary_is_missing(self) -> None:
        from app.tools.ffmpeg_resolver import resolve_ffmpeg_tools

        def fake_run(command: list[str], **_kwargs: Any) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = Path(temp_dir)
            platform_dir = runtime_root / "ffmpeg" / "test-platform"
            executable_suffix = ".exe" if sys.platform == "win32" else ""
            ffmpeg = platform_dir / f"ffmpeg{executable_suffix}"
            ffprobe = platform_dir / f"ffprobe{executable_suffix}"
            platform_dir.mkdir(parents=True)
            ffmpeg.write_text("#!/bin/sh\n", encoding="utf-8")
            ffprobe.write_text("#!/bin/sh\n", encoding="utf-8")

            tools = resolve_ffmpeg_tools(
                runtime_root=runtime_root,
                platform_tag="test-platform",
                which_func=lambda _name: None,
                run_func=fake_run,
                environ={},
            )

        self.assertEqual(Path(tools.ffmpeg), ffmpeg)
        self.assertEqual(Path(tools.ffprobe or ""), ffprobe)
        self.assertEqual(tools.source, "private")

    def test_auto_install_is_opt_in(self) -> None:
        from app.tools.ffmpeg_resolver import resolve_ffmpeg_tools

        install_calls: list[Path] = []

        def fake_install(runtime_root: Path, **_kwargs: Any):
            install_calls.append(runtime_root)
            return None

        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(RuntimeError, "TOOGRAPH_AUTO_INSTALL_FFMPEG=1"):
                resolve_ffmpeg_tools(
                    runtime_root=Path(temp_dir),
                    which_func=lambda _name: None,
                    run_func=lambda command, **kwargs: subprocess.CompletedProcess(command, 1),
                    install_func=fake_install,
                    environ={},
                )

        self.assertEqual(install_calls, [])

    def test_auto_install_uses_app_private_installer_when_enabled(self) -> None:
        from app.tools.ffmpeg_resolver import FfmpegTools, resolve_ffmpeg_tools

        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = Path(temp_dir)
            installed_ffmpeg = runtime_root / "python" / "bin" / "ffmpeg"
            installed_ffmpeg.parent.mkdir(parents=True)
            installed_ffmpeg.write_text("#!/bin/sh\n", encoding="utf-8")

            def fake_install(root: Path, **_kwargs: Any) -> FfmpegTools:
                self.assertEqual(root, runtime_root)
                return FfmpegTools(ffmpeg=str(installed_ffmpeg), ffprobe=None, source="imageio-ffmpeg")

            tools = resolve_ffmpeg_tools(
                runtime_root=runtime_root,
                which_func=lambda _name: None,
                run_func=lambda command, **kwargs: subprocess.CompletedProcess(command, 0),
                install_func=fake_install,
                environ={"TOOGRAPH_AUTO_INSTALL_FFMPEG": "1"},
            )

        self.assertEqual(Path(tools.ffmpeg), installed_ffmpeg)
        self.assertIsNone(tools.ffprobe)
        self.assertEqual(tools.source, "imageio-ffmpeg")


if __name__ == "__main__":
    unittest.main()
