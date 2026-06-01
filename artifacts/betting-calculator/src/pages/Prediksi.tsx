import React, { useState, useMemo, useEffect } from "react";
import {
  Brain, Zap, Star, Flame, Snowflake, Clock,
  ChevronDown, ChevronRight, AlertCircle, Info,
  CheckCircle, TrendingUp, ArrowRight, Hash, Target,
  BarChart2, Calendar
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_LABELS: Record<string, string> = {
  "00:01": "Tengah Malam",
  "13:00": "Siang",
  "16:00": "Sore",
  "19:00": "Malam",
  "22:00": "Malam Akhir",
  "23:00": "Dini Hari",
};

const SHIO_TABLE: { name: string; emoji: string; numbers: string[] }[] = [
  { name: "Ular",    emoji: "🐍", numbers: ["01","13","25","37","49","61","73","85","97"] },
  { name: "Naga",    emoji: "🐉", numbers: ["02","14","26","38","50","62","74","86","98"] },
  { name: "Kelinci", emoji: "🐰", numbers: ["03","15","27","39","51","63","75","87","99"] },
  { name: "Harimau", emoji: "🐯", numbers: ["04","16","28","40","52","64","76","88","00"] },
  { name: "Kerbau",  emoji: "🐃", numbers: ["05","17","29","41","53","65","77","89"] },
  { name: "Tikus",   emoji: "🐭", numbers: ["06","18","30","42","54","66","78","90"] },
  { name: "Babi",    emoji: "🐷", numbers: ["07","19","31","43","55","67","79","91"] },
  { name: "Anjing",  emoji: "🐶", numbers: ["08","20","32","44","56","68","80","92"] },
  { name: "Ayam",    emoji: "🐔", numbers: ["09","21","33","45","57","69","81","93"] },
  { name: "Monyet",  emoji: "🐵", numbers: ["10","22","34","46","58","70","82","94"] },
  { name: "Kambing", emoji: "🐑", numbers: ["11","23","35","47","59","71","83","95"] },
  { name: "Kuda",    emoji: "🐴", numbers: ["12","24","36","48","60","72","84","96"] },
];

function getShio(num2d: string) {
  return SHIO_TABLE.find(s => s.numbers.includes(num2d)) || { name: "?", emoji: "❓", numbers: [] };
}

// ─── Analysis Data Builder ──────────────────────────────────────────────────
interface AnalysisData {
  // chain[prevSlot][prev2D][nextSlot][next2D] = count
  chain: Record<string, Record<string, Record<string, Record<string, number>>>>;
  // slotFreq[slot][2D] = count
  slotFreq: Record<string, Record<string, number>>;
  // gapMap[slot][2D] = array of draw-index gaps (distance between consecutive appearances)
  gapData: Record<string, Record<string, { appearances: number[]; currentGap: number; avgGap: number }>>;
  // dayPattern[slot][dayOfWeek(0=Sun)][2D] = count
  dayPattern: Record<string, Record<number, Record<string, number>>>;
  totalDrawsBySlot: Record<string, number>;
  totalRows: number;
}

function buildAnalysisData(rows: ResultRow[]): AnalysisData {
  const chain: AnalysisData["chain"] = {};
  const slotFreq: AnalysisData["slotFreq"] = {};
  const appearances: Record<string, Record<string, number[]>> = {}; // slot → 2D → list of row indices
  const dayPattern: AnalysisData["dayPattern"] = {};
  const totalDrawsBySlot: Record<string, number> = {};

  // Day name → day index (0=Sun)
  const DAY_IDX: Record<string, number> = {
    "Minggu": 0, "Senin": 1, "Selasa": 2, "Rabu": 3,
    "Kamis": 4, "Jumat": 5, "Sabtu": 6
  };

  rows.forEach((row, rowIdx) => {
    const dayIdx = DAY_IDX[row.hari] ?? -1;

    TIME_SLOTS.forEach((slot, si) => {
      const v = String(row[slot] || "");
      if (!/^\d{4}$/.test(v)) return;
      const two = v.slice(-2);

      // Slot frequency
      if (!slotFreq[slot]) slotFreq[slot] = {};
      slotFreq[slot][two] = (slotFreq[slot][two] || 0) + 1;
      totalDrawsBySlot[slot] = (totalDrawsBySlot[slot] || 0) + 1;

      // Appearance index for gap calc
      if (!appearances[slot]) appearances[slot] = {};
      if (!appearances[slot][two]) appearances[slot][two] = [];
      appearances[slot][two].push(rowIdx);

      // Day pattern
      if (dayIdx >= 0) {
        if (!dayPattern[slot]) dayPattern[slot] = {};
        if (!dayPattern[slot][dayIdx]) dayPattern[slot][dayIdx] = {};
        dayPattern[slot][dayIdx][two] = (dayPattern[slot][dayIdx][two] || 0) + 1;
      }

      // Build forward chain: this slot → next slot
      const nextSlot = TIME_SLOTS[si + 1];
      if (nextSlot) {
        const nv = String(row[nextSlot] || "");
        if (/^\d{4}$/.test(nv)) {
          const next2D = nv.slice(-2);
          if (!chain[slot]) chain[slot] = {};
          if (!chain[slot][two]) chain[slot][two] = {};
          if (!chain[slot][two][nextSlot]) chain[slot][two][nextSlot] = {};
          chain[slot][two][nextSlot][next2D] = (chain[slot][two][nextSlot][next2D] || 0) + 1;
        }
      }
    });
  });

  // Calculate gap data
  const gapData: AnalysisData["gapData"] = {};
  const totalRows = rows.length;

  TIME_SLOTS.forEach(slot => {
    gapData[slot] = {};
    for (let n = 0; n <= 99; n++) {
      const two = String(n).padStart(2, "0");
      const appList = appearances[slot]?.[two] || [];
      if (appList.length === 0) {
        gapData[slot][two] = { appearances: [], currentGap: totalRows, avgGap: totalRows };
        continue;
      }
      // appList is sorted newest-first (row 0 = most recent)
      const currentGap = appList[0]; // rows since last appearance (row 0 = just appeared)
      const gaps: number[] = [];
      for (let i = 0; i < appList.length - 1; i++) {
        gaps.push(appList[i + 1] - appList[i]);
      }
      const avgGap = gaps.length > 0
        ? gaps.reduce((a, b) => a + b, 0) / gaps.length
        : totalRows / Math.max(appList.length, 1);
      gapData[slot][two] = { appearances: appList, currentGap, avgGap };
    }
  });

  return { chain, slotFreq, gapData, dayPattern, totalDrawsBySlot, totalRows };
}

// ─── Prediction Engine ─────────────────────────────────────────────────────
interface PredictionFactor {
  name: string;
  score: number;     // 0–100
  weight: number;
  evidence: string;
  sampleCount: number;
}

interface NumberPrediction {
  num2d: string;
  totalScore: number;
  rank: number;
  shio: ReturnType<typeof getShio>;
  factors: PredictionFactor[];
  confidence: "tinggi" | "sedang" | "rendah";
}

interface SlotPrediction {
  slot: string;
  label: string;
  actual: string | null;
  isKnown: boolean;
  prevSlot: string | null;
  prevNum: string | null;
  chainSampleCount: number;
  predictions: NumberPrediction[];
}

function predictSlot(
  slot: string,
  prevSlot: string | null,
  prevNum: string | null,
  todayDayIdx: number,
  ad: AnalysisData,
  topN = 8
): { predictions: NumberPrediction[]; chainSampleCount: number } {
  const ALL_NUMS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

  // ── Factor weights
  const W_CHAIN   = 0.45; // slot-to-slot transition
  const W_GAP     = 0.25; // due/gap analysis
  const W_SLOTFREQ = 0.20; // slot-specific frequency
  const W_DAY     = 0.10; // day-of-week pattern

  // Chain data for this transition
  const chainData = prevSlot && prevNum
    ? ad.chain[prevSlot]?.[prevNum]?.[slot] || {}
    : {};
  const chainTotal = Object.values(chainData).reduce((a, b) => a + b, 0);

  // Slot frequency data
  const slotFreqData = ad.slotFreq[slot] || {};
  const slotTotal = ad.totalDrawsBySlot[slot] || 1;

  // Day pattern data
  const dayData = todayDayIdx >= 0 ? (ad.dayPattern[slot]?.[todayDayIdx] || {}) : {};
  const dayTotal = Object.values(dayData).reduce((a, b) => a + b, 0) || 1;

  const scored: NumberPrediction[] = ALL_NUMS.map(num => {
    const factors: PredictionFactor[] = [];

    // ── Factor 1: Transition chain ──────────────────────────
    const chainCount = chainData[num] || 0;
    const chainPct   = chainTotal > 0 ? chainCount / chainTotal : 0;
    let chainScore   = 0;
    let chainEvidence = "";

    if (chainTotal >= 5 && prevSlot && prevNum) {
      // Direct match: normalize so top candidate = ~100
      const maxChainCount = Math.max(...Object.values(chainData), 1);
      chainScore = (chainCount / maxChainCount) * 100;
      chainEvidence = chainCount > 0
        ? `Saat slot ${prevSlot} = ${prevNum}, nomor ${num} muncul ${chainCount}x dari ${chainTotal} situasi serupa (${Math.round(chainPct * 100)}%)`
        : `Belum pernah muncul setelah ${prevSlot}=${prevNum} (${chainTotal} situasi historis)`;
    } else if (prevSlot && prevNum) {
      // Not enough chain data — try head-digit broadening
      const head = prevNum[0];
      let broadCount = 0; let broadTotal = 0;
      const broadSlot = ad.chain[prevSlot] || {};
      Object.entries(broadSlot).forEach(([k, nexts]) => {
        if (k[0] === head) {
          broadTotal += Object.values(nexts[slot] || {}).reduce((a, b) => a + b, 0);
          broadCount += (nexts[slot]?.[num] || 0);
        }
      });
      const maxBroad = Math.max(...Object.entries(broadSlot)
        .filter(([k]) => k[0] === head)
        .flatMap(([, nexts]) => Object.values(nexts[slot] || {})), 1);
      chainScore = broadTotal >= 3 ? (broadCount / maxBroad) * 80 : 0;
      chainEvidence = broadTotal >= 3
        ? `Pola kepala "${head}x" di slot ${prevSlot}: nomor ${num} muncul ${broadCount}x dari ${broadTotal} situasi (kepala ${head})`
        : `Data rantai tidak cukup dari slot ${prevSlot} (< 5 sampel)`;
    } else {
      chainEvidence = "Slot pertama — tidak ada data rantai sebelumnya";
    }
    factors.push({ name: "Rantai Slot", score: chainScore, weight: W_CHAIN, evidence: chainEvidence, sampleCount: chainTotal });

    // ── Factor 2: Gap / Due analysis ────────────────────────
    const gd = ad.gapData[slot]?.[num] || { currentGap: 99, avgGap: 99, appearances: [] };
    let gapScore = 0;
    let gapEvidence = "";

    if (gd.appearances.length > 0) {
      // Score increases as currentGap approaches and exceeds avgGap
      const ratio = gd.currentGap / Math.max(gd.avgGap, 1);
      // ratio=0 (just appeared): low score; ratio=1 (exactly at avg): 50; ratio=2 (2x overdue): 100
      gapScore = Math.min(ratio * 50, 100);
      if (gd.currentGap === 0) {
        gapEvidence = `Muncul pada draw terakhir di slot ${slot} — frekuensi tinggi`;
      } else {
        gapEvidence = `Belum muncul ${gd.currentGap} draw di slot ${slot} · Rata-rata kemunculan setiap ${gd.avgGap.toFixed(1)} draw${ratio >= 1.5 ? " → SUDAH LEWAT WAKTU" : ratio >= 1 ? " → tepat di rata-rata" : " → masih terlalu cepat"}`;
      }
    } else {
      gapScore = 80; // never appeared = very overdue
      gapEvidence = `Belum pernah muncul di slot ${slot} dari ${ad.totalRows} hari data — sangat jarang`;
    }
    factors.push({ name: "Analisis Gap/Due", score: gapScore, weight: W_GAP, evidence: gapEvidence, sampleCount: gd.appearances.length });

    // ── Factor 3: Slot-specific frequency ───────────────────
    const sfCount = slotFreqData[num] || 0;
    const sfPct   = sfCount / slotTotal;
    const maxSf   = Math.max(...Object.values(slotFreqData), 1);
    const slotFreqScore = (sfCount / maxSf) * 100;
    const sfEvidence = sfCount > 0
      ? `Frekuensi historis di slot ${slot}: ${sfCount}x dari ${slotTotal} draw (${(sfPct * 100).toFixed(1)}%)`
      : `Belum pernah muncul di slot ${slot}`;
    factors.push({ name: "Frekuensi Slot", score: slotFreqScore, weight: W_SLOTFREQ, evidence: sfEvidence, sampleCount: slotTotal });

    // ── Factor 4: Day-of-week pattern ────────────────────────
    const dayCount = dayData[num] || 0;
    const dayPct   = dayCount / dayTotal;
    // Expected if uniform: 1/7 ≈ 14.3%
    const dayLift  = (dayPct / (1 / 7)); // 1.0 = uniform, >1 = above expected
    const dayScore = Math.min((dayLift / 3) * 100, 100); // capped at 3x lift = 100
    const DAY_NAMES = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const todayName = todayDayIdx >= 0 ? DAY_NAMES[todayDayIdx] : "hari ini";
    const dayEvidence = dayCount > 0
      ? `Muncul ${dayCount}x di hari ${todayName} pada slot ${slot} dari ${dayTotal} total draw hari ini (${(dayPct * 100).toFixed(0)}% vs ekspektasi 14%)`
      : `Belum pernah muncul di hari ${todayName} pada slot ${slot}`;
    factors.push({ name: "Pola Hari", score: dayScore, weight: W_DAY, evidence: dayEvidence, sampleCount: dayCount });

    // ── Weighted total ───────────────────────────────────────
    const totalScore = factors.reduce((acc, f) => acc + f.score * f.weight, 0);

    // ── Confidence based on sample sizes ─────────────────────
    const chainSamples = chainTotal;
    let confidence: NumberPrediction["confidence"];
    if (chainSamples >= 15 && sfCount >= 5) confidence = "tinggi";
    else if (chainSamples >= 5 || sfCount >= 3) confidence = "sedang";
    else confidence = "rendah";

    return { num2d: num, totalScore, rank: 0, shio: getShio(num), factors, confidence };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  const top = scored.slice(0, topN).map((p, i) => ({ ...p, rank: i + 1 }));

  return { predictions: top, chainSampleCount: chainTotal };
}

// ─── Full day analysis ──────────────────────────────────────────────────────
function runFullAnalysis(rows: ResultRow[], ad: AnalysisData): {
  slots: SlotPrediction[];
  todayRow: ResultRow;
  bbfs8: string[];
  topShio: { name: string; emoji: string; count: number; pct: number }[];
  totalDraws: number;
} {
  const todayRow = rows.find(r => TIME_SLOTS.some(s => /^\d{4}$/.test(String(r[s] || "")))) || rows[0];
  const DAY_IDX: Record<string, number> = {
    "Minggu": 0, "Senin": 1, "Selasa": 2, "Rabu": 3,
    "Kamis": 4, "Jumat": 5, "Sabtu": 6
  };
  const todayDayIdx = DAY_IDX[todayRow?.hari ?? ""] ?? -1;

  const slots: SlotPrediction[] = [];
  let lastKnownSlot: string | null = null;
  let lastKnownNum: string | null = null;

  // For BBFS: collect scores across all non-known slots
  const globalScoreAccum: Record<string, number> = {};

  for (const slot of TIME_SLOTS) {
    const raw = String(todayRow?.[slot] || "");
    const isKnown = /^\d{4}$/.test(raw);

    if (isKnown) {
      slots.push({
        slot, label: SLOT_LABELS[slot] || slot,
        actual: raw, isKnown: true,
        prevSlot: lastKnownSlot, prevNum: lastKnownNum,
        chainSampleCount: 0, predictions: [],
      });
      lastKnownSlot = slot;
      lastKnownNum  = raw.slice(-2);
    } else {
      const { predictions, chainSampleCount } = predictSlot(slot, lastKnownSlot, lastKnownNum, todayDayIdx, ad);
      slots.push({
        slot, label: SLOT_LABELS[slot] || slot,
        actual: null, isKnown: false,
        prevSlot: lastKnownSlot, prevNum: lastKnownNum,
        chainSampleCount, predictions,
      });
      // Accumulate for BBFS
      predictions.forEach(p => {
        globalScoreAccum[p.num2d] = (globalScoreAccum[p.num2d] || 0) + p.totalScore;
      });
      // Advance chain using top prediction
      if (predictions[0]) {
        lastKnownSlot = slot;
        lastKnownNum  = predictions[0].num2d;
      }
    }
  }

  // BBFS: top 8 by combined score across all predicted slots
  const bbfs8 = Object.entries(globalScoreAccum)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([num]) => num)
    .sort();

  // Shio analysis from last 30 days
  const recent = rows.slice(0, 30);
  const shioCount: Record<string, number> = {};
  let shioTotal = 0;
  recent.forEach(r => {
    TIME_SLOTS.forEach(s => {
      const v = String(r[s] || "");
      if (/^\d{4}$/.test(v)) {
        const sh = getShio(v.slice(-2));
        shioCount[sh.name] = (shioCount[sh.name] || 0) + 1;
        shioTotal++;
      }
    });
  });
  const topShio = SHIO_TABLE.map(s => ({
    ...s,
    count: shioCount[s.name] || 0,
    pct: Math.round(((shioCount[s.name] || 0) / (shioTotal || 1)) * 100),
  })).sort((a, b) => b.count - a.count);

  const totalDraws = Object.values(ad.totalDrawsBySlot).reduce((a, b) => a + b, 0);

  return { slots, todayRow, bbfs8, topShio, totalDraws };
}

// ─── Post-Mortem Engine ──────────────────────────────────────────────────────
interface PostMortemSlot {
  slot: string;
  actual4D: string;
  actual2D: string;
  predicted: NumberPrediction[];
  hitRank: number | null;
  topPred: string;
  topCorrect: boolean;
  factorScores: { name: string; topScore: number; actualScore: number; weight: number }[];
  missReason: string | null;
  learnSignal: string;
}

function runPostMortem(rows: ResultRow[]): PostMortemSlot[] {
  if (rows.length < 3) return [];

  // Simulate "yesterday's" prediction: use data excluding today (rows[0])
  const histRows = rows.slice(1);
  const histAd = buildAnalysisData(histRows);
  const todayRow = rows[0];

  const DAY_IDX: Record<string, number> = {
    "Minggu": 0, "Senin": 1, "Selasa": 2, "Rabu": 3,
    "Kamis": 4, "Jumat": 5, "Sabtu": 6,
  };
  const dayIdx = DAY_IDX[todayRow.hari] ?? -1;

  const results: PostMortemSlot[] = [];
  let lastSlot: string | null = null;
  let lastNum:  string | null = null;

  for (const slot of TIME_SLOTS) {
    const v = String(todayRow[slot] || "");
    if (!/^\d{4}$/.test(v)) { continue; }

    const actual2D = v.slice(-2);
    const { predictions } = predictSlot(slot, lastSlot, lastNum, dayIdx, histAd, 12);

    const hitIdx = predictions.findIndex(p => p.num2d === actual2D);
    const hit    = hitIdx >= 0;
    const topPred = predictions[0]?.num2d ?? "??";

    // Factor scores: top prediction vs what actual number scored on each factor
    const topFactors    = predictions[0]?.factors ?? [];
    const actualFactors = predictions.find(p => p.num2d === actual2D)?.factors ?? topFactors.map(f => ({ ...f, score: 0 }));

    const factorScores = topFactors.map((tf, fi) => ({
      name: tf.name,
      topScore:    Math.round(tf.score),
      actualScore: Math.round(actualFactors[fi]?.score ?? 0),
      weight: tf.weight,
    }));

    // Why wrong and learning signal
    let missReason: string | null = null;
    let learnSignal = "";

    if (hit && hitIdx === 0) {
      learnSignal = `✅ Prediksi #1 tepat! Engine berhasil menunjuk ${actual2D} sebagai kandidat teratas.`;
    } else if (hit && hitIdx <= 2) {
      learnSignal = `✅ Nomor ${actual2D} masuk top 3 (rank #${hitIdx + 1}) — prediksi cukup akurat.`;
    } else if (hit) {
      learnSignal = `⚠️ Nomor ${actual2D} ada di rank #${hitIdx + 1} — masuk prediksi tapi kurang diprioritaskan.`;
      const chainFact = topFactors.find(f => f.name === "Rantai Slot");
      const actualChainFact = actualFactors.find(f => f.name === "Rantai Slot");
      if (chainFact && (actualChainFact?.score ?? 0) > chainFact.score) {
        missReason = `Faktor Rantai Slot lebih kuat untuk ${actual2D} (${Math.round(actualChainFact?.score ?? 0)}) dibanding nomor prediksi #1 (${Math.round(chainFact.score)}), tapi bobot gabungan memenangkan nomor lain.`;
      } else {
        missReason = `Nomor ${actual2D} kalah di faktor Frekuensi dan Gap dibanding kandidat teratas — gap ratio dan riwayat frekuensinya lebih rendah.`;
      }
    } else {
      // Total miss
      const weakestFactor = factorScores.reduce((a, b) => a.actualScore < b.actualScore ? a : b);
      const chainFact = factorScores.find(f => f.name === "Rantai Slot");
      if (chainFact && chainFact.topScore < 20) {
        missReason = `Data rantai slot sangat minim (${predictions[0]?.factors[0]?.sampleCount ?? 0} sampel) — engine tidak punya referensi transisi yang kuat sehingga jatuh ke faktor frekuensi umum yang meleset.`;
        learnSignal = `📚 Butuh lebih banyak data historis transisi slot ${lastSlot ?? "awal"} → ${slot}. Skor rendah pada Rantai Slot = prediksi kurang andal.`;
      } else {
        missReason = `Nomor ${actual2D} tidak masuk top 12 prediksi. Faktor terlemah untuk nomor ini: ${weakestFactor.name} (hanya ${weakestFactor.actualScore}/100). Engine salah karena pola yang diharapkan tidak terjadi hari ini — bisa jadi hari acak.`;
        learnSignal = `📚 Faktor yang paling tidak akurat: ${weakestFactor.name}. Perlu dicatat bahwa nomor ini mungkin muncul karena pola yang belum ada di data historis.`;
      }
    }

    results.push({
      slot, actual4D: v, actual2D,
      predicted: predictions.slice(0, 8),
      hitRank: hit ? hitIdx + 1 : null,
      topPred, topCorrect: topPred === actual2D,
      factorScores, missReason, learnSignal,
    });

    lastSlot = slot;
    lastNum  = actual2D;
  }

  return results;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Prediksi({ resultData, isDark }: { resultData: ResultRow[]; isDark: boolean }) {
  const [openSection, setOpenSection] = useState<string>("today");
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  const card = isDark
    ? "rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl"
    : "rounded-[24px] border border-slate-200 bg-white shadow-xl";
  const muted = isDark ? "text-white/40" : "text-slate-400";
  const sub   = isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-100";

  // Build analysis data from all historical rows (memoized)
  const ad = useMemo(() => buildAnalysisData(resultData), [resultData]);
  const analysis = useMemo(
    () => resultData.length > 0 ? runFullAnalysis(resultData, ad) : null,
    [resultData, ad]
  );
  // Post-mortem: simulate yesterday's prediction vs today's actual (memoized)
  const postMortem = useMemo(() => runPostMortem(resultData), [resultData]);

  // Auto-expand first predicted slot
  useEffect(() => {
    if (analysis) {
      const first = analysis.slots.find(s => !s.isKnown);
      if (first) setExpandedSlot(first.slot);
    }
  }, [analysis]);

  const toggle = (id: string) => setOpenSection(s => s === id ? "" : id);
  const Divider = () => <div className={`h-px ${isDark ? "bg-white/10" : "bg-slate-100"}`} />;

  const SectionHdr = ({ id, title, sub: subtitle, dot }: { id: string; title: string; sub: string; dot: string }) => (
    <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        <div className="text-left">
          <div className="font-black text-sm">{title}</div>
          <div className={`text-xs mt-0.5 ${muted}`}>{subtitle}</div>
        </div>
      </div>
      {openSection === id
        ? <ChevronDown className={`w-4 h-4 ${muted}`} />
        : <ChevronRight className={`w-4 h-4 ${muted}`} />}
    </button>
  );

  const confidenceStyle = (c: NumberPrediction["confidence"]) => {
    if (c === "tinggi")  return isDark ? "text-green-400 bg-green-500/15 border-green-500/30" : "text-green-700 bg-green-50 border-green-200";
    if (c === "sedang")  return isDark ? "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" : "text-yellow-700 bg-yellow-50 border-yellow-200";
    return isDark ? "text-slate-400 bg-white/5 border-white/10" : "text-slate-500 bg-slate-50 border-slate-200";
  };

  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-20 opacity-40">
        <div className="text-center"><Brain className="w-12 h-12 mx-auto mb-3"/><p>Memuat data hasil...</p></div>
      </div>
    );
  }

  const predictedSlots  = analysis.slots.filter(s => !s.isKnown);
  const knownSlots      = analysis.slots.filter(s => s.isKnown);

  return (
    <div className="animate-slide-up space-y-4">

      {/* ── Hero ── */}
      <div className="rounded-[24px] bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white p-5 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-5 h-5 opacity-80"/>
              <span className="text-xs font-bold opacity-70">ANALISA & PREDIKSI — MULTI-FAKTOR</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Prediksi Toto Macau</h1>
            <p className="text-xs opacity-70 mt-1 max-w-md">
              Engine 4-faktor: Rantai Slot (45%) + Gap/Due Analysis (25%) + Frekuensi Slot (20%) + Pola Hari (10%) · {ad.totalRows} hari data · {analysis.totalDraws} draw
            </p>
          </div>
          <div className={`px-4 py-2 rounded-2xl bg-white/10 border border-white/20 text-right`}>
            <div className="text-xs opacity-60 mb-0.5">Referensi</div>
            <div className="font-black">{analysis.todayRow.hari}</div>
            <div className="text-xs opacity-70">{analysis.todayRow.tanggal}</div>
          </div>
        </div>

        {/* Quick status row */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/20 border border-green-500/30 text-xs font-bold text-green-300">
            <CheckCircle className="w-3.5 h-3.5"/>
            {knownSlots.length} slot diketahui
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">
            <Brain className="w-3.5 h-3.5"/>
            {predictedSlots.length} slot diprediksi
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-white/70">
            <Hash className="w-3.5 h-3.5"/>
            BBFS: {analysis.bbfs8.join("·")}
          </div>
        </div>
      </div>

      {/* ── TODAY'S PREDICTION (main section) ── */}
      <div className={`${card} overflow-hidden`}>
        <SectionHdr id="today" title="Prediksi Hari Ini per Slot" sub="Skor tertimbang 4 faktor — klik nomor untuk lihat alasan lengkap" dot="bg-yellow-400" />
        {openSection === "today" && (
          <>
            <Divider/>
            <div className="p-4 space-y-3">
              {analysis.slots.map((sl, idx) => (
                <SlotCard
                  key={sl.slot}
                  sl={sl}
                  idx={idx}
                  isDark={isDark}
                  card={card}
                  sub={sub}
                  muted={muted}
                  expanded={expandedSlot === sl.slot}
                  onToggle={() => setExpandedSlot(e => e === sl.slot ? null : sl.slot)}
                  confidenceStyle={confidenceStyle}
                  analysis={analysis}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── BBFS 8 DIGIT ── */}
      <div className={`${card} overflow-hidden`}>
        <SectionHdr id="bbfs" title="BBFS 8 Digit" sub="Gabungan skor tertinggi dari semua slot yang diprediksi" dot="bg-blue-400" />
        {openSection === "bbfs" && (
          <>
            <Divider/>
            <div className="p-5">
              <div className="flex flex-wrap gap-3 mb-4">
                {analysis.bbfs8.map((num, i) => (
                  <div key={num} className="flex flex-col items-center gap-1">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                      i < 3 ? "bg-gradient-to-br from-blue-500 to-cyan-500 shadow-blue-500/30"
                      : i < 6 ? isDark ? "bg-white/20" : "bg-slate-200"
                      : isDark ? "bg-white/10" : "bg-slate-100"
                    }`}>
                      <span className={`text-xl font-black ${i < 3 ? "text-white" : isDark ? "text-white" : "text-slate-700"}`}>{num}</span>
                    </div>
                    <span className={`text-[10px] ${muted}`}>{getShio(num).emoji}</span>
                    <span className={`text-[9px] font-bold ${muted}`}>#{i+1}</span>
                  </div>
                ))}
              </div>
              <div className={`px-4 py-3 rounded-2xl font-mono font-black text-center text-lg tracking-widest ${isDark ? "bg-blue-500/10 border border-blue-500/20 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-700"}`}>
                {analysis.bbfs8.join(" * ")}
              </div>
              <div className={`mt-3 text-xs text-center ${muted}`}>
                {analysis.bbfs8.length} angka · {analysis.bbfs8.length >= 4 ? (
                  [4,5,6].map(k => {
                    const n = analysis.bbfs8.length;
                    const perms = [
                      Math.round(n*(n-1)*(n-2)*(n-3)/24),
                      Math.round(n*(n-1)*(n-2)*(n-3)*(n-4)/120),
                      Math.round(n*(n-1)*(n-2)*(n-3)*(n-4)*(n-5)/720),
                    ];
                    return `${perms[k-4]} kombinasi ${k}D`;
                  }).join(" · ")
                ) : ""}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── POST-MORTEM & BELAJAR DARI KESALAHAN ── */}
      {postMortem.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <SectionHdr
            id="postmortem"
            title="Evaluasi Prediksi & Belajar dari Kesalahan"
            sub={`Simulasi prediksi kemarin vs hasil aktual — ${postMortem.filter(p => (p.hitRank ?? 99) <= 3).length}/${postMortem.length} slot top-3 akurat`}
            dot={postMortem.filter(p => (p.hitRank ?? 99) <= 3).length >= postMortem.length / 2 ? "bg-green-400" : "bg-orange-400"}
          />
          {openSection === "postmortem" && (
            <>
              <Divider/>
              <div className="p-4 space-y-4">

                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Tepat #1", val: postMortem.filter(p => p.hitRank === 1).length, color: "text-green-400", bg: isDark ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200" },
                    { label: "Top 3 Hit", val: postMortem.filter(p => (p.hitRank ?? 99) <= 3).length, color: "text-blue-400", bg: isDark ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-200" },
                    { label: "Tidak Masuk", val: postMortem.filter(p => p.hitRank === null).length, color: "text-red-400", bg: isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-2xl p-3 border text-center ${s.bg}`}>
                      <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                      <div className={`text-[10px] font-bold ${muted} mt-0.5`}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Per-slot evaluation */}
                {postMortem.map(pm => {
                  const hitColor = pm.hitRank === 1
                    ? isDark ? "border-green-500/40 bg-green-500/5" : "border-green-200 bg-green-50"
                    : pm.hitRank !== null && pm.hitRank <= 3
                    ? isDark ? "border-blue-500/40 bg-blue-500/5" : "border-blue-200 bg-blue-50"
                    : pm.hitRank !== null
                    ? isDark ? "border-yellow-500/40 bg-yellow-500/5" : "border-yellow-200 bg-yellow-50"
                    : isDark ? "border-red-500/30 bg-red-500/5" : "border-red-100 bg-red-50/60";

                  const hitIcon = pm.hitRank === 1 ? "🎯" : pm.hitRank !== null && pm.hitRank <= 3 ? "✅" : pm.hitRank !== null ? "⚠️" : "❌";

                  return (
                    <div key={pm.slot} className={`rounded-[18px] border p-4 space-y-3 ${hitColor}`}>
                      {/* Header */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-black ${isDark ? "bg-white/15 text-white" : "bg-slate-800 text-white"}`}>
                          {pm.slot}
                        </div>
                        <span className="text-lg">{hitIcon}</span>
                        <div>
                          <div className="text-xs font-black">
                            Aktual: <span className="font-mono text-base">{pm.actual4D}</span>
                            <span className={`ml-2 ${muted}`}>(2D: {pm.actual2D})</span>
                          </div>
                          <div className={`text-[10px] ${muted}`}>
                            {pm.hitRank === null
                              ? `Tidak masuk top 12 prediksi · Prediksi #1: ${pm.topPred}`
                              : pm.hitRank === 1
                              ? `✅ Prediksi #1 TEPAT SASARAN!`
                              : `Nomor ada di rank #${pm.hitRank} dari 12 prediksi · Prediksi #1: ${pm.topPred}`
                            }
                          </div>
                        </div>
                      </div>

                      {/* Predicted numbers grid */}
                      <div>
                        <div className={`text-[10px] font-bold uppercase tracking-wide ${muted} mb-1.5`}>Prediksi yang dihasilkan engine:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {pm.predicted.map((p, pi) => {
                            const isActual = p.num2d === pm.actual2D;
                            return (
                              <div key={p.num2d} className={`px-2 py-1 rounded-lg text-xs font-black font-mono flex items-center gap-1 ${
                                isActual
                                  ? "bg-green-500 text-white ring-2 ring-green-400"
                                  : pi === 0
                                  ? isDark ? "bg-purple-600/80 text-white" : "bg-purple-100 text-purple-800"
                                  : isDark ? "bg-white/10 text-white/60" : "bg-slate-100 text-slate-600"
                              }`}>
                                #{pi+1} {p.num2d}
                                {isActual && <span className="text-[9px]">←KELUAR</span>}
                              </div>
                            );
                          })}
                          {pm.hitRank === null && (
                            <div className="px-2 py-1 rounded-lg text-xs font-black font-mono bg-red-500 text-white">
                              {pm.actual2D} tidak ada ↑
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Factor breakdown: top pred vs actual */}
                      <div>
                        <div className={`text-[10px] font-bold uppercase tracking-wide ${muted} mb-1.5`}>
                          Perbandingan skor faktor — Prediksi #1 ({pm.topPred}) vs Aktual ({pm.actual2D}):
                        </div>
                        <div className="space-y-1.5">
                          {pm.factorScores.map(f => {
                            const topWider = f.topScore >= f.actualScore;
                            return (
                              <div key={f.name} className={`rounded-xl p-2.5 ${isDark ? "bg-white/5" : "bg-white/80"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold ${muted}`}>{f.name} (bobot {Math.round(f.weight*100)}%)</span>
                                  <span className={`text-[10px] font-black ${topWider ? (isDark ? "text-purple-300" : "text-purple-700") : "text-green-400"}`}>
                                    {pm.topPred}: {f.topScore}/100 · {pm.actual2D}: {f.actualScore}/100
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  {[{ label: pm.topPred, score: f.topScore, color: "bg-purple-500" }, { label: pm.actual2D, score: f.actualScore, color: "bg-green-500" }].map(bar => (
                                    <div key={bar.label} className="flex items-center gap-2">
                                      <span className={`w-6 text-[9px] font-black text-right ${muted}`}>{bar.label}</span>
                                      <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}>
                                        <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.score}%` }}/>
                                      </div>
                                      <span className={`text-[9px] font-black w-6 ${muted}`}>{bar.score}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Miss reason + learning signal */}
                      {pm.missReason && (
                        <div className={`rounded-xl p-3 text-xs ${isDark ? "bg-orange-500/10 border border-orange-500/20 text-orange-300" : "bg-orange-50 border border-orange-200 text-orange-800"}`}>
                          <div className="font-black mb-1">🔍 Kenapa meleset?</div>
                          <p className="leading-relaxed">{pm.missReason}</p>
                        </div>
                      )}
                      <div className={`rounded-xl p-3 text-xs ${isDark ? "bg-white/5 border border-white/10 text-white/70" : "bg-slate-50 border border-slate-200 text-slate-700"}`}>
                        <div className="font-black mb-1">📚 Pelajaran untuk putaran berikutnya:</div>
                        <p className="leading-relaxed">{pm.learnSignal}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Overall accuracy insight */}
                <div className={`rounded-2xl p-4 ${isDark ? "bg-violet-500/10 border border-violet-500/20" : "bg-violet-50 border border-violet-200"}`}>
                  <div className={`font-black text-sm mb-2 ${isDark ? "text-violet-300" : "text-violet-800"}`}>
                    🧠 Insight Akurasi Engine
                  </div>
                  <div className={`text-xs space-y-1 ${isDark ? "text-violet-300/80" : "text-violet-700"}`}>
                    {(() => {
                      const hits1 = postMortem.filter(p => p.hitRank === 1).length;
                      const hits3 = postMortem.filter(p => (p.hitRank ?? 99) <= 3).length;
                      const hits8 = postMortem.filter(p => (p.hitRank ?? 99) <= 8).length;
                      const total = postMortem.length;
                      const hitRate3 = total > 0 ? Math.round(hits3 / total * 100) : 0;
                      return (
                        <>
                          <p>• Akurasi top-1: {hits1}/{total} slot ({Math.round(hits1/total*100)}%)</p>
                          <p>• Akurasi top-3: {hits3}/{total} slot ({hitRate3}%) — {"target ideal ≥ 50%"}</p>
                          <p>• Akurasi top-8: {hits8}/{total} slot ({Math.round(hits8/total*100)}%) — {"target ideal ≥ 80%"}</p>
                          <p className="mt-1 font-bold">
                            {hitRate3 >= 70 ? "🟢 Engine sangat akurat hari ini — data historis representatif."
                             : hitRate3 >= 40 ? "🟡 Akurasi sedang — pola ada tapi ada faktor acak yang memengaruhi."
                             : "🔴 Akurasi rendah — kemungkinan hari acak atau pola sedang berubah. Waspadai taruhan berlebih."}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* ── SHIO ── */}
      <div className={`${card} overflow-hidden`}>
        <SectionHdr id="shio" title="Analisa Shio (30 Hari)" sub="Zodiak 12 shio berdasarkan frekuensi 2D terakhir" dot="bg-red-400" />
        {openSection === "shio" && (
          <>
            <Divider/>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {analysis.topShio.slice(0, 6).map((s, i) => (
                  <div key={s.name} className={`p-3.5 rounded-2xl flex items-center gap-3 ${i === 0 ? isDark ? "bg-red-500/20 border border-red-500/30" : "bg-red-50 border border-red-200" : sub}`}>
                    <div className="text-2xl">{s.emoji}</div>
                    <div className="min-w-0 flex-1">
                      {i === 0 && <div className="text-[10px] text-yellow-400 font-bold mb-0.5">TERPANAS</div>}
                      <div className={`font-black text-sm ${i === 0 ? "text-red-400" : ""}`}>{s.name}</div>
                      <div className={`text-xs ${muted}`}>{s.count}x · {s.pct}%</div>
                    </div>
                    <div className={`w-8 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"} ml-auto`}>
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${(s.count / (analysis.topShio[0]?.count || 1)) * 100}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={analysis.topShio.slice(0, 8)} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}/>
                  <YAxis tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}/>
                  <Tooltip contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 11 }}/>
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {analysis.topShio.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#ef4444" : i <= 2 ? "#f97316" : "#8b5cf6"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className={`p-4 rounded-[20px] ${sub} text-xs`}>
        <div className="flex items-start gap-2">
          <AlertCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${muted}`}/>
          <span className={muted}>
            Analisa dari {ad.totalRows} hari · {analysis.totalDraws} total draw. Skor prediksi dihitung dari 4 faktor statistik historis. Lotere bersifat acak — prediksi ini adalah estimasi probabilistik berdasarkan pola data masa lalu, bukan jaminan.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Slot Card Component ────────────────────────────────────────────────────
function SlotCard({
  sl, idx, isDark, card, sub, muted, expanded, onToggle, confidenceStyle, analysis,
}: {
  sl: SlotPrediction;
  idx: number;
  isDark: boolean;
  card: string;
  sub: string;
  muted: string;
  expanded: boolean;
  onToggle: () => void;
  confidenceStyle: (c: NumberPrediction["confidence"]) => string;
  analysis: { slots: SlotPrediction[] };
}) {
  const [expandedPred, setExpandedPred] = useState<string | null>(null);

  return (
    <div className={`rounded-[18px] overflow-hidden transition-all ${
      sl.isKnown
        ? isDark ? "border border-green-500/20 bg-green-500/5" : "border border-green-200 bg-green-50/50"
        : isDark ? "border border-purple-500/20 bg-purple-500/5" : "border border-purple-100 bg-purple-50/40"
    }`}>
      {/* Header row */}
      <button className="w-full flex items-center gap-3 px-4 py-3" onClick={onToggle}>
        {/* Slot index */}
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
          sl.isKnown ? "bg-green-500 text-white" : "bg-purple-600 text-white"
        }`}>{idx + 1}</div>

        {/* Time */}
        <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-black ${
          sl.isKnown ? "bg-green-600/80 text-white" : "bg-purple-600/80 text-white"
        }`}>{sl.slot}</div>
        <div className={`text-[10px] flex-shrink-0 ${muted}`}>{sl.label}</div>

        {/* Content preview */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 ml-auto justify-end flex-wrap">
          {sl.isKnown ? (
            <>
              <div className={`px-3 py-1 rounded-lg font-black text-base font-mono ${isDark ? "bg-white/15 text-white" : "bg-white text-slate-900 shadow-sm"}`}>
                {sl.actual}
              </div>
              <div className="flex items-center gap-1 text-xs text-green-400 font-bold">
                <CheckCircle className="w-3 h-3"/>Aktual
              </div>
            </>
          ) : (
            <>
              {sl.predictions.slice(0, 3).map((p, pi) => (
                <div key={p.num2d} className={`px-2 py-1 rounded-lg font-black text-sm font-mono ${
                  pi === 0 ? "bg-purple-600 text-white shadow-sm" : isDark ? "bg-white/10 text-white/60" : "bg-white/80 text-slate-700 border border-slate-200"
                }`}>
                  {p.num2d}
                  <span className={`text-[9px] ml-0.5 ${pi === 0 ? "text-white/70" : muted}`}>{Math.round(p.totalScore)}pts</span>
                </div>
              ))}
            </>
          )}
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 ${muted} transition-transform ${expanded ? "" : "-rotate-90"}`}/>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className={`h-px mb-3 ${isDark ? "bg-white/10" : "bg-black/5"}`}/>

          {sl.isKnown ? (
            /* Known slot: show it confirmed the prediction of previous step */
            <div>
              <div className={`text-xs font-bold mb-2 ${muted}`}>Slot {sl.slot} sudah diketahui — data aktual:</div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`px-4 py-2 rounded-xl font-black text-2xl font-mono ${isDark ? "bg-white/10 text-white" : "bg-white text-slate-900 shadow"}`}>{sl.actual}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${muted}`}>2D Ekor:</span>
                    <span className="font-black text-sm">{sl.actual?.slice(-2)}</span>
                    <span className="text-base">{getShio(sl.actual?.slice(-2) || "").emoji}</span>
                    <span className={`text-xs font-bold ${muted}`}>{getShio(sl.actual?.slice(-2) || "").name}</span>
                  </div>
                  {sl.prevNum && sl.prevSlot && (
                    <div className={`text-xs ${muted}`}>
                      Dari rantai: {sl.prevSlot} = {sl.prevNum} → {sl.slot} = {sl.actual?.slice(-2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Predicted slot: show all candidates with factor breakdown */
            <div>
              <div className={`flex items-center gap-2 mb-3`}>
                <div className={`text-xs font-bold ${muted}`}>
                  {sl.prevSlot && sl.prevNum
                    ? `Diprediksi berdasarkan: ${sl.prevSlot} = ${sl.prevNum} → ${sl.slot} (${sl.chainSampleCount} situasi historis serupa)`
                    : `Diprediksi dari frekuensi historis slot ${sl.slot}`}
                </div>
              </div>

              <div className="space-y-2">
                {sl.predictions.map((pred, pi) => (
                  <PredictionRow
                    key={pred.num2d}
                    pred={pred}
                    pi={pi}
                    isDark={isDark}
                    sub={sub}
                    muted={muted}
                    expanded={expandedPred === pred.num2d}
                    onToggle={() => setExpandedPred(e => e === pred.num2d ? null : pred.num2d)}
                    confidenceStyle={confidenceStyle}
                    topScore={sl.predictions[0]?.totalScore || 1}
                  />
                ))}
              </div>

              {/* BBFS for this slot */}
              {sl.predictions.length >= 4 && (
                <div className={`mt-3 px-3 py-2 rounded-xl font-mono font-black text-center text-sm tracking-widest ${isDark ? "bg-purple-500/10 border border-purple-500/20 text-purple-300" : "bg-purple-50 border border-purple-200 text-purple-700"}`}>
                  BBFS slot ini: {sl.predictions.slice(0, 6).map(p => p.num2d).sort().join(" * ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Prediction Row Component ───────────────────────────────────────────────
function PredictionRow({
  pred, pi, isDark, sub, muted, expanded, onToggle, confidenceStyle, topScore,
}: {
  pred: NumberPrediction;
  pi: number;
  isDark: boolean;
  sub: string;
  muted: string;
  expanded: boolean;
  onToggle: () => void;
  confidenceStyle: (c: NumberPrediction["confidence"]) => string;
  topScore: number;
}) {
  const FACTOR_COLORS = ["bg-yellow-500", "bg-blue-500", "bg-green-500", "bg-orange-500"];

  return (
    <div className={`rounded-xl overflow-hidden border ${
      pi === 0
        ? isDark ? "border-purple-500/40 bg-purple-500/10" : "border-purple-300 bg-purple-50"
        : isDark ? "border-white/10 bg-white/3" : "border-slate-200 bg-white"
    }`}>
      <button className="w-full flex items-center gap-2.5 px-3 py-2.5" onClick={onToggle}>
        {/* Rank */}
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
          pi === 0 ? "bg-purple-600 text-white" : pi === 1 ? isDark ? "bg-white/20 text-white" : "bg-slate-700 text-white" : isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500"
        }`}>#{pred.rank}</div>

        {/* Number */}
        <div className={`font-black text-xl font-mono flex-shrink-0 ${pi === 0 ? "text-purple-300" : isDark ? "text-white" : "text-slate-800"}`}>
          {pred.num2d}
        </div>

        {/* Shio */}
        <span className="text-base flex-shrink-0">{pred.shio.emoji}</span>
        <span className={`text-xs flex-shrink-0 ${muted}`}>{pred.shio.name}</span>

        {/* Score bar */}
        <div className="flex-1 min-w-0">
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
            <div
              className={`h-full rounded-full transition-all ${pi === 0 ? "bg-gradient-to-r from-purple-500 to-fuchsia-500" : pi === 1 ? "bg-gradient-to-r from-blue-500 to-cyan-500" : "bg-slate-400"}`}
              style={{ width: `${(pred.totalScore / topScore) * 100}%` }}
            />
          </div>
        </div>

        {/* Score */}
        <span className={`text-xs font-black flex-shrink-0 w-12 text-right ${pi === 0 ? "text-purple-400" : muted}`}>
          {Math.round(pred.totalScore)}pts
        </span>

        {/* Confidence badge */}
        <div className={`flex-shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${confidenceStyle(pred.confidence)}`}>
          {pred.confidence}
        </div>

        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 ${muted} transition-transform ${expanded ? "" : "-rotate-90"}`}/>
      </button>

      {/* Factor breakdown */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className={`h-px ${isDark ? "bg-white/10" : "bg-slate-100"}`}/>
          <div className={`text-[10px] font-bold uppercase tracking-wide ${muted} mb-1`}>Alasan prediksi:</div>
          {pred.factors.map((f, fi) => (
            <div key={f.name} className={`rounded-xl p-2.5 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${FACTOR_COLORS[fi]}`}/>
                <span className={`text-[10px] font-black uppercase tracking-wide ${muted}`}>{f.name}</span>
                <span className={`ml-auto text-[10px] font-black ${f.score >= 60 ? "text-green-400" : f.score >= 30 ? "text-yellow-400" : "text-slate-400"}`}>
                  {Math.round(f.score)}/100 × {Math.round(f.weight * 100)}%
                </span>
              </div>
              {/* Score bar */}
              <div className={`h-1.5 rounded-full overflow-hidden mb-2 ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                <div
                  className={`h-full rounded-full ${f.score >= 60 ? "bg-green-500" : f.score >= 30 ? "bg-yellow-500" : "bg-slate-400"}`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
              {/* Evidence text */}
              <p className={`text-[10px] leading-relaxed ${muted}`}>{f.evidence}</p>
            </div>
          ))}
          <div className={`text-[10px] font-black text-center pt-1 ${muted}`}>
            Skor Total: {pred.factors.map(f => `${Math.round(f.score)}×${Math.round(f.weight*100)}%`).join(" + ")} = <span className={pi === 0 ? "text-purple-400" : ""}>{Math.round(pred.totalScore)}pts</span>
          </div>
        </div>
      )}
    </div>
  );
}
