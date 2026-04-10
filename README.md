# aura-pa-dashboard

## Responsive Layout Notes

- `frontend/src/app/page.tsx` now provides a stacked landing shell with `responsive-card-padding`, tightened text sizes, and section wrappers so the hero and assistant panels stay readable on narrow viewports.
- `frontend/src/app/components/Assistant.tsx` uses responsive paddings, a scaled mic indicator, a full-width touch-friendly action button, and card/grid tweaks (timestamp/audio stack, `w-full min-w-0`) to avoid overflow while keeping the desktop polish.
- `frontend/src/app/globals.css` introduces a `responsive-card-padding` utility plus a base layer that guarantees `min-height: 100%`, `overscroll-behavior: none`, and consistent `font-feature-settings`, ensuring future sections can reuse the mobile-friendly spacing without guessing which classes to apply.

## Backend Health Service

A new `backend/` workspace hosts an Express service that still exposes `GET /health` plus Swagger UI at `GET /docs`, but now also offers `POST /sessions/{sessionId}/audio` for streaming client recordings into a per-session Redis list. Each audio list is stored under `aura/audio/{sessionId}` with a 3-day TTL, and the backend keeps the uploaded blob in memory before forwarding to Redis. The service runs on `PORT 4000` by default, and `backend/README.md` documents installation, dev/start commands, and the `npm run lint`/`npm run test` automation.
