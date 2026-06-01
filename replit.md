# 4D Macau Strategi Dashboard

Kalkulator strategi Toto Macau 4D dengan histori live, analitik prediksi AI, manajemen saldo, dan sinkronisasi data antar perangkat berbasis akun.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/betting-calculator run dev` — run the frontend (port 20840)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite lib declarations (run before api-server typecheck)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run push-github` — push latest changes to GitHub (needs GITHUB_PERSONAL_ACCESS_TOKEN)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Clerk auth setup

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui
- API: Express 5 + Clerk auth + pino logging
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit-managed Clerk (whitelabel)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/betting-calculator/` — React frontend (main dashboard)
- `artifacts/api-server/` — Express API server
- `lib/db/` — Drizzle schema + DB client (source-of-truth: `src/schema/index.ts`)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source-of-truth for API)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod schemas
- `scripts/src/push-to-github.ts` — GitHub push utility

## Architecture decisions

- **Contract-first API**: OpenAPI spec in `lib/api-spec/openapi.yaml` is the ground truth; Orval generates hooks and Zod schemas from it. Do not hand-write API client code.
- **Clerk proxy**: In production, Clerk FAPI requests go through `/api/__clerk` to support custom domains. The proxy is a no-op in development (dev FAPI is hit directly).
- **localStorage + cloud sync**: User strategy data lives in `localStorage` for instant read/write. `DataSync.tsx` syncs to `/api/user/data` on login, every 30s, on blur, and on page hide.
- **Masterlive.net scraper**: HTML-parsed via regex from 3 fallback URLs. Results stored in `lottery_results` table with `(date_key, slot)` unique constraint; bulk-upserted in 50-row chunks.
- **Scheduler**: Server-side cron fires 5 minutes after each WIB draw slot (00:01, 13:00, 16:00, 19:00, 22:00, 23:00).

## Product

- **Live hasil draw** — fetched from masterlive.net, cached 2 min, 905+ records
- **10 mesin prediksi** — Recency, Gap, Markov, Slot Transition, Streak, Momentum, Day+Slot Pattern, Balance, Harmony, Uniform
- **Analisis konsensus** — 5 engine independen dijalankan paralel, hasil dikombinasi
- **Backtesting akurasi** — uji engine terhadap 30 draw terakhir
- **Kelly Criterion** — kalkulator ukuran taruhan optimal
- **Saldo & histori** — pencatatan menang/kalah, kalender bulanan
- **Sinkronisasi akun** — data tersimpan per akun Clerk, sync lintas perangkat
- **Live stream** — jadwal YouTube berdasarkan slot WIB aktif

## User preferences

- Bahasa Indonesia untuk semua UI dan komunikasi
- Dark mode sebagai default, light mode tersedia
- GitHub repo: https://github.com/yansihaloho/betting_calculator

## Gotchas

- **Typecheck libs first**: Jalankan `pnpm run typecheck:libs` sebelum `pnpm --filter @workspace/api-server run typecheck` — lib/db adalah composite package yang perlu di-build terlebih dahulu agar deklarasi tersedia.
- **Clerk dev keys**: Pesan "development keys" di console adalah normal di dev — otomatis pakai production keys saat deployed.
- **Masterlive.net fragility**: Scraper berbasis regex; jika struktur HTML berubah, hasil parsing akan kosong. Monitor log `masterlive.net: no draws parsed`.
- **RESULT_START_DATE**: Hardcoded `"2026-01-01"` di `resultsFetcher.ts` — update jika perlu data historis lebih jauh.
- **DataSync SYNC_KEYS**: Jika tambah state baru ke localStorage, tambahkan juga key-nya ke array `SYNC_KEYS` di `DataSync.tsx` agar sinkron ke cloud.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Replit-managed Clerk setup and proxy configuration
