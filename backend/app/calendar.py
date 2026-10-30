"""Cultural calendar for a campaign's flight: local moments to time the peaks around.

Two sources, both real data:
- Public holidays per country in the flight window (the `holidays` package, offline).
- Release anniversaries of the zone's own Qloo titles (TV and film release dates from Qloo) inside
  the window, round ones flagged: an "on this day" moment the zone's audience already cares about.

The country of each market comes from Qloo's locality search (its disambiguation names the country).
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any

import holidays

from .qloo import QlooClient

# Country names as Qloo writes them (often in the local language) to ISO codes.
COUNTRY = {
    "nederland": "NL", "netherlands": "NL", "deutschland": "DE", "germany": "DE", "united kingdom": "GB", "england": "GB",
    "scotland": "GB", "wales": "GB", "españa": "ES", "spain": "ES", "france": "FR", "italia": "IT", "italy": "IT",
    "portugal": "PT", "united states of america": "US", "united states": "US", "belgië": "BE", "belgique": "BE",
    "belgium": "BE", "österreich": "AT", "austria": "AT", "schweiz": "CH", "suisse": "CH", "switzerland": "CH",
    "danmark": "DK", "denmark": "DK", "sverige": "SE", "sweden": "SE", "norge": "NO", "norway": "NO", "polska": "PL",
    "poland": "PL", "ireland": "IE", "éire": "IE", "canada": "CA", "australia": "AU", "méxico": "MX", "mexico": "MX",
    "brasil": "BR", "brazil": "BR", "japan": "JP", "suomi": "FI", "finland": "FI", "česko": "CZ", "czechia": "CZ",
}
ROUND = (5, 10, 15, 20, 25, 30, 40, 50)


async def _country(q: QlooClient, name: str, center: list[float]) -> str | None:
    """The ISO country of a market: its own name if it is a country, else the nearest Qloo locality's country."""
    if name.lower() in COUNTRY:
        return COUNTRY[name.lower()]
    try:
        res = await q.search(name, types="urn:entity:locality", take=5)
    except Exception:
        return None
    best = None
    for r in res:
        loc = r.get("location") or {}
        if "lat" not in loc:
            continue
        d = (loc["lon"] - center[0]) ** 2 + (loc["lat"] - center[1]) ** 2
        if best is None or d < best[0]:
            best = (d, r.get("disambiguation") or "")
    if not best:
        return None
    for part in reversed([p.strip().lower() for p in best[1].split(",")]):
        if part in COUNTRY:
            return COUNTRY[part]
    return None


async def _release(q: QlooClient, e: dict[str, Any]) -> dt.date | None:
    try:
        res = await q.search(e["name"], types=f"urn:entity:{e['domain']}", take=5)
    except Exception:
        return None
    for r in res:
        if r.get("entity_id") == e["id"]:
            raw = (r.get("properties") or {}).get("release_date")
            try:
                return dt.date.fromisoformat(str(raw)[:10]) if raw else None
            except ValueError:
                return None
    return None


async def build_calendar(q: QlooClient, result: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    plan = result.get("plan") or {}
    start = dt.date.fromisoformat(plan["start"])
    end = dt.date.fromisoformat(plan["end"])
    moments: list[dict[str, Any]] = []

    # Holidays, per country of the campaign's markets.
    markets = {m["name"]: m for m in brief.get("markets", [])}
    codes = await asyncio.gather(*(_country(q, n, m.get("center") or [0, 0]) for n, m in markets.items()))
    by_country: dict[str, list[str]] = {}
    for n, code in zip(markets, codes):
        if code:
            by_country.setdefault(code, []).append(n)
    for code, names in by_country.items():
        try:
            cal = holidays.country_holidays(code, years=range(start.year, end.year + 1), language="en_US")
        except (NotImplementedError, KeyError):
            continue
        for d, title in sorted(cal.items()):
            if start <= d <= end:
                moments.append({"date": d.isoformat(), "kind": "holiday", "title": title, "markets": names, "country": code,
                                "why": "Public holiday: people are off, out and on their phones; plan around closed shops and busy evenings."})

    # Anniversaries of the zones' own Qloo titles.
    async def zone(g: dict[str, Any]) -> list[dict[str, Any]]:
        titles = [e for e in g.get("ledger", []) if e.get("domain") in ("movie", "tv_show")][:6]
        dates = await asyncio.gather(*(_release(q, e) for e in titles))
        out = []
        for e, d in zip(titles, dates):
            if not d:
                continue
            for year in range(start.year, end.year + 1):
                try:
                    day = d.replace(year=year)
                except ValueError:  # 29 February
                    day = d.replace(year=year, day=28)
                n = year - d.year
                if n >= 1 and start <= day <= end:
                    out.append({"date": day.isoformat(), "kind": "anniversary", "title": f"{n} {'year' if n == 1 else 'years'} of {e['name']}", "zone": g["key"], "round": n in ROUND,
                                "zone_label": (g.get("persona") or {}).get("name") or g.get("label"), "lift": e.get("lift"), "image": e.get("image"),
                                "why": f"{e['name']} is {e.get('lift', 1):.1f}× stronger in this zone. Fans mark release anniversaries; a timely nod reads as insider."})
        return out

    for part in await asyncio.gather(*(zone(g) for g in result.get("groups", []))):
        moments += part
    moments.sort(key=lambda m: m["date"])
    return {"start": start.isoformat(), "end": end.isoformat(), "countries": by_country, "moments": moments}
