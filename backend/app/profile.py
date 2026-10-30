"""The culture profile of a place: what a geist listens to, watches, wears, reads, eats and where it
travels, plus who it is, how it sounds and how it looks.

Qloo data and model interpretation stay apart: every section says which it is.
- Qloo: entities per domain with lift against the brief's other places, genres, demographics, places.
- Computed: the color palette, extracted from the place's own Qloo imagery.
- Third party: 30-second previews from Deezer's public API, for the mixtape.
- AI interpretation (labeled): the mood axes and the "sounds like" and "looks like" lines.
All Qloo calls go through the response cache; the five core domains reuse the pipeline's calls exactly.
"""

from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from PIL import Image

from .config import settings
from .responsible import check_lines, sensitive
from .creative import PANEL_MODEL
from .llm import LLM, BudgetExceeded, LLMUnavailable
from .models import Market
from .pipeline import ANCHOR_WEIGHT, DOMAINS, TAG_TYPES, TOP_N, _clean_tag, _location_params
from .qloo import Entity, QlooClient

EXTRA_DOMAINS = ["book", "destination"]
SECTIONS = [
    ("sound", "What it listens to", ["artist"]),
    ("screen", "What it watches", ["tv_show", "movie"]),
    ("style", "What it wears and buys", ["brand"]),
    ("listens", "What it tunes into", ["podcast"]),
    ("reads", "What it reads", ["book"]),
    ("travels", "Where it travels", ["destination"]),
]
PER_SECTION = 12
EPS = 0.05
CACHE_DIR = settings.data_dir / "profiles"


async def _noop(_: dict[str, Any]) -> None:
    return None


def _places(result: dict[str, Any]) -> dict[str, Market]:
    """Every place in the campaign: the cities (or discovered hotspots) and the neighborhoods."""
    out: dict[str, Market] = {}
    for m in result["markets"]:
        out[m["name"]] = Market(m["name"], tuple(m["center"]), m.get("parent"))
    for sp in result.get("splits", []):
        for n in sp["neighborhoods"]:
            out[n["name"]] = Market(n["name"], tuple(n["center"]), n.get("parent") or sp["city"])
    return out


def _base(brief: dict[str, Any], anchors: list[str], m: Market, take: int) -> dict[str, Any]:
    # Identical to pipeline.culture_map's parameters for the core domains, so those hit the cache.
    return {
        "signal__interests__entities": anchors,
        "signal__interests__entities__weight": ANCHOR_WEIGHT,
        "signal__demographics__age": brief.get("age") or None,
        "signal__demographics__gender": brief.get("gender"),
        "feature__explainability": "true",
        "take": take,
        **_location_params(m),
    }


async def _domain(q: QlooClient, brief: dict, anchors: list[str], m: Market, d: str) -> list[Entity]:
    take = TOP_N if d in DOMAINS else 30
    try:
        return await q.entities(f"urn:entity:{d}", None, f"{d} · {m.name}", **_base(brief, anchors, m, take))
    except Exception:
        return []


async def _tags(q: QlooClient, brief: dict, anchors: list[str], m: Market) -> list[dict[str, Any]]:
    params = {k: v for k, v in _base(brief, anchors, m, TOP_N).items() if k not in ("feature__explainability", "take")}
    out = []
    for tag_type in TAG_TYPES:
        try:
            for t in await q.tags(None, f"aesthetics · {m.name}", filter__tag__types=tag_type, take=15, **params):
                out.append({
                    "id": t.get("tag_id"),
                    "name": _clean_tag(t["name"]),
                    "kind": "music" if tag_type.endswith("music") else "media",
                    "affinity": float(((t.get("query") or {}).get("affinity")) or 0),
                })
        except Exception:
            pass
    return out


def _lift(maps: dict[str, dict[str, list[Entity]]]) -> dict[str, dict[str, float]]:
    """Rank-based lift per place and entity, per domain, against every other place in the campaign
    (same method as the pipeline: rank score in this place over its mean across places)."""
    names = list(maps)
    out: dict[str, dict[str, float]] = {n: {} for n in names}
    domains = {d for v in maps.values() for d in v}
    for d in domains:
        scores = []
        for n in names:
            ents = maps[n].get(d, [])
            k = max(len(ents), 1)
            scores.append({e.id: 1 - r / k for r, e in enumerate(ents)})
        ids = {i for s in scores for i in s}
        for i in ids:
            row = np.array([s.get(i, 0.0) for s in scores])
            mean = row.mean()
            for n, v in zip(names, row):
                out[n][i] = float((v + EPS) / (mean + EPS))
    return out


async def _place_photos(names: list[str], context: str) -> dict[str, str]:
    """A photo per destination (Qloo has none for these): Wikipedia's lead image, found by a search with the
    campaign's city as context so "Glendale" lands on Glendale, California. Cached on disk; no key needed."""
    path = settings.data_dir / "wiki_images.json"
    cache: dict[str, str | None] = json.loads(path.read_text("utf-8")) if path.exists() else {}
    keys = {n: f"{n}|{context}" for n in names}
    todo = [n for n in names if keys[n] not in cache]
    if todo:
        headers = {"User-Agent": "Tastegeist/1.0 (https://tastegeist.app)"}
        async with httpx.AsyncClient(timeout=6, headers=headers) as http:

            async def one(name: str) -> None:
                try:
                    hits = (await http.get("https://en.wikipedia.org/w/api.php", params={
                        "action": "query", "list": "search", "srsearch": f"{name} {context}".strip(), "srlimit": 1, "format": "json",
                    })).json()["query"]["search"]
                    if not hits:
                        cache[keys[name]] = None
                        return
                    title = hits[0]["title"].replace(" ", "_")
                    d = (await http.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}")).json()
                    thumb = (d.get("originalimage") or d.get("thumbnail") or {}).get("source")
                    cache[keys[name]] = thumb if d.get("type") == "standard" and thumb else None
                except Exception:
                    return  # try again next time

            await asyncio.gather(*(one(n) for n in todo))
        path.write_text(json.dumps(cache, ensure_ascii=False), "utf-8")
    return {n: cache[keys[n]] for n in names if cache.get(keys[n])}


async def _deezer(names: list[str]) -> dict[str, dict[str, Any]]:
    """30-second previews for the mixtape, from Deezer's public API (no key; cached on disk)."""
    path = settings.data_dir / "deezer.json"
    cache: dict[str, Any] = json.loads(path.read_text("utf-8")) if path.exists() else {}
    todo = [n for n in names if n not in cache]
    if todo:
        async with httpx.AsyncClient(timeout=6) as http:
            async def one(name: str) -> None:
                try:
                    r = await http.get("https://api.deezer.com/search/artist", params={"q": name, "limit": 1})
                    a = (r.json().get("data") or [None])[0]
                    if not a or a.get("name", "").lower() != name.lower():
                        cache[name] = None
                        return
                    t = (await http.get(f"https://api.deezer.com/artist/{a['id']}/top", params={"limit": 1})).json().get("data") or []
                    cache[name] = {"track": t[0]["title"], "preview": t[0]["preview"], "cover": t[0]["album"]["cover_medium"], "link": t[0]["link"]} if t and t[0].get("preview") else None
                except Exception:
                    pass  # a failed lookup is retried next time

            await asyncio.gather(*(one(n) for n in todo))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cache), "utf-8")
    return {n: cache[n] for n in names if cache.get(n)}


async def _palette(urls: list[str]) -> list[str]:
    """Five swatches extracted from the place's own imagery (computed, not invented)."""
    if not urls:
        return []
    pixels = []
    async with httpx.AsyncClient(timeout=8) as http:
        async def one(u: str) -> None:
            try:
                im = Image.open(io.BytesIO((await http.get(u)).content)).convert("RGB").resize((48, 48))
                pixels.append(np.asarray(im).reshape(-1, 3))
            except Exception:
                pass

        await asyncio.gather(*(one(u) for u in urls[:10]))
    if not pixels:
        return []
    px = np.concatenate(pixels).astype(float)
    # Drop near-greys so the palette shows color, then a small k-means.
    sat = px.max(axis=1) - px.min(axis=1)
    px = px[sat > 28] if (sat > 28).sum() > 200 else px
    rng = np.random.default_rng(7)
    centers = px[rng.choice(len(px), 5, replace=False)]
    for _ in range(12):
        label = np.argmin(((px[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        centers = np.array([px[label == k].mean(0) if (label == k).any() else centers[k] for k in range(5)])
    counts = np.bincount(label, minlength=5)
    order = np.argsort(-counts)
    return ["#%02x%02x%02x" % tuple(int(v) for v in centers[k]) for k in order]


MOOD_SCHEMA = {
    "type": "object",
    "properties": {
        "axes": {
            "type": "object",
            "properties": {k: {"type": "integer"} for k in ("energy", "warmth", "time", "intimacy", "tone")},
            "required": ["energy", "warmth", "time", "intimacy", "tone"],
            "additionalProperties": False,
        },
        "sounds_like": {"type": "string"},
        "looks_like": {"type": "string"},
        "feels_like": {"type": "string"},
    },
    "required": ["axes", "sounds_like", "looks_like", "feels_like"],
    "additionalProperties": False,
}
MOOD_SYSTEM = (
    "You read the cultural taste of a place for a creative team. Score five axes from 0 to 100: "
    "energy (0 calm, 100 intense), warmth (0 cool, 100 warm), time (0 nostalgic, 100 of the moment), "
    "intimacy (0 public and social, 100 private and inward), tone (0 earnest, 100 ironic). "
    "Then write three short lines, each under 14 words: what the place sounds like, looks like (light, "
    "materials, colors, type) and feels like. Base everything only on the titles and genres given. "
    "Describe a taste, never people: no age, gender, ethnicity, religion or politics. Never name a city, "
    "country or place other than the one given. No em dashes."
)


async def _mood(llm: LLM | None, name: str, tags: list[dict], top: list[dict]) -> dict[str, Any] | None:
    # name is the full place, e.g. "Noord, a neighborhood of Amsterdam", so the model can't misplace it.
    if llm is None:
        return None
    user = (
        f"Place: {name}\nGenres: {', '.join(t['name'] for t in tags[:14])}\n"
        f"Titles it over-indexes on: {', '.join(f'{e['name']} ({e['domain']})' for e in top[:24])}"
    )
    try:
        raw, _ = await llm.json(model=PANEL_MODEL, system=MOOD_SYSTEM, user=user, schema=MOOD_SCHEMA, max_tokens=800, effort="low")
    except (BudgetExceeded, LLMUnavailable):
        return None
    raw["axes"] = {k: max(0, min(100, int(v))) for k, v in raw["axes"].items()}
    check_lines(raw, ("sounds_like", "looks_like", "feels_like"), [t["name"] for t in top])  # U2
    return raw


DAY_SCHEMA = {
    "type": "object",
    "properties": {
        "moments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string", "enum": ["Morning", "Afternoon", "Evening", "Late"]},
                    "text": {"type": "string"},
                    "refs": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["time", "text", "refs"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["moments"],
    "additionalProperties": False,
}
DAY_SYSTEM = (
    "You write a short editorial 'day in the place' for a creative team: four moments (Morning, Afternoon, "
    "Evening, Late), one or two sentences each, in the second person. Use only the venues and titles given, "
    "by their exact names, and list the ones each moment uses in refs. It describes a taste, never a person: "
    "no age, gender, ethnicity, religion or politics. Never name another city or place. No em dashes."
)


async def _day(llm: LLM | None, place: str, venues: list[str], titles: list[dict]) -> list[dict[str, Any]] | None:
    if llm is None or not (venues or titles):
        return None
    user = "\n".join([
        f"Place: {place}",
        f"Venues: {', '.join(venues[:10])}",
        "Titles: " + ", ".join(f"{t['name']} ({t['domain']})" for t in titles[:20]),
    ])
    try:
        raw, _ = await llm.json(model=PANEL_MODEL, system=DAY_SYSTEM, user=user, schema=DAY_SCHEMA, max_tokens=900, effort="low")
    except (BudgetExceeded, LLMUnavailable):
        return None
    known = set(venues) | {t["name"] for t in titles}
    # Keep only references that really are in the data, so every cited name is a Qloo entity.
    # U2: a moment that describes people by a sensitive trait is left out.
    return [{**m, "refs": [r for r in m["refs"] if r in known]} for m in raw["moments"][:4] if not sensitive(m["text"], list(known))]


def _place_line(g: dict[str, Any], places: dict[str, Market]) -> str:
    if g["kind"] == "neighborhood":
        parent = places[g["markets"][0]].parent if g["markets"][0] in places else None
        return f"{g['label']}, a neighborhood of {parent}" if parent else g["label"]
    return " and ".join(g["markets"])


def _ranks(eid: str, domain: str, maps: dict[str, dict[str, list[Entity]]]) -> dict[str, list[int | None]]:
    """Where a title ranks in each place's Qloo list for its domain: [rank or None, list length]."""
    out = {}
    for n, by_domain in maps.items():
        ents = by_domain.get(domain, [])
        out[n] = [next((i + 1 for i, x in enumerate(ents) if x.id == eid), None), len(ents)]
    return out


def _ent(e: Entity, lift: float, lifts_elsewhere: dict[str, float], maps: dict[str, dict[str, list[Entity]]]) -> dict[str, Any]:
    # The working behind the lift: where the title ranks in each place's list for its domain.
    ranks = _ranks(e.id, e.domain, maps)
    return {
        "id": e.id, "name": e.name, "domain": e.domain, "image": e.image,
        "popularity": e.popularity, "lift": round(lift, 2),
        "elsewhere": {k: round(v, 2) for k, v in lifts_elsewhere.items()},
        "ranks": ranks,
    }


async def build_profile(q: QlooClient, llm: LLM | None, campaign: dict[str, Any], key: str) -> dict[str, Any]:
    """The profile of one geist (a zone or a neighborhood) of a finished campaign. Cached per result."""
    result = campaign["result"]
    g = next((x for x in result["groups"] if x["key"] == key), None)
    if g is None:
        raise KeyError(key)
    stamp = f"v4__{campaign['id']}__{key}__{campaign.get('updated', 0)}".replace("/", "_").replace(" ", "_")
    path = CACHE_DIR / f"{stamp}.json"
    if path.exists():
        return json.loads(path.read_text("utf-8"))

    brief = campaign["brief"]
    anchors = [a["id"] for a in result.get("anchors", []) if a.get("id")]
    places = _places(result)
    all_domains = DOMAINS + EXTRA_DOMAINS

    # Every place, every domain: needed for lift. Core domains are cache hits from the run.
    async def place_map(m: Market) -> tuple[str, dict[str, list[Entity]]]:
        res = await asyncio.gather(*(_domain(q, brief, anchors, m, d) for d in all_domains))
        return m.name, dict(zip(all_domains, res))

    maps = dict(await asyncio.gather(*(place_map(m) for m in places.values())))
    lift = _lift(maps)
    mine = [n for n in g["markets"] if n in maps]

    # Merge the geist's places: an entity's lift is its best lift among them.
    best: dict[str, tuple[Entity, float]] = {}
    for n in mine:
        for ents in maps[n].values():
            for e in ents:
                v = lift[n].get(e.id, 0)
                if e.id not in best or best[e.id][1] < v:
                    best[e.id] = (e, v)
    others = [n for n in maps if n not in mine]

    sections = []
    for sid, title, doms in SECTIONS:
        # Contrast weighted by popularity (as in the ledger), so a distinctive title people know
        # beats an obscure one that happens to rank high in a single place.
        ents = sorted((x for x in best.values() if x[0].domain in doms), key=lambda x: -(x[1] * (x[0].popularity or 0.05) ** 0.5))[:PER_SECTION]
        sections.append({
            "id": sid, "title": title, "domains": doms,
            "entities": [_ent(e, v, {o: lift[o].get(e.id, 0) for o in others}, maps) for e, v in ents],
        })
    # Destinations come without images from Qloo: give each a photo of the place itself.
    travels = next((x for x in sections if x["id"] == "travels"), None)
    if travels:
        bare = [x["name"] for x in travels["entities"] if not x.get("image")]
        if bare:
            context = places[mine[0]].parent if mine and places[mine[0]].parent else (mine[0] if mine else "")
            photos = await _place_photos(bare, context or "")
            for x in travels["entities"]:
                x["image"] = x.get("image") or photos.get(x["name"])

    tags_by_place = await asyncio.gather(*(_tags(q, brief, anchors, places[n]) for n in mine))
    merged: dict[str, dict] = {}
    for tl in tags_by_place:
        for t in tl:
            if t["name"] not in merged or merged[t["name"]]["affinity"] < t["affinity"]:
                merged[t["name"]] = t
    tags = sorted(merged.values(), key=lambda t: -t["affinity"])[:16]

    top_all = sorted(best.values(), key=lambda x: -x[1])
    top_ids = [e.id for e, _ in top_all if e.domain in ("artist", "tv_show", "movie", "brand")][:6]
    try:
        demo = await q.demographics(top_ids) if top_ids else []
    except Exception:
        demo = []

    # Where they go out: Qloo places around the geist, steered by its strongest tastes.
    center = places[mine[0]].center if mine else (0, 0)
    try:
        venues = await q.entities(
            "urn:entity:place", None, f"venues · {g['label']}",
            filter__location=f"POINT({center[0]} {center[1]})",
            filter__location__radius=1500 if g["kind"] == "neighborhood" else 6000,
            signal__interests__entities=[e["id"] for e in g["ledger"][:5]], take=12,
        )
    except Exception:
        venues = []

    artists = [e["name"] for e in sections[0]["entities"][:10]]
    imagery = [e.image for e, _ in top_all if e.image and e.domain in ("artist", "tv_show", "movie")][:10]
    titles = [{"name": e.name, "domain": e.domain} for e, _ in top_all]
    previews, palette, mood, day = await asyncio.gather(
        _deezer(artists),
        _palette(imagery),
        _mood(llm, _place_line(g, places), tags, titles),
        _day(llm, _place_line(g, places), [v.name for v in venues], titles),
    )
    for e in sections[0]["entities"]:
        if e["name"] in previews:
            e["preview"] = previews[e["name"]]

    profile = {
        "key": key,
        "label": g["label"],
        "kind": g["kind"],
        "markets": mine,
        "compared_with": others,
        "sections": sections,
        # Rank of every ledger title in every place: a sharper signal than lift when only two places compare.
        "ledger_ranks": {e["id"]: _ranks(e["id"], e["domain"], maps) for e in g["ledger"]},
        "tags": tags,
        "demographics": demo,
        "venues": [{"id": v.id, "name": v.name, "image": v.image} for v in venues],
        "palette": palette,
        "mood": mood,
        "day": day,
        "sources": {
            "sections": "Qloo Insights; lift vs the campaign's other places",
            "tags": "Qloo genre tags",
            "demographics": "Qloo demographics, aggregate group skew",
            "venues": "Qloo places",
            "palette": "Computed from this place's Qloo imagery",
            "previews": "30-second previews from Deezer",
            "mood": "AI interpretation of the Qloo genres and titles (Claude Haiku)",
            "day": "Written by AI (Claude Haiku) from this place's Qloo venues and titles; references checked against the data",
        },
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile), "utf-8")
    return profile
