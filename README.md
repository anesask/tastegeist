# Tastegeist

**Every neighborhood has a geist.**

Tastegeist turns a campaign brief into a campaign map. It finds the right idea for the right neighborhood, and shows the cultural data behind every line.

> One city. Many tastes. A campaign for each.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com). MIT licensed.

---

## The problem

A culture deck from an agency strategist costs $20k to $80k and takes two to four weeks. Smaller brands get none, so they run one campaign everywhere. But taste is local:

- In the Amsterdam sample, De Pijp and Noord, ten minutes apart by bike, share only **60%** of their top Qloo affinities.
- Amsterdam and Berlin share **79%**.
- In Los Angeles, Silver Lake and Venice share **52%**.

A city-wide campaign talks past most of what makes each neighborhood itself.

## What it does

1. **Brief.** Describe the product (or paste a URL), the audience and the budget, then pick a scope: **a whole country**, **several cities**, or **one city in depth**. Claude proposes "anchors": real brands, artists and shows the audience already loves. Qloo resolves them, and you confirm or swap them.
2. **Taste zones.**
   - Qloo maps what each market and neighborhood over-indexes on.
   - Tastegeist computes lift, clusters markets with shared taste into zones, and names each zone's *geist* ("The Noord Slow-Burners").
   - You get a map, example places, a Culture Map constellation and an editorial dossier per zone.
3. **Culture.** A profile of every place: what it listens to (a playable mixtape of 30-second previews), watches, wears and buys, tunes into, reads, where it eats and travels, and its age and sex mix, all with lift against the brief's other places. A mood radar and "sounds, looks, feels like" lines are AI interpretation, labeled as such; the color palette is computed from the place's own Qloo imagery. Click any title to see how strongly every place leans to it and which concepts use it; compare two places side by side.
4. **Creatives.**
   - Three concepts per zone: headline, copy, moodboard, music, partners and channels. Every element cites the Qloo entities it was built from; a validator throws out anything uncited.
   - Each concept is shown as a poster built from the zone's real Qloo references (films, artists, shows), toned in the zone color.
5. **The séance.** Each concept is tested on 8 synthetic personas built from Qloo demographics and the zone's affinities. Results are counts ("6 of 8 would stop scrolling") plus quotes. The same personas also judge a generic LLM-only concept, which gives a *measured* uplift.
6. **Media plan.**
   - Flighting by channel, a budget split you can edit, per-market audience definitions with interest keywords taken straight from the ledger, geo targets, and A/B tests with proper sample sizes.
   - Export to **Excel, PDF and JSON**.
7. **Results.** Key insight, LLM-only comparison, a benefit forecast on your own numbers (labeled as a scenario model), and ranked improvement opportunities.
8. **Client report.** An editorial report of the campaign at `/report/<id>`: the finding, one chapter per taste zone, the control, the plan. Anyone with the link can read it, and it prints to PDF.

## Why Qloo (and why the plan collapses without it)

A language model alone writes one campaign for everyone. It can't know which blocks of Amsterdam over-index on *Normal People* and AFC Ajax. That knowledge is Qloo's.

- **The ledger:** every concept element cites Qloo entity ids and lift. Remove Qloo and the ledger is empty.
- **The LLM-only toggle:** the same brief through the same model without Qloo produces one generic concept. On the EU demo, the same personas stopped scrolling **0 of 32** times for it, vs **22 of 32** for Tastegeist's tailored concepts.
- **The neighborhood layer:** zones, places and the live heatmap exist only because of Qloo's location data.

## Qloo calls used

All calls are GET requests to `hackathon.api.qloo.com`, cached server-side (never committed to git, per Qloo's terms).

| Call | Why |
| --- | --- |
| `/search` (types filtered) | Resolve the product's anchors and validate cities and countries (locality autocomplete) |
| `/v2/insights` `filter.type=urn:entity:{artist,tv_show,movie,podcast,brand}` + `signal.interests.entities` (weight 0.2) + `signal.location(.query)` + `feature.explainability` | The culture map of each market or neighborhood. Explainability says which anchor drove each entity |
| `/v2/insights` `filter.type=urn:tag` + `filter.tag.types=urn:tag:genre:{music,media}` | Aesthetics per market |
| `/v2/insights` `filter.type=urn:heatmap` | The live neighborhood heatmap; for country scope, the national heatmap that finds hotspot cities |
| `/v2/insights` `filter.type=urn:entity:place` + `filter.location` | Example places per zone, and naming discovered neighborhoods and cities from the places' own geocodes (fully Qloo-native, no third-party geocoder) |
| `/v2/insights` `filter.type=urn:entity:{book,destination}` (same signals as the culture maps) | The Culture tab's reading and travel sections, with lift against the campaign's other places |
| `/v2/insights` `filter.type=urn:demographics` | Age and gender skew for the audience chart and the séance personas |

## How a request becomes a result (Amsterdam demo, redacted)

1. **Anchors.** `/search` turns "Patagonia", "Muji" and "Fred again.." into entity ids.
2. **Culture maps.** For Amsterdam, Berlin, London and Manchester, plus `POINT`s in De Pijp and Noord: 5 domains × 50 entities via Insights, with anchors weighted 0.2. Without that weight, anchors drown out location and every city returns the same list.
3. **Lift.** Raw affinities sit in a narrow band (0.93-0.96), so lift is rank-based: an entity's rank score in one market divided by its mean across markets.
4. **Zones.** Markets are clustered by cosine similarity of log-lift vectors (average linkage, k chosen by silhouette). Each zone's ledger keeps entities with lift above 1.5 inside the zone and below 1.0 elsewhere, ranked by contrast × √popularity.
5. **Creatives.**
   - Claude Opus 5.5 writes three concepts per zone from the ledger only (structured JSON).
   - A validator drops any element citing an id that isn't on the ledger.
   - Claude Haiku 5.5 names the geist and runs the séance.
   - Optional: gpt-image-1-mini hero images (`GENERATE_IMAGES=1`); off by default, the posters use the Qloo imagery itself.
6. **Plan.** Deterministic: budget by ledger strength, with a city that has neighborhood geists handing its share to them. Flighting is in three phases; A/B sample size comes from a two-proportion z-test.

## Architecture

```
React 19 + Vite 8, Tailwind 4, TanStack Query, React Router, ECharts 6, MapLibre 6 + deck.gl 9
        │  REST + SSE (live progress, reattaches after reload)
        ▼
FastAPI ─ pipeline.py   anchors → culture maps → lift → zones → ledger
        ├ scope.py      country hotspots and city neighborhoods, from Qloo heatmaps and place geocodes
        ├ creative.py   Opus concepts, Haiku séance and naming, LLM-only baseline
        ├ images.py     optional generated hero images (off by default)
        ├ plan.py       media plan; export.py: XLSX, PDF, JSON
        └ store.py      campaigns per anonymous workspace (cookie)
SQLite caches: Qloo responses, LLM output, images, campaigns. All server-side, never in git.
```

**Cost control:**
- Every paid call is cached; the demos replay for free.
- Claude and image spend is tallied per day against a hard cap, after which new campaigns fall back to template concepts.
- New campaigns are rate-limited per IP.

## Run it locally

Needs Python 3.12+ and Node 22+. Copy `.env.example` to `.env` and set `QLOO_API_KEY`, `ANTHROPIC_API_KEY` and, optionally, `OPENAI_API_KEY` (hero images).

```bash
# backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip
.venv/bin/python -m uvicorn app.main:app --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                                       # http://localhost:5173
```

The three demo campaigns (Europe, USA, Germany) appear on first start. Open one and press **Generate** to build it; after that it's cached. End-to-end tests: `cd frontend && npx playwright test` (desktop and phone, every screen).

## Deploy

```bash
docker build -t tastegeist .
docker run -p 8000:8000 --env-file .env -v tastegeist-data:/app/backend/data tastegeist
```

One image serves the API and the app. Mount the data volume so the caches and campaigns persist.

## Limitations (what the results don't prove)

- **The séance is synthetic.** The personas are built from Qloo's aggregate group affinities and voiced by a language model. They are directional and not a survey; the A/B tests in the plan are how to validate.
- **The benefit forecast is a scenario model.** It applies a share of the synthetic uplift to *your* baseline numbers. It is not a prediction.
- **Affinity ≠ individuals.** Everything describes what groups tend to like, never what one person will do.
- **Coverage varies.** Neighborhood discovery and heatmaps depend on Qloo's data depth in a given city.
- **Ad-platform export.** The JSON per market is not yet verified against Meta or Google import specs.

## Responsible use

- No personal data is sent to Qloo: briefs are product descriptions and public cultural signals.
- Results are framed as group affinities.
- Qloo output (the ledger, lift values, the data source on every chart) is visibly separated from model interpretation (the concepts, the séance).

## License

MIT, see [LICENSE](LICENSE).
