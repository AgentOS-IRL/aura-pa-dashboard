This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000/aura](http://localhost:3000/aura) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Available routes

The static export now includes two entry points that live under the configured base path (`NEXT_PUBLIC_AURA_BASE_PATH`, default `/aura`):

- `/aura/` renders the assistant experience.
- `/aura/transcript` now renders the global transcript history aggregated from `/aura/transcripts`. The page always fetches the newest entries across every session, surfaces the pagination metadata (`page`, `limit`, `total`, `hasMore`), and lets you browse older data via the Previous/Next controls or hit Refresh for the latest view.

Because the app runs as a static export (`output: "export"`), both routes are built at `npm run build` and must be deployed together so the transcript page can always reach the same backend that the assistant uses.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Assistant session uploads

Each press of **Wake Assistant** generates a fresh session identifier that appears next to the action button and drives the `POST /aura/sessions/{sessionId}/audio` uploads. The built-in status badges report when a chunk is in flight and if an upload fails, so you have real-time feedback while recording.

The UI posts chunks to `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:4000`). Override that value in `.env.local` or your deployment env when your backend runs somewhere else:

```bash
NEXT_PUBLIC_BACKEND_URL=https://aura-pa-backend.internal
```

The frontend also respects `NEXT_PUBLIC_AURA_BASE_PATH`, which should match the backend `AURA_BASE_PATH` value (default `/aura`). Adjust this pair together whenever you deploy behind a different prefix.

To replay or debug manually, you can hit the same endpoint with `curl` or `fetch`:

```bash
curl -X POST "${NEXT_PUBLIC_BACKEND_URL:-http://localhost:4000}/aura/sessions/<session-id>/audio" \\
  -F "audio=@/path/to/chunk.wav" \\
  -H "Content-Type: multipart/form-data"
```

## Static build artifact

`npm run build` executes the Next.js production build followed by `next export` (the project is configured with `output: "export"`), emitting the static bundle into `frontend/out` by default. Because the dashboard uses a `/aura` base path, the exported entry points live under `frontend/out/aura`, so the backend runtime must serve that subdirectory via `express.static()` plus the SPA fallback. You can rename the root output folder by setting `FRONTEND_BUILD_DIR`, but keep the matching base-path subdirectory so the deploy script pushes the files the backend expects.

## Favicon

The canonical favicon resides at `src/app/favicon.ico`, which Next.js App Router picks up automatically. Metadata in `layout.tsx` also points to supplemental PNG exports in `public/` (`apple-touch-icon.png`, `icon-192x192.png`, and `icon-512x512.png`). When the design needs refreshing, replace those files with new source assets so both the favicon and metadata stay in sync.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
