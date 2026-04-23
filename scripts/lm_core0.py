#!/usr/bin/env python3
from __future__ import annotations

import sys
from textwrap import dedent


MESSAGE = dedent(
    """\
    [GraphiteUI] This legacy local runtime entrypoint has moved to EZLLM.

    Use EZLLM instead:
      pipx install ezllm
      ezllm start

    Then point GraphiteUI at:
      LOCAL_BASE_URL=http://127.0.0.1:8888/v1

    This wrapper only exists to guide migration and exits without starting a runtime.
    """
)


def main() -> int:
    sys.stderr.write(MESSAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
