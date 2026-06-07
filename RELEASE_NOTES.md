# Release Notes

## v0.2.2 - Ticker Analysis Links

- Defaults the calendar to Mega and Large cap events.
- Removes in-app EPS parsing and enrichment in favor of external analysis links.
- Links ticker symbols and calendar exports to Yahoo Finance analysis pages instead of showing EPS estimate or last-quarter EPS values.

## v0.2.1 - Calendar Display Fixes

This version fixes date visibility and mobile overflow behavior in the earnings calendar.

### Fixes

- Show cached earnings for the selected date even when that date is before today.
- Fix weekly `+N more` controls so they open the full day view on mobile and desktop.
- Keep the `+N more` control styled consistently while making it keyboard-focusable.

## v0.2.0 - Event Calendar Export

This version adds per-event `.ics` calendar export for upcoming US earnings events.

### Highlights

- New `/calendar.ics` endpoint with optional event filters.
- Click a Pre/After timing badge to download that event's calendar file.
- Timed calendar events instead of all-day events:
  - Pre: 08:00 America/New_York
  - After: 16:30 America/New_York
- 30-minute event duration.
- Stable event UIDs based on ticker, report date, and timing.
- Unfiltered feed defaults to the current core use case: Mega cap earnings with known timing over the next 60 days.

### Notes

- Calendar files are generated from the local cache. Refresh data first if the cache is empty.
- On Render Free, the cache remains ephemeral and can be lost after restarts or idle spin-downs.

## v0.1.0 - Local Earnings Calendar

This first version establishes a local-first US stock earnings calendar for personal use.

### Highlights

- Daily, weekly, and monthly earnings calendar views.
- Manual refresh from public Nasdaq earnings data.
- Local JSON cache under `data/`, excluded from git.
- Default display focused on Mega cap stocks.
- Market-cap filters:
  - Mega: $200B+
  - Large: $10B-$200B
  - Small: <$10B
- Sector dropdown filter populated from Nasdaq stock screener data.
- Earnings timing badges:
  - Pre: pre market
  - After: after market
- Events with unknown earnings timing are cached but hidden from the calendar.
- Event cards show:
  - ticker
  - timing badge
  - market-cap tier
  - company name
  - sector
  - latest sale, net change, and percent change
  - EPS estimate when available

### Data Sources

- Earnings calendar: Nasdaq public earnings calendar endpoint.
- Sector, industry, country, latest sale, and price change: Nasdaq public stock screener endpoint.

The app treats the Nasdaq endpoints as public data sources but keeps the provider code isolated so it can be replaced later if needed.

### Local Use

```bash
node scripts/refresh.js
node src/server.js
```

Then open:

```text
http://127.0.0.1:3000
```

### Known Limitations

- No login or multi-user support.
- No Telegram reminder yet.
- No calendar subscription yet.
- No automatic scheduled refresh yet.
- Earnings dates and market data depend on public Nasdaq endpoints.
- Sector labels use Nasdaq's classification, not standardized GICS categories.

### Next Candidates

- Telegram daily or weekly digest.
- Optional watchlist/import support.
- ETF or index-based filters.
- Deployment target for always-on refresh and notifications.
