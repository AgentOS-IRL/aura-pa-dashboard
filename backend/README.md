# Backend Health Service

This standalone Express service lives under `backend/` and now exposes both a health endpoint and a Redis-backed audio ingestion route so the Aura Assistant can accumulate spoken recordings per session.

## Setup

```bash
cd backend
npm install
```

## Running the service

```bash
npm run dev     # starts via ts-node-dev on port 4000 by default
npm run build   # compiles TypeScript to dist/
npm run start   # runs the compiled dist bundle
```

The service honors the `PORT` environment variable; omit it to use the fallback `4000`.

## Redis-backed audio capture

The audio route pushes every chunk into a per-session Redis list under the key `aura/audio/{sessionId}` so the assistant can replay ordered fragments later. Each list expires after 3 days (259200 seconds) so stale recordings are cleaned up automatically.

### Configuration

- `REDIS_HOST` / `REDIS_PORT` (default `192.168.8.129:6379`) configure the target server.
- `REDIS_PASSWORD` is used when Redis requires authentication.
- `REDIS_URL` overrides the host/port pair if you prefer a single connection string.

Retry logic with exponential backoff keeps the connection resilient, and connection events are logged for visibility.

### Upload endpoint

- `POST /sessions/{sessionId}/audio` – accepts `multipart/form-data` uploads and expects a single `audio` field containing the raw blob.
- The route only keeps blobs in memory; it forwards the Buffer directly to Redis without persisting files on disk.

### Sample curl

```bash
curl -X POST http://localhost:4000/sessions/my-session/audio \\
  -F \"audio=@/path/to/recording.webm\" \\
  -H \"Content-Type: multipart/form-data\"
```

`REDIS_HOST` / `REDIS_PORT` must point to a valid instance when sending chunks.

## Verification

Run `npm run lint` to exercise ESLint (`src/**/*.ts`) and `npm run test` (alias for `npm run build`) to ensure the bundle compiles.
