# Backend Health Service

This standalone Express service lives under `backend/` and only exposes a health endpoint plus Swagger documentation so other teams can verify Aura PA deployments quickly.

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

## Endpoints

- `GET /health` – returns `{ status: 'ok', uptime, version, timestamp }` to confirm the process is alive.
- `GET /docs` – serves the Swagger UI rendered from `openapi.yaml`.
- `GET /docs.json` – exposes the raw OpenAPI definition used by the UI.

## Verification

Run `npm run lint` to exercise ESLint (`src/**/*.ts`) and `npm run test` (alias for `npm run build`) to ensure the bundle compiles.
