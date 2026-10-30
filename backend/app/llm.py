"""Claude calls with a response cache and a daily spend cap.

Every call is cached by its exact request, so demo briefs and re-runs cost nothing.
Spend is tallied per UTC day from response.usage; once DAILY_CAP_USD is reached, calls raise
BudgetExceeded and the pipeline falls back to template output.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import sqlite3
import time
from typing import Any

import anthropic

from .config import settings

CONCEPT_MODEL = "claude-opus-5-5"
PANEL_MODEL = "claude-haiku-5-5"
DAILY_CAP_USD = 5.0
# New Anthropic orgs have a low concurrent-request limit across all models.
MAX_CONCURRENT = 4

# $ per 1M tokens: input, output, cache read
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


class BudgetExceeded(RuntimeError):
    pass


class LLMUnavailable(RuntimeError):
    pass


class LLM:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(settings.data_dir / "llm_cache.sqlite3", check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS llm (k TEXT PRIMARY KEY, body TEXT, at REAL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL)")
        self.db.commit()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, max_retries=4) if settings.anthropic_api_key else None
        self.sem = asyncio.Semaphore(MAX_CONCURRENT)

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def spent_today(self) -> float:
        row = self.db.execute("SELECT usd FROM spend WHERE day = ?", (_today(),)).fetchone()
        return row[0] if row else 0.0

    def add_spend(self, usd: float) -> None:
        self.db.execute(
            "INSERT INTO spend VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd",
            (_today(), usd),
        )
        self.db.commit()

    def _record(self, model: str, usage: Any) -> float:
        p_in, p_out, p_cache = PRICES[model]
        usd = (
            (usage.input_tokens + (usage.cache_creation_input_tokens or 0) * 1.25) * p_in
            + (usage.cache_read_input_tokens or 0) * p_cache
            + usage.output_tokens * p_out
        ) / 1_000_000
        self.db.execute(
            "INSERT INTO spend VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd",
            (_today(), usd),
        )
        self.db.commit()
        from .ops import get_ops

        get_ops().check_spend(self.spent_today(), DAILY_CAP_USD)  # alert before the cap, once a day
        return usd

    async def json(
        self,
        *,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int,
        effort: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Return (parsed JSON, meta). meta has cached / usd / ms for the agent log."""
        key = hashlib.sha1(json.dumps([model, system, user, schema, effort], sort_keys=True).encode()).hexdigest()
        row = self.db.execute("SELECT body FROM llm WHERE k = ?", (key,)).fetchone()
        if row:
            return json.loads(row[0]), {"cached": True, "usd": 0.0, "ms": 0, "model": model}
        if not self.client:
            raise LLMUnavailable("ANTHROPIC_API_KEY not set")
        if self.spent_today() >= DAILY_CAP_USD:
            raise BudgetExceeded(f"daily LLM cap of ${DAILY_CAP_USD:.0f} reached")

        async with self.sem:
            t = time.perf_counter()
            try:
                response = await self.client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                    output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                )
            except anthropic.RateLimitError as e:
                raise LLMUnavailable("Claude rate limit, try again shortly") from e
            except anthropic.APIStatusError as e:
                raise LLMUnavailable(f"Claude API error {e.status_code}") from e
            except anthropic.APIConnectionError as e:
                raise LLMUnavailable("Claude unreachable") from e
            ms = round((time.perf_counter() - t) * 1000)
        usd = self._record(model, response.usage)
        if response.stop_reason == "refusal":
            raise LLMUnavailable("model declined the request")
        if response.stop_reason == "max_tokens":
            raise LLMUnavailable("response hit max_tokens")
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        self.db.execute("INSERT OR REPLACE INTO llm VALUES (?, ?, ?)", (key, json.dumps(data), time.time()))
        self.db.commit()
        return data, {"cached": False, "usd": round(usd, 4), "ms": ms, "model": model}


def _today() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
