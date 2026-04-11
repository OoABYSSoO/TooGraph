#!/usr/bin/env python3
from __future__ import annotations

import sys
from textwrap import dedent


MESSAGE = dedent(
    """\
    [GraphiteUI] Bundled model download is retired.

    Use the model manager for your OpenAI-compatible gateway, then configure it in GraphiteUI:

      GraphiteUI -> Model Providers -> Local / Custom OpenAI-compatible

    This script exits without downloading models.
    """
)


def main() -> int:
    sys.stderr.write(MESSAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
