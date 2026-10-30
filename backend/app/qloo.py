"""Typed Qloo client with a SQLite response cache.

All Qloo calls are GET with query params against the hackathon host, authenticated
with the X-Api-Key header. Responses are cached forever by (path, sorted params);
Qloo allows private server-side caching but not publishing the data, so the cache
file lives in backend/data/ which is gitignored.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from .config import settings

LogFn = Callable[[dict[str, Any]], Awaitable[None]]


class QlooError(RuntimeError):
    def __init__(self, status: int, path: str, body: str):
        super().__init__(f"Qloo {status} on {path}: {body[:300]}")
        self.status = status


@dataclass
class Entity:
    id: str
    name: str
    domain: str
    affinity: float
    popularity: float | None = None
    image: str | None = None
    explain: dict[str, float] | None = None  # anchor entity id -> influence 0..1


class Cache:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS qloo (k TEXT PRIMARY KEY, body TEXT, at REAL)")
        self.db.commit()

    # Taste shifts: cached Qloo answers are reused for 30 days, then asked again. Stored demo results
    # don't depend on this; only new runs and live views (heatmaps, profiles) do.
    MAX_AGE = 30 * 86400

    def get(self, key: str) -> Any | None:
        row = self.db.execute("SELECT body, at FROM qloo WHERE k = ?", (key,)).fetchone()
        if not row or (row[1] and time.time() - row[1] > self.MAX_AGE):
            return None
        return json.loads(row[0])

    def put(self, key: str, body: Any) -> None:
        self.db.execute("INSERT OR REPLACE INTO qloo VALUES (?, ?, ?)", (key, json.dumps(body), time.time()))
        self.db.commit()


class QlooClient:
    def __init__(self, concurrency: int = 6):
        self.http = httpx.AsyncClient(
            base_url=settings.qloo_base_url,
            headers={"X-Api-Key": settings.qloo_api_key},
            timeout=60,
        )
        self.cache = Cache(settings.data_dir / "qloo_cache.sqlite3")
        self.sem = asyncio.Semaphore(concurrency)
        self.health: dict[str, Any] = {}

    async def get(self, path: str, params: dict[str, Any], log: LogFn | None = None, label: str = "") -> dict:
        params = {k: (",".join(v) if isinstance(v, (list, tuple)) else v) for k, v in params.items() if v is not None}
        key = hashlib.sha1((path + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        cached = self.cache.get(key)
        if cached is not None:
            if log:
                await log({"type": "qloo", "path": path, "label": label, "params": params, "cached": True, "ms": 0})
            return cached
        async with self.sem:
            t = time.perf_counter()
            try:
                for attempt in range(3):
                    r = await self.http.get(path, params=params)
                    if r.status_code != 429:
                        break
                    await asyncio.sleep(1.5 * (attempt + 1))
            except httpx.HTTPError:
                self._note(False, 0)
                raise
            ms = round((time.perf_counter() - t) * 1000)
        self._note(r.status_code < 500 and r.status_code != 429, ms)
        if log:
            await log({"type": "qloo", "path": path, "label": label, "params": params, "cached": False, "ms": ms, "status": r.status_code})
        if r.status_code != 200:
            raise QlooError(r.status_code, path, r.text)
        body = r.json()
        self.cache.put(key, body)
        return body

    def _note(self, ok: bool, ms: int) -> None:
        """Remember how live calls went, for the status line (no extra probing of Qloo)."""
        h = self.health
        if ok:
            h.update(ok_at=time.time(), fails=0, ms=ms)
        else:
            h.update(fail_at=time.time(), fails=h.get("fails", 0) + 1)

    def status(self) -> str:
        """ok, slow, degraded or down from recent live calls; unknown before the first one."""
        h = self.health
        recent = time.time() - 600
        if h.get("fails", 0) >= 3 and h.get("fail_at", 0) > recent:
            return "down"
        if h.get("fails", 0) and h.get("fail_at", 0) > recent:
            return "degraded"
        if not h.get("ok_at"):
            return "unknown"
        return "slow" if h.get("ms", 0) > 8000 and h["ok_at"] > recent else "ok"

    # ---- endpoints -------------------------------------------------------

    async def search(self, query: str, types: str | None = None, take: int = 5, log: LogFn | None = None) -> list[dict]:
        body = await self.get("/search", {"query": query, "types": types, "take": take}, log, f"search “{query}”")
        return body.get("results", [])

    async def insights(self, filter_type: str, log: LogFn | None = None, label: str = "", **params: Any) -> dict:
        p = {"filter.type": filter_type}
        p.update({k.replace("__", "."): v for k, v in params.items()})
        return await self.get("/v2/insights", p, log, label)

    async def entities(self, filter_type: str, log: LogFn | None = None, label: str = "", **params: Any) -> list[Entity]:
        body = await self.insights(filter_type, log, label, **params)
        out = []
        for e in body.get("results", {}).get("entities", []):
            q = e.get("query") or {}
            ex = (q.get("explainability") or {}).get("signal.interests.entities") or []
            out.append(Entity(
                id=e["entity_id"],
                name=e["name"],
                domain=filter_type.rsplit(":", 1)[-1],
                affinity=float(q.get("affinity") or 0),
                popularity=e.get("popularity"),
                image=((e.get("properties") or {}).get("image") or {}).get("url"),
                explain={x["entity_id"]: round(x["score"], 3) for x in ex} or None,
            ))
        return out

    async def tags(self, log: LogFn | None = None, label: str = "", **params: Any) -> list[dict]:
        body = await self.insights("urn:tag", log, label, **params)
        return body.get("results", {}).get("tags", [])

    async def heatmap(self, log: LogFn | None = None, label: str = "", **params: Any) -> list[dict]:
        body = await self.insights("urn:heatmap", log, label, **params)
        return body.get("results", {}).get("heatmap", [])

    async def demographics(self, entity_ids: list[str], log: LogFn | None = None) -> list[dict]:
        body = await self.insights("urn:demographics", log, "audience profile", signal__interests__entities=entity_ids)
        return body.get("results", {}).get("demographics", [])

    async def aclose(self) -> None:
        await self.http.aclose()
