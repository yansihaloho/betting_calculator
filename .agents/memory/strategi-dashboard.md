---
name: Strategi Dashboard
description: 4D Macau betting calculator — architecture, sharp edges, and audit lessons.
---

# Strategi Dashboard — Durable Notes

**Why:** Non-obvious constraints that cost time to discover.

## TypeScript build order
Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck`.
`lib/db` is a composite lib — api-server references its declarations, which only exist after `tsc --build`.

**How to apply:** Any time an api-server typecheck reports "module has no exported member" for @workspace/db, run typecheck:libs first.

## Bulk upsert in Drizzle ORM
Use `sql\`excluded.column_name\`` to reference the excluded row in `onConflictDoUpdate.set`.
Sequential per-row inserts work but are slow for 900+ rows; chunk to 50.

## Clerk dev-key warning
"Clerk has been loaded with development keys" in console is normal and expected in dev. Not a bug.

## DataSync SYNC_KEYS
Any new localStorage key added to the app must also be added to the `SYNC_KEYS` array in `DataSync.tsx`; otherwise it won't sync to the server.

## push-to-github.ts
`HeadersInit` is a DOM type — not available with `@types/node` only. Use `Record<string, string>` instead.
The incremental push detects changes via `git diff --name-only ${githubBaseSHA}`. Files edited after the last checkpoint won't be detected; push them explicitly.
