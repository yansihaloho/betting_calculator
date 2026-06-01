import { db } from "@workspace/db";
import { lotteryResultsTable } from "@workspace/db";
import { logger } from "./logger";

export const RESULT_START_DATE = "2026-01-01";

export const TIME_SLOTS = ["00:01","13:00","16:00","19:00","22:00","23:00"];

export interface ParsedDraw { dateKey: string; slot: string; number: string }

const BULAN_MAP: Record<string, string> = {
  januari:"01", februari:"02", maret:"03", april:"04",
  mei:"05", juni:"06", juli:"07", agustus:"08",
  september:"09", oktober:"10", november:"11", desember:"12",
};

function parseIndonesianDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const [, day, monthRaw, year] = m;
  const month = BULAN_MAP[monthRaw.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseMasterliveHTML(html: string): ParsedDraw[] {
  const results: ParsedDraw[] = [];
  try {
    const rowPattern = /<th[^>]*>([\s\S]*?)<\/th>((?:\s*<td[^>]*>[\s\S]*?<\/td>){1,6})/gi;
    let match: RegExpExecArray | null;

    while ((match = rowPattern.exec(html)) !== null) {
      const thText = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const dateKey = parseIndonesianDate(thText);
      if (!dateKey) continue;
      if (dateKey < RESULT_START_DATE) continue;

      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const tdHtml = match[2];
      const values: string[] = [];
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdPattern.exec(tdHtml)) !== null) {
        const val = tdMatch[1].replace(/<[^>]+>/g, "").trim();
        values.push(val);
      }

      for (let i = 0; i < values.length && i < TIME_SLOTS.length; i++) {
        const v = values[i];
        if (v && v !== "-" && /^\d{4}$/.test(v)) {
          results.push({ dateKey, slot: TIME_SLOTS[i], number: v });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "parseMasterliveHTML: error during parsing");
  }
  return results;
}

const FETCH_URLS = [
  "https://masterlive.net/data-totomacau-lengkap-2026.php",
  "https://masterlive.net/data-totomacau-2026.php",
  "https://masterlive.net/totomacau.php",
];

async function fetchHtmlFromMasterlive(): Promise<string | null> {
  for (const url of FETCH_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Referer": "https://masterlive.net/",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, url }, "masterlive.net URL returned non-OK");
        continue;
      }
      const html = await res.text();
      const draws = parseMasterliveHTML(html);
      if (draws.length === 0) {
        logger.warn({ url }, "masterlive.net: no draws parsed, trying next URL");
        continue;
      }
      logger.info({ url, count: draws.length }, "masterlive.net: successfully fetched from URL");
      return html;
    } catch (err) {
      logger.warn({ err, url }, "masterlive.net: URL fetch failed, trying next");
    }
  }
  logger.error("masterlive.net: all URLs failed");
  return null;
}

export async function fetchAndStoreFromMasterlive(): Promise<ParsedDraw[]> {
  try {
    const html = await fetchHtmlFromMasterlive();
    if (!html) return [];
    const draws = parseMasterliveHTML(html);
    if (draws.length === 0) {
      logger.warn("masterlive.net: no draws parsed from HTML");
      return [];
    }

    for (const draw of draws) {
      await db.insert(lotteryResultsTable).values({
        dateKey: draw.dateKey,
        slot: draw.slot,
        number: draw.number,
      }).onConflictDoUpdate({
        target: [lotteryResultsTable.dateKey, lotteryResultsTable.slot],
        set: { number: draw.number },
      });
    }

    logger.info({ count: draws.length }, "masterlive.net: draws stored to DB");
    return draws;
  } catch (err) {
    logger.error({ err }, "masterlive.net: fetch/store failed");
    return [];
  }
}
