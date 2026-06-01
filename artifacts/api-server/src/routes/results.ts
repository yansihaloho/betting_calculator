import { Router } from "express";
import { db } from "@workspace/db";
import { lotteryResultsTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import {
  fetchAndStoreFromMasterlive,
  RESULT_START_DATE,
  TIME_SLOTS,
} from "../lib/resultsFetcher";

const router = Router();

type CachedResult = { rows: ReturnType<typeof rowsToResultFormat>; at: number };
let _resultCache: CachedResult | null = null;
const CACHE_TTL_MS = 2 * 60 * 1000;

let _fetchInFlight: Promise<void> | null = null;

const HARI_ID = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function rowsToResultFormat(rows: { dateKey: string; slot: string; number: string }[]) {
  const byDate: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (!byDate[r.dateKey]) byDate[r.dateKey] = {};
    byDate[r.dateKey][r.slot] = r.number;
  }

  return Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, slots]) => {
      const [yr, mo, dy] = dateKey.split("-").map(Number);
      const d = new Date(Date.UTC(yr, mo - 1, dy, 5, 0, 0));
      const hari = HARI_ID[d.getUTCDay()];
      const tanggal = `${dy} ${BULAN_ID[mo - 1]} ${yr}`;
      return {
        hari,
        tanggal,
        ...Object.fromEntries(TIME_SLOTS.map(s => [s, slots[s] ?? "-"])),
      };
    });
}

router.get("/results/toto-macau", async (req, res) => {
  const now = Date.now();
  const cacheAge = _resultCache ? now - _resultCache.at : Infinity;
  const forceRefresh = req.query.force === "true" || req.query.force === "1";

  if (_resultCache && cacheAge < CACHE_TTL_MS && !forceRefresh) {
    req.log.debug({ cacheAgeMs: cacheAge }, "results: serving from cache");
    res.json({ results: _resultCache.rows, source: "masterlive.net", fetchedAt: new Date(_resultCache.at).toISOString() });
    return;
  }

  if (forceRefresh) {
    req.log.info("results: force-refresh requested, bypassing cache");
  }

  try {
    if (!_fetchInFlight) {
      _fetchInFlight = fetchAndStoreFromMasterlive().then(() => {}).finally(() => { _fetchInFlight = null; });
    }
    await _fetchInFlight;

    const rows = await db
      .select({
        dateKey: lotteryResultsTable.dateKey,
        slot: lotteryResultsTable.slot,
        number: lotteryResultsTable.number,
      })
      .from(lotteryResultsTable)
      .where(gte(lotteryResultsTable.dateKey, RESULT_START_DATE))
      .orderBy(desc(lotteryResultsTable.dateKey), desc(lotteryResultsTable.slot));

    const results = rowsToResultFormat(rows);
    _resultCache = { rows: results, at: now };

    req.log.info({ count: results.length }, "results: cache refreshed");
    res.json({ results, source: "masterlive.net", fetchedAt: new Date(now).toISOString() });
  } catch (err) {
    if (_resultCache) {
      req.log.warn({ err }, "results: fetch failed, serving stale cache");
      res.json({ results: _resultCache.rows, source: "masterlive.net (stale)", fetchedAt: new Date(_resultCache.at).toISOString() });
      return;
    }
    req.log.error({ err }, "Failed to fetch toto macau results");
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

export default router;
