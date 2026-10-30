"""Turning a user's own brief into a campaign: product card, anchors, localities (stories B1-B3, B6)."""

from __future__ import annotations

import asyncio
import html
import re
from typing import Any

import httpx

from .llm import PANEL_MODEL, LLM, BudgetExceeded, LLMUnavailable
from .qloo import QlooClient

ANCHOR_TYPES = ["urn:entity:brand", "urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:podcast", "urn:entity:person"]

CARD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Product name"},
        "category": {"type": "string"},
        "price_tier": {"type": "string", "description": "budget, mid, premium or luxury"},
        "claims": {"type": "array", "items": {"type": "string"}, "description": "2-4 key claims, only ones the description supports"},
        "tone": {"type": "string", "description": "Brand tone in a few words"},
        "anchors": {
            "type": "array",
            "description": "4-6 real, well-known brands, artists, films, TV shows or podcasts this product's audience already loves",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": ANCHOR_TYPES},
                    "why": {"type": "string", "description": "One short reason"},
                },
                "required": ["name", "type", "why"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["name", "category", "price_tier", "claims", "tone", "anchors"],
    "additionalProperties": False,
}


def _image(r: dict[str, Any]) -> str | None:
    return ((r.get("properties") or {}).get("image") or {}).get("url")


async def search_entities(q: QlooClient, text: str, types: list[str] | None = None, take: int = 8) -> list[dict[str, Any]]:
    results = await q.search(text, types=",".join(types or ANCHOR_TYPES), take=take)
    return [
        {"id": r["entity_id"], "name": r["name"], "type": next((t for t in r.get("types", []) if t in ANCHOR_TYPES), r.get("types", [""])[0]), "image": _image(r),
         "popularity": r.get("popularity")}
        for r in results
        if any(t in ANCHOR_TYPES for t in r.get("types", []))
    ]


async def search_localities(q: QlooClient, text: str, take: int = 8) -> list[dict[str, Any]]:
    results = await q.search(text, types="urn:entity:locality", take=take)
    out, seen = [], set()
    for r in results:
        loc = r.get("location") or {}
        if "lat" not in loc:
            continue
        key = (r["name"], round(loc["lat"], 2), round(loc["lon"], 2))
        if key in seen:
            continue
        seen.add(key)
        props = r.get("properties") or {}
        out.append({
            "id": r["entity_id"], "name": r["name"], "disambiguation": r.get("disambiguation") or "",
            "center": [loc["lon"], loc["lat"]], "population": props.get("population"), "admin_level": props.get("admin_level"),
        })
    return out


async def fetch_url_text(url: str) -> str:
    """Server-side fetch of a product page; returns title, description and visible text (trimmed)."""
    if not re.match(r"^https?://", url):
        url = "https://" + url
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers={"User-Agent": "TastegeistBot/1.0"}) as c:
        r = await c.get(url)
    r.raise_for_status()
    page = r.text[:400_000]
    title = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
    desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', page, re.I)
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    body = re.sub(r"<[^>]+>", " ", body)
    body = html.unescape(re.sub(r"\s+", " ", body)).strip()
    parts = [html.unescape(title.group(1).strip()) if title else "", html.unescape(desc.group(1)) if desc else "", body[:3000]]
    return "\n".join(p for p in parts if p)


async def product_card(llm: LLM, q: QlooClient, name: str, description: str, url: str | None, audience_hint: str) -> dict[str, Any]:
    """Claude reads the product (text or URL) and proposes anchors; Qloo resolves each to a real entity."""
    page = ""
    if url:
        try:
            page = await fetch_url_text(url)
        except Exception:
            page = ""
    user = f"Product name: {name}\nDescription: {description}\n" + (f"From the product page:\n{page}\n" if page else "") + (f"Audience notes: {audience_hint}\n" if audience_hint else "")
    try:
        card, _ = await llm.json(
            model=PANEL_MODEL,
            system="You are a brand strategist. Normalise a product into a card, and propose anchors: real, well-known brands, artists, films, shows or podcasts its audience already loves. Never invent claims.",
            user=user, schema=CARD_SCHEMA, max_tokens=3000, effort="low",
        )
    except (BudgetExceeded, LLMUnavailable) as e:
        return {"name": name, "category": "", "price_tier": "", "claims": [], "tone": "", "anchors": [], "error": str(e), "url_read": bool(page)}

    async def resolve(a: dict[str, Any]) -> dict[str, Any] | None:
        hits = await search_entities(q, a["name"], [a["type"]], take=3)
        hit = next((h for h in hits if h["type"] == a["type"]), None)
        return {**hit, "why": a["why"]} if hit else None

    resolved = [a for a in await asyncio.gather(*(resolve(a) for a in card["anchors"])) if a]
    return {**card, "anchors": resolved, "url_read": bool(page)}
