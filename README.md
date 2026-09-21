# Albion Profit Radar

A mobile-first profit scanner for Albion Online: live market data from the
[Albion Online Data Project](https://albion-online-data.com), with analytics
that surface profitable **flips**, **crafts**, and **refines** — net of taxes,
fees, resource returns, station costs, and transport risk.

Installable on iPhone Home Screen as a standalone PWA.

**Live site:** https://luckytofu15.github.io/albion/

## Strategies

| Mode | What it screens |
|------|-----------------|
| Flip | Buy-low / sell-high spreads across royal cities + Black Market |
| Craft | 9,000+ craft recipes: material cost (with resource return) vs sale price |
| Refine | Raw → refined resource margins in each resource's bonus city |

Each result shows net silver, ROI, a confidence score (profit, ROI, quote
freshness, 7-day volume), and quote age. Community market data can be stale —
verify expensive trades in game before committing silver.

## Run it

### Hosted (iPhone)

1. Open the live site in **Safari**.
2. Share → **Add to Home Screen** → Add.
3. Launch **Albion Radar** from the Home Screen.

### Local

```bash
npm start        # http://localhost:4173 — serves the app + optional API proxy
```

Or open `index.html` directly and use **Try demo**.

## Recipe database

`data/recipes.json` is generated from
[ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) and currently
holds ~9,000 craft/refine recipes with localized names, bonus cities, and
material lists. Refresh it any time:

```bash
npm run sync-data
```

`data/recipes.demo.json` is a small built-in fallback so the UI works with no
network.

## Project layout

- `index.html`, `app.js`, `styles.css` — the PWA
- `manifest.webmanifest`, `service-worker.js`, `icons/` — installability / offline shell
- `data/recipes.json` — generated recipe database (see above)
- `scripts/sync-data.mjs` — rebuilds the recipe database
- `server.mjs` — optional local dev server + API proxy (not needed on GitHub Pages;
  the app calls the Data Project API directly from the browser)
- `.github/workflows/pages.yml` — deploys `main` to GitHub Pages
