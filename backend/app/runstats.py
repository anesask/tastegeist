"""How long a run takes, measured (OPEN_POINTS C3).

From the trace of every stored run that actually called the model (cached replays take under a second
and would distort it): the typical total (p50, and p95 once there are enough runs) and how far into a
run each step starts, as a share of the total. The run view turns that into "about 2 minutes left".
"""

from __future__ import annotations

from statistics import median
from typing import Any

STEPS = ["anchors", "culture_map", "lift", "zones", "neighborhoods", "places", "concepts", "seance", "done"]


def _pct(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def run_stats(results: list[tuple[str, str, dict[str, Any]]]) -> dict[str, Any]:
    totals: list[float] = []
    shares: dict[str, list[float]] = {}
    for _, _, r in results:
        t = (r or {}).get("trace") or {}
        tot = t.get("totals") or {}
        secs = t.get("seconds") or 0
        if secs < 20 or not tot.get("llm_calls") or tot.get("llm_cached", 0) >= tot.get("llm_calls", 0):
            continue  # a cached replay, not a measurement
        totals.append(secs)
        seen: dict[str, float] = {}
        for s in t.get("steps", []):
            seen.setdefault(s["step"], s["t"])
        for step, at in seen.items():
            shares.setdefault(step, []).append(at / secs)
    if not totals:
        return {"runs": 0, "p50": None, "p95": None, "steps": {}}
    return {
        "runs": len(totals),
        "p50": round(median(totals), 1),
        "p95": round(_pct(totals, 0.95), 1) if len(totals) >= 3 else None,
        "steps": {k: round(median(v), 3) for k, v in shares.items()},
    }
