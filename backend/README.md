# Backend Health Service

This standalone Express service lives under `backend/` and now exposes both a health endpoint and a Redis-backed audio ingestion route so the Aura Assistant can accumulate spoken recordings per session.

## Setup

```bash
cd backend
npm install
```

To exercise the Codex-powered workflows that this service relies on (e.g., `agentHealth` diagnostics and `CodexClient` usage tracking via `backend/src/services/codexClient.ts`), create a Codex environment for this repo via https://chatgpt.com/codex/cloud/settings/environments. Once the environment exists, `npm run lint` and `npm run test` can reference the same configuration as AgentOS and the helper services.

### Langfuse tracing

Langfuse traces are emitted every time `CodexClient.executeSync` or `executeStructured` runs when `LANGFUSE_SECRET_KEY` is present in the environment (set the optional `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_BASE_URL` as needed; the default host is `https://cloud.langfuse.com`). These keys are documented in `.env.example` so new deployments know how to opt in—leave them undefined to keep tracing disabled. After providing the keys, run `npm run test:backend` (and `npm run lint` if you want to double-check formatting) to exercise the Langfuse instrumentation along with the rest of the backend suite.

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

The audio ingestion route now streams each `multipart/form-data` upload through the `DeepgramTranscribeClient` and persists the resulting text (or an error marker) via `saveTranscript`. Each row records metadata such as `source: "transcribe"` and the transcription options so you can understand how the text was produced. Errors still save a row with `payload: ""` and metadata that includes `error: true` and the vendor error message, ensuring the transcript table reflects attempted uploads even when the vendor call fails. Uploads whose Deepgram response is empty or whitespace-only no longer create transcript rows, so operators won’t see blank entries for those chunks.

### Configuration

- `FRONTEND_URL` (default `http://localhost:3000`) sets which origin the Express/CORS middleware exposes via `Access-Control-Allow-Origin`. Override this in production with your dashboard host so only trusted frontends can call `/aura/sessions/{sessionId}/audio`.
- The Express stack also sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so the Aura Assistant dashboard can stay cross-origin isolated for VAD/SharedArrayBuffer usage while still delegating uploads to this API.
- `DEEPGRAM_API_KEY` (required) plus the optional `DEEPGRAM_BASE_URL` variables configure the transcription client described above, so the audio route can reach Deepgram without additional wiring.

### Upload endpoint

- `POST /aura/sessions/{sessionId}/audio` – accepts `multipart/form-data` uploads and expects a single `audio` field containing the raw blob.
  - The route keeps the blob in memory, sends it to `DeepgramTranscribeClient.transcribeStream`, and saves the transcript response rather than writing audio to Redis.
  - Requests missing the session ID or the file receive `400`, successes return `201`, and transcription failures return `500`.
  - When the optional `context` form field is set to `classification-generator`, the backend also asks the LLM to propose or update a single classification (name + description) that matches the transcript. That generator work runs asynchronously, reuses existing classifications when the name already exists, and never blocks the `201` response even if Codex fails—new recordings still follow the original “general” flow otherwise.
- Every request to this route responds with the configured CORS headers so the Next.js client on `FRONTEND_URL` (or `*` in dev) can POST audio without being blocked by the browser.

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
- The table now also exposes `classification_state` (one of `pending`, `classified`, or `unclassified`) with a companion `classification_reason` column so every transcript row records the worker's latest verdict even when no labels attach to the `transcript_classifications` join table.

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

## Automated transcript classification

- After every transcript row is saved, the background worker at `backend/src/services/transcriptClassificationWorker.ts` enumerates the entries in the `classifications` table, builds a prompt that lists each identifier/name/description, and calls the `CodexClient.executeStructured` helper with a schema that now expects `classificationStatus` plus either `classificationIds` or `unclassifiedReason` so Codex can explicitly signal when nothing matches.
- When Codex returns `classificationStatus: "classified"`, the worker deduplicates, trims, and filters the returned classification IDs before clearing any previous assignments, calling `assignClassificationToTranscript`, and updating `classification_state` on the transcript row to `classified` (clearing any prior `classification_reason`).
- When Codex says `classificationStatus: "unclassified"`, the worker clears that transcript's labels, leaves the `transcript_classifications` join table untouched for this row, and writes `classification_state = 'unclassified'` plus the optional `classification_reason` so consumers can tell the difference between "not yet evaluated" and "intentionally unclassified" rows.
- Classification only runs when the payload contains text and when at least one classification exists; any failures (missing auth, network errors, schema parse issues, etc.) are logged (`Unable to classify transcript with Codex` / `Background transcript classification failed`) but never stop the transcript from being saved.
- This automation relies on the Codex credentials stored at `~/.codex/auth.json` (or whatever path you set via `CODEX_AUTH_PATH`), so provision that file before running the service so the worker can authenticate. Adjust the Codex model or prompt by editing `backend/src/services/codexClient.ts` or the worker itself.

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
  - `classificationState` (string) – `pending`, `classified`, or `unclassified`, describing how the worker evaluated the transcript.
  - `classificationReason` (string|null) – optional explanation provided when Codex marked the row as `unclassified`.
- The route returns `200` with the records on success, `400` for missing session IDs or malformed query params, and `500` if the storage layer throws.

### Global transcript history

- `GET /aura/transcripts` – returns the same paginated payload as above but spans every stored session. Entries are always sorted by newest first (ordered by `receivedAt` desc with `id` as a tie-breaker) so the dashboard can show the most recent activity immediately.
- The query string accepts the same `page` (default 1) and `limit` (default 25, capped at 100) parameters so the UI can step through older rows.
- It also supports an optional `classificationState` query parameter (`pending`, `classified`, or `unclassified`). Adding this parameter returns only the rows whose `classification_state` matches the filter (e.g., `?classificationState=unclassified` surfaces the transcripts that the worker explicitly marked as unclassified), and the accompanying `total`/`hasMore` metadata reflects that filtered set.
- Each entry still includes the originating `sessionId`, `payload`, `metadata`, and `receivedAt` fields so you can correlate a transcript row with an assistant run.
- Each entry also carries `classificationState` / `classificationReason` so dashboards can surface the new "unclassified" flag and optional reason without following the `transcript_classifications` join table.
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
      "receivedAt": "2026-04-01T12:00:00Z",
      "classificationState": "pending",
      "classificationReason": null
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
