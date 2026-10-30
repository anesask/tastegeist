"""Abuse protection for the endpoints that spend money (the product card, campaign creation).

Three cheap layers on top of the per-IP rate limits:
- a honeypot field the wizard never shows (bots fill every input),
- a minimum time on the form (a person takes seconds to write a brief; scripts post at once),
- a content filter on the brief: categories Tastegeist won't market, and prompt-injection attempts.
None of it needs a third-party service or stores anything about the visitor.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException

from .responsible import targets_sensitive

MIN_FORM_MS = 2500

# Categories no campaign here may promote. Alcohol is allowed (adult targeting is a later rule, M5).
BLOCKED = {
    "weapons": r"\b(firearms?|guns?|rifles?|pistols?|ammunition|ammo|explosives?)\b",
    "drugs": r"\b(cocaine|heroin|meth(amphetamine)?|mdma|ecstasy pills|fentanyl)\b",
    "adult": r"\b(porn(ography)?|escort services?|onlyfans|xxx)\b",
    "tobacco": r"\b(cigarettes?|vapes?|vaping|nicotine pouch(es)?)\b",
    "gambling": r"\b(casino|sports ?betting|online betting|slot machines?)\b",
    "hate": r"\b(white power|ethnic cleansing|nazi)\b",
}
INJECTION = re.compile(
    r"(ignore (all |the )?(previous|prior|above) (instructions|prompts?)|system prompt|you are now|disregard (your|the) (rules|instructions)|"
    r"reveal (your|the) (prompt|instructions|api key))",
    re.I,
)


def _text(body: dict[str, Any]) -> str:
    keys = ("name", "product_name", "description", "product", "audience", "constraints", "url", "title")
    return " ".join(str(body.get(k) or "") for k in keys)


def check(body: dict[str, Any], min_ms: int = 0) -> None:
    """Raise for bots and briefs Tastegeist won't run. Silent for everything else.
    `min_ms` applies the form-time rule (campaign creation only: an example brief can be sent at once)."""
    if str(body.get("website") or "").strip():  # the honeypot
        raise HTTPException(400, "Something went wrong. Please try again.")
    elapsed = body.get("elapsed_ms")
    if min_ms and isinstance(elapsed, (int, float)) and elapsed < min_ms:
        raise HTTPException(429, "That was quick. Give it a moment and try again.")
    text = _text(body)
    trait = targets_sensitive(str(body.get("audience") or ""))
    if trait:
        raise HTTPException(422, f"Tastegeist doesn't target or exclude people by a sensitive trait (\"{trait}\"). Describe the audience by taste instead.")
    if INJECTION.search(text):
        raise HTTPException(422, "The brief contains instructions aimed at the AI. Describe the product instead.")
    for cat, rx in BLOCKED.items():
        if re.search(rx, text, re.I):
            raise HTTPException(422, f"Tastegeist doesn't run campaigns in this category ({cat}). See the terms.")
