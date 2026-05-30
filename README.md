# us-stock-calendar

A local-first web app for tracking upcoming US stock earnings dates.

## v0.1 Scope

- Local self-use web app.
- Earnings calendar only.
- Daily, weekly, and monthly views.
- Default view: weekly.
- UI range: today through the next 60 days.
- Local cache may retain the past 7 days for timezone buffer and debugging.
- Market-cap tiers:
  - Mega: >= 200B USD
  - Large: 10B to 200B USD
  - Small: < 10B USD
  - Unknown: missing market-cap data
- Default filters: Mega only.
- Earnings timing:
  - Before market open
  - After market close
- Events without a known pre-market or after-hours timing are cached but hidden from the UI.
- Manual refresh first. A script entry is reserved so it can later be wired to cron.

## Later

- Telegram daily or weekly digest.
- `.ics` calendar subscription feed.
- Optional watchlist/import flows.
- ETF or theme-based default lists.

## Local Development

This first scaffold intentionally uses Node.js built-ins only.

```bash
node scripts/refresh.js
node src/server.js
```

Then open:

```text
http://localhost:3000
```

## Refresh

Refresh pulls US market earnings data from Nasdaq's public calendar endpoint, enriches events with sector and industry data from Nasdaq's public stock screener, and writes a local cache under `data/`.

```bash
node scripts/refresh.js
```

The web app also exposes a local refresh button that calls `POST /api/refresh`.
