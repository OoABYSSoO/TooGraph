#!/usr/bin/env python3
from __future__ import annotations

import sys
from textwrap import dedent


MESSAGE = dedent(
    """\
    [GraphiteUI] This legacy local runtime entrypoint is retired.

    Start any OpenAI-compatible local or private gateway, then point GraphiteUI at it:

      LOCAL_BASE_URL=http://127.0.0.1:8000/v1
      LOCAL_API_KEY=<optional api key>
      LOCAL_TEXT_MODEL=<model name exposed by your gateway>

    This wrapper only exists to guide migration and exits without starting a runtime.
    """
)


def main() -> int:
    sys.stderr.write(MESSAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
