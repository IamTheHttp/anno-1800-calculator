# Anno 1800 Planner

A static web tool for planning Anno 1800 islands: residents, production
buildings, supply chains, and workforce. Base game only (no DLC content).
Working conditions, items, electricity, and trade unions are not modelled.

## What it does

- **Islands** — each island has a region (Old World / New World), residents per
  tier, and a count per production building.
- **Balance** (building-driven) — per good: tons/min produced vs. used by
  residents and by factories, with the net shown in tons and in buildings.
  Factories draw inputs only as fast as their output is needed, so an
  overbuilt chain (e.g. extra breweries) does not show its inputs as missing.
  Building rows show "Runs at N%" when demand keeps them below capacity.
- **Needs plan** (population-driven) — every building the residents' needs call
  for, through the full chain, vs. what is built. Goods from the other region
  (e.g. coffee for engineers) carry a region badge.
- **Workforce** — workers the buildings need vs. residents of each tier.
- **Shortage marks** — goods an island lacks are marked red when the whole
  empire is short of them, and amber when another island has the surplus.
  Marks appear in a "Missing" strip on the island, on resident need chips, on
  building rows ("+N needed", output short, input short), on balance rows, and
  as counts next to each island in the sidebar.
- **Income** — coins per minute per island and for the empire: taxes minus
  royal taxes, minus production-building upkeep. The "Revenue" difficulty setting in the top bar
  adds its tax bonus. Tax tied to goods the empire lacks shows as "at risk".
- **Trade routes** — ship a good from one island to another, either a fixed
  t/min or **Auto** (what the destination lacks, up to the source's surplus).
  Islands' balances show a Trade column, shortages are computed after trade,
  and the needs plan moves an exported good's chain to the producing island.
  Clicking an amber "Missing" chip adds an Auto route from the island with the
  most spare; the Trade routes page lists every route and suggests new ones.
  Ship capacity and travel time are not modelled.
- **Empire overview** — all islands summed, plus a "what to build next" list.
  It assumes any surplus can reach any deficit.
- **Supply chains** — the full tree behind N buildings of any good.
- **Need unlocks** — needs appear only once an island reaches the game's
  resident threshold (toggle in the top bar). Bonus needs (e.g. rum for
  workers) count only when ticked on the island.
- **Theme** — Auto (follows the OS), Light, or Dark, from the top bar.
- **Import / export** — the whole plan as a versioned JSON file. The plan also
  autosaves to the browser's local storage.

## Develop

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (model + render smoke tests)
npm run lint
npm run build      # static site in dist/
```

The project-level `.npmrc` pins the public npm registry.

## Game data

`src/data/game-data.json` and `src/data/icons.json` are generated from the
Anno1800Calculator data file (see `THIRD_PARTY_NOTICES.md`):

```
npm run data       # downloads params.js into .data-src/ if missing, then extracts
```

Delete `.data-src/` first to pull the latest upstream data.

## Rates

- A building makes `tpmin × output amount` tons per minute.
- A tier consumes `residents × tpmin` tons per minute of each active need.
- One resident provides one worker of its tier.
- Routes: fixed amounts ship first, then Auto routes in list order.
- A factory runs at `min(1, needed / capacity)` of its output, empire-wide.
  "Needed" is resident demand plus the inputs of factories that are
  themselves needed. Goods no resident or factory uses (bricks, steel beams,
  weapons, …) run at full capacity.
- Each met need pays `MoneyValue / 100` coins per minute per resident, times
  the Revenue multiplier (Plenty ×1.25, Medium ×1.125, Spare ×1).
- Royal taxes take a share of each tier's taxes per island: none below 1,000
  residents, then `floor(1 + residents / 125)` percent, capped at 40% from
  4,875 residents.
- Upkeep is each production building's coin maintenance. Public buildings,
  warehouses, ships, and inactive-building costs are not counted.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main`. Enable it under *Settings → Pages → Source: GitHub
Actions*. Pages on a private repository needs a paid GitHub plan.

## Export format

```json
{
  "app": "anno1800-planner",
  "version": 2,
  "exportedAt": "2026-10-07T12:00:00.000Z",
  "settings": { "applyUnlocks": true, "revenue": "medium" },
  "routes": [
    { "id": "r1", "from": "p2x8mq01", "to": "k3j9x0aa", "product": 1010216, "amount": null }
  ],
  "islands": [
    {
      "id": "k3j9x0aa",
      "name": "Crown Falls",
      "region": 5000000,
      "residents": { "15000000": 500 },
      "buildings": { "1010278": 2 },
      "bonusNeeds": [],
      "notes": ""
    }
  ]
}
```

Keys of `residents` and `buildings` are game ids (population levels and
buildings, see `src/data/game-data.json`). A route's `amount` is t/min, or
`null` for Auto. Unknown ids, and routes to missing islands, are dropped on
import with a warning. Version 1 files (no routes) still import.
