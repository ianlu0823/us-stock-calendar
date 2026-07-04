# us-stock-calendar

A local-first web app for tracking upcoming US stock earnings dates.

## v0.2.0 Scope

- Per-event `.ics` calendar export from each Pre/After timing badge.
- `/calendar.ics` can also generate a filtered event file through query parameters.
- Feed includes timed earnings events, not all-day events.
- Feed timing uses `America/New_York`:
  - Pre: 08:00 ET
  - After: 16:30 ET
- Calendar events last 30 minutes.
- Feed range follows the UI range: today through the next 60 days.
- Feed defaults to Mega cap stocks with known pre-market or after-hours timing.

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

- Second data source for cross-checking (decided 2026-07-05, not implemented yet):
  - Keep Nasdaq as the primary source; harden that pipeline first.
  - Candidate: Finnhub earnings calendar (free tier, official API key). Use it to
    cross-check report dates and to fill pre-market/after-hours timing via its
    `hour` field (`bmo`/`amc`/`dmh`), which Nasdaq mostly leaves unsupplied.
  - Runners-up: Alpha Vantage `EARNINGS_CALENDAR`, API Ninjas.
  - Rejected: Yahoo (no official API; crumb/429 instability already hit in v0.2.x)
    and Google Finance (no public API at all).
- Link to Yahoo Finance for external earnings analysis:
  - Keep Nasdaq as the source for earnings date and pre-market/after-hours timing.
  - Avoid parsing third-party EPS estimate feeds in the app.
  - Link ticker symbols and calendar event descriptions to Yahoo Finance analysis pages.
- Telegram daily or weekly digest.
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

## Add Events To Calendar

Click a Pre or After badge on an earnings event to download that event's calendar file.

```text
https://your-render-service.onrender.com/calendar.ics?symbol=AVGO&date=2026-06-03&time=afterhours
```

For local development:

```text
http://localhost:3000/calendar.ics?symbol=AVGO&date=2026-06-03&time=afterhours
```

Calendar files use New York market time so calendar apps can convert earnings reminders to your local timezone.
