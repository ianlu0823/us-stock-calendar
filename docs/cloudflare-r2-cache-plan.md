# Cloudflare R2 Cache Persistence Plan

> **Status (2026-07-05): NOT adopted.** Cache persistence and scheduled
> refresh went with GitHub Actions + the orphan `cache-data` branch instead
> (see DEPLOYMENT.md), which avoids the R2 credit-card requirement and the
> AWS SDK dependency. This GPT-5.5-authored plan is kept for reference in
> case R2 is revisited.

## Decision

Use Cloudflare R2 as the production cache store for `earnings-cache.json`.

Render remains the deployment platform for the Node web app. R2 only replaces the production cache persistence layer currently backed by `data/earnings-cache.json`.

```text
Browser
  -> Render Node app
  -> cache read/write
  -> Cloudflare R2 object: earnings-cache.json
```

Local development should keep using the existing file cache under `data/` unless R2 environment variables are explicitly configured.

## Why R2

- The app's cache is naturally a JSON object file, not high-frequency key-value state.
- R2 is a closer match to the existing `data/earnings-cache.json` model than Redis.
- R2 free tier is large enough for this project: 10 GB-month storage, 1M Class A operations, 10M Class B operations, and free egress.
- R2 has strong read-after-write consistency for direct object operations through the S3 API or Worker bindings.
- It leaves room for future cache snapshots, manual recovery, and debugging old cache states.

Sources:

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 consistency: https://developers.cloudflare.com/r2/reference/consistency/
- Cloudflare R2 limits: https://developers.cloudflare.com/r2/platform/limits/

## Non-Goals

- Do not move the whole app from Render to Cloudflare.
- Do not use R2 as a mounted filesystem.
- Do not commit cache JSON into git.
- Do not remove local file cache support.
- Do not add user accounts or multi-user storage in this step.

## Target Behavior

Production:

- If R2 env vars are present, read and write `earnings-cache.json` from R2.
- If R2 object does not exist, return the same empty cache shape used today.
- Refresh writes the full cache object to R2 after successful or rejected refresh handling.
- `/api/events` and `/calendar.ics` read from R2-backed cache.

Local development:

- If R2 env vars are absent, keep using `data/earnings-cache.json`.
- Existing commands continue to work:

```bash
npm run refresh
npm run dev
```

## Environment Variables

Add these to Render:

```text
CACHE_BACKEND=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=us-stock-calendar
R2_OBJECT_KEY=earnings-cache.json
```

Optional:

```text
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

If `R2_ENDPOINT` is not set, derive it from `R2_ACCOUNT_ID`.

Keep `DATA_DIR` for local file cache and paid Render disk compatibility, but do not rely on it for Render Free production.

## Cloudflare Setup

1. Create an R2 bucket, for example:

```text
us-stock-calendar
```

2. Create an R2 API token with narrow permissions:

```text
Object Read
Object Write
Bucket: us-stock-calendar
```

3. Store the credentials only in Render environment variables.

4. Do not make the bucket public. The app server should be the only reader/writer.

## Code Plan

### 1. Add Cache Backend Selection

Update `src/cache.js` so it delegates based on env:

```text
CACHE_BACKEND=r2 -> R2 cache
default          -> local file cache
```

The public API should stay the same:

```js
readEarningsCache()
writeEarningsCache(cache)
```

This keeps `src/refreshEarnings.js`, `src/server.js`, and `src/calendarFeed.js` mostly unchanged.

### 2. Keep Empty Cache Shape Centralized

Create one helper for the empty cache response:

```js
{
  events: [],
  meta: {
    source: "nasdaq",
    status: "empty",
    updatedAt: null
  }
}
```

Both local file and R2 backends should use the same fallback.

### 3. Implement R2 Read

Use S3-compatible R2 API to fetch:

```text
s3://us-stock-calendar/earnings-cache.json
```

Behavior:

- `NoSuchKey` / 404 -> return empty cache.
- Invalid JSON -> throw a clear error.
- Network/auth failure -> throw a clear error so the frontend refresh flow can show failure.

### 4. Implement R2 Write

Upload the full JSON cache with:

```text
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

Use the same pretty JSON format as the local file cache:

```js
`${JSON.stringify(cache, null, 2)}\n`
```

### 5. Add Defensive Metadata

When writing to R2, include object metadata if easy:

```text
updated-at: <cache.meta.updatedAt or now>
event-count: <cache.events.length>
source: nasdaq
```

This is useful for dashboard/debugging, but not required for app behavior.

## Dependency Options

Preferred implementation:

```bash
npm install @aws-sdk/client-s3
```

Reason:

- Cloudflare R2 is S3-compatible.
- AWS SDK handles signing correctly.
- Less risk than hand-rolling AWS Signature V4.

Tradeoff:

- Adds a dependency to a project that currently uses Node built-ins only.

Alternative:

- Use Cloudflare Worker as a tiny cache proxy, then call it with `fetch`.
- This avoids AWS SDK in the app, but adds another deployable component, so it is not the first choice.

## Tests

Add focused tests for cache behavior.

### Local File Cache

- Missing local file returns empty cache.
- Existing local file parses and returns cache.
- Write creates JSON file.

### R2 Cache

Use mocked S3 client or injected fetch/client functions.

- Missing object returns empty cache.
- Existing object returns parsed cache.
- Invalid JSON throws readable error.
- Write sends expected key, content type, and JSON body.
- `CACHE_BACKEND` defaults to local file when unset.

### Existing Test Suite

Run:

```bash
npm test
```

Expected: all existing refresh and provider tests still pass.

## Rollout Plan

1. Implement R2 backend behind `CACHE_BACKEND=r2`.
2. Run local tests with default file backend.
3. Run local tests with mocked R2 backend.
4. Create R2 bucket and credentials.
5. Add Render env vars.
6. Deploy to Render.
7. Trigger one refresh:

```bash
curl -X POST https://<render-service>.onrender.com/api/refresh
```

8. Confirm:

- R2 has `earnings-cache.json`.
- `/api/events` returns populated cache.
- Restart/redeploy Render.
- `/api/events` still returns the same cache after restart.

## Rollback Plan

If R2 fails in production:

1. Remove or change:

```text
CACHE_BACKEND=r2
```

2. Redeploy Render.
3. App falls back to local file cache behavior.

This restores current behavior, including Render Free's ephemeral cache limitation.

## Future Enhancements

- Write daily snapshots:

```text
snapshots/earnings-cache-YYYY-MM-DD.json
```

- Keep only the last 30 snapshots with an R2 lifecycle rule or cleanup script.
- Add `/api/cache/status` for backend, updatedAt, event count, and object age.
- Add refresh locking to avoid concurrent refresh writes.
- Add a small migration command to upload the current local `data/earnings-cache.json` to R2.

## Recommended Next Step

Implement the R2 cache backend first, without changing UI or refresh behavior.

The change should be limited to:

- `src/cache.js`
- cache tests
- `package.json`
- deployment docs

Do not refactor the refresh pipeline during this step.
