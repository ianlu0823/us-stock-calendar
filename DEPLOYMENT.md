# Deployment

## Render Free Deployment

This project can be tested on Render Free as a simple Node.js web service.

### Goal

Deploy the current local-first v0.1 app so the web UI is reachable from a public Render URL.

### Repository

Use the GitHub repository:

```text
ianlu0823/us-stock-calendar
```

### Service Type

Create a new Render Web Service from GitHub.

Render should detect this as a Node.js project. The root `render.yaml` can also be used as a Blueprint.

### Commands

Render is configured with:

```bash
Build Command: npm install
Start Command: npm start
```

If Render asks for an explicit start command, use:

```bash
npm start
```

No separate build step is required beyond installing dependencies.

### Environment Variables

For test deployment:

```text
NODE_ENV=production
```

When `NODE_ENV=production`, the app automatically binds to `0.0.0.0`.
The app reads `PORT` from the platform, so let Render provide it.

### Health Check

Render is configured to check:

```text
/healthz
```

After deployment, check:

```text
https://your-render-service.onrender.com/healthz
```

Expected response:

```json
{"ok":true,"service":"us-stock-calendar","time":"..."}
```

### Cache Storage

By default, the app writes cache data to:

```text
data/earnings-cache.json
```

For a quick Free deployment test, this can stay as-is. Render's filesystem is ephemeral, so cache data may be lost when the service restarts or redeploys.

If adding persistent storage later, mount a disk and set:

```text
DATA_DIR=/var/data
```

Then the app will write:

```text
/var/data/earnings-cache.json
```

### Refresh Data

Open the deployed app and click `Refresh`.

For a manual API test:

```bash
curl -X POST https://your-render-service.onrender.com/api/refresh
```

### Free Plan Notes

- The service may sleep when idle.
- The first request after sleep may be slow.
- Cache data does not persist unless persistent storage is configured.
- This is fine for a deployment smoke test.

### Not Included Yet

- Scheduled refresh.
- Telegram digest.
- Calendar subscription feed.
- Refresh token protection.
