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
The incremental push detects changes via `git diff --name-only ${githubBaseSHA}`. Files edited after the last checkpoint won't be detected; push them explicitly via the inline node script pattern.

## SmartPredictionV2 architecture (12 engine)
`prediksi2` menu → SmartPredictionV2.tsx. 12 engines: E01 multi-window recency, E02 Poisson gap,
E03 2nd-order Markov, E04 slot transition+, E05 day×slot, E06 momentum+accel, E07 cross-pos corr,
E08 cyclic, E09 hot/cold, E10 balance, E11 sum pattern, E12 repeat pattern.
Confidence = Borda count voting agreement across engines, not ad-hoc formula.

## softmax / normalise pattern
Both `normalise` (max=1 scaling) and `softmax` (temperature-controlled probability) are defined in SmartPredictionV2.
Use `normalise` for engine score arrays; `softmax` is available for probability-ranked output.
