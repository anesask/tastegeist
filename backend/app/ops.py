"""Running it for real: error tracking, cookieless page counts, spend and alerts.

Privacy by construction: no cookies, no user or workspace ids, no IP addresses are stored. A page view
is a counter per normalised path and day; an error is a message, a trimmed stack and the path.
The ops view is behind ADMIN_TOKEN; without it the endpoints don't exist (404).
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import re
import sqlite3
import time
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("tastegeist.ops")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
OPS_SLACK_WEBHOOK = os.getenv("OPS_SLACK_WEBHOOK", "")
ALERT_SHARE = 0.8  # warn once a day when spend passes 80% of the cap
MAX_ERRORS = 2000

# Ids in paths are collapsed so counts are per page, not per campaign (and nothing identifies one).
_IDS = [(re.compile(r"/c/[^/?#]+"), "/c/:id"), (re.compile(r"/report/[^/?#]+"), "/report/:id")]


def normalise(path: str) -> str:
    path = (path or "/").split("?")[0].split("#")[0][:120] or "/"
    for rx, repl in _IDS:
        path = rx.sub(repl, path)
    return path


class Ops:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(settings.data_dir / "ops.sqlite3", check_same_thread=False)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS errors (at REAL, source TEXT, message TEXT, path TEXT, stack TEXT);
            CREATE TABLE IF NOT EXISTS views (day TEXT, path TEXT, n INTEGER, PRIMARY KEY (day, path));
            CREATE TABLE IF NOT EXISTS alerts (day TEXT, kind TEXT, PRIMARY KEY (day, kind));
            """
        )
        # Retention, as the privacy policy says: page counts for 12 months.
        self.db.execute("DELETE FROM views WHERE day < ?", ((dt.date.today() - dt.timedelta(days=365)).isoformat(),))
        self.db.commit()

    # ---- telemetry
    def error(self, source: str, message: str, path: str = "", stack: str = "") -> None:
        self.db.execute(
            "INSERT INTO errors VALUES (?, ?, ?, ?, ?)", (time.time(), source[:10], message[:500], normalise(path), stack[:3000])
        )
        self.db.execute("DELETE FROM errors WHERE rowid NOT IN (SELECT rowid FROM errors ORDER BY at DESC LIMIT ?)", (MAX_ERRORS,))
        self.db.commit()

    def view(self, path: str) -> None:
        day = dt.date.today().isoformat()
        self.db.execute(
            "INSERT INTO views VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1", (day, normalise(path))
        )
        self.db.commit()

    # ---- alerts
    def alert_once(self, kind: str, text: str) -> bool:
        """Log (and post to the ops Slack, if set) at most once per kind and day."""
        day = dt.date.today().isoformat()
        cur = self.db.execute("INSERT OR IGNORE INTO alerts VALUES (?, ?)", (day, kind))
        self.db.commit()
        if not cur.rowcount:
            return False
        log.warning("ALERT %s: %s", kind, text)
        if OPS_SLACK_WEBHOOK.startswith("https://hooks.slack.com/"):
            try:
                httpx.post(OPS_SLACK_WEBHOOK, json={"text": f"Tastegeist ops: {text}"}, timeout=5)
            except httpx.HTTPError:
                pass
        return True

    def check_spend(self, spent: float, cap: float) -> None:
        if cap > 0 and spent >= cap * ALERT_SHARE:
            self.alert_once("spend80", f"model spend today is ${spent:.2f} of the ${cap:.0f} daily cap")
        if cap > 0 and spent >= cap:
            self.alert_once("spend100", f"daily cap of ${cap:.0f} reached; new model calls are refused until tomorrow")

    # ---- the ops view
    def summary(self, llm_db: sqlite3.Connection, results: list[tuple[str, str, dict[str, Any]]], cap: float) -> dict[str, Any]:
        since = (dt.date.today() - dt.timedelta(days=29)).isoformat()
        spend = [{"day": d, "usd": round(u, 4)} for d, u in llm_db.execute("SELECT day, usd FROM spend WHERE day >= ? ORDER BY day", (since,))]
        views = [{"day": d, "path": p, "n": n} for d, p, n in self.db.execute("SELECT day, path, n FROM views WHERE day >= ? ORDER BY day", (since,))]
        errors = [
            {"at": a, "source": s, "message": m, "path": p, "stack": st}
            for a, s, m, p, st in self.db.execute("SELECT at, source, message, path, stack FROM errors ORDER BY at DESC LIMIT 50")
        ]
        campaigns = []
        qloo_live = qloo_cached = 0
        for cid, title, r in results:
            t = (r or {}).get("trace") or {}
            tot = t.get("totals") or {}
            qloo_live += tot.get("qloo_calls", 0) - tot.get("qloo_cached", 0)
            qloo_cached += tot.get("qloo_cached", 0)
            campaigns.append({"id": cid, "title": title, "usd": tot.get("usd", 0), "qloo_calls": tot.get("qloo_calls", 0),
                              "llm_calls": tot.get("llm_calls", 0), "finished": t.get("finished")})
        campaigns.sort(key=lambda c: -(c["usd"] or 0))
        today = dt.date.today().isoformat()
        spent = next((s["usd"] for s in spend if s["day"] == today), 0.0)
        return {
            "cap": cap, "spent_today": spent, "alert_at": round(cap * ALERT_SHARE, 2),
            "spend": spend, "views": views, "errors": errors, "campaigns": campaigns[:50],
            "providers": [
                {"name": "Anthropic (Claude)", "unit": "USD", "value": round(sum(s["usd"] for s in spend), 4), "note": "last 30 days, from the spend ledger"},
                {"name": "Qloo", "unit": "calls", "value": qloo_live, "note": f"live calls in stored runs; {qloo_cached} more served from cache"},
            ],
            "alerts": [{"day": d, "kind": k} for d, k in self.db.execute("SELECT day, kind FROM alerts ORDER BY day DESC LIMIT 20")],
        }


def admin_ok(token: str | None) -> bool:
    import hmac

    return bool(ADMIN_TOKEN) and bool(token) and hmac.compare_digest(ADMIN_TOKEN, token or "")


_ops: Ops | None = None


def get_ops() -> Ops:
    """One Ops per process, created on first use."""
    global _ops
    if _ops is None:
        _ops = Ops()
    return _ops
