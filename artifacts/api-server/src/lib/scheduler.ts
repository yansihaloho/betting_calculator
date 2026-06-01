import { fetchAndStoreFromMasterlive } from "./resultsFetcher";
import { logger } from "./logger";

const FETCH_TRIGGERS_WIB_MINUTES = [6, 13 * 60 + 5, 16 * 60 + 5, 19 * 60 + 5, 22 * 60 + 5, 23 * 60 + 5];

const WIB_OFFSET_MINUTES = 7 * 60;

function nowWibMinutes(): number {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + WIB_OFFSET_MINUTES) % (24 * 60);
}

function msUntilNextTrigger(): number {
  const nowMin = nowWibMinutes();
  const diffs = FETCH_TRIGGERS_WIB_MINUTES.map(t => (t > nowMin ? t - nowMin : t + 24 * 60 - nowMin));
  return Math.min(...diffs) * 60 * 1000;
}

function slotLabel(wibMinutes: number): string {
  const h = Math.floor(wibMinutes / 60).toString().padStart(2, "0");
  const m = (wibMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m} WIB`;
}

let _fetchRunning = false;

async function runFetch() {
  if (_fetchRunning) {
    logger.warn("Scheduler: previous fetch still in progress, skipping this trigger");
    return;
  }
  _fetchRunning = true;
  try {
    logger.info("Scheduler: fetching masterlive.net results");
    const draws = await fetchAndStoreFromMasterlive();
    logger.info({ count: draws.length }, "Scheduler: fetch complete");
  } finally {
    _fetchRunning = false;
  }
}

function scheduleNext() {
  const ms = msUntilNextTrigger();
  const nowMin = nowWibMinutes();
  const nextTrigger = FETCH_TRIGGERS_WIB_MINUTES.find(t => t > nowMin) ?? FETCH_TRIGGERS_WIB_MINUTES[0];
  const minutes = Math.round(ms / 60000);

  logger.info(
    { nextTrigger: slotLabel(nextTrigger), inMinutes: minutes },
    "Scheduler: next fetch scheduled"
  );

  setTimeout(async () => {
    await runFetch();
    scheduleNext();
  }, ms);
}

export function startScheduler() {
  logger.info("Scheduler: starting — will fetch masterlive.net 5 min after each draw slot");
  runFetch().catch(err => logger.error({ err }, "Scheduler: initial fetch failed"));
  scheduleNext();
}
