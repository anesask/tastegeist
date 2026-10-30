"""The agent's trace: what it did, in order, kept with the result so the product can show its work.

Built from the events a run already streams (steps, Qloo calls, model calls, warnings), compacted
for storage: every step, every call with its label, cache hit, time and cost, and the validator's
rejections.
"""

from __future__ import annotations

import re
import time
from typing import Any

REJECTED = re.compile(r"(\d+) uncited element")


def build_trace(events: list[dict[str, Any]], started: float) -> dict[str, Any]:
    steps, calls, warnings = [], [], []
    rejected = 0
    for e in events:
        kind = e.get("type")
        if kind == "step":
            steps.append({"t": e.get("t", 0), "step": e.get("step"), "text": e.get("text", ""), "market": e.get("market")})
        elif kind in ("qloo", "llm"):
            text = e.get("text") or ""
            m = REJECTED.search(text)
            if m:
                rejected += int(m.group(1))
            calls.append({
                "t": e.get("t", 0),
                "kind": kind,
                "label": e.get("label") or e.get("path", ""),
                "path": e.get("path"),
                "cached": bool(e.get("cached")),
                "ms": e.get("ms", 0),
                "usd": round(float(e.get("usd") or 0), 4),
                "model": e.get("model"),
                "note": text or None,
            })
        elif kind == "warn":
            warnings.append({"t": e.get("t", 0), "text": e.get("text", "")})
    qloo = [c for c in calls if c["kind"] == "qloo"]
    llm = [c for c in calls if c["kind"] == "llm"]
    return {
        "finished": time.time(),
        "seconds": round(time.time() - started, 1),
        "steps": steps,
        "calls": calls,
        "warnings": warnings,
        "totals": {
            "qloo_calls": len(qloo),
            "qloo_cached": sum(c["cached"] for c in qloo),
            "llm_calls": len(llm),
            "llm_cached": sum(c["cached"] for c in llm),
            "usd": round(sum(c["usd"] for c in llm), 4),
            "rejected_elements": rejected,
        },
    }
