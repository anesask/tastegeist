"""Responsible use, enforced (OPEN_POINTS U1, U2).

U1, stereotypes: a séance quote that speaks from a demographic cliché ("as a woman", "boomers") instead
of from taste is withheld; the persona's scores still count, the words aren't shown.
U2, sensitive inference: no zone may be described, named or targeted by ethnicity, religion,
politics, health or sexuality. Generated names, lines and concept elements that do are replaced or
dropped, and a brief that asks to target such a trait is refused.

Matching ignores the titles in the data, so a podcast called "Office Ladies" or a band named after
a religion never trips the check. Checked against every stored demo: no hits outside titles.
"""

from __future__ import annotations

import re
from typing import Any

SENSITIVE = re.compile(
    r"\b(muslims?|christians?|jews|jewish|hindus?|buddhists?|catholics?|religio\w*|ethnic\w*|racial|races?|black people|white people|"
    r"immigrants?|migrants?|refugees?|gay|lesbians?|queer|lgbt\w*|transgender|bisexual|conservatives?|liberals?|left-wing|right-wing|"
    r"republicans?|democrats?|political|politics|disabled|disabilit\w*|illness|depressed|pregnan\w*)\b",
    re.I,
)
STEREOTYPE = re.compile(
    r"\b(as an? (woman|man|girl|guy|mom|mum|dad|mother|father|wife|husband|old person|older person)|ladies|girly|manly|boomers?|"
    r"gen ?z|zoomers?|old people|young people these days|women love|men love|like a girl|at my age|for my age)\b",
    re.I,
)


def _without_titles(text: str, titles: list[str]) -> str:
    out = text or ""
    for t in sorted({t for t in titles if t}, key=len, reverse=True):
        out = re.sub(re.escape(t), " ", out, flags=re.I)
    return out


def sensitive(text: str, titles: list[str] = ()) -> str | None:
    m = SENSITIVE.search(_without_titles(text, list(titles)))
    return m.group(0) if m else None


def stereotyped(text: str, titles: list[str] = ()) -> str | None:
    m = STEREOTYPE.search(_without_titles(text, list(titles)))
    return m.group(0) if m else None


def check_quotes(panel: dict[str, Any] | None, titles: list[str]) -> int:
    """U1: withhold persona words that lean on a stereotype. Returns how many were withheld."""
    if not panel:
        return 0
    n = 0
    for p in panel.get("personas") or []:
        if any(stereotyped(p.get(k, ""), titles) for k in ("quote", "feels_off", "compare_to")):
            p["quote"] = "Quote withheld: it leaned on a stereotype rather than on taste. The scores still count."
            p["feels_off"] = p["compare_to"] = ""
            p["withheld"] = True
            n += 1
    panel["withheld"] = n
    return n


def check_group(g: dict[str, Any]) -> int:
    """U2 on a zone's own words: persona name and tagline, the geist line. Returns how many were replaced."""
    titles = [e["name"] for e in g.get("ledger", [])]
    n = 0
    persona = g.get("persona") or {}
    if sensitive(persona.get("name", ""), titles):
        persona["name"] = f"The {g.get('label', 'local')} audience"
        n += 1
    if sensitive(persona.get("tagline", ""), titles):
        persona["tagline"] = ""
        n += 1
    if sensitive(g.get("geist", ""), titles):
        g["geist"] = f"{g.get('label', 'This place')}: defined by its titles below."
        n += 1
    return n


def check_concept(c: dict[str, Any], titles: list[str]) -> int:
    """U2 on a concept: drop any element that describes the audience by a sensitive trait."""
    n = 0
    for k in ("big_idea", "headline", "body", "music"):
        if c.get(k) and sensitive(c[k].get("text", ""), titles):
            c[k] = None
            n += 1
    for k in ("moodboard", "partners", "channels"):
        keep = [el for el in c.get(k) or [] if not sensitive(el.get("text", ""), titles)]
        n += len(c.get(k) or []) - len(keep)
        c[k] = keep
    return n


def check_lines(d: dict[str, Any] | None, keys: tuple[str, ...], titles: list[str]) -> int:
    """U2 on profile prose (mood lines): blank any that names a sensitive trait."""
    if not d:
        return 0
    n = 0
    for k in keys:
        if isinstance(d.get(k), str) and sensitive(d[k], titles):
            d[k] = ""
            n += 1
    return n


def targets_sensitive(audience: str) -> str | None:
    """The audience a brief asks for, described by a sensitive trait. Only the audience field is checked:
    a constraint like "no political references" is a fair house rule."""
    return sensitive(audience or "")
