"""Tastegeist API: campaigns, runs streamed over SSE, live heatmaps."""

from __future__ import annotations

import asyncio
import os
import time
import json
import uuid
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .config import settings
from .demos import DEMOS
from .llm import DAILY_CAP_USD, LLM
from .models import brief_from_dict, brief_to_dict
from .pipeline import concept_heatmap, run
from .profile import build_profile
from .trace import build_trace
from .qloo import QlooClient
from .guard import MIN_FORM_MS, check as guard_check
from .ops import admin_ok, get_ops
from .responsible import check_concept, check_quotes
from .ratelimit import RateLimit
from .store import Store

state: dict[str, Any] = {}
WORKSPACE_COOKIE = "tg_ws"


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["qloo"] = QlooClient()
    state["llm"] = LLM()
    store = state["store"] = Store()
    for cid, brief in DEMOS.items():
        store.upsert_demo(cid, brief_to_dict(brief))
    _drop_profiles(store.purge_stale())  # retention, as the privacy policy says
    if os.getenv("BACKUP_DIR"):
        from .backup import daily

        state["backup"] = asyncio.create_task(daily())
    yield
    await state["qloo"].aclose()


app = FastAPI(title="Tastegeist", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

# Active runs: campaign id -> event queue + replay buffer, so a reload can reattach to the stream.
runs: dict[str, dict[str, Any]] = {}

new_campaign_limit = RateLimit((3, 3600), (10, 86400))
run_limit = RateLimit((20, 3600), (60, 86400))
# The map loads a heatmap per selected geist; Qloo responses are cached, so this only guards abuse.
heatmap_limit = RateLimit((240, 3600))


def workspace(request: Request, response: Response) -> str:
    """Anonymous workspace per browser: your campaigns survive a reload without an account."""
    ws = request.cookies.get(WORKSPACE_COOKIE)
    if not ws:
        ws = uuid.uuid4().hex[:16]
        response.set_cookie(WORKSPACE_COOKIE, ws, max_age=60 * 60 * 24 * 90, httponly=True, samesite="lax")
    return ws


# ---------- operations: errors, cookieless page counts, spend (R1, R3)

telemetry_limit = RateLimit((120, 3600))


@app.middleware("http")
async def record_server_errors(request: Request, call_next):
    """Unhandled server errors go to the ops log (message, path, trimmed stack; no request data)."""
    import traceback

    try:
        return await call_next(request)
    except Exception as e:
        get_ops().error("server", f"{type(e).__name__}: {e}", request.url.path, traceback.format_exc())
        raise


@app.post("/api/telemetry/error")
async def client_error(body: dict[str, Any], request: Request):
    telemetry_limit.check(request)
    get_ops().error("client", str(body.get("message", "")), str(body.get("path", "")), str(body.get("stack", "")))
    return {"ok": True}


@app.post("/api/telemetry/view")
async def page_view(body: dict[str, Any], request: Request):
    """A cookieless page count: path and day only, ids collapsed. The browser skips it under Do Not Track."""
    telemetry_limit.check(request)
    get_ops().view(str(body.get("path", "/")))
    return {"ok": True}


@app.get("/api/ops/summary")
async def ops_summary(request: Request):
    if not admin_ok(request.headers.get("x-admin-token")):
        raise HTTPException(404, "not found")
    llm: LLM = state["llm"]
    return get_ops().summary(llm.db, state["store"].all_results(), DAILY_CAP_USD)


@app.get("/api/status")
async def status():
    """One line per dependency for the status banner (T8): from live calls, without probing anyone."""
    llm: LLM = state["llm"]
    spent = llm.spent_today()
    model = "off" if not llm.enabled else "cap" if spent >= DAILY_CAP_USD else "near" if spent >= DAILY_CAP_USD * 0.8 else "ok"
    return {"app": "ok", "qloo": state["qloo"].status() if settings.qloo_api_key else "off", "model": model}


@app.get("/api/run-stats")
async def run_timing():
    """Typical run time from real (not cached) runs, for the up-front estimate and the live countdown."""
    from .runstats import run_stats

    return run_stats(state["store"].all_results())


@app.get("/api/health")
async def health():
    llm: LLM = state["llm"]
    return {
        "ok": True,
        "qloo": bool(settings.qloo_api_key),
        "llm": llm.enabled,
        "llm_spent_today": round(llm.spent_today(), 3),
        "llm_daily_cap": DAILY_CAP_USD,
    }


@app.get("/api/campaigns")
async def list_campaigns(request: Request, response: Response):
    return state["store"].list(workspace(request, response))


@app.get("/api/campaigns/{cid}")
async def get_campaign(cid: str, request: Request, response: Response):
    store: Store = state["store"]
    if not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    c = store.get(cid)
    c["running"] = cid in runs
    return c


@app.get("/api/report/{cid}")
async def get_report(cid: str):
    """Read-only client report: anyone with the link (the campaign id is unguessable) can view a finished campaign."""
    store: Store = state["store"]
    c = store.get(cid)
    if not c or not c.get("result"):
        raise HTTPException(404, "report not found")
    c.pop("workspace", None)
    # White label: the report carries the owner's brand kit and agency details, never their integrations.
    ws = store.workspace_of(cid)
    st = store.get_settings(ws) if ws and not c.get("demo") else {}
    c["branding"] = {k: st.get(k) for k in ("brand", "agency", "client") if st.get(k)}
    return c


@app.post("/api/campaigns/{cid}/run")
async def start_run(cid: str, request: Request, response: Response):
    store: Store = state["store"]
    if not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    if cid in runs:
        return {"campaign_id": cid, "attached": True}
    c = store.get(cid)
    if c.get("demo"):
        raise HTTPException(403, "Demos are read-only. Use the demo as a template to generate your own copy.")
    run_limit.check(request)
    brief = brief_from_dict(c["brief"])
    brief.id = cid
    brief.style = _style(store.get_settings(workspace(request, response)))
    if c["brief"].get("headline_auto"):
        brief.headline = ""  # let the pipeline write a fresh one from the new zone count
    entry: dict[str, Any] = {"events": [], "listeners": set()}
    runs[cid] = entry
    store.set_status(cid, "running")
    started = time.time()

    async def emit(ev: dict[str, Any] | None) -> None:
        if ev is not None:
            ev.setdefault("t", round(time.time() - started, 2))
            entry["events"].append(ev)
        for q in list(entry["listeners"]):
            await q.put(ev)

    async def job():
        try:
            result = await run(state["qloo"], brief, emit, state["llm"])
            result["trace"] = build_trace(entry["events"], started)
            store.snapshot(cid)  # keep the previous run as a version
            store.save_result(cid, result)
            if not c["brief"].get("headline") or c["brief"].get("headline_auto"):
                store.set_headline(cid, result["headline"])
            await emit({"type": "result"})
        except Exception as e:  # surface failures to the UI instead of hanging the stream
            store.set_status(cid, "failed")
            await emit({"type": "error", "text": str(e)})
        finally:
            await emit(None)
            runs.pop(cid, None)

    asyncio.create_task(job())
    return {"campaign_id": cid, "attached": False}


@app.get("/api/campaigns/{cid}/events")
async def run_events(cid: str):
    entry = runs.get(cid)

    async def stream():
        if entry is None:
            yield {"event": "end", "data": "{}"}
            return
        q: asyncio.Queue = asyncio.Queue()
        backlog = list(entry["events"])
        entry["listeners"].add(q)
        try:
            for ev in backlog:
                yield {"event": ev["type"], "data": json.dumps(ev, ensure_ascii=False)}
            while (ev := await q.get()) is not None:
                yield {"event": ev["type"], "data": json.dumps(ev, ensure_ascii=False)}
            yield {"event": "end", "data": "{}"}
        finally:
            entry["listeners"].discard(q)

    return EventSourceResponse(stream())


@app.get("/api/images/{name}")
async def image(name: str):
    from fastapi.responses import FileResponse

    from .images import IMAGE_DIR

    if not name.endswith(".png") or "/" in name or ".." in name:
        raise HTTPException(404, "not found")
    path = IMAGE_DIR / name
    if not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/heatmap")
async def heatmap(request: Request, city: str, entities: str):
    """Live neighborhood heatmap for a set of ledger entities (spec decision 10)."""
    heatmap_limit.check(request)
    ids = [e for e in entities.split(",") if e][:5]
    if not ids:
        raise HTTPException(400, "entities required")
    return {"city": city, "cells": await concept_heatmap(state["qloo"], city, ids)}


profile_limit = RateLimit((120, 3600))


@app.delete("/api/workspace")
async def delete_workspace(request: Request, response: Response):
    """Right to erasure: delete this browser's campaigns, their cached profiles, and the workspace cookie."""
    store: Store = state["store"]
    ws = request.cookies.get(WORKSPACE_COOKIE)
    ids = store.delete_workspace(ws) if ws else []
    _drop_profiles(ids)
    response.delete_cookie(WORKSPACE_COOKIE)
    return {"deleted": len(ids)}


def _drop_profiles(ids: list[str]) -> None:
    for cid in ids:
        for f in (settings.data_dir / "profiles").glob(f"{cid}__*.json"):
            f.unlink(missing_ok=True)


@app.get("/api/campaigns/{cid}/profile/{key}")
async def place_profile(cid: str, key: str, request: Request, response: Response):
    """The culture profile of one geist: what it listens to, watches, wears, reads, eats, where it travels."""
    store: Store = state["store"]
    if not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    c = store.get(cid)
    if not c or not c["result"]:
        raise HTTPException(409, "campaign has not been generated yet")
    profile_limit.check(request)
    try:
        return await build_profile(state["qloo"], state["llm"], c, key)
    except KeyError:
        raise HTTPException(404, "no such place in this campaign")


# ---------- workspace settings, brand kit, white label, integrations

MAX_LOGO = 200_000  # characters of data URL
LOGO_PREFIXES = ("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,", "data:image/svg+xml;base64,")
CHANNELS = {"social", "online_video", "ooh", "audio", "influencers", "press"}


def _clean_settings(body: dict[str, Any], old: dict[str, Any]) -> dict[str, Any]:
    """Only known fields, bounded sizes, safe image types. Logos are shown as <img>, never inlined as markup."""
    def text(v: Any, n: int = 80) -> str:
        return str(v or "").strip()[:n]

    def logo(v: Any) -> str | None:
        v = str(v or "")
        if not v:
            return None
        if len(v) > MAX_LOGO or not v.startswith(LOGO_PREFIXES):
            raise HTTPException(422, "Logos must be PNG, JPEG, WebP or SVG, under 150 KB")
        return v

    def color(v: Any) -> str | None:
        v = text(v, 7)
        return v if len(v) == 7 and v.startswith("#") and all(ch in "0123456789abcdefABCDEF" for ch in v[1:]) else None

    b = body.get("brand") or {}
    a = body.get("agency") or {}
    d = body.get("defaults") or {}
    out: dict[str, Any] = {
        "brand": {"name": text(b.get("name")), "logo": logo(b.get("logo")), "color": color(b.get("color")), "font": "sans" if b.get("font") == "sans" else "serif"},
        "agency": {"name": text(a.get("name")), "logo": logo(a.get("logo"))},
        "client": text(body.get("client")),
        "defaults": {
            "currency": text(d.get("currency"), 3).upper() or "EUR",
            "budget": max(0, min(10_000_000, int(d.get("budget") or 0))),
            "channels": [c for c in (d.get("channels") or []) if c in CHANNELS],
        },
    }
    ai = body.get("ai") or {}
    banned = ai.get("banned") or []
    if isinstance(banned, str):
        banned = banned.split(",")
    out["ai"] = {
        "provider": "tastegeist",  # bring-your-own providers are announced, not yet accepted
        "tone": ai.get("tone") if ai.get("tone") in TONES else "balanced",
        "house_rules": text(ai.get("house_rules"), 300),
        "banned": [b for b in (text(x, 60) for x in banned[:20]) if b],
        "language": "en",
    }
    hook = body.get("slack_webhook")
    if hook is None:  # not sent: keep the stored one (the browser only ever sees it masked)
        out["slack_webhook"] = old.get("slack_webhook")
    elif hook == "":
        out["slack_webhook"] = None
    elif str(hook).startswith("https://hooks.slack.com/services/") and len(hook) < 200:
        out["slack_webhook"] = hook
    else:
        raise HTTPException(422, "That isn't a Slack incoming-webhook URL")
    return out


TONES = {"balanced", "bold", "understated", "playful"}


def _style(st: dict[str, Any]) -> dict[str, Any]:
    """The writing style a run uses, from Settings > AI. Balanced tone and empty rules change nothing."""
    ai = st.get("ai") or {}
    return {k: v for k, v in {"tone": ai.get("tone") if ai.get("tone") != "balanced" else None,
                              "house_rules": ai.get("house_rules"), "banned": ai.get("banned")}.items() if v}


def _public_settings(st: dict[str, Any]) -> dict[str, Any]:
    hook = st.get("slack_webhook")
    return {**{k: v for k, v in st.items() if k != "slack_webhook"}, "slack": bool(hook)}


@app.get("/api/workspace/settings")
async def get_settings(request: Request, response: Response):
    store: Store = state["store"]
    return _public_settings(store.get_settings(workspace(request, response)))


@app.put("/api/workspace/settings")
async def put_settings(body: dict[str, Any], request: Request, response: Response):
    store: Store = state["store"]
    ws = workspace(request, response)
    st = _clean_settings(body, store.get_settings(ws))
    store.save_settings(ws, st)
    return _public_settings(st)


@app.get("/api/campaigns/{cid}/versions")
async def campaign_versions(cid: str, request: Request, response: Response):
    """Every run of a campaign, summarised for comparison: zones, chosen headlines, séance, budget."""
    store, c, _ = _owned_result(cid, request, response)

    def summary(v: dict[str, Any]) -> dict[str, Any]:
        r = v["result"]
        groups = []
        for g in r.get("groups", []):
            cs = g.get("concepts") or []
            ch = cs[g.get("chosen") or 0] if cs else {}
            pnl = ch.get("panel") or {}
            groups.append({
                "key": g["key"], "label": g.get("label"), "kind": g.get("kind"), "name": (g.get("persona") or {}).get("name"),
                "headline": (ch.get("headline") or {}).get("text"), "stops": pnl.get("stop_scrolling"), "size": pnl.get("size"),
                "base_stops": (g.get("baseline_panel") or {}).get("stop_scrolling"),
                "ledger": [e["name"] for e in g.get("ledger", [])[:5]],
            })
        budget = {z["key"]: z["budget"] for z in (r.get("plan") or {}).get("zones", [])}
        return {"n": v["n"], "created": v["created"], "current": v.get("current", False), "headline": r.get("headline"), "groups": groups, "budget": budget}

    return [summary(v) for v in store.versions(cid)]


@app.post("/api/campaigns/{cid}/slack")
async def send_to_slack(cid: str, request: Request, response: Response):
    """Post the campaign summary and report link to the workspace's Slack channel (incoming webhook)."""
    store, c, r = _owned_result(cid, request, response)
    hook = store.get_settings(workspace(request, response)).get("slack_webhook")
    if not hook:
        raise HTTPException(409, "Add a Slack webhook in Settings first")
    slack_limit.check(request)
    base = str(request.base_url).rstrip("/")
    lines = [f"*{c.get('headline') or c.get('title')}*", f"{c.get('title')}: {', '.join(c.get('markets', []))}"]
    for g in r.get("groups", []):
        cs = g.get("concepts") or []
        ch = cs[g.get("chosen") or 0] if cs else {}
        pnl = ch.get("panel") or {}
        stop = f" ({pnl['stop_scrolling']} of {pnl['size']} stop)" if pnl else ""
        lines.append(f"- {(g.get('persona') or {}).get('name', g.get('label'))}, {g.get('label')}: \"{(ch.get('headline') or {}).get('text', '')}\"{stop}")
    lines.append(f"Client report: {base}/report/{cid}")
    async with httpx.AsyncClient(timeout=8) as http:
        res = await http.post(hook, json={"text": "\n".join(lines)})
    if res.status_code >= 300:
        raise HTTPException(502, "Slack didn't accept the message")
    return {"ok": True}


@app.get("/api/campaigns/{cid}/calendar")
async def campaign_calendar(cid: str, request: Request, response: Response):
    """Local moments in the flight window: public holidays and anniversaries of the zones' Qloo titles."""
    from .calendar import build_calendar

    _, c, result = _owned_result(cid, request, response)
    profile_limit.check(request)
    return await build_calendar(state["qloo"], result, c["brief"])


@app.get("/api/preview-audio")
async def preview_audio(artist: str, request: Request):
    """A fresh 30-second Deezer preview for an artist. Deezer signs preview links with an expiry, so the
    stored ones go stale; this looks the track up again at play time and redirects to the live link."""
    from fastapi.responses import RedirectResponse

    img_limit.check(request)
    name = artist.strip()[:120]
    if not name:
        raise HTTPException(400, "artist required")
    async with httpx.AsyncClient(timeout=6) as http:
        found = (await http.get("https://api.deezer.com/search/artist", params={"q": name, "limit": 1})).json().get("data") or []
        if not found:
            raise HTTPException(404, "no preview")
        top = (await http.get(f"https://api.deezer.com/artist/{found[0]['id']}/top", params={"limit": 1})).json().get("data") or []
    url = top[0].get("preview") if top else None
    if not url or not url.startswith("https://"):
        raise HTTPException(404, "no preview")
    return RedirectResponse(url, status_code=307, headers={"Cache-Control": "no-store"})


slack_limit = RateLimit((20, 3600))
img_limit = RateLimit((600, 3600))


@app.get("/api/img")
async def image_proxy(u: str, request: Request):
    """Same-origin copy of a Qloo image, so a poster can be exported as a PNG in the browser.
    Only images.qloo.com, only images, nothing stored."""
    from urllib.parse import urlparse

    p = urlparse(u)
    if p.scheme != "https" or p.hostname != "images.qloo.com":
        raise HTTPException(400, "only Qloo images")
    img_limit.check(request)
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as http:
        r = await http.get(u, headers={"User-Agent": "Tastegeist/1.0"})
    ctype = r.headers.get("content-type", "")
    if r.status_code != 200 or not ctype.startswith("image/"):
        raise HTTPException(502, "image unavailable")
    return Response(r.content, media_type=ctype, headers={"Cache-Control": "private, max-age=3600"})


ENTITY_DOMAINS = {"artist", "tv_show", "movie", "podcast", "brand", "book", "destination"}


@app.get("/api/entity/{eid}")
async def entity_detail(eid: str, domain: str, request: Request):
    """One title, drilled down: who it skews to and the tastes that go with it. Qloo only, cached."""
    if domain not in ENTITY_DOMAINS or not all(ch.isalnum() or ch == "-" for ch in eid) or len(eid) > 64:
        raise HTTPException(400, "bad entity")
    profile_limit.check(request)
    q: QlooClient = state["qloo"]
    demo, related = await asyncio.gather(
        q.demographics([eid]),
        q.entities(f"urn:entity:{domain}", None, f"related · {domain}", signal__interests__entities=eid, take=8),
    )
    d = demo[0]["query"] if demo else {"age": {}, "gender": {}}
    return {
        "demographics": d,
        "related": [{"id": e.id, "name": e.name, "image": e.image} for e in related if e.id != eid][:6],
    }


def _owned_result(cid: str, request: Request, response: Response) -> tuple[Store, dict[str, Any], dict[str, Any]]:
    store: Store = state["store"]
    if not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    c = store.get(cid)
    if not c["result"]:
        raise HTTPException(409, "campaign has not been generated yet")
    return store, c, c["result"]


def _editable_result(cid: str, request: Request, response: Response) -> tuple[Store, dict[str, Any], dict[str, Any]]:
    """Like _owned_result, for changes: demos are shared by every visitor, so nobody may change them."""
    store, c, result = _owned_result(cid, request, response)
    if c.get("demo"):
        raise HTTPException(403, "Demos are read-only. Use the demo as a template to edit your own copy.")
    return store, c, result


@app.post("/api/campaigns/{cid}/choose")
async def choose_concept(cid: str, body: dict[str, str], request: Request, response: Response):
    """Mark the concept a zone runs with; the media plan follows (story E7)."""
    store, c, result = _editable_result(cid, request, response)
    for g in result["groups"]:
        if g["key"] == body.get("group"):
            ids = [x["id"] for x in g.get("concepts", [])]
            if body.get("concept") not in ids:
                raise HTTPException(400, "unknown concept")
            g["chosen"] = ids.index(body["concept"])
            break
    else:
        raise HTTPException(400, "unknown group")
    _refresh_plan(c, result)
    store.save_result(cid, result)
    return {"ok": True}


EDITABLE = ("headline", "big_idea", "body")


@app.patch("/api/campaigns/{cid}/concept")
async def edit_concept(cid: str, body: dict[str, str], request: Request, response: Response):
    """A strategist rewrites a line (story W1). The Qloo citations stay; the line is marked as edited."""
    store, c, result = _editable_result(cid, request, response)
    field, text = body.get("field"), str(body.get("text", "")).strip()
    if field not in EDITABLE or not text:
        raise HTTPException(422, "Pick a headline, big idea or body, and give it some text")
    g = next((x for x in result["groups"] if x["key"] == body.get("group")), None)
    concept = next((x for x in (g or {}).get("concepts", []) if x["id"] == body.get("concept")), None)
    if concept is None:
        raise HTTPException(400, "unknown concept")
    el = concept.get(field) or {"because": []}
    concept[field] = {**el, "text": text[:600], "edited": True}
    _refresh_plan(c, result)
    store.save_result(cid, result)
    return {"concept": concept}


@app.put("/api/campaigns/{cid}/budget")
async def set_budget(cid: str, body: dict[str, Any], request: Request, response: Response):
    """Edit the budget split: {"shares": {group_key: share 0..1}} (story F2)."""
    store, c, result = _editable_result(cid, request, response)
    shares = {k: max(0.0, float(v)) for k, v in (body.get("shares") or {}).items()}
    total = sum(shares.values()) or 1.0
    result["budget_shares"] = {k: v / total for k, v in shares.items()}
    _refresh_plan(c, result)
    store.save_result(cid, result)
    return result["plan"]


def _refresh_plan(c: dict[str, Any], result: dict[str, Any]) -> None:
    from .plan import build_plan

    brief = brief_from_dict(c["brief"])
    centers = {m["name"]: m for m in result["markets"]}
    groups = [
        {**g, "market_objs": [g] if g["kind"] == "neighborhood" else [centers[m] for m in g["markets"] if m in centers]}
        for g in result["groups"]
    ]
    result["plan"] = build_plan(brief, groups, result.get("budget_shares"))


@app.get("/api/campaigns/{cid}/export.{fmt}")
async def export_plan(cid: str, fmt: str, request: Request, response: Response):
    from fastapi.responses import Response as Raw

    from . import export

    _, c, _ = _owned_result(cid, request, response)
    slug = "".join(ch if ch.isalnum() else "-" for ch in (c["title"] or "campaign").lower()).strip("-")
    if fmt == "xlsx":
        body, mime = export.xlsx(c), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif fmt == "pdf":
        st = state["store"].get_settings(workspace(request, response)) if not c.get("demo") else {}
        body, mime = export.pdf(c, {k: st.get(k) for k in ("brand", "agency", "client")}), "application/pdf"
    elif fmt == "json":
        body, mime = export.json_markets(c), "application/json"
    else:
        raise HTTPException(404, "unknown export format")
    return Raw(body, media_type=mime, headers={"Content-Disposition": f'attachment; filename="tastegeist-{slug}.{fmt}"'})


# ---- Brief building (wizard) -------------------------------------------------------------------

search_limit = RateLimit((120, 3600))
card_limit = RateLimit((10, 3600), (30, 86400))


@app.get("/api/qloo/search")
async def qloo_search(request: Request, q: str, types: str | None = None):
    from .briefs import search_entities

    search_limit.check(request)
    if len(q.strip()) < 2:
        return []
    return await search_entities(state["qloo"], q.strip(), types.split(",") if types else None)


@app.get("/api/localities/search")
async def locality_search(request: Request, q: str):
    from .briefs import search_localities

    search_limit.check(request)
    if len(q.strip()) < 2:
        return []
    return await search_localities(state["qloo"], q.strip())


@app.post("/api/brief/card")
async def brief_card(body: dict[str, Any], request: Request):
    from .briefs import product_card

    card_limit.check(request)
    guard_check(body)
    name = (body.get("name") or "").strip()
    description = (body.get("description") or "").strip()
    if not name or (not description and not body.get("url")):
        raise HTTPException(400, "A product name and a description or URL are required")
    return await product_card(state["llm"], state["qloo"], name, description[:2000], body.get("url"), (body.get("audience") or "")[:500])


def _own_campaign(cid: str, request: Request, response: Response) -> Store:
    """A user's own campaign: demos can be read by everyone but changed by no one."""
    store: Store = state["store"]
    c = store.get(cid)
    if not c or c.get("demo") or not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    if cid in runs:
        raise HTTPException(409, "campaign is generating")
    return store


@app.patch("/api/campaigns/{cid}")
async def rename_campaign(cid: str, body: dict[str, Any], request: Request, response: Response):
    title = str(body.get("title", "")).strip()[:120]
    if not title:
        raise HTTPException(422, "Give the campaign a name")
    _own_campaign(cid, request, response).rename(cid, title)
    return {"ok": True}


@app.post("/api/campaigns/{cid}/duplicate")
async def duplicate_campaign(cid: str, request: Request, response: Response):
    store: Store = state["store"]
    if not store.owns(workspace(request, response), cid):
        raise HTTPException(404, "campaign not found")
    new_campaign_limit.check(request)  # a copy counts like a new campaign
    return {"id": store.duplicate(cid, workspace(request, response))}


@app.delete("/api/campaigns/{cid}")
async def delete_campaign(cid: str, request: Request, response: Response):
    _own_campaign(cid, request, response).delete(cid)
    _drop_profiles([cid])
    return {"ok": True}


preview_limit = RateLimit((90, 3600))
THIN_PREVIEW = 30  # of the 60 titles the preview asks for per place


@app.post("/api/preview")
async def brief_preview(body: dict[str, Any], request: Request):
    """What Qloo sees while a brief is being written: each place's top titles for the anchors, how alike
    the places already look, and for one city or a country the taste heatmap. Qloo only (cached), no model."""
    from .models import Market
    from .pipeline import ANCHOR_WEIGHT

    preview_limit.check(request)
    anchors = [a for a in body.get("anchors", []) if isinstance(a, str)][:6]
    places = [p for p in body.get("places", []) if p.get("name") and p.get("center")][:6]
    scope = body.get("scope", "cities")
    if not anchors or not places:
        raise HTTPException(422, "anchors and places required")
    q: QlooClient = state["qloo"]

    async def one(p: dict[str, Any]) -> dict[str, Any]:
        m = Market(p["name"], tuple(p["center"]))
        base = {"signal__interests__entities": anchors, "signal__interests__entities__weight": ANCHOR_WEIGHT, "signal__location__query": m.name, "take": 20}
        out: list[dict[str, Any]] = []
        for d in ("artist", "tv_show", "movie"):
            try:
                ents = await q.entities(f"urn:entity:{d}", None, f"preview {d} · {m.name}", **base)
            except Exception:
                ents = []
            out += [{"id": e.id, "name": e.name, "domain": e.domain, "image": e.image} for e in ents]
        return {"name": m.name, "center": list(m.center), "titles": out}

    maps = await asyncio.gather(*(one(p) for p in places))
    overlap = []
    for i in range(len(maps)):
        for j in range(i + 1, len(maps)):
            a, b = {t["id"] for t in maps[i]["titles"]}, {t["id"] for t in maps[j]["titles"]}
            if a and b:
                overlap.append({"a": maps[i]["name"], "b": maps[j]["name"], "pct": round(len(a & b) / max(len(a), len(b)), 3)})
    heat: list[dict[str, Any]] = []
    if scope in ("city", "country") and places:
        try:
            heat = (await concept_heatmap(q, places[0]["name"], anchors))[:250]
        except Exception:
            heat = []
    # Show each place's most distinctive titles: the ones the other places don't share.
    ids_by_place = [{t["id"] for t in m["titles"]} for m in maps]
    for i, m in enumerate(maps):
        others = set().union(*(ids for j, ids in enumerate(ids_by_place) if j != i))
        mine = [t for t in m["titles"] if t["image"]]
        m["top"] = ([t for t in mine if t["id"] not in others] + [t for t in mine if t["id"] in others])[:6]
        m["distinct"] = sum(1 for t in m["titles"] if t["id"] not in others)
        m["read"] = len(m["titles"])
        # Coverage up front (OPEN_POINTS 26): a place Qloo can't read would waste a run.
        m["coverage"] = "none" if not m["read"] else "thin" if m["read"] < THIN_PREVIEW else "ok"
    for m in maps:
        del m["titles"]
    return {"places": maps, "overlap": overlap, "heat": heat}


@app.post("/api/campaigns")
async def create_campaign(body: dict[str, Any], request: Request, response: Response):
    """Create a user campaign from the wizard and start generating it."""
    from .scope import brief_from_wizard

    new_campaign_limit.check(request)
    guard_check(body, min_ms=MIN_FORM_MS)
    try:
        brief = brief_from_wizard(body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    cid = state["store"].create(workspace(request, response), brief_to_dict(brief))
    return {"id": cid}


# ---- Static frontend (production) ----------------------------------------------------------------
# In the Docker image the built frontend sits in backend/static. Any non-API path serves index.html,
# so deep links like /app/c/eu/zones work on reload.
_STATIC = settings.data_dir.parent / "static"
if _STATIC.exists():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    class _Hashed(StaticFiles):
        """Build assets carry a content hash in their name: cache them for a year."""

        async def get_response(self, path, scope):
            r = await super().get_response(path, scope)
            if r.status_code == 200:
                r.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return r

    app.mount("/assets", _Hashed(directory=_STATIC / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "not found")
        file = _STATIC / path
        if path and file.is_file() and _STATIC in file.resolve().parents:
            return FileResponse(file)
        # the page itself is never cached, so a deploy shows up on the next load
        return FileResponse(_STATIC / "index.html", headers={"Cache-Control": "no-cache"})


fix_limit = RateLimit((6, 3600), (20, 86400))


@app.post("/api/campaigns/{cid}/fix")
async def fix_concept(cid: str, body: dict[str, str], request: Request, response: Response):
    """Apply the séance's fix to one concept, re-test it on the same personas, keep the before score (story E5)."""
    from .creative import apply_fix, build_personas, run_panel
    from .images import concept_image
    from .llm import BudgetExceeded, LLMUnavailable

    store, c, result = _editable_result(cid, request, response)
    fix_limit.check(request)
    g = next((x for x in result["groups"] if x["key"] == body.get("group")), None)
    concept = next((x for x in (g or {}).get("concepts", []) if x["id"] == body.get("concept")), None)
    if not g or not concept or not (concept.get("panel") or {}).get("fix"):
        raise HTTPException(400, "This concept has no séance fix to apply")
    llm: LLM = state["llm"]

    async def log(_ev: dict[str, Any]) -> None:
        return None

    brief = {"product": c["brief"]["product"], "objective": c["brief"].get("objective", "launch")}
    st = _style(state["store"].get_settings(workspace(request, response)))
    extras = {"constraints": c["brief"].get("constraints"), "tone": st.get("tone"), "house_rules": st.get("house_rules"), "banned": st.get("banned")}
    brief.update({k: v for k, v in extras.items() if v})
    try:
        new = await apply_fix(llm, brief, g["label"], g["geist"], g["ledger"], concept, log)
        personas = build_personas(g["markets"], g["ledger"], result.get("demographics", []), f"{cid}:{g['key']}")
        new["panel"] = await run_panel(llm, brief, g["label"], new, personas, log)
        titles = [e["name"] for e in g["ledger"]]
        check_concept(new, titles)  # U2
        check_quotes(new["panel"], titles)  # U1
    except (BudgetExceeded, LLMUnavailable) as e:
        raise HTTPException(503, str(e)) from e
    place = g["label"] if g["kind"] == "neighborhood" else " and ".join(g["markets"])
    new["image"] = await concept_image(llm, c["product_name"] or c["title"], place, new, log) or concept.get("image")
    new["id"] = concept["id"]
    new["before"] = {"stop_scrolling": concept["panel"]["stop_scrolling"], "would_consider": concept["panel"]["would_consider"],
                     "size": concept["panel"]["size"], "headline": (concept.get("headline") or {}).get("text"), "avg": concept["panel"].get("avg")}
    g["concepts"] = [new if x["id"] == concept["id"] else x for x in g["concepts"]]
    _refresh_plan(c, result)
    store.save_result(cid, result)
    return {"concept": new}
