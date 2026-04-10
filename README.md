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

## Dockerized development

`docker compose build` uses the new Dockerfile to install dependencies for both workspaces, run the frontend and backend builds, and bake the `backend/server.js` entrypoint that calls `startServer()` from `backend/dist/index.js`. After building, `docker compose up` starts the `aura-dashboard` service, which runs `node backend/server.js` as the Node system user, restarts unless stopped, and maps host port `3006` to the container port `3001` (`PORT=3001` inside the container).

- The service mounts `./backend` and `./frontend` into `/app/backend` and `/app/frontend` so you can iterate on either project without rebuilding the image. To keep the backend dependencies in place while the source tree is mounted, `/app/backend/node_modules` is backed by a named volume, and `./uploads` is bound to `/app/backend/uploads` so runtime blobs persist across restarts.
- A second named volume, `backend-dist`, pins the image-built `/app/backend/dist` directory so the compiled backend bundle continues to exist even when the host workspace is empty or freshly cloned.
- Build artifacts are refreshed by running `docker compose up --build` after changing `backend` or `frontend` sources. Use `docker compose exec aura-dashboard sh` to inspect the container or run ad-hoc commands while still executing as the `node` user.
 - The mapped `FRONTEND_URL` environment variable points back to `http://localhost:3006`, mirroring the host port used for the dashboard UI so the backend's CORS rules stay aligned with the containerized frontend.
