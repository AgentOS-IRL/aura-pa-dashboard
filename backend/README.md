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
- `FRONTEND_URL` (default `http://localhost:3000`) sets which origin the Express/CORS middleware exposes via `Access-Control-Allow-Origin`. Override this in production with your dashboard host so only trusted frontends can call `/sessions/{sessionId}/audio`.
- The Express stack also sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so the Aura Assistant dashboard can stay cross-origin isolated for VAD/SharedArrayBuffer usage while still delegating uploads to this API.

Retry logic with exponential backoff keeps the connection resilient, and connection events are logged for visibility.

### Upload endpoint

- `POST /sessions/{sessionId}/audio` – accepts `multipart/form-data` uploads and expects a single `audio` field containing the raw blob.
- The route only keeps blobs in memory; it forwards the Buffer directly to Redis without persisting files on disk.
- Every request to this route responds with the configured CORS headers so the Next.js client on `FRONTEND_URL` (or `*` in dev) can POST audio without being blocked by the browser.

### Sample curl

```bash
curl -X POST http://localhost:4000/sessions/my-session/audio \\
  -F \"audio=@/path/to/recording.webm\" \\
  -H \"Content-Type: multipart/form-data\"
```

`REDIS_HOST` / `REDIS_PORT` must point to a valid instance when sending chunks.

## Verification

Run `npm run lint` to exercise ESLint (`src/**/*.ts`) and `npm run test` (alias for `npm run build`) to ensure the bundle compiles.

## Dockerized runtime

The Docker service described in the root `docker-compose.yml` runs `node backend/server.js` as the `node` user with `PORT=3001` and `FRONTEND_URL=http://localhost:3006`, so the Express app listens on the port expected by the mapped host port. `backend/server.js` ensures the `backend/uploads` directory exists before requiring the compiled `dist/index.js`, and the compose setup mounts the repo's top-level `uploads/` directory at `/app/backend/uploads` so any uploaded blobs persist between container restarts. A dedicated `backend-dist` volume keeps `/app/backend/dist` populated with the image-built bundle even when the host `backend/` folder lacks `dist/`, so the runtime still finds the compiled entry point.
