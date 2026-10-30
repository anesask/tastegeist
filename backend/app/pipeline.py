"""Deterministic Tastegeist pipeline: anchors -> culture maps -> lift -> zones -> ledger.

The agent (or the demo runner) calls these steps; all Qloo calls and all math live here,
so results are reproducible and cacheable.

Lift. Qloo entity affinities for a well-anchored audience sit in a narrow band (0.93-0.96),
so raw affinity ratios hide the differences. What does differ between markets is *which*
entities make the market's top-N. We therefore score each entity per market by rank
(1 at the top, falling to 0 past the top-N) and define

    lift(e, m) = (score(e, m) + eps) / (mean_m' score(e, m') + eps)

An entity at the top in one of four markets and absent elsewhere gets lift ~3; one that ranks
the same everywhere gets 1.0. Zones are clustered on these lift vectors (spec decision 4).
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any

import numpy as np

from .config import settings
from .responsible import check_concept, check_group, check_quotes
from .creative import allowed_ledger, build_personas, llm_only, name_geist, run_panel, template_concept, write_concepts
from .llm import LLM
from .models import Brief, Market
from .plan import build_plan
from .scope import discover_hotspots, discover_neighborhoods
from .qloo import Entity, LogFn, QlooClient

DOMAINS = ["artist", "tv_show", "movie", "podcast", "brand"]
TOP_N = 50
EPS = 0.1
ANCHOR_WEIGHT = "0.2"  # low enough that location shapes the result, high enough to stay on-brand
LEDGER_SIZE = 10
TAG_TYPES = ["urn:tag:genre:music", "urn:tag:genre:media"]
HEAT_SMOOTH = 0.1
HEAT_MAX_CELLS = 400


def _clean_tag(name: str) -> str:
    name = " ".join(name.replace(" - ", "-").replace("- ", "-").split())
    return name[:1].upper() + name[1:]


async def _noop(_: dict[str, Any]) -> None:
    return None


async def resolve_anchors(q: QlooClient, brief: Brief, log: LogFn) -> None:
    async def one(a):
        if a.id:
            return
        results = await q.search(a.name, types=a.type, take=5, log=log)
        match = next((r for r in results if a.type in r.get("types", [])), None)
        if match:
            a.id = match["entity_id"]
            a.name = match["name"]
            a.image = ((match.get("properties") or {}).get("image") or {}).get("url")
    await asyncio.gather(*(one(a) for a in brief.anchors))
    await log({"type": "step", "step": "anchors", "text": "Resolved anchors: " + ", ".join(f"{a.name} ({a.type.rsplit(':', 1)[-1]})" for a in brief.anchors if a.id)})


def _location_params(m: Market) -> dict[str, Any]:
    return {"signal__location": m.wkt} if m.is_neighborhood else {"signal__location__query": m.name}


async def culture_map(q: QlooClient, brief: Brief, m: Market, log: LogFn) -> dict[str, Any]:
    anchors = [a.id for a in brief.anchors if a.id]
    base = {
        "signal__interests__entities": anchors,
        "signal__interests__entities__weight": ANCHOR_WEIGHT,
        "signal__demographics__age": brief.age or None,
        "signal__demographics__gender": brief.gender,
        "feature__explainability": "true",
        "take": TOP_N,
        **_location_params(m),
    }

    async def domain(d: str) -> list[Entity]:
        try:
            return await q.entities(f"urn:entity:{d}", log, f"{d} · {m.name}", **base)
        except Exception as e:  # one domain failing must not sink the market
            await log({"type": "warn", "text": f"{d} in {m.name}: {e}"})
            return []

    async def tags() -> list[dict]:
        # Music and media genre tags read as aesthetics; keyword/style namespaces come back empty.
        params = {k: v for k, v in base.items() if k not in ("feature__explainability", "take")}
        out: list[dict] = []
        for tag_type in TAG_TYPES:
            try:
                for t in await q.tags(log, f"aesthetics · {m.name}", filter__tag__types=tag_type, take=15, **params):
                    out.append({**t, "name": _clean_tag(t["name"])})
            except Exception as e:
                await log({"type": "warn", "text": f"tags in {m.name}: {e}"})
        return out

    results = await asyncio.gather(*(domain(d) for d in DOMAINS), tags())
    by_domain = dict(zip(DOMAINS, results[:-1]))
    await log({"type": "step", "step": "culture_map", "market": m.name, "text": f"Culture map for {m.name}: {sum(len(v) for v in by_domain.values())} entities across {len(DOMAINS)} domains"})
    return {"market": m, "domains": by_domain, "tags": results[-1]}


def overlaps(maps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """How much two places' raw Qloo culture maps (top entities per domain) have in common.
    Independent of the lift/ledger math, so it's an honest measure of how different they are."""
    sets = [{e.id for ents in cm["domains"].values() for e in ents} for cm in maps]
    out = []
    for i in range(len(maps)):
        for j in range(i + 1, len(maps)):
            a, b = sets[i], sets[j]
            if a and b:
                out.append({"a": maps[i]["market"].name, "b": maps[j]["market"].name, "shared": len(a & b), "size": min(len(a), len(b)),
                            "pct": round(len(a & b) / min(len(a), len(b)), 3)})
    return out


def compute_lift(maps: list[dict[str, Any]]) -> tuple[list[str], dict[str, Entity], np.ndarray]:
    """Return entity ids, an id->entity lookup, and a (markets x entities) lift matrix."""
    lookup: dict[str, Entity] = {}
    scores: list[dict[str, float]] = []
    for cm in maps:
        s: dict[str, float] = {}
        for ents in cm["domains"].values():
            n = max(len(ents), 1)
            for rank, e in enumerate(ents):
                s[e.id] = 1 - rank / n
                lookup.setdefault(e.id, e)
        scores.append(s)
    ids = sorted(lookup)
    S = np.array([[s.get(i, 0.0) for i in ids] for s in scores])
    lift = (S + EPS) / (S.mean(axis=0, keepdims=True) + EPS)
    return ids, lookup, lift


def _cosine(lift: np.ndarray) -> np.ndarray:
    X = np.log(lift)  # centred: 0 = no over- or under-index
    norm = np.linalg.norm(X, axis=1, keepdims=True)
    norm[norm == 0] = 1
    X = X / norm
    return X @ X.T


def cluster(lift: np.ndarray, k_max: int = 5) -> list[int]:
    """Average-linkage agglomerative clustering on cosine similarity; k picked by silhouette."""
    n = lift.shape[0]
    if n <= 2:
        return list(range(n))
    D = 1 - _cosine(lift)
    best, best_score = [0] * n, -2.0
    for k in range(2, min(k_max, n - 1) + 1):
        labels = _agglomerate(D, k)
        sc = _silhouette(D, labels)
        if sc > best_score:
            best, best_score = labels, sc
    return best


def _agglomerate(D: np.ndarray, k: int) -> list[int]:
    clusters = [[i] for i in range(len(D))]
    while len(clusters) > k:
        best = None
        for a in range(len(clusters)):
            for b in range(a + 1, len(clusters)):
                d = np.mean([D[i, j] for i in clusters[a] for j in clusters[b]])
                if best is None or d < best[0]:
                    best = (d, a, b)
        _, a, b = best
        clusters[a] += clusters.pop(b)
    labels = [0] * len(D)
    for c, members in enumerate(clusters):
        for i in members:
            labels[i] = c
    return labels


def _silhouette(D: np.ndarray, labels: list[int]) -> float:
    vals = []
    for i in range(len(D)):
        same = [j for j in range(len(D)) if labels[j] == labels[i] and j != i]
        if not same:
            vals.append(0.0)
            continue
        a = np.mean([D[i, j] for j in same])
        b = min(np.mean([D[i, j] for j in range(len(D)) if labels[j] == c]) for c in set(labels) if c != labels[i])
        vals.append((b - a) / max(a, b, 1e-9))
    return float(np.mean(vals))


def build_ledger(member_idx: list[int], ids: list[str], lookup: dict[str, Entity], lift: np.ndarray, size: int = LEDGER_SIZE) -> list[dict[str, Any]]:
    """Pick the zone's defining entities: high lift inside the zone, low outside, spread across domains.

    Prefers the spec's rule (lift > 1.5 inside, < 1.0 outside) and relaxes it when a zone is too
    small to fill the ledger.
    """
    inside = lift[member_idx].mean(axis=0)
    others = [i for i in range(lift.shape[0]) if i not in member_idx]
    outside = lift[others].mean(axis=0) if others else np.ones(lift.shape[1])
    contrast = inside / outside
    # Prefer recognisable references: a campaign can't be built on an entity nobody knows.
    popularity = np.array([lookup[i].popularity or 0.3 for i in ids])
    rank_by = contrast * np.sqrt(popularity)

    picked: list[int] = []
    per_domain: dict[str, int] = {}
    for strict in (True, False):
        for j in np.argsort(-rank_by):
            if len(picked) >= size:
                break
            if j in picked:
                continue
            if strict and not (inside[j] > 1.5 and outside[j] < 1.0):
                continue
            if not strict and inside[j] <= 1.0:
                continue
            d = lookup[ids[j]].domain
            if per_domain.get(d, 0) >= 3:
                continue
            picked.append(int(j))
            per_domain[d] = per_domain.get(d, 0) + 1
    return [
        {**asdict(lookup[ids[j]]), "lift": round(float(inside[j]), 2), "lift_outside": round(float(outside[j]), 2)}
        for j in picked
    ]


def _peek(ledger: list[dict[str, Any]], n: int = 4) -> list[dict[str, Any]]:
    """A few ledger titles for a partial result: enough for the live view, nothing more."""
    return [{"id": e["id"], "name": e["name"], "image": e.get("image"), "lift": e["lift"]} for e in ledger[:n]]


def geist_line(name: str, ledger: list[dict[str, Any]]) -> str:
    """One-line persona from the ledger's top entity per domain (spec: "The geist of X: ...")."""
    seen, parts = set(), []
    for e in ledger:
        if e["domain"] not in seen:
            seen.add(e["domain"])
            parts.append(e["name"])
        if len(parts) == 3:
            break
    return f"The geist of {name}: {', '.join(parts)}."


def split_budget(brief: Brief, zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Spend per market proportional to the strength of its zone's ledger."""
    if not brief.budget:
        return []
    weights = {}
    for z in zones:
        strength = float(np.mean([e["lift"] for e in z["ledger"]])) if z["ledger"] else 1.0
        for m in z["markets"]:
            weights[m] = strength
    total = sum(weights.values()) or 1
    return [{"market": m, "amount": round(brief.budget * w / total, -2), "currency": brief.currency} for m, w in weights.items()]


def _market_json(m: Market) -> dict[str, Any]:
    return {"name": m.name, "center": list(m.center), "parent": m.parent}


async def run(q: QlooClient, brief: Brief, log: LogFn = _noop, llm: LLM | None = None) -> dict[str, Any]:
    await log({"type": "step", "step": "start", "text": f"Brief: {brief.title}"})
    await resolve_anchors(q, brief, log)

    # Scope engines decide what the markets are.
    country_heat: list[dict[str, Any]] = []
    if brief.scope == "city" and brief.markets and not brief.markets[0].is_neighborhood:
        await log({"type": "step", "step": "anchors", "text": f"Mapping the neighborhoods of {brief.markets[0].name}"})
        hoods = await discover_neighborhoods(q, brief, brief.markets[0], log)
        if len(hoods) < 2:
            raise RuntimeError(f"Couldn't find enough named neighborhoods in {brief.markets[0].name}; try the cities scope instead")
        brief.markets = hoods
    elif brief.scope == "country" and brief.markets:
        await log({"type": "step", "step": "anchors", "text": f"Reading the national heatmap of {brief.markets[0].name}"})
        hot, country_heat = await discover_hotspots(q, brief, brief.markets[0], log)
        if len(hot) < 2:
            raise RuntimeError(f"Qloo's heatmap for {brief.markets[0].name} was too thin to find hotspots; try picking cities instead")
        brief.markets = hot

    cities = brief.markets
    maps = await asyncio.gather(*(culture_map(q, brief, m, log) for m in cities))

    ids, lookup, lift = compute_lift(list(maps))
    labels = cluster(lift)
    await log({"type": "step", "step": "lift", "text": f"Computed lift for {len(ids)} entities across {len(cities)} markets"})

    zones = []
    for z in sorted(set(labels)):
        idx = [i for i, l in enumerate(labels) if l == z]
        names = [cities[i].name for i in idx]
        ledger = build_ledger(idx, ids, lookup, lift)
        zones.append({
            "id": f"z{z + 1}",
            "markets": names,
            "ledger": ledger,
            "geist": geist_line(" + ".join(names), ledger),
        })
    zones.sort(key=lambda z: -len(z["markets"]))
    for i, z in enumerate(zones):
        z["id"] = f"z{i + 1}"
    await log({"type": "step", "step": "zones", "text": f"Clustered {len(cities)} markets into {len(zones)} strategy zones"})

    # Per-market culture map summary: each market's own highest-lift entities.
    market_maps = []
    for i, m in enumerate(cities):
        order = np.argsort(-lift[i])[:12]
        market_maps.append({
            **_market_json(m),
            "zone": next(z["id"] for z in zones if m.name in z["markets"]),
            "top": [{**asdict(lookup[ids[j]]), "lift": round(float(lift[i, j]), 2)} for j in order],
            "tags": [{"id": t["tag_id"], "name": t["name"], "subtype": t.get("subtype")} for t in maps[i]["tags"][:12]],
        })

    market_overlap = overlaps(list(maps))
    # Partial result: the zones are known, so the live view can draw them before any writing starts.
    centers = {m["name"]: m["center"] for m in market_maps}
    await log({"type": "partial", "stage": "zones", "groups": [
        {"key": z["id"], "kind": "zone", "label": " + ".join(z["markets"]), "points": [{"name": n, "center": centers[n]} for n in z["markets"]], "top": _peek(z["ledger"])}
        for z in zones
    ]})

    # Neighborhood split: the hero "one city, many tastes" view.
    hood_overlap: list[dict[str, Any]] = []
    splits = []
    for city, hoods in brief.neighborhoods.items():
        await log({"type": "step", "step": "neighborhoods", "text": f"Summoning the geists of {' and '.join(h.name for h in hoods)}…"})
        hmaps = await asyncio.gather(*(culture_map(q, brief, h, log) for h in hoods))
        hids, hlookup, hlift = compute_lift(list(hmaps))
        hood_overlap += overlaps(list(hmaps))
        parts = []
        for i, h in enumerate(hoods):
            ledger = build_ledger([i], hids, hlookup, hlift)
            parts.append({
                **_market_json(h), "ledger": ledger, "geist": geist_line(h.name, ledger),
                "tags": [t["name"] for t in hmaps[i]["tags"][:10]],
            })
        splits.append({"city": city, "neighborhoods": parts})
        await log({"type": "partial", "stage": "zones", "groups": [
            {"key": n["name"], "kind": "neighborhood", "label": n["name"], "parent": city, "points": [{"name": n["name"], "center": n["center"]}], "top": _peek(n["ledger"])}
            for n in parts
        ]})

    profile = []
    top_ids = [e["id"] for z in zones for e in z["ledger"][:3]]
    if top_ids:
        try:
            profile = await q.demographics(top_ids[:6], log)
        except Exception as e:
            await log({"type": "warn", "text": f"demographics: {e}"})

    # Every zone and every neighborhood is a "geist" group: persona, places, concepts, séance.
    brief_json = {"product": brief.product, "objective": brief.objective}
    # Copy-writing extras (brief constraints, workspace style); only set keys change the prompts.
    style = brief.style or {}
    extras = {"constraints": brief.constraints, "tone": style.get("tone"), "house_rules": style.get("house_rules"), "banned": style.get("banned")}
    brief_json.update({k: v for k, v in extras.items() if v})
    by_name = {m.name: m for m in cities}
    groups: list[dict[str, Any]] = []
    for z in zones:
        groups.append({**z, "key": z["id"], "kind": "zone", "label": " + ".join(z["markets"]), "market_objs": [_market_json(by_name[n]) for n in z["markets"]]})
    for sp in splits:
        for n in sp["neighborhoods"]:
            groups.append({**n, "key": n["name"], "kind": "neighborhood", "label": n["name"], "markets": [n["name"]], "market_objs": [n]})

    await log({"type": "step", "step": "places", "text": "Naming each geist and finding the places it lives in"})

    async def places(g: dict[str, Any]) -> list[dict[str, Any]]:
        center = g["market_objs"][0]["center"]
        radius = 1500 if g["kind"] == "neighborhood" else 6000
        try:
            ents = await q.entities(
                "urn:entity:place", log, f"places · {g['label']}",
                filter__location=f"POINT({center[0]} {center[1]})", filter__location__radius=radius,
                signal__interests__entities=[e["id"] for e in g["ledger"][:5]], take=6,
            )
        except Exception as e:
            await log({"type": "warn", "text": f"places for {g['label']}: {e}"})
            return []
        return [asdict(e) for e in ents if e.image][:4]

    found = await asyncio.gather(*(places(g) for g in groups))
    for g, pl in zip(groups, found):
        g["places"] = pl

    if llm is not None:
        personas_named = await asyncio.gather(*(name_geist(llm, g["label"], g["ledger"], log) for g in groups))
        for g, pn in zip(groups, personas_named):
            g["persona"] = pn
        # U2: no zone is named or described by a sensitive trait.
        replaced = sum(check_group(g) for g in groups)
        if replaced:
            await log({"type": "warn", "text": f"Responsible use: {replaced} zone name or line(s) replaced for naming a sensitive trait"})
        await log({"type": "partial", "stage": "geists", "groups": [
            {"key": g["key"], "name": (g.get("persona") or {}).get("name"), "tagline": (g.get("persona") or {}).get("tagline")} for g in groups
        ]})
        await log({"type": "step", "step": "concepts", "text": f"Writing three concepts for each of {len(groups)} geists, from their ledgers"})

        async def concepts_for(g: dict[str, Any]) -> list[dict[str, Any]]:
            cs = await write_concepts(llm, brief_json, g["label"], g["geist"], allowed_ledger(g["ledger"], brief_json.get("banned")), log)
            await log({"type": "partial", "stage": "concepts", "key": g["key"], "headlines": [((c.get("headline") or {}).get("text")) for c in cs]})
            return cs

        concept_sets = await asyncio.gather(*(concepts_for(g) for g in groups))
        llm_only_concept = await llm_only(llm, brief_json, [m.name for m in cities], log)

        await log({"type": "step", "step": "seance", "text": "Holding the séance: personas built from Qloo demographics and ledger affinities"})

        async def seance(g: dict[str, Any], concepts: list[dict[str, Any]]) -> None:
            personas = build_personas(g["markets"], g["ledger"], profile, f"{brief.id}:{g['key']}")
            panels = await asyncio.gather(*(run_panel(llm, brief_json, g["label"], c, personas, log) for c in concepts))
            titles = [e["name"] for e in g["ledger"]]
            for c, pnl in zip(concepts, panels):
                c["panel"] = pnl
            # The same personas judge the generic LLM-only concept: the measured uplift (story G4).
            g["baseline_panel"] = await run_panel(llm, brief_json, f"{g['label']} (LLM only)", llm_only_concept, personas, log) if llm_only_concept else None
            # U1 and U2: withhold stereotyped quotes; drop concept lines that describe people by a sensitive trait.
            withheld = sum(check_quotes(c.get("panel"), titles) for c in concepts) + check_quotes(g["baseline_panel"], titles)
            dropped = sum(check_concept(c, titles) for c in concepts)
            if withheld or dropped:
                await log({"type": "warn", "text": f"Responsible use, {g['label']}: {withheld} séance quote(s) withheld for stereotyping, {dropped} concept line(s) dropped for a sensitive trait"})
            g["concepts"] = concepts
            score = lambda c: ((c.get("panel") or {}).get("stop_scrolling", 0), ((c.get("panel") or {}).get("avg") or {}).get("attention", 0))  # noqa: E731
            g["chosen"] = max(range(len(concepts)), key=lambda i: score(concepts[i])) if concepts else 0
            best = concepts[g["chosen"]] if concepts else {}
            pnl = best.get("panel") or {}
            base = g.get("baseline_panel") or {}
            await log({"type": "partial", "stage": "seance", "key": g["key"], "headline": (best.get("headline") or {}).get("text"),
                       "stops": pnl.get("stop_scrolling"), "size": pnl.get("size"), "base_stops": base.get("stop_scrolling")})

        await asyncio.gather(*(seance(g, cs) for g, cs in zip(groups, concept_sets)))
    else:
        for g in groups:
            g["persona"] = {"name": g["label"], "tagline": ""}
            g["concepts"] = [{**template_concept(g["geist"], g["ledger"]), "id": "c1", "direction": "Ledger template"}]
            g["chosen"] = 0
            g["baseline_panel"] = None
        llm_only_concept = None

    if llm is not None and settings.generate_images:
        from .images import add_images

        await log({"type": "step", "step": "seance", "text": "Shooting a hero image for every concept"})
        await add_images(llm, {"groups": groups}, brief.product_name or brief.title, log)

    plan = build_plan(brief, groups)
    for g in groups:
        g.pop("market_objs", None)

    result = {
        "brief": {
            "id": brief.id, "title": brief.title, "product": brief.product, "product_name": brief.product_name, "objective": brief.objective,
            "headline": brief.headline, "age": brief.age, "gender": brief.gender, "budget": brief.budget, "currency": brief.currency,
            "scope": brief.scope, "channels": brief.channels,
        },
        "anchors": [{"id": a.id, "name": a.name, "type": a.type, "image": a.image} for a in brief.anchors if a.id],
        "markets": market_maps,
        "groups": groups,
        "zones": [g for g in groups if g["kind"] == "zone"],
        "splits": [{"city": sp["city"], "neighborhoods": [g for g in groups if g["kind"] == "neighborhood" and g.get("parent") == sp["city"]]} for sp in splits],
        "plan": plan,
        "headline": brief.headline or auto_headline(brief, len(groups)),
        "country_heat": country_heat,
        "overlap": {"markets": market_overlap, "neighborhoods": hood_overlap},
        "demographics": profile,
        "llm_only": llm_only_concept,
    }
    await log({"type": "step", "step": "done", "text": "Campaign ready"})
    return result


WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def auto_headline(brief: Brief, n: int) -> str:
    w = WORDS[n] if n < len(WORDS) else str(n)
    if brief.scope == "city":
        return f"One {brief.markets[0].parent}. {w.capitalize()} tastes, {w} campaigns."
    if brief.scope == "country":
        return f"One {brief.country}. {w.capitalize()} tastes, {w} campaigns."
    m = len(brief.markets)
    return f"{(WORDS[m] if m < len(WORDS) else str(m)).capitalize()} cities. {w.capitalize()} tastes."


async def concept_heatmap(q: QlooClient, city: str, entity_ids: list[str], log: LogFn = _noop) -> list[dict[str, Any]]:
    """Geohash cells where the given references concentrate. Runs live on stage (spec decision 10)."""
    cells = await q.heatmap(log, f"heatmap · {city}", filter__location__query=city, signal__interests__entities=entity_ids)
    out = []
    for c in cells:
        a = c["query"].get("affinity") or 0
        p = c["query"].get("popularity") or 0
        out.append({
            "geohash": c["location"]["geohash"],
            "lat": c["location"]["latitude"],
            "lon": c["location"]["longitude"],
            "affinity": a,
            "rank": c["query"].get("affinity_rank") or 0,
            "popularity": p,
            # Cell affinity tracks overall activity (r ~ 0.8-0.9), so the signal is the excess over it.
            # Smoothed so near-empty cells don't explode.
            "lift": round((a + HEAT_SMOOTH) / (p + HEAT_SMOOTH), 3),
        })
    # Keep the cells where taste is both strong and above what activity alone predicts.
    out.sort(key=lambda c: -(c["rank"] * min(c["lift"], 3)))
    return out[:HEAT_MAX_CELLS]
