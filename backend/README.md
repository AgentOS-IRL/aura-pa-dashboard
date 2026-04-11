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

The runtime now uses the `AURA_BASE_PATH` environment variable (default `/aura`) so every route, including `/health`, `/docs`, and `/sessions`, is mounted beneath that prefix. If you override the base path, keep `frontend` and deploy scripts in sync (`NEXT_PUBLIC_AURA_BASE_PATH` on the frontend should match).

## Redis-backed audio capture

The audio route pushes every chunk into a per-session Redis list under the key `agentos/aura/audio/{sessionId}` so the assistant can replay ordered fragments later. Each list expires after 3 days (259200 seconds) so stale recordings are cleaned up automatically.

### Configuration

- `REDIS_HOST` / `REDIS_PORT` (default `192.168.8.129:6379`) configure the target server.
- `REDIS_PASSWORD` is used when Redis requires authentication.
- `REDIS_URL` overrides the host/port pair if you prefer a single connection string.
- `FRONTEND_URL` (default `http://localhost:3000`) sets which origin the Express/CORS middleware exposes via `Access-Control-Allow-Origin`. Override this in production with your dashboard host so only trusted frontends can call `/aura/sessions/{sessionId}/audio`.
- The Express stack also sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so the Aura Assistant dashboard can stay cross-origin isolated for VAD/SharedArrayBuffer usage while still delegating uploads to this API.

Retry logic with exponential backoff keeps the connection resilient, and connection events are logged for visibility.

### Upload endpoint

- `POST /aura/sessions/{sessionId}/audio` – accepts `multipart/form-data` uploads and expects a single `audio` field containing the raw blob.
- The route only keeps blobs in memory; it forwards the Buffer directly to Redis without persisting files on disk.
- Every request to this route responds with the configured CORS headers so the Next.js client on `FRONTEND_URL` (or `*` in dev) can POST audio without being blocked by the browser.

### Sample curl

```bash
curl -X POST http://localhost:4000/aura/sessions/my-session/audio \\
  -F \"audio=@/path/to/recording.webm\" \\
  -H \"Content-Type: multipart/form-data\"
```

`REDIS_HOST` / `REDIS_PORT` must point to a valid instance when sending chunks.

## Transcript persistence

Transcripts are now ingested through a dedicated HTTP endpoint instead of the retired Redis listener. The client posts the text for each session using `POST /aura/sessions/{sessionId}/transcript` and the Express route persists the payload with the optional metadata into the same SQLite store that powers replay.

### Transcript endpoint

- `POST /aura/sessions/{sessionId}/transcript` – accepts `application/json` bodies containing:
  - `payload` (string) – the transcript text to persist.
  - `metadata` (optional object) – any ancillary data (e.g., speaker, source) that should be recorded alongside the payload.
- The route trims the `sessionId` path parameter, validates the payload is present, and returns `201` on success, `400` when validation fails, or `500` when persistence throws.
- Since the listener is gone, callers must now push transcripts explicitly to this endpoint rather than relying on Redis pub/sub.

### Storage configuration

- `TRANSCRIPT_DB_PATH` controls where the SQLite file lives (default: `backend/data/transcripts.db`). The helper under `backend/src/config/database.ts` creates the parent directory automatically, so only ensure the directory is writable. `backend/data/.gitkeep` keeps the directory tracked even though `*.db*` files are ignored.
- Save operations still use the `transcripts` table with `session_id`, `payload`, optional JSON `metadata`, and the ISO `received_at` timestamp so you can audit when each chunk arrived.

Inspect the SQLite file with standard tools (e.g., `sqlite3 backend/data/transcripts.db`) or point `TRANSCRIPT_DB_PATH` elsewhere in production before retrieving historical transcripts.

## Transcript retrieval

When you need to show what Aura previously captured, call one of the read endpoints to paginate stored transcript rows. The storage layer tracks every session, so you can either scope the query to a specific session or read the entire global history that mixes entries from every session.

### Session-specific transcript read

- `GET /aura/sessions/{sessionId}/transcript` – returns a single JSON payload that includes `transcripts`, `page`, `limit`, `total`, and `hasMore`. The query string accepts `page` (optional, defaults to 1) and `limit` (optional, defaults to 25, capped at 100) so you can step backward through older history scoped to one session.
- `total` reports how many rows exist for the session, `page` reflects the currently returned page, and `hasMore` becomes `true` whenever a subsequent page still exists.
- Use `?page=2&limit=25` (or higher `page` values) when `hasMore` is `true` to fetch additional entries.
- Each row contains:
  - `sessionId` (string) – the session that produced the record.
  - `payload` (string) – the text that was captured for that chunk.
  - `metadata` (object|null) – any context stored at ingest time (e.g., speaker, source). If no metadata was saved, this field is `null`.
  - `receivedAt` (string) – ISO timestamp describing when the row was stored.
- The route returns `200` with the records on success, `400` for missing session IDs or malformed query params, and `500` if the storage layer throws.

### Global transcript history

- `GET /aura/transcripts` – returns the same paginated payload as above but spans every stored session. Entries are always sorted by newest first (ordered by `receivedAt` desc with `id` as a tie-breaker) so the dashboard can show the most recent activity immediately.
- The query string accepts the same `page` (default 1) and `limit` (default 25, capped at 100) parameters so the UI can step through older rows.
- Each entry still includes the originating `sessionId`, `payload`, `metadata`, and `receivedAt` fields so you can correlate a transcript row with an assistant run.
- `total` reflects the count of all matching rows, and `hasMore` becomes `true` whenever additional pages exist across any session.
- The route returns `200` with results, `400` when pagination parameters are invalid, and `500` when the storage helper throws.

### Purging transcripts

- `DELETE /aura/transcripts` – removes every row from the transcripts table via the same storage helper that powers the listing route. The dashboard exposes a **Delete all transcripts** button on `/aura/transcript` that prompts for confirmation before calling this route.
- Use this endpoint with caution: the operation is irreversible and any historian data you rely on will be gone until new transcripts are recorded.
- The route returns `204` when the purge succeeds, and `500` when the storage layer throws. Any failures surface in the UI’s error banner so operators can retry.
- Sample curl:

```bash
curl -X DELETE http://localhost:4000/aura/transcripts
```

### Sample curl

```bash
curl -X GET http://localhost:4000/aura/transcripts?page=1&limit=25
```

The response looks like:

```json
{
  "transcripts": [
    {
      "sessionId": "session-1",
      "payload": "Hey Aura, show me the transcript",
      "metadata": {
        "source": "web"
      },
      "receivedAt": "2026-04-01T12:00:00Z"
    }
  ],
  "page": 1,
  "limit": 25,
  "total": 113,
  "hasMore": true
}
```

## Verification

Run `npm run lint` to exercise ESLint (`src/**/*.ts`) and `npm run test` (alias for `npm run build`) to ensure the bundle compiles.

## Dockerized runtime

The Docker service described in the root `docker-compose.yml` runs `node backend/server.js` as the `node` user with `PORT=3001` and `FRONTEND_URL=http://localhost:3006`, so the Express app listens on the port expected by the mapped host port. `backend/server.js` ensures the `backend/uploads` directory exists before requiring the compiled `dist/index.js`, and the compose setup mounts the repo's top-level `uploads/` directory at `/app/backend/uploads` so any uploaded blobs persist between container restarts. A dedicated `backend-dist` volume keeps `/app/backend/dist` populated with the image-built bundle even when the host `backend/` folder lacks `dist/`, so the runtime still finds the compiled entry point.
