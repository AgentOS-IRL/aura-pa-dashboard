# aura-pa-dashboard

## Responsive Layout Notes

- `frontend/src/app/page.tsx` now provides a stacked landing shell with `responsive-card-padding`, tightened text sizes, and section wrappers so the hero and assistant panels stay readable on narrow viewports.
- `frontend/src/app/components/Assistant.tsx` uses responsive paddings, a scaled mic indicator, a full-width touch-friendly action button, and card/grid tweaks (timestamp/audio stack, `w-full min-w-0`) to avoid overflow while keeping the desktop polish.
- `frontend/src/app/globals.css` introduces a `responsive-card-padding` utility plus a base layer that guarantees `min-height: 100%`, `overscroll-behavior: none`, and consistent `font-feature-settings`, ensuring future sections can reuse the mobile-friendly spacing without guessing which classes to apply.

## Backend Health Service

A new `backend/` workspace hosts an Express service that lives beneath the configured `AURA_BASE_PATH` (default `/aura`), so the health endpoint is `GET /aura/health` and the Swagger UI lives at `GET /aura/docs`. The stack still accepts `POST /aura/sessions/{sessionId}/audio` for streaming client recordings into a per-session Redis list, each list is stored under `agentos/aura/audio/{sessionId}` with a 3-day TTL, and the backend keeps uploaded blobs in memory before forwarding to Redis. The service runs on `PORT 4000` by default, and `backend/README.md` documents installation, dev/start commands, and the `npm run lint`/`npm run test` automation.

The Aura Assistant dashboard now opens a dedicated session ID every time you tap **Wake Assistant**, displays that identifier and upload status next to the action button, and streams every VAD-detected chunk to `POST /aura/sessions/{sessionId}/audio` so the backend, Redis list, and downstream systems always see the same session context.

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

## Deploying to Aura

`npm run deploy` simply runs `./package_deploy.sh`, which builds both the frontend and backend workspaces, syncs the repository to the target server over SSH, copies the exported frontend bundle (`frontend/$FRONTEND_BUILD_DIR`, defaulting to `frontend/out`) into `$SERVER_PATH/frontend/$FRONTEND_BUILD_DIR`, and finally restarts the remote `docker compose` stack. Because the app now exports under the `/aura` prefix, the static files that the backend serves live inside the `frontend/$FRONTEND_BUILD_DIR/aura` subdirectory, so keep that structure intact when you sync the build artifacts. The exported directory is produced by `npm run build:frontend` (a Next.js `next build` + `next export` run), and the backend's Express service mounts that same folder via `express.static()` with a SPA fallback, so the dashboard served on port 3006 locally matches what the container exposes.

The script requires the following environment variables (set them in the same shell you use for deployment):

- `SSH_KEY`: path to the private key used for the remote server.
- `SERVER_USER`: username for the SSH session.
- `SERVER_HOST`: remote host or IP that runs the Aura service.
- `SERVER_PATH`: directory on the remote host where the repo should live.

`SSH_PORT` is optional and defaults to 22 when omitted. The deploy helper also makes sure `$SERVER_PATH/uploads` exists with liberal permissions. When you need to stop the running container before bringing it back up, pass `npm run deploy restart`; otherwise the command simply runs `docker compose up -d --build`.

Since both the deploy helper and the backend runtime read `FRONTEND_BUILD_DIR`, export the same value before running `npm run deploy` and also when the backend starts so they agree on where the static files live (for example, `FRONTEND_BUILD_DIR=dist npm run deploy`). Because the helper copies from `$SCRIPT_DIR/frontend/$FRONTEND_BUILD_DIR` to `$SERVER_PATH/frontend/$FRONTEND_BUILD_DIR`, the container receives the exact static build that your backend statically serves.

Because the script builds the frontend and backend locally before syncing, expect `npm run deploy` to take a little longer than `npm run start`, but the remote host always receives the latest artifacts plus the source files that `docker compose` needs to rebuild the image.

## Codex / OpenAI configuration

The health service now depends on the same Codex configuration that AgentOS uses:

- Supply credentials via `~/.codex/auth.json` (or override the location with `CODEX_AUTH_PATH`). The file must contain a non-empty `api_key` or `token` entry so the OpenAI helper can authenticate with the Responses API.
- `LANGCHAIN_MODEL_ID` controls the active `tools.langchain_tool.model_id` value (default `gpt-5.1-codex`), while `CODING_TOOL_AGENT` mirrors `tools.coding_tool.agent` (default `codex`). Use the documentation in `docs/agent-os-core-config.md` when updating those sections.
- `package_deploy.sh` now copies the configured auth file into both `$SERVER_PATH/.codex` and `$SERVER_PATH/agent_os_chat/.codex` on the remote host before restarting the stack. Make sure your local credentials are fresh before running `npm run deploy`, because that is the file that gets shipped to production.

The new Codex client (`CodexClient`) and configuration helpers live under `backend/src/services/codexClient.ts` and `backend/src/config/openai.ts`, and `npm run test:backend` covers their validation so the runtime fails fast if the credentials or model settings are missing.
