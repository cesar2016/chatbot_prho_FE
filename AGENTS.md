# AGENTS.md — Frontend Prototipe ChatBot

## Commands

- `npm run dev` — Start Vite dev server (HMR enabled)
- `npm run build` — Build: runs `tsc -b` then `vite build` (order matters)
- `npm run lint` — Run Oxlint
- `npm run preview` — Preview the production build

## Build order is critical

`npm run build` runs `tsc -b` **before** `vite build`. Do not reverse this order — TypeScript must emit declarations first.

## Environment variables

Required in `.env` (see `.env.example`):

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase client
- `VITE_N8N_WEBHOOK_URL` — WhatsApp webhook (used in `App.tsx:121`)
- `VITE_VOYAGE_API_KEY` — Voyage AI embedding key (used in `App.tsx:283`, `App.tsx:339`)

Without these, the app renders the login screen only and console-warns on missing webhook.

## Type-aware linting

Current `.oxlintrc.json` does **not** have `typeAware: true`. If you enable it, install `oxlint-tsgolint` and update the config per the README instructions. The tsconfig has `noUnusedLocals`/`noUnusedParameters` enabled.

## Supabase realtime subscriptions

`src/App.tsx:62-83` subscribes to `postgres_changes` on tables: `messages`, `conversations`, `ai_suggestions`. Subscriptions start on mount and clean up on unmount. Do not unmount the channel manually unless you intend to lose real-time updates.

## Import extensions

`tsconfig.app.json` sets `allowImportingTsExtensions: true` and `verbatimModuleSyntax: true`. You can import `.tsx` files from `.ts` (and vice versa). This is intentional for the Vite+bundler setup.

## Dev server port

Vite defaults to `localhost:5173`. No explicit port config in `vite.config.ts`.

## Key app flows (from `src/App.tsx`)

- **Auth**: Login form at `src/App.tsx:369` posts to `http://localhost:8000/api/login`. On success, sets `currentUser`.
- **Chat**: Real-time messages via Supabase; send to n8n webhook via `sendToN8n()`.
- **Knowledge base**: RAG with Voyage AI embeddings; save via `handleSaveKnowledge()`.
- **Test bot**: Modal at `src/App.tsx:718` queries Voyage AI + Supabase `match_documents` RPC.
- **Reset**: `handleResetChats()` deletes all rows from `conversations` and `contacts` (cascade).

## Generated / build artifacts (gitignored)

- `dist/`
- `node_modules/`
- `.env.local` (if created locally)