from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


def test_tracked_project_files_do_not_reintroduce_legacy_public_response_identifier() -> None:
    legacy_identifier = "final" + "_reply"
    repo_root = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stdout:
        subprocess.run(
            ["git", "ls-files"],
            cwd=repo_root,
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        stdout.seek(0)
        tracked_files = stdout.read().splitlines()

    offenders: list[str] = []
    for relative_path in tracked_files:
        path = repo_root / relative_path
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if legacy_identifier in content:
            offenders.append(relative_path)

    assert offenders == []
