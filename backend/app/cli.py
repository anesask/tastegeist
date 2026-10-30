"""Run a demo brief from the command line: python -m app.cli eu"""
import asyncio, json, sys

from .demos import DEMOS
from .pipeline import run
from .llm import LLM
from .qloo import QlooClient


async def main(demo: str) -> None:
    q = QlooClient()

    async def log(ev):
        if ev["type"] == "llm":
            print(f"[llm] {ev['label']} {ev['model']} ${ev['usd']} {ev['ms']}ms{' cache' if ev['cached'] else ''}", file=sys.stderr)
        elif ev["type"] not in ("qloo", "partial"):
            print(f"[{ev['type']}] {ev.get('text')}", file=sys.stderr)

    try:
        result = await run(q, DEMOS[demo], log, LLM())
    finally:
        await q.aclose()
    print(json.dumps(result, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "eu"))
