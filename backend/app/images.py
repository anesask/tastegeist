"""Hero images for concepts (OpenAI image model), cached on disk and counted toward the daily cap.

The prompt comes from the concept's first moodboard frame. Moodboards reference real films and
artists on purpose (that's the ledger), so the image prompt asks for the mood only: no real people,
characters, logos or text. The headline is set by the UI on top of the image, never baked in.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
from typing import Any

from .config import settings
from .llm import DAILY_CAP_USD, LLM
from .qloo import LogFn

IMAGE_MODEL = "gpt-image-1-mini"
IMAGE_USD = 0.02  # conservative per-image estimate (1024x1536, medium) used for the spend cap
IMAGE_DIR = settings.data_dir / "images"
_sem = asyncio.Semaphore(3)

try:
    from openai import AsyncOpenAI

    _client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
except Exception:  # openai missing or misconfigured: posters fall back to the Qloo duotone
    _client = None


def _prompt(product: str, place: str, concept: dict[str, Any]) -> str:
    frame = (concept.get("moodboard") or [{}])[0].get("text") or (concept.get("big_idea") or {}).get("text", "")
    return (
        f"Editorial advertising photograph for {product}, a campaign in {place}. Scene: {frame} "
        "Capture the mood and setting only. Do not depict any real or famous person, film or TV character, artwork, "
        "brand logo, poster or written text. Natural light, photographic, magazine quality, vertical composition with calm space at the bottom."
    )


async def concept_image(llm: LLM, product: str, place: str, concept: dict[str, Any], log: LogFn) -> str | None:
    if _client is None or concept.get("template"):
        return None
    prompt = _prompt(product, place, concept)
    name = hashlib.sha1((IMAGE_MODEL + prompt).encode()).hexdigest()[:20] + ".png"
    path = IMAGE_DIR / name
    url = f"/api/images/{name}"
    if path.exists():
        return url
    if llm.spent_today() + IMAGE_USD > DAILY_CAP_USD:
        return None
    async with _sem:
        try:
            r = await _client.images.generate(model=IMAGE_MODEL, prompt=prompt, size="1024x1536", quality="medium", n=1)
        except Exception as e:
            await log({"type": "warn", "text": f"image for {place}: {str(e)[:120]}"})
            return None
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(r.data[0].b64_json))
    llm.add_spend(IMAGE_USD)
    await log({"type": "llm", "label": f"hero image · {place}", "model": IMAGE_MODEL, "cached": False, "usd": IMAGE_USD, "ms": 0})
    return url


async def add_images(llm: LLM, result: dict[str, Any], product: str, log: LogFn) -> None:
    """Attach a hero image to every concept in a run result (in place)."""
    jobs = []
    for g in result["groups"]:
        place = g["label"] if g["kind"] == "neighborhood" else " and ".join(g["markets"])
        for c in g.get("concepts", []):
            jobs.append((c, concept_image(llm, product, place, c, log)))
    for c, url in zip([j[0] for j in jobs], await asyncio.gather(*(j[1] for j in jobs))):
        if url:
            c["image"] = url
