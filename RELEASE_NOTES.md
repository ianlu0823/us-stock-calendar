# Release Notes

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
- `.ics` calendar subscription feed.
- Optional watchlist/import support.
- ETF or index-based filters.
- Deployment target for always-on refresh and notifications.

