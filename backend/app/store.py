"""Campaign persistence (SQLite). The spec's build rule: workspace / campaign / run / plan objects
from day one, so the UI is just a client of the same API an enterprise would use."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any

from .config import settings

DEMO_WORKSPACE = "demo"


class Store:
    def __init__(self) -> None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(settings.data_dir / "app.sqlite3", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                workspace TEXT NOT NULL,
                brief TEXT NOT NULL,
                status TEXT NOT NULL,          -- draft | running | ready | failed
                demo INTEGER NOT NULL DEFAULT 0,
                created REAL NOT NULL,
                updated REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS results (
                campaign_id TEXT PRIMARY KEY,
                result TEXT NOT NULL,
                updated REAL NOT NULL
            );
            -- Earlier runs of a campaign, kept when it is generated again (newest result stays in results).
            CREATE TABLE IF NOT EXISTS versions (
                campaign_id TEXT NOT NULL,
                n INTEGER NOT NULL,
                result TEXT NOT NULL,
                created REAL NOT NULL,
                PRIMARY KEY (campaign_id, n)
            );
            -- Workspace settings: defaults, brand kit, agency details, integrations.
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                settings TEXT NOT NULL,
                updated REAL NOT NULL
            );
            """
        )
        self.db.commit()

    def upsert_demo(self, cid: str, brief: dict[str, Any]) -> None:
        now = time.time()
        row = self.db.execute("SELECT id FROM campaigns WHERE id = ?", (cid,)).fetchone()
        if row:
            # Keep a headline the pipeline generated earlier when the seed brief has none.
            old = json.loads(self.db.execute("SELECT brief FROM campaigns WHERE id = ?", (cid,)).fetchone()["brief"])
            if not brief.get("headline") and old.get("headline"):
                brief = {**brief, "headline": old["headline"], "headline_auto": old.get("headline_auto", False)}
            self.db.execute("UPDATE campaigns SET brief = ? WHERE id = ?", (json.dumps(brief), cid))
        else:
            self.db.execute(
                "INSERT INTO campaigns VALUES (?, ?, ?, 'draft', 1, ?, ?)", (cid, DEMO_WORKSPACE, json.dumps(brief), now, now)
            )
        self.db.commit()

    def create(self, workspace: str, brief: dict[str, Any]) -> str:
        cid = uuid.uuid4().hex[:10]
        now = time.time()
        self.db.execute("INSERT INTO campaigns VALUES (?, ?, ?, 'draft', 0, ?, ?)", (cid, workspace, json.dumps(brief), now, now))
        self.db.commit()
        return cid

    def list(self, workspace: str) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT c.*, r.result FROM campaigns c LEFT JOIN results r ON r.campaign_id = c.id "
            "WHERE c.workspace = ? OR c.demo = 1 ORDER BY c.demo ASC, c.updated DESC",
            (workspace,),
        ).fetchall()
        return [self._summary(r) for r in rows]

    def get(self, cid: str) -> dict[str, Any] | None:
        r = self.db.execute(
            "SELECT c.*, r.result FROM campaigns c LEFT JOIN results r ON r.campaign_id = c.id WHERE c.id = ?", (cid,)
        ).fetchone()
        if not r:
            return None
        return {**self._summary(r), "brief": json.loads(r["brief"]), "result": json.loads(r["result"]) if r["result"] else None}

    def set_status(self, cid: str, status: str) -> None:
        self.db.execute("UPDATE campaigns SET status = ?, updated = ? WHERE id = ?", (status, time.time(), cid))
        self.db.commit()

    def save_result(self, cid: str, result: dict[str, Any]) -> None:
        self.db.execute("INSERT OR REPLACE INTO results VALUES (?, ?, ?)", (cid, json.dumps(result), time.time()))
        self.db.execute("UPDATE campaigns SET status = 'ready', updated = ? WHERE id = ?", (time.time(), cid))
        self.db.commit()

    def snapshot(self, cid: str) -> None:
        """Keep the current result as a numbered version before a new run replaces it."""
        row = self.db.execute("SELECT result, updated FROM results WHERE campaign_id = ?", (cid,)).fetchone()
        if not row:
            return
        n = self.db.execute("SELECT COALESCE(MAX(n), 0) + 1 FROM versions WHERE campaign_id = ?", (cid,)).fetchone()[0]
        self.db.execute("INSERT INTO versions VALUES (?, ?, ?, ?)", (cid, n, row["result"], row["updated"]))
        self.db.commit()

    def versions(self, cid: str) -> list[dict[str, Any]]:
        """Earlier runs, oldest first, plus the current one last."""
        rows = self.db.execute("SELECT n, result, created FROM versions WHERE campaign_id = ? ORDER BY n", (cid,)).fetchall()
        out = [{"n": r["n"], "created": r["created"], "result": json.loads(r["result"])} for r in rows]
        cur = self.db.execute("SELECT result, updated FROM results WHERE campaign_id = ?", (cid,)).fetchone()
        if cur:
            out.append({"n": len(rows) + 1, "created": cur["updated"], "result": json.loads(cur["result"]), "current": True})
        return out

    def get_settings(self, workspace: str) -> dict[str, Any]:
        row = self.db.execute("SELECT settings FROM workspaces WHERE id = ?", (workspace,)).fetchone()
        return json.loads(row["settings"]) if row else {}

    def save_settings(self, workspace: str, data: dict[str, Any]) -> None:
        self.db.execute("INSERT OR REPLACE INTO workspaces VALUES (?, ?, ?)", (workspace, json.dumps(data), time.time()))
        self.db.commit()

    def workspace_of(self, cid: str) -> str | None:
        r = self.db.execute("SELECT workspace FROM campaigns WHERE id = ?", (cid,)).fetchone()
        return r["workspace"] if r else None

    def all_results(self, limit: int = 200) -> list[tuple[str, str, dict[str, Any]]]:
        """Recent finished campaigns (id, title, result), newest first: for the ops view's cost per campaign."""
        rows = self.db.execute(
            "SELECT c.id, c.brief, r.result FROM campaigns c JOIN results r ON r.campaign_id = c.id ORDER BY r.updated DESC LIMIT ?", (limit,)
        ).fetchall()
        return [(r["id"], json.loads(r["brief"]).get("title", ""), json.loads(r["result"])) for r in rows]

    def set_headline(self, cid: str, headline: str) -> None:
        row = self.db.execute("SELECT brief FROM campaigns WHERE id = ?", (cid,)).fetchone()
        brief = json.loads(row["brief"])
        brief["headline"] = headline
        brief["headline_auto"] = True  # regenerated on the next run, unlike a hand-written headline
        self.db.execute("UPDATE campaigns SET brief = ? WHERE id = ?", (json.dumps(brief), cid))
        self.db.commit()

    def rename(self, cid: str, title: str) -> None:
        row = self.db.execute("SELECT brief FROM campaigns WHERE id = ?", (cid,)).fetchone()
        brief = json.loads(row["brief"])
        brief["title"] = title
        self.db.execute("UPDATE campaigns SET brief = ?, updated = ? WHERE id = ?", (json.dumps(brief), time.time(), cid))
        self.db.commit()

    def duplicate(self, cid: str, workspace: str) -> str:
        """A new draft with the same brief, ready to edit and generate."""
        row = self.db.execute("SELECT brief FROM campaigns WHERE id = ?", (cid,)).fetchone()
        brief = json.loads(row["brief"])
        brief["title"] = f"{brief.get('title', 'Campaign')} (copy)"
        if brief.get("headline_auto"):
            brief.pop("headline", None)
        return self.create(workspace, brief)

    def delete(self, cid: str) -> None:
        self._delete([cid])

    def delete_workspace(self, workspace: str) -> list[str]:
        """Erase a workspace's own campaigns and results (never the demos). Returns the deleted ids."""
        ids = [r["id"] for r in self.db.execute("SELECT id FROM campaigns WHERE workspace = ? AND demo = 0", (workspace,))]
        self._delete(ids)
        self.db.execute("DELETE FROM workspaces WHERE id = ?", (workspace,))
        self.db.commit()
        return ids

    def purge_stale(self, max_age_days: int = 365) -> list[str]:
        """Retention (privacy policy): workspaces unused for a year are deleted."""
        cutoff = time.time() - max_age_days * 86400
        ids = [
            r["id"]
            for r in self.db.execute(
                "SELECT id FROM campaigns WHERE demo = 0 AND workspace IN "
                "(SELECT workspace FROM campaigns WHERE demo = 0 GROUP BY workspace HAVING MAX(updated) < ?)",
                (cutoff,),
            )
        ]
        self._delete(ids)
        self.db.execute(
            "DELETE FROM workspaces WHERE updated < ? AND id NOT IN (SELECT workspace FROM campaigns WHERE updated >= ?)", (cutoff, cutoff)
        )
        self.db.commit()
        return ids

    def _delete(self, ids: list[str]) -> None:
        for cid in ids:
            self.db.execute("DELETE FROM results WHERE campaign_id = ?", (cid,))
            self.db.execute("DELETE FROM versions WHERE campaign_id = ?", (cid,))
            self.db.execute("DELETE FROM campaigns WHERE id = ?", (cid,))
        self.db.commit()

    def owns(self, workspace: str, cid: str) -> bool:
        r = self.db.execute("SELECT workspace, demo FROM campaigns WHERE id = ?", (cid,)).fetchone()
        return bool(r) and (r["demo"] == 1 or r["workspace"] == workspace)

    @staticmethod
    def _summary(r: sqlite3.Row) -> dict[str, Any]:
        brief = json.loads(r["brief"])
        result = json.loads(r["result"]) if r["result"] else None
        thumbs = []
        if result:
            # People, film and TV make better thumbnails than brand logos.
            for z in result.get("groups", result.get("zones", [])):
                ents = [e for e in z["ledger"] if e.get("image")]
                ents.sort(key=lambda e: e["domain"] in ("brand", "podcast"))
                thumbs += [e["image"] for e in ents[:1]]
        return {
            "id": r["id"],
            "title": brief.get("title"),
            "product_name": brief.get("product_name"),
            "headline": brief.get("headline"),
            "objective": brief.get("objective"),
            "scope": brief.get("scope", "cities"),
            "markets": [m["name"] for m in brief.get("markets", [])],
            "status": r["status"],
            "demo": bool(r["demo"]),
            "created": r["created"],
            "updated": r["updated"],
            "thumbs": thumbs[:4],
            "zones": len(result["zones"]) if result else 0,
        }
