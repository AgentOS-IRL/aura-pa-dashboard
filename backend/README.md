# Backend Health Service

This standalone Express service lives under `backend/` and now exposes both a health endpoint and a Redis-backed audio ingestion route so the Aura Assistant can accumulate spoken recordings per session.

## Setup

```bash
cd backend
npm install
```

To exercise the Codex-powered workflows that this service relies on (e.g., `agentHealth` diagnostics and `CodexClient` usage tracking via `backend/src/services/codexClient.ts`), create a Codex environment for this repo via https://chatgpt.com/codex/cloud/settings/environments. Once the environment exists, `npm run lint` and `npm run test` can reference the same configuration as AgentOS and the helper services.

## Deepgram transcription client

The backend now ships a dedicated Deepgram helper (`backend/src/services/deepgramTranscribeClient.ts`) that forces every upload through `nova-3` with `language: "en"`, `smart_format: true`, and `utterances: true`. The client also filters utterances with confidence below `0.8`, joins the remaining text, and returns both the final transcript plus the individual utterance metadata so callers can store a clean string alongside the raw Deepgram response.

### Configuration

- `DEEPGRAM_API_KEY` (required) – the secret key used for Deepgram requests. The service fails fast if this variable is missing or empty.
- `DEEPGRAM_BASE_URL` (optional) – override the endpoint when pointing at a proxy or alternate Deepgram host.

Read more about these knobs in `docs/agent-os-core-config.md` before pushing changes to production.

### Example usage

```ts
import fs from "fs";
import { DeepgramTranscribeClient } from "./services/deepgramTranscribeClient";

const client = new DeepgramTranscribeClient();
const transcript = await client.transcribeStream(
  "session-123",
  fs.createReadStream("uploads/recording.webm")
);

console.log(transcript.text);
```

## Running the service

```bash
npm run dev     # starts via ts-node-dev on port 4000 by default
npm run build   # compiles TypeScript to dist/
npm run start   # runs the compiled dist bundle
```

The service honors the `PORT` environment variable; omit it to use the fallback `4000`.

The runtime now uses the `AURA_BASE_PATH` environment variable (default `/aura`) so every route, including `/health`, `/docs`, and `/sessions`, is mounted beneath that prefix. If you override the base path, keep `frontend` and deploy scripts in sync (`NEXT_PUBLIC_AURA_BASE_PATH` on the frontend should match).

## AgentOS status monitoring

The backend now duplicates the Redis connection and subscribes to the `agentos/status` channel so it can track every reported task (`taskId`/`label` or `agentName`). Each JSON message is sanitized, normalized (lowercased health values, ISO timestamps), and stored in memory alongside the last time it was seen. This snapshot is surfaced via `GET /aura/health` in the new `agentHealth` array (empty when no events have arrived), which allows downstream services to consume `{ id, health, lastChecked, label? }` without replaying Redis.

Point the service at `redis://192.168.8.129:6379` (or any `REDIS_URL`) so the subscriber can connect to AgentOS, and ensure the instance emits messages to `agentos/status`. Since manual verification is not supported, run `npm run lint && npm run test` after deploying or changing this logic to prove the new subscriber compiles and the route stays typed.

## Audio transcription ingest

The audio ingestion route now streams each `multipart/form-data` upload through the `DeepgramTranscribeClient` and persists the resulting text (or an error marker) via `saveTranscript`. Each row records metadata such as `source: "transcribe"`, the executor identifier, and the transcription options so you can understand how the text was produced. Errors still save a row with `payload: ""` and metadata that includes `error: true` and the vendor error message, ensuring the transcript table reflects attempted uploads even when the vendor call fails. Uploads whose Deepgram response is empty or whitespace-only no longer create transcript rows, so operators won’t see blank entries for those chunks.

### Configuration

- `FRONTEND_URL` (default `http://localhost:3000`) sets which origin the Express/CORS middleware exposes via `Access-Control-Allow-Origin`. Override this in production with your dashboard host so only trusted frontends can call `/aura/sessions/{sessionId}/audio`.
- The Express stack also sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so the Aura Assistant dashboard can stay cross-origin isolated for VAD/SharedArrayBuffer usage while still delegating uploads to this API.
- `DEEPGRAM_API_KEY` (required) plus the optional `DEEPGRAM_BASE_URL` variables configure the transcription client described above, so the audio route can reach Deepgram without additional wiring.

### Upload endpoint

- `POST /aura/sessions/{sessionId}/audio` – accepts `multipart/form-data` uploads and expects a single `audio` field containing the raw blob.
-- The route keeps the blob in memory, sends it to `DeepgramTranscribeClient.transcribeStream`, and saves the transcript response rather than writing audio to Redis.
- Every request to this route responds with the configured CORS headers so the Next.js client on `FRONTEND_URL` (or `*` in dev) can POST audio without being blocked by the browser.

### Executor health gating

Every chunk still requires the caller to supply the executor identifier AgentOS publishes via the `agentos/status` channel. Provide it either as the `X-Aura-Executor-Id` request header or the `?executorId=` query parameter so the backend can look up the same value from the in-memory `agentHealth` snapshot before transcribing. Only the normalized health strings `health`, `healthy`, `green`, `up`, or `ok` are considered healthy; any other value (missing entry or `down`, `critical`, etc.) causes the route to skip transcription, log a warning, and return `409 Conflict` with a clear message rather than calling Deepgram.

Please keep `/aura/health` open as the source of truth for executor readiness—operations teams must ensure AgentOS has published a healthy status for the desired executor before streaming audio chunks to avoid the new guard rejecting uploads.

### Sample curl

```bash
DEEPGRAM_API_KEY=dg-... \
  curl -X POST http://localhost:4000/aura/sessions/my-session/audio \
  -F "audio=@/path/to/recording.webm" \
  -H "Content-Type: multipart/form-data"
```

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

## Classification table

- Stored in the same SQLite file (`backend/data/transcripts.db`) as the transcripts so operators can reuse the same tooling.
- Columns: `id` (TEXT PRIMARY KEY), `name` (TEXT NOT NULL), `description` (TEXT, nullable).
- Initialized automatically every time the backend starts, ensuring the table exists before any requests run and letting teams inspect it with `sqlite3 backend/data/transcripts.db`.

## Transcript classifications

- The `transcript_classifications` table captures the 1→many relationship between transcript rows (`transcript_id`) and classification identifiers (`classification_id`).
- Each row records `assigned_at` (ISO timestamp) and enforces a composite primary key (`transcript_id`, `classification_id`) plus cascading foreign keys so deleting a transcript or classification automatically drops related assignments.
- The table is created alongside the other schema objects when the service boots, so inspect it with the same SQLite file (`sqlite3 backend/data/transcripts.db`).
- Use SQL such as `SELECT * FROM transcript_classifications WHERE transcript_id = ?;` or `SELECT transcript_id FROM transcript_classifications WHERE classification_id = ?;` to understand which labels are attached to which transcripts.

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

Run `npm run lint` and `npm run test` to exercise ESLint (`src/**/*.ts`) and Vitest so the subscriber and new route stay typed and tested.

## Dockerized runtime

The Docker service described in the root `docker-compose.yml` runs `node backend/server.js` as the `node` user with `PORT=3001` and `FRONTEND_URL=http://localhost:3006`, so the Express app listens on the port expected by the mapped host port. `backend/server.js` ensures the `backend/uploads` directory exists before requiring the compiled `dist/index.js`, and the compose setup mounts the repo's top-level `uploads/` directory at `/app/backend/uploads` so any uploaded blobs persist between container restarts. A dedicated `backend-dist` volume keeps `/app/backend/dist` populated with the image-built bundle even when the host `backend/` folder lacks `dist/`, so the runtime still finds the compiled entry point.
