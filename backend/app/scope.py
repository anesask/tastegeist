"""Scope engines: what a campaign's markets are (stories B5-B7).

- cities:  the user's chosen cities.
- city:    one city in depth. Qloo's city heatmap, seeded by the anchors, shows where the taste
           concentrates; the hottest spots (spread apart) become markets, each named by the
           neighborhood Qloo's own place data reports there.
- country: the same on Qloo's national heatmap; hotspots are named by the city Qloo's places report.

Everything is Qloo: no third-party geocoder, so it works for any city or country Qloo covers.
"""

from __future__ import annotations

import collections
import math
import re
from typing import Any

from .models import Anchor, Brief, Market
from .qloo import LogFn, QlooClient

CHANNELS = {"social", "online_video", "audio", "ooh", "influencers", "press"}
AGES = {"24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"}


def brief_from_wizard(body: dict[str, Any]) -> Brief:
    """Validate the wizard payload into a Brief. Raises ValueError with a user-facing message."""
    name = (body.get("name") or "").strip()[:80]
    product = (body.get("description") or "").strip()[:2000]
    if not name or not product:
        raise ValueError("A product name and description are required")
    anchors = [Anchor(a["name"], a["type"], a.get("id"), a.get("image")) for a in body.get("anchors", []) if a.get("id")][:6]
    if not anchors:
        raise ValueError("Pick at least one anchor: a brand, artist or show your audience loves")
    scope = body.get("scope")
    places = body.get("places") or []
    if scope == "cities" and not 2 <= len(places) <= 6:
        raise ValueError("Pick between 2 and 6 cities")
    if scope in ("city", "country") and len(places) != 1:
        raise ValueError("Pick exactly one place")
    if scope not in ("cities", "city", "country"):
        raise ValueError("Unknown scope")
    markets = [Market(p["name"], (float(p["center"][0]), float(p["center"][1]))) for p in places]
    budget = body.get("budget")
    return Brief(
        id="",
        title=(body.get("title") or f"{name} launch").strip()[:80],
        product=f"{name}, {product}" if not product.lower().startswith(name.lower()) else product,
        product_name=name,
        objective=body.get("objective") or "launch",
        anchors=anchors,
        markets=markets,
        age=[a for a in body.get("age", []) if a in AGES],
        gender=body.get("gender") if body.get("gender") in ("female", "male") else None,
        budget=float(budget) if budget else None,
        currency=(body.get("currency") or "EUR")[:3].upper(),
        scope=scope,
        country=places[0]["name"] if scope == "country" else None,
        channels=[c for c in body.get("channels", []) if c in CHANNELS] or ["social", "online_video", "audio", "ooh", "influencers"],
        start=body.get("start") or None,
        end=body.get("end") or None,
        constraints=(body.get("constraints") or "")[:500],
    )


# Taste hotspots near airports are travellers, not residents.
AIRPORT = re.compile(r"airport|o'hare|flughafen|schiphol|heathrow|aeroporto|a[eé]roport", re.I)


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = (a[0] - b[0]) * 111 * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * 111
    return math.hypot(dx, dy)


async def _hot_cells(q: QlooClient, brief: Brief, where: str, log: LogFn) -> list[dict[str, Any]]:
    anchors = [a.id for a in brief.anchors if a.id]
    cells = await q.heatmap(log, f"heatmap · {where}", filter__location__query=where, signal__interests__entities=anchors)
    out = []
    for c in cells:
        a, p = c["query"].get("affinity") or 0, c["query"].get("popularity") or 0
        rank = c["query"].get("affinity_rank") or 0
        out.append({"lat": c["location"]["latitude"], "lon": c["location"]["longitude"], "rank": rank, "lift": (a + 0.1) / (p + 0.1), "score": rank * a})
    out.sort(key=lambda c: -c["score"])
    return out


async def _name_at(q: QlooClient, brief: Brief, lon: float, lat: float, radius_m: int, field: str, log: LogFn) -> tuple[str | None, str | None]:
    """Most common neighborhood (or city) among the Qloo places at a point, plus its country code."""
    anchors = [a.id for a in brief.anchors if a.id]
    try:
        body = await q.insights(
            "urn:entity:place", log, f"name area {lat:.3f},{lon:.3f}",
            filter__location=f"POINT({lon} {lat})", filter__location__radius=radius_m, signal__interests__entities=anchors, take=20,
        )
    except Exception:
        return None, None
    names: collections.Counter[str] = collections.Counter()
    regions: collections.Counter[str] = collections.Counter()
    countries: collections.Counter[str] = collections.Counter()
    for e in body.get("results", {}).get("entities", []):
        props = e.get("properties") or {}
        geo = props.get("geocode") or {}
        v = (props.get("neighborhood") or geo.get("name")) if field == "neighborhood" else (geo.get("metro") or geo.get("city"))
        # A neighborhood named like its city ("Lisbon" inside Lisboa) is the geocoder's fallback, not a place.
        if v and not AIRPORT.search(v) and not (field == "neighborhood" and v in (geo.get("city"), geo.get("metro"), geo.get("admin1_region"))):
            names[v] += 1
        if geo.get("admin1_region"):
            regions[geo["admin1_region"]] += 1
        if geo.get("country_code"):
            countries[geo["country_code"]] += 1
    cc = countries.most_common(1)[0][0] if countries else None
    # City-states (Berlin, Hamburg) report districts as the city; their region is the real city.
    if field == "city" and regions:
        region = regions.most_common(1)[0][0]
        if region in names:
            return region, cc
    return (names.most_common(1)[0][0] if names else None), cc


async def _pick(q: QlooClient, brief: Brief, cells: list[dict[str, Any]], k: int, min_km: float, radius_m: int, field: str, exclude: str | None, log: LogFn) -> list[Market]:
    """Greedy: hottest cells first, spaced at least min_km apart, each named by Qloo, no duplicate names."""
    picked: list[Market] = []
    home: str | None = None  # a national heatmap bleeds over borders; stay in the hottest pick's country
    for cell in cells[:200]:
        if len(picked) >= k:
            break
        c = (cell["lon"], cell["lat"])
        if any(_km(c, m.center) < min_km for m in picked):
            continue
        name, cc = await _name_at(q, brief, cell["lon"], cell["lat"], radius_m, field, log)
        if not name or name == exclude or any(m.name == name for m in picked):
            continue
        if home and cc and cc != home:
            continue
        home = home or cc
        picked.append(Market(name, c))
    return picked


async def discover_neighborhoods(q: QlooClient, brief: Brief, city: Market, log: LogFn, k: int = 6) -> list[Market]:
    cells = await _hot_cells(q, brief, city.name, log)
    picked = await _pick(q, brief, cells, k, min_km=1.5, radius_m=900, field="neighborhood", exclude=city.name, log=log)
    await log({"type": "step", "step": "anchors", "text": f"Found {len(picked)} neighborhoods where this taste concentrates in {city.name}: {', '.join(m.name for m in picked)}"})
    return [Market(m.name, m.center, parent=city.name) for m in picked]


async def discover_hotspots(q: QlooClient, brief: Brief, country: Market, log: LogFn, k: int = 5) -> tuple[list[Market], list[dict[str, Any]]]:
    cells = await _hot_cells(q, brief, country.name, log)
    picked = await _pick(q, brief, cells, k, min_km=60, radius_m=15000, field="city", exclude=None, log=log)
    await log({"type": "step", "step": "anchors", "text": f"Hottest cities in {country.name} for this taste: {', '.join(m.name for m in picked)}"})
    heat = [{"lat": c["lat"], "lon": c["lon"], "rank": c["rank"], "lift": round(c["lift"], 3)} for c in cells[:800]]
    return picked, heat
