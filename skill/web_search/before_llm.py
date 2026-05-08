from __future__ import annotations

from datetime import datetime
import json


def web_search_before_llm() -> dict[str, str]:
    return {"context": f"Current date: {datetime.now().astimezone().date().isoformat()}"}


if __name__ == "__main__":
    print(json.dumps(web_search_before_llm(), ensure_ascii=False))
