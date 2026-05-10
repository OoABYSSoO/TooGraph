#!/usr/bin/env python3
from __future__ import annotations

import sys
from textwrap import dedent


MESSAGE = dedent(
    """\
    [TooGraph] This local runtime entrypoint is retired.

    Start the OpenAI-compatible local or private gateway you want to use, then configure it in TooGraph:

      TooGraph -> Model Providers -> Local / Custom OpenAI-compatible

    This script exits without starting a runtime.
    """
)


def main() -> int:
    sys.stderr.write(MESSAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
