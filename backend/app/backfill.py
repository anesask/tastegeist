"""Add hero images to stored campaign results without re-running them: python -m app.backfill eu us"""
import asyncio
import json
import sys

from .images import add_images
from .llm import LLM
from .store import Store


async def main(ids: list[str]) -> None:
    store, llm = Store(), LLM()

    async def log(ev):
        if ev["type"] in ("llm", "warn"):
            print(ev.get("label") or ev.get("text"))

    for cid in ids:
        c = store.get(cid)
        if not c or not c["result"]:
            print(cid, "has no result")
            continue
        await add_images(llm, c["result"], c["product_name"] or c["title"], log)
        store.db.execute("UPDATE results SET result = ? WHERE campaign_id = ?", (json.dumps(c["result"]), cid))
        store.db.commit()
        print(cid, "done; spent today", round(llm.spent_today(), 3))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
