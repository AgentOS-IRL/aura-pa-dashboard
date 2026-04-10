# aura-pa-dashboard

## Responsive Layout Notes

- `frontend/src/app/page.tsx` now provides a stacked landing shell with `responsive-card-padding`, tightened text sizes, and section wrappers so the hero and assistant panels stay readable on narrow viewports.
- `frontend/src/app/components/Assistant.tsx` uses responsive paddings, a scaled mic indicator, a full-width touch-friendly action button, and card/grid tweaks (timestamp/audio stack, `w-full min-w-0`) to avoid overflow while keeping the desktop polish.
- `frontend/src/app/globals.css` introduces a `responsive-card-padding` utility plus a base layer that guarantees `min-height: 100%`, `overscroll-behavior: none`, and consistent `font-feature-settings`, ensuring future sections can reuse the mobile-friendly spacing without guessing which classes to apply.

## Backend Health Service

A new `backend/` workspace hosts an Express service that still exposes `GET /health` plus Swagger UI at `GET /docs`, but now also offers `POST /sessions/{sessionId}/audio` for streaming client recordings into a per-session Redis list. Each audio list is stored under `aura/audio/{sessionId}` with a 3-day TTL, and the backend keeps the uploaded blob in memory before forwarding to Redis. The service runs on `PORT 4000` by default, and `backend/README.md` documents installation, dev/start commands, and the `npm run lint`/`npm run test` automation.

The Aura Assistant dashboard now opens a dedicated session ID every time you tap **Wake Assistant**, displays that identifier and upload status next to the action button, and streams every VAD-detected chunk to `POST /sessions/{sessionId}/audio` so the backend, Redis list, and downstream systems always see the same session context.

## Workspace scripts

The new root-level scripts coordinate the `backend/` and `frontend/` workspaces so you can install, run, build, test, and deploy the entire project without navigating into each directory manually.

- `npm run dev` starts the backend and frontend dev servers in parallel (`npm run dev:backend` then `npm run dev:frontend`) so the dashboard is fully interactive once both services are ready.
- `npm run install:all` chains `npm run install:backend` and `npm run install:frontend` to fetch dependencies for both workspaces, or run the latter scripts individually when only one side changes.
- `npm run build:frontend` runs the production build inside the `frontend/` package, and `npm run test:backend` runs the backend test suite from `backend/`.
- `npm run deploy` simply executes `./package_deploy.sh`, so the existing deployment helper remains the single source of truth for publishing.

Because each script `cd`s into `backend/` or `frontend/`, you can rely on this top-level manifest to delegate work without duplicating logic between the child manifests; refer to the individual `backend/` and `frontend/` readmes for additional details about each workspace.
