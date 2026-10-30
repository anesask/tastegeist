"""Media plan engine: deterministic, so every number can be explained.

- Budget: split across zones by ledger strength (mean lift), then across a zone's markets evenly.
- Flighting: three phases over the campaign dates (tease, launch, sustain), channels per phase.
- Audiences: age/gender from the brief, interest keywords straight from the ledger.
- A/B test: the two best séance concepts per zone; sample size from a two-proportion z-test.
"""

from __future__ import annotations

import datetime as dt
import math
from typing import Any

from .models import Brief

CHANNEL_LABEL = {
    "social": "Social",
    "online_video": "Online video",
    "audio": "Audio",
    "ooh": "OOH",
    "influencers": "Influencers",
    "press": "Press",
}
# Which channels run in which phase. Channels the user didn't pick are skipped.
PHASES = [
    ("Tease", 0.0, 0.25, ["social", "influencers"]),
    ("Launch", 0.25, 0.65, ["online_video", "ooh", "audio", "social", "press"]),
    ("Sustain", 0.65, 1.0, ["social", "audio", "influencers"]),
]
# Default share of a zone's budget per channel (renormalised over the chosen channels).
CHANNEL_WEIGHT = {"social": 0.32, "online_video": 0.24, "ooh": 0.16, "audio": 0.12, "influencers": 0.12, "press": 0.04}
AGE_LABEL = {
    "24_and_younger": "18-24",
    "25_to_29": "25-29",
    "30_to_34": "30-34",
    "35_to_44": "35-44",
    "45_to_54": "45-54",
    "55_and_older": "55+",
}


def _dates(brief: Brief) -> tuple[dt.date, dt.date]:
    today = dt.date.today()
    start = dt.date.fromisoformat(brief.start) if brief.start else today + dt.timedelta(days=14)
    end = dt.date.fromisoformat(brief.end) if brief.end else start + dt.timedelta(weeks=8)
    return start, max(end, start + dt.timedelta(days=7))


def ab_sample_size(p1: float = 0.010, uplift: float = 0.20, alpha_z: float = 1.96, power_z: float = 0.84) -> int:
    """Impressions per arm to detect a relative uplift in click-through rate (alpha 0.05, power 0.8)."""
    p2 = p1 * (1 + uplift)
    n = (alpha_z + power_z) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p2 - p1) ** 2
    return int(math.ceil(n / 1000.0)) * 1000


def default_shares(groups: list[dict[str, Any]], strength: dict[str, float]) -> tuple[dict[str, float], dict[str, set[str]]]:
    """Zones split the budget by ledger strength. A city with neighborhood geists hands its slice of
    its zone to those neighborhoods (split by their strength), so no market is budgeted twice."""
    zones = [g for g in groups if g["kind"] == "zone"]
    hoods: dict[str, list[dict[str, Any]]] = {}
    for g in groups:
        if g["kind"] == "neighborhood":
            hoods.setdefault(g.get("parent") or g["markets"][0], []).append(g)
    total = sum(strength[z["key"]] for z in zones) or 1.0
    out: dict[str, float] = {}
    carved: dict[str, set[str]] = {}
    for z in zones:
        zs = strength[z["key"]] / total
        per_market = zs / max(1, len(z["markets"]))
        out[z["key"]] = zs
        for city in z["markets"]:
            if city in hoods:
                out[z["key"]] -= per_market
                carved.setdefault(z["key"], set()).add(city)
                hs = sum(strength[h["key"]] for h in hoods[city]) or 1.0
                for h in hoods[city]:
                    out[h["key"]] = per_market * strength[h["key"]] / hs
    return out, carved


def build_plan(brief: Brief, groups: list[dict[str, Any]], shares: dict[str, float] | None = None) -> dict[str, Any]:
    start, end = _dates(brief)
    days = (end - start).days
    channels = [c for c in brief.channels if c in CHANNEL_WEIGHT] or list(CHANNEL_WEIGHT)
    cw_total = sum(CHANNEL_WEIGHT[c] for c in channels)

    strength = {g["key"]: (sum(e["lift"] for e in g["ledger"]) / len(g["ledger"]) if g["ledger"] else 1.0) for g in groups}
    budget = brief.budget or 0
    default, carved = default_shares(groups, strength)

    zones = []
    for g in groups:
        # A zone whose every city is planned through its neighborhoods has nothing left to buy.
        if g["kind"] == "zone" and set(g["markets"]) <= carved.get(g["key"], set()):
            continue
        # User-edited shares win; otherwise split by ledger strength.
        share = shares[g["key"]] if shares and g["key"] in shares else default[g["key"]]
        amount = round(budget * share, -1)
        chosen = g["concepts"][g.get("chosen", 0)] if g.get("concepts") else None
        ranked = sorted(g.get("concepts", []), key=lambda c: -((c.get("panel") or {}).get("stop_scrolling", 0)))
        keywords: dict[str, list[str]] = {}
        for e in g["ledger"]:
            keywords.setdefault(e["domain"], []).append(e["name"])
        zones.append({
            "key": g["key"],
            "name": g.get("persona", {}).get("name") or g["label"],
            "label": g["label"],
            "markets": g["markets"],
            "share": round(share, 4),
            "budget": amount,
            "channels": [
                {"channel": c, "label": CHANNEL_LABEL[c], "budget": round(amount * CHANNEL_WEIGHT[c] / cw_total, -1)} for c in channels
            ],
            "audience": {
                "age": [AGE_LABEL.get(a, a) for a in brief.age] or ["18-34"],
                "gender": brief.gender or "all",
                "interests": keywords,
            },
            "geo": [
                {"name": m["name"], "lat": m["center"][1], "lon": m["center"][0], "radius_km": 1.5 if m.get("parent") else 12}
                for m in g["market_objs"]
                if m["name"] not in carved.get(g["key"], ())
            ],
            "creative": {"id": chosen["id"], "headline": (chosen.get("headline") or {}).get("text"), "direction": chosen.get("direction")} if chosen else None,
            "ab_test": {
                "a": {"id": ranked[0]["id"], "headline": (ranked[0].get("headline") or {}).get("text")},
                "b": {"id": ranked[1]["id"], "headline": (ranked[1].get("headline") or {}).get("text")},
                "split": "50/50",
                "metric": "Click-through rate",
                "impressions_per_arm": ab_sample_size(),
                "assumption": "Baseline CTR 1.0%, detect a 20% relative uplift, alpha 0.05, power 0.8",
            }
            if len(ranked) >= 2
            else None,
        })

    flighting = []
    for name, a, b, phase_channels in PHASES:
        p_start = start + dt.timedelta(days=round(days * a))
        p_end = start + dt.timedelta(days=round(days * b))
        for c in phase_channels:
            if c in channels:
                flighting.append({"phase": name, "channel": c, "label": CHANNEL_LABEL[c], "start": p_start.isoformat(), "end": p_end.isoformat()})

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": brief.currency,
        "budget": budget,
        "channels": [{"channel": c, "label": CHANNEL_LABEL[c]} for c in channels],
        "zones": zones,
        "flighting": flighting,
        "method": "Budget by zone strength (mean ledger lift) unless edited; channel weights renormalised over chosen channels.",
        "edited": bool(shares),
    }
