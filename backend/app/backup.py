"""Backups of the server's data: campaigns, caches, ops log and culture profiles.

    python -m app.backup              # snapshot now into BACKUP_DIR (or backend/backups)
    python -m app.backup list         # list snapshots
    python -m app.backup restore NAME # restore one (stop the server first)

SQLite files are copied with SQLite's online backup API, so a snapshot is consistent even while the
server writes. With BACKUP_DIR set, the server also takes one snapshot a day. Point BACKUP_DIR at a
mounted volume or a synced folder to keep copies off the machine. Backups hold Qloo data: keep them
private, like backend/data.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

from .config import ROOT, settings

KEEP = int(os.getenv("BACKUP_KEEP", "14"))


def backup_dir() -> Path:
    return Path(os.getenv("BACKUP_DIR") or ROOT / "backend" / "backups")


def snapshot(dest: Path | None = None, keep: int = KEEP) -> Path:
    """Copy every store into a new timestamped folder; prune to the newest `keep`."""
    root = dest or backup_dir()
    out = root / time.strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=False)
    for db in sorted(settings.data_dir.glob("*.sqlite3")):
        src = sqlite3.connect(db)
        dst = sqlite3.connect(out / db.name)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
    for extra in ("profiles", "deezer.json"):
        p = settings.data_dir / extra
        if p.is_dir():
            shutil.copytree(p, out / extra)
        elif p.exists():
            shutil.copy2(p, out / extra)
    (out / "COMPLETE").write_text(str(time.time()))  # a snapshot without this marker is partial
    snaps = sorted(d for d in root.iterdir() if d.is_dir() and (d / "COMPLETE").exists())
    for old in snaps[:-keep] if keep > 0 else []:
        shutil.rmtree(old, ignore_errors=True)
    return out


def snapshots(root: Path | None = None) -> list[Path]:
    root = root or backup_dir()
    return sorted(d for d in root.iterdir() if d.is_dir() and (d / "COMPLETE").exists()) if root.exists() else []


def restore(snap: Path) -> None:
    """Replace the live data with a snapshot. Stop the server first; the current data is kept aside."""
    if not (snap / "COMPLETE").exists():
        raise ValueError(f"{snap} is not a complete snapshot")
    aside = settings.data_dir.with_name(f"data-before-restore-{time.strftime('%Y%m%d-%H%M%S')}")
    if settings.data_dir.exists():
        shutil.copytree(settings.data_dir, aside)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    for f in snap.iterdir():
        if f.name == "COMPLETE":
            continue
        target = settings.data_dir / f.name
        if f.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(f, target)
        else:
            shutil.copy2(f, target)


async def daily() -> None:
    """Background task: one snapshot a day while the server runs (only with BACKUP_DIR set)."""
    import asyncio
    import logging

    log = logging.getLogger("tastegeist.backup")
    while True:
        try:
            last = snapshots()
            if not last or time.time() - (last[-1] / "COMPLETE").stat().st_mtime > 23 * 3600:
                log.info("backup written to %s", await asyncio.to_thread(snapshot))
        except Exception as e:  # never take the server down for a backup
            from .ops import get_ops

            get_ops().error("server", f"backup failed: {e}", "/backup")
        await asyncio.sleep(3600)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "backup"
    if cmd == "list":
        for s in snapshots():
            print(s.name)
    elif cmd == "restore" and len(sys.argv) > 2:
        restore(backup_dir() / sys.argv[2])
        print("restored", sys.argv[2])
    else:
        print("written", snapshot())
