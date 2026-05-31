# Deployment

## Zeabur Test Deployment

This project can be tested on Zeabur Free Plan as a simple Node.js web service.

### Goal

Deploy the current local-first v0.1 app so the web UI is reachable from a public Zeabur URL.

### Repository

Use the GitHub repository:

```text
ianlu0823/us-stock-calendar
```

### Service Type

Create a new Zeabur service from GitHub.

Zeabur should detect this as a Node.js project.

### Commands

Use:

```bash
npm start
```

If Zeabur asks for an explicit start command:

```bash
node src/server.js
```

No build command is required.

### Environment Variables

For test deployment:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
```

`HOST=0.0.0.0` lets the app accept traffic inside Zeabur's container environment.

### Cache Storage

By default, the app writes cache data to:

```text
data/earnings-cache.json
```

For a quick Free Plan test, this can stay as-is. The cache may be lost when the service restarts or redeploys.

If adding a Zeabur volume later, mount it and set:

```text
DATA_DIR=/data
```

Then the app will write:

```text
/data/earnings-cache.json
```

### Health Check

After deployment, check:

```text
https://your-zeabur-domain/healthz
```

Expected response:

```json
{"ok":true,"service":"us-stock-calendar","time":"..."}
```

### Refresh Data

Open the deployed app and click `Refresh`.

For a manual API test:

```bash
curl -X POST https://your-zeabur-domain/api/refresh
```

### Free Plan Notes

- The service may sleep when idle.
- The first request after sleep may be slow.
- Cache data may not persist unless a volume is configured.
- This is fine for a deployment smoke test.

### Not Included Yet

- Scheduled refresh.
- Telegram digest.
- Calendar subscription feed.
- Refresh token protection.

