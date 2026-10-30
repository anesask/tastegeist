"""Concepts, the séance (synthetic panel) and the LLM-only comparison.

Ledger rule (spec decision 3): the writer may only cite ledger entity ids. The validator drops
any id that isn't on the ledger and any element left with no valid citation, so nothing in a
concept exists without a Qloo affinity behind it.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

from .llm import CONCEPT_MODEL, LLM, PANEL_MODEL, BudgetExceeded, LLMUnavailable
from .qloo import LogFn

AGE_LABEL = {
    "24_and_younger": "under 25",
    "25_to_29": "25–29",
    "30_to_34": "30–34",
    "35_to_44": "35–44",
    "45_to_54": "45–54",
    "55_and_older": "55+",
}
PANEL_SIZE = 8


def _cited(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": description},
            "because": {"type": "array", "items": {"type": "string"}, "description": "Ledger entity ids this draws on"},
        },
        "required": ["text", "because"],
        "additionalProperties": False,
    }


CONCEPT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "big_idea": _cited("The campaign idea in one or two sentences"),
        "headline": _cited("Headline, max 8 words"),
        "body": _cited("Body copy, max 40 words"),
        "moodboard": {"type": "array", "items": _cited("An image prompt for one moodboard frame"), "description": "Exactly 3 frames"},
        "music": _cited("Music direction: sound, tempo, reference artists"),
        "partners": {"type": "array", "items": _cited("A creator, brand or venue to partner with, and why"), "description": "Exactly 3"},
        "channels": {"type": "array", "items": _cited("A channel and how to use it here"), "description": "2 or 3"},
    },
    "required": ["big_idea", "headline", "body", "moodboard", "music", "partners", "channels"],
    "additionalProperties": False,
}

CONCEPT_SYSTEM = """You are Tastegeist's creative strategist. You write one campaign concept for one strategy zone, built only from that zone's Qloo ledger: the entities its audience over-indexes on there (lift > 1 means more than in the brief's other markets).

Rules:
- Every element cites the ledger entity ids it draws on in `because`. Use only ids from the ledger. An element you can't tie to the ledger doesn't belong in the concept.
- Name specific ledger entities in the copy, moodboard and music where it reads naturally. Specific beats generic.
- Lift describes what a group tends to like, not any individual. Don't stereotype people; write to a taste, not a demographic.
- Respect the product's facts. Don't invent claims, prices or features.
- Write like a sharp creative director: concrete, visual, no buzzwords."""

CONCEPT_SET_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "concepts": {
            "type": "array",
            "description": "Exactly 3 clearly different creative directions",
            "items": {
                "type": "object",
                "properties": {
                    "direction": {"type": "string", "description": "2-4 word name for this direction"},
                    **CONCEPT_SCHEMA["properties"],
                },
                "required": ["direction", *CONCEPT_SCHEMA["required"]],
                "additionalProperties": False,
            },
        }
    },
    "required": ["concepts"],
    "additionalProperties": False,
}

GEIST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Persona name in the form 'The Trendsetters', 2-3 words"},
        "tagline": {"type": "string", "description": "One sentence: who they are, max 16 words"},
        "because": {"type": "array", "items": {"type": "string"}, "description": "Ledger ids the name draws on"},
    },
    "required": ["name", "tagline", "because"],
    "additionalProperties": False,
}

LLM_ONLY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "big_idea": {"type": "string"},
        "headline": {"type": "string"},
        "body": {"type": "string"},
        "moodboard": {"type": "array", "items": {"type": "string"}},
        "music": {"type": "string"},
        "partners": {"type": "array", "items": {"type": "string"}},
        "channels": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["big_idea", "headline", "body", "moodboard", "music", "partners", "channels"],
    "additionalProperties": False,
}

REACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "attention": {"type": "integer", "description": "1-5: how likely I'd stop scrolling for this. Most ads I see are a 1 or 2."},
        "resonance": {"type": "integer", "description": "1-5: how much the message fits my taste and life. Most ads I see are a 1 or 2."},
        "interest": {"type": "integer", "description": "1-5: how likely this makes me look the product up or buy it. Most ads I see are a 1 or 2."},
        "quote": {"type": "string", "description": "My honest reaction in my own voice, 1-2 sentences"},
        "feels_off": {"type": "string", "description": "What feels off or fake to me, or empty if nothing"},
        "compare_to": {"type": "string", "description": "What this reminds me of"},
    },
    "required": ["attention", "resonance", "interest", "quote", "feels_off", "compare_to"],
    "additionalProperties": False,
}

SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "top_objection": {"type": "string"},
        "fix": {"type": "string", "description": "One concrete change to the concept that addresses it"},
    },
    "required": ["top_objection", "fix"],
    "additionalProperties": False,
}


def _ledger_text(ledger: list[dict[str, Any]]) -> str:
    return "\n".join(f"- {e['id']} | {e['name']} | {e['domain']} | lift {e['lift']:.2f}" for e in ledger)


def _brief_text(brief: dict[str, Any]) -> str:
    return f"Product: {brief['product']}\nObjective: {brief['objective']}"


TONES = {
    "bold": "Bold: big claims, short punchy lines, high energy.",
    "understated": "Understated: quiet confidence, dry, no hype words.",
    "playful": "Playful: witty, light, a wink, never silly.",
}


def _copy_brief(brief: dict[str, Any]) -> str:
    """The brief as the copywriter sees it: plus the campaign's constraints and the workspace style.
    Empty extras add nothing, so briefs without a style keep their exact prompt (and their cache)."""
    lines = [_brief_text(brief)]
    if brief.get("constraints"):
        lines.append(f"Constraints from the brief: {brief['constraints']}")
    if brief.get("tone") in TONES:
        lines.append(f"Tone of voice: {TONES[brief['tone']]}")
    if brief.get("house_rules"):
        lines.append(f"House rules (always follow): {brief['house_rules']}")
    if brief.get("banned"):
        lines.append(f"Never mention or reference: {', '.join(brief['banned'])}.")
    return "\n".join(lines)


def _banned_hit(text: str, banned: list[str]) -> bool:
    t = text.lower()
    return any(b.lower() in t for b in banned if b)


def allowed_ledger(ledger: list[dict[str, Any]], banned: list[str] | None) -> list[dict[str, Any]]:
    """The ledger minus banned references, so the writer can't cite them."""
    return [e for e in ledger if not _banned_hit(e["name"], banned or [])] if banned else ledger


def scrub_banned(concept: dict[str, Any], banned: list[str] | None) -> int:
    """Drop any element whose text still names a banned reference. Returns how many were dropped."""
    if not banned:
        return 0
    dropped = 0
    for k in ("big_idea", "headline", "body", "music"):
        el = concept.get(k)
        if el and _banned_hit(el.get("text", ""), banned):
            concept[k] = None
            dropped += 1
    for k in ("moodboard", "partners", "channels"):
        keep = [el for el in concept.get(k) or [] if not _banned_hit(el.get("text", ""), banned)]
        dropped += len(concept.get(k) or []) - len(keep)
        concept[k] = keep
    return dropped


def validate_concept(raw: dict[str, Any], ledger: list[dict[str, Any]]) -> tuple[dict[str, Any], int]:
    """Keep only ledger citations; drop uncited elements. Returns (concept, dropped element count)."""
    names = {e["id"]: e["name"] for e in ledger}
    dropped = 0

    def fix(el: dict[str, Any]) -> dict[str, Any] | None:
        nonlocal dropped
        ids = [i for i in dict.fromkeys(el.get("because", [])) if i in names]
        if not ids:
            dropped += 1
            return None
        return {"text": el["text"].strip(), "because": ids}

    out: dict[str, Any] = {}
    for k, v in raw.items():
        if isinstance(v, list):
            out[k] = [x for x in (fix(el) for el in v) if x]
        else:
            out[k] = fix(v)
    return out, dropped


def template_concept(geist: str, ledger: list[dict[str, Any]]) -> dict[str, Any]:
    """Deterministic fallback when the LLM is off or over budget: still fully ledger-cited."""
    by_domain: dict[str, dict[str, Any]] = {}
    for e in ledger:
        by_domain.setdefault(e["domain"], e)
    top = ledger[:3]
    cite = lambda es: [e["id"] for e in es]  # noqa: E731
    music = by_domain.get("artist")
    brands = [e for e in ledger if e["domain"] == "brand"][:3]
    return {
        "big_idea": {"text": f"Speak to {geist[:-1].split(': ', 1)[-1]}: show up where this taste already lives.", "because": cite(top)},
        "headline": None,
        "body": None,
        "moodboard": [{"text": f"Visual world of {e['name']}", "because": [e["id"]]} for e in top],
        "music": {"text": f"In the lane of {music['name']}", "because": [music["id"]]} if music else None,
        "partners": [{"text": e["name"], "because": [e["id"]]} for e in brands],
        "channels": [],
        "template": True,
    }


async def write_concepts(llm: LLM, brief: dict[str, Any], name: str, geist: str, ledger: list[dict[str, Any]], log: LogFn) -> list[dict[str, Any]]:
    """Three distinct ledger-cited directions for one zone, from a single Opus call."""
    user = (
        f"{_copy_brief(brief)}\n\nZone: {name}\n{geist}\n\nLedger (id | name | domain | lift):\n{_ledger_text(ledger)}\n\n"
        "Write three clearly different campaign concepts for this zone, each built on different ledger entities where possible."
    )
    try:
        raw, meta = await llm.json(model=CONCEPT_MODEL, system=CONCEPT_SYSTEM, user=user, schema=CONCEPT_SET_SCHEMA, max_tokens=16000, effort="medium")
    except (BudgetExceeded, LLMUnavailable) as e:
        await log({"type": "warn", "text": f"Concepts for {name}: {e}; using ledger template"})
        return [{**template_concept(geist, ledger), "id": "c1", "direction": "Ledger template"}]
    out, dropped_total = [], 0
    for i, c in enumerate(raw["concepts"][:3]):
        direction = c.pop("direction", f"Direction {i + 1}")
        concept, dropped = validate_concept(c, ledger)
        dropped_total += dropped + scrub_banned(concept, brief.get("banned"))
        out.append({**concept, "id": f"c{i + 1}", "direction": direction})
    await log({"type": "llm", "label": f"3 concepts · {name}", **meta, "text": f"{dropped_total} uncited element(s) rejected" if dropped_total else None})
    return out


async def name_geist(llm: LLM, name: str, ledger: list[dict[str, Any]], log: LogFn) -> dict[str, Any]:
    """Persona name and tagline for a zone ("The Trendsetters"), grounded in its ledger."""
    try:
        raw, meta = await llm.json(
            model=PANEL_MODEL,
            system="You name audience segments for a marketing team. Names are warm and specific and never stereotype people; describe a taste, not a demographic.",
            user=f"Place: {name}\nWhat this audience over-indexes on (id | name | domain | lift):\n{_ledger_text(ledger)}",
            schema=GEIST_SCHEMA, max_tokens=1500, effort="low",
        )
    except (BudgetExceeded, LLMUnavailable):
        return {"name": name, "tagline": ""}
    await log({"type": "llm", "label": f"geist name · {name}", **meta})
    return {"name": raw["name"], "tagline": raw["tagline"]}


def build_personas(markets: list[str], ledger: list[dict[str, Any]], demographics: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    """Personas get ages and genders from Qloo's demographic skew and real affinities from the ledger."""
    rng = random.Random(seed)
    age_w: dict[str, float] = {}
    gender_w: dict[str, float] = {}
    for d in demographics:
        for k, v in d["query"].get("age", {}).items():
            age_w[k] = age_w.get(k, 0) + v
        for k, v in d["query"].get("gender", {}).items():
            gender_w[k] = gender_w.get(k, 0) + v
    ages = [k for k, v in sorted(age_w.items(), key=lambda x: -x[1]) if v > 0] or ["25_to_29", "30_to_34"]
    lean = max(gender_w, key=gender_w.get) if gender_w else None

    personas = []
    for i in range(PANEL_SIZE):
        picks = rng.sample(ledger, k=min(4, len(ledger)))
        gender = lean if lean and rng.random() < 0.6 else ("female" if lean == "male" else "male")
        personas.append({
            "id": f"p{i + 1}",
            "market": markets[i % len(markets)],
            "age": AGE_LABEL.get(ages[i % len(ages)], ages[i % len(ages)]),
            "gender": gender,
            "affinities": [{"id": e["id"], "name": e["name"], "domain": e["domain"]} for e in picks],
        })
    return personas


async def run_panel(llm: LLM, brief: dict[str, Any], name: str, concept: dict[str, Any], personas: list[dict[str, Any]], log: LogFn) -> dict[str, Any] | None:
    """The séance: each persona reacts in its own voice; results are counts, not scores (decision 7)."""
    if concept.get("template"):
        return None
    pitch = pitch_text(concept)

    async def react(p: dict[str, Any]) -> dict[str, Any] | None:
        likes = ", ".join(a["name"] for a in p["affinities"])
        system = (
            f"You are a {p['age']} {p['gender']} living in {p['market']}. You genuinely like {likes}. "
            "You're shown an ad concept. React honestly in your own casual voice, as someone with your taste would. "
            "You see hundreds of ads a day and ignore almost all of them; score like that, so a 4 or 5 means it genuinely speaks to your taste. "
            "Be specific. Don't mention being an AI or a persona."
        )
        try:
            r, meta = await llm.json(model=PANEL_MODEL, system=system, user=f"{_brief_text(brief)}\n\nAd concept:\n{pitch}", schema=REACTION_SCHEMA, max_tokens=2000, effort="low")
        except (BudgetExceeded, LLMUnavailable):
            return None
        await log({"type": "llm", "label": f"séance · {p['market']} {p['age']}", **meta})
        # Counts, not scores (decision 7): a persona counts only when they rate 4 or 5.
        return {**p, **r, "stop_scrolling": r["attention"] >= 4, "would_consider": r["interest"] >= 4}

    reactions = [r for r in await asyncio.gather(*(react(p) for p in personas)) if r]
    if not reactions:
        return None
    objections = "\n".join(f"- {r['feels_off']}" for r in reactions if r["feels_off"].strip())
    summary = {"top_objection": "", "fix": ""}
    if objections:
        try:
            summary, meta = await llm.json(
                model=PANEL_MODEL,
                system="You summarise panel feedback on an ad concept for a creative team.",
                user=f"Concept:\n{pitch}\n\nObjections:\n{objections}\n\nName the most common objection and one concrete fix.",
                schema=SUMMARY_SCHEMA, max_tokens=2000, effort="low",
            )
            await log({"type": "llm", "label": f"séance summary · {name}", **meta})
        except (BudgetExceeded, LLMUnavailable):
            pass
    return {
        "size": len(reactions),
        "stop_scrolling": sum(r["stop_scrolling"] for r in reactions),
        "would_consider": sum(r["would_consider"] for r in reactions),
        "avg": {k: round(sum(r[k] for r in reactions) / len(reactions), 2) for k in ("attention", "resonance", "interest")},
        **summary,
        "personas": reactions,
    }


def pitch_text(concept: dict[str, Any]) -> str:
    """Readable ad pitch from a ledger-cited concept or a plain LLM-only one."""
    lines = []
    for k in ("big_idea", "headline", "body", "moodboard", "music", "partners", "channels"):
        v = concept.get(k)
        if not v:
            continue
        label = k.replace("_", " ").title()
        for x in v if isinstance(v, list) else [v]:
            lines.append(f"{label}: {x['text'] if isinstance(x, dict) else x}")
    return "\n".join(lines)


async def llm_only(llm: LLM, brief: dict[str, Any], markets: list[str], log: LogFn) -> dict[str, Any] | None:
    """Same brief, same model, no Qloo: the comparison that proves Qloo is essential."""
    try:
        raw, meta = await llm.json(
            model=CONCEPT_MODEL,
            system="You are a creative strategist. Write one campaign concept for the brief.",
            user=f"{_copy_brief(brief)}\nMarkets: {', '.join(markets)}\n\nWrite the concept. Give 3 moodboard frames, 3 partners and 2-3 channels.",
            schema=LLM_ONLY_SCHEMA, max_tokens=8000, effort="medium",
        )
    except (BudgetExceeded, LLMUnavailable) as e:
        await log({"type": "warn", "text": f"LLM-only comparison: {e}"})
        return None
    await log({"type": "llm", "label": "LLM-only comparison (no Qloo)", **meta})
    return raw


async def apply_fix(llm: LLM, brief: dict[str, Any], name: str, geist: str, ledger: list[dict[str, Any]], concept: dict[str, Any], log: LogFn) -> dict[str, Any]:
    """Rewrite one concept using its séance objection and fix, still citing only the ledger (story E5)."""
    panel = concept.get("panel") or {}
    user = (
        f"{_copy_brief(brief)}\n\nZone: {name}\n{geist}\n\nLedger (id | name | domain | lift):\n{_ledger_text(ledger)}\n\n"
        f"Current concept:\n{pitch_text(concept)}\n\n"
        f"The synthetic panel's top objection: {panel.get('top_objection', '')}\nSuggested fix: {panel.get('fix', '')}\n\n"
        "Rewrite the concept so it fixes the objection. Keep what worked, keep the same direction name."
    )
    single = {**CONCEPT_SCHEMA, "properties": {"direction": {"type": "string"}, **CONCEPT_SCHEMA["properties"]}, "required": ["direction", *CONCEPT_SCHEMA["required"]]}
    raw, meta = await llm.json(model=CONCEPT_MODEL, system=CONCEPT_SYSTEM, user=user, schema=single, max_tokens=8000, effort="medium")
    direction = raw.pop("direction", concept.get("direction"))
    fixed, dropped = validate_concept(raw, ledger)
    dropped += scrub_banned(fixed, brief.get("banned"))
    await log({"type": "llm", "label": f"apply fix · {name}", **meta, "text": f"{dropped} uncited element(s) rejected" if dropped else None})
    return {**fixed, "direction": direction}
