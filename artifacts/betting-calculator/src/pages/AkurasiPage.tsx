/**
 * AkurasiPage — History Akurasi Report Card
 *
 * Melakukan backtesting 30 draw terakhir per slot:
 * untuk setiap draw, gunakan semua draw sebelumnya sebagai data latih,
 * buat prediksi 4D / Colok Jitu / Shio / 2D Ekor, lalu bandingkan
 * dengan hasil aktual.
 */

import React, { useMemo, useState } from "react";
import {
  Target, TrendingUp, Award, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, BarChart2, Clock, Flame, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_NAMES: Record<string, string> = {
  "00:01": "Tengah Malam", "13:00": "Siang",
  "16:00": "Sore",        "19:00": "Malam",
  "22:00": "Larut Malam", "23:00": "Dini Hari",
};
const ALL_2D = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
/* Toto Macau shio — idx=(n===0?100:n)%12
   0=Kuda 1=Ular 2=Naga 3=Kelinci 4=Harimau 5=Kerbau
   6=Tikus 7=Babi 8=Anjing 9=Ayam 10=Monyet 11=Kambing */
const SHIO_NAMES = [
  "Kuda","Ular","Naga","Kelinci","Harimau","Kerbau",
  "Tikus","Babi","Anjing","Ayam","Monyet","Kambing",
];

function validDraw(v: string): boolean { return /^\d{4}$/.test(v); }
function depan(v: string): string { return v.slice(0, 2); }
function ekor(v: string): string { return v.slice(2); }
function norm(sc: Record<string,number>): Record<string,number> {
  const mx = Math.max(...Object.values(sc), 1e-9);
  const out: Record<string,number> = {};
  for (const k in sc) out[k] = sc[k] / mx;
  return out;
}
function getShioIdx(numStr: string): number {
  const n = parseInt(numStr, 10);
  return (n === 0 ? 100 : n) % 12;
}

/* ─── Engine B: Recency Exponential ────────────────────────────────────── */
function engineB_pred(draws: string[]): Record<string,number> {
  const sc: Record<string,number> = {};
  ALL_2D.forEach(k => (sc[k] = 0));
  draws.forEach((d, i) => { sc[d] += Math.exp(-i * 0.08); });
  return norm(sc);
}

/* ─── Engine C: Gap / Overdue ───────────────────────────────────────────── */
function engineC_pred(draws: string[]): Record<string,number> {
  const sc: Record<string,number> = {};
  ALL_2D.forEach(k => (sc[k] = 0));
  const lastSeen: Record<string,number> = {};
  const freq: Record<string,number> = {};
  ALL_2D.forEach(k => { lastSeen[k] = draws.length; freq[k] = 0; });
  draws.forEach((d, i) => { if (lastSeen[d] === draws.length) lastSeen[d] = i; freq[d]++; });
  for (const k of ALL_2D) {
    const f = freq[k];
    const last = lastSeen[k];
    const avg = f > 0 ? draws.length / f : draws.length;
    sc[k] = Math.min(3, last / Math.max(avg, 1)) / 3;
  }
  return norm(sc);
}

/* ─── Engine E: Momentum Trend ──────────────────────────────────────────── */
function engineE_pred(draws: string[]): Record<string,number> {
  const sc: Record<string,number> = {};
  ALL_2D.forEach(k => (sc[k] = 0));
  if (draws.length < 10) return sc;
  const half = Math.floor(draws.length / 2);
  const rf: Record<string,number> = {};
  const pf: Record<string,number> = {};
  ALL_2D.forEach(k => { rf[k] = 0; pf[k] = 0; });
  draws.slice(0, half).forEach(d => rf[d]++);
  draws.slice(half).forEach(d => pf[d]++);
  for (const k of ALL_2D) {
    sc[k] = Math.max(0, rf[k] / half - pf[k] / half) + rf[k] * 0.04;
  }
  return norm(sc);
}

/* ─── Engine F: Digit Positional ────────────────────────────────────────── */
function engineF_pred(draws: string[]): Record<string,number> {
  const sc: Record<string,number> = {};
  ALL_2D.forEach(k => (sc[k] = 0));
  const pf: number[][] = Array.from({ length: 2 }, () => new Array(10).fill(0));
  draws.forEach((d, i) => {
    const decay = Math.exp(-i * 0.06);
    pf[0][+d[0]] += decay;
    pf[1][+d[1]] += decay;
  });
  const maxP = pf.map(p => Math.max(...p, 1e-9));
  for (const k of ALL_2D) {
    sc[k] = (pf[0][+k[0]] / maxP[0]) * 0.55 + (pf[1][+k[1]] / maxP[1]) * 0.45;
  }
  return norm(sc);
}

/* ─── Engine G: Kembar / Pattern Cycle ──────────────────────────────────── */
function engineG_pred(draws: string[]): Record<string,number> {
  const sc: Record<string,number> = {};
  ALL_2D.forEach(k => (sc[k] = 0));
  if (draws.length < 5) return sc;
  const last15 = draws.slice(0, 15);
  const total15 = last15.length;
  const kembarRate = last15.filter(d => d[0] === d[1]).length / total15;
  const konsekRate = last15.filter(d => Math.abs(+d[0] - +d[1]) === 1).length / total15;
  const jauhRate   = last15.filter(d => Math.abs(+d[0] - +d[1]) >= 5).length / total15;
  for (const k of ALL_2D) {
    const diff = Math.abs(+k[0] - +k[1]);
    if (k[0] === k[1])   sc[k] = kembarRate * 2.5 + 0.05;
    else if (diff === 1)  sc[k] = konsekRate  * 1.5 + 0.05;
    else if (diff >= 5)   sc[k] = jauhRate    * 1.2 + 0.05;
    else                  sc[k] = 0.05;
  }
  let kIdx = 0;
  for (const d of last15) {
    if (d[0] === d[1]) {
      const digit = +d[0];
      const decay = Math.exp(-kIdx * 0.25);
      for (let i = 0; i <= 9; i++) {
        sc[`${i}${i}`] += decay * (Math.abs(i - digit) <= 1 ? 1.5 : 0.3);
      }
    }
    kIdx++;
  }
  return norm(sc);
}

/* ─── 5-Engine Weighted Consensus for 2D Depan (B+C+E+F+G) ─────────────── */
function computeDepanConsensus(draws: string[]): Record<string,number> {
  if (draws.length < 5) {
    const sc: Record<string,number> = {};
    ALL_2D.forEach(k => (sc[k] = 0));
    return sc;
  }
  const scB = engineB_pred(draws);
  const scC = engineC_pred(draws);
  const scE = engineE_pred(draws);
  const scF = engineF_pred(draws);
  const scG = engineG_pred(draws);
  // Weights B:25, C:20, E:20, F:20, G:15 — matches SmartPrediction consensus
  const out: Record<string,number> = {};
  ALL_2D.forEach(k => {
    out[k] = (scB[k]||0)*25 + (scC[k]||0)*20 + (scE[k]||0)*20 + (scF[k]||0)*20 + (scG[k]||0)*15;
  });
  return norm(out);
}

/* ─── Recency+Gap Consensus for 2D Ekor ─────────────────────────────────── */
function computeEkorPred(ekorDraws: string[]): Record<string,number> {
  const scB = engineB_pred(ekorDraws);
  const scC = engineC_pred(ekorDraws);
  const out: Record<string,number> = {};
  ALL_2D.forEach(k => { out[k] = (scB[k]||0) * 0.6 + (scC[k]||0) * 0.4; });
  return norm(out);
}

/* ─── Single draw prediction from training data ─────────────────────────── */
interface DrawPred {
  pred4d: string;
  colokDigit: number;
  colokPos: number;
  shioIdx: number;
  ekor2d: string;
}

function predictFromHistory(depanHistory: string[], ekorHistory: string[]): DrawPred {
  if (depanHistory.length < 5) {
    return { pred4d: "0000", colokDigit: 0, colokPos: 3, shioIdx: 0, ekor2d: "00" };
  }
  const scD = computeDepanConsensus(depanHistory);
  const scE = computeEkorPred(ekorHistory);

  const topD = ALL_2D.slice().sort((a, b) => (scD[b]??0) - (scD[a]??0))[0];
  const topE = ALL_2D.slice().sort((a, b) => (scE[b]??0) - (scE[a]??0))[0];
  const pred4d = topD + topE;

  // Colok Jitu — strongest positional digit across all 4 positions
  const posScore: number[][] = [
    new Array(10).fill(0), new Array(10).fill(0),
    new Array(10).fill(0), new Array(10).fill(0),
  ];
  ALL_2D.slice().sort((a,b) => (scD[b]??0) - (scD[a]??0)).slice(0, 10).forEach(k => {
    posScore[0][+k[0]] += scD[k]??0;
    posScore[1][+k[1]] += scD[k]??0;
  });
  ALL_2D.slice().sort((a,b) => (scE[b]??0) - (scE[a]??0)).slice(0, 10).forEach(k => {
    posScore[2][+k[0]] += scE[k]??0;
    posScore[3][+k[1]] += scE[k]??0;
  });

  let bestPos = 3;
  let bestMx = -1;
  posScore.forEach((p, i) => {
    const mx = Math.max(...p);
    if (mx > bestMx) { bestMx = mx; bestPos = i; }
  });
  const bestDigit = posScore[bestPos].indexOf(Math.max(...posScore[bestPos]));

  return {
    pred4d,
    colokDigit: bestDigit,
    colokPos: bestPos,
    shioIdx: getShioIdx(topE),
    ekor2d: topE,
  };
}

/* ─── Check a single prediction against actual result ───────────────────── */
interface HitCheck {
  hit4d: boolean;
  hitColokJitu: boolean;
  hitShio: boolean;
  hitEkor2d: boolean;
}

function checkHit(pred: DrawPred, actual: string): HitCheck {
  const a = actual;
  const posMap: Record<number, string> = { 0: a[0], 1: a[1], 2: a[2], 3: a[3] };
  return {
    hit4d:       pred.pred4d === a,
    hitColokJitu: String(pred.colokDigit) === (posMap[pred.colokPos] ?? ""),
    hitShio:     getShioIdx(ekor(a)) === pred.shioIdx,
    hitEkor2d:   pred.ekor2d === ekor(a),
  };
}

/* ─── Backtest for one slot ─────────────────────────────────────────────── */
interface SlotBacktest {
  slot: string;
  rounds: {
    tanggal: string;
    actual: string;
    pred: DrawPred;
    hit: HitCheck;
  }[];
  totals: { n4d: number; nColok: number; nShio: number; nEkor: number; total: number };
}

function backtestSlot(resultData: ResultRow[], slot: string, testRounds = 30): SlotBacktest {
  const draws: { tanggal: string; num: string }[] = [];
  for (const row of resultData) {
    const v = String(row[slot] ?? "");
    if (validDraw(v)) draws.push({ tanggal: row.tanggal, num: v });
  }

  const rounds: SlotBacktest["rounds"] = [];
  const available = Math.min(testRounds, draws.length - 20);

  for (let i = 0; i < available; i++) {
    const { tanggal, num: actual } = draws[i];
    const history = draws.slice(i + 1);
    const depanH = history.map(d => depan(d.num));
    const ekorH  = history.map(d => ekor(d.num));
    const pred = predictFromHistory(depanH, ekorH);
    const hit  = checkHit(pred, actual);
    rounds.push({ tanggal, actual, pred, hit });
  }

  const totals = rounds.reduce(
    (acc, r) => ({
      n4d:   acc.n4d   + (r.hit.hit4d       ? 1 : 0),
      nColok:acc.nColok+ (r.hit.hitColokJitu? 1 : 0),
      nShio: acc.nShio + (r.hit.hitShio     ? 1 : 0),
      nEkor: acc.nEkor + (r.hit.hitEkor2d   ? 1 : 0),
      total: acc.total + 1,
    }),
    { n4d: 0, nColok: 0, nShio: 0, nEkor: 0, total: 0 }
  );

  return { slot, rounds, totals };
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const POS_NAMES = ["AS", "KOP", "KEPALA", "EKOR"];
function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}
function rateColor(r: number): string {
  if (r >= 50) return "#22c55e";
  if (r >= 30) return "#f59e0b";
  return "#ef4444";
}

/* ─── Props & Component ──────────────────────────────────────────────────── */
interface Props { resultData: ResultRow[]; isDark: boolean }

export default function AkurasiPage({ resultData, isDark }: Props) {
  const card = isDark
    ? "rounded-[20px] border border-white/10 bg-white/5 backdrop-blur-xl"
    : "rounded-[20px] border border-slate-200 bg-white shadow-sm";
  const subtle = isDark ? "text-white/50" : "text-slate-400";
  const subCard = isDark ? "bg-white/5 rounded-xl" : "bg-slate-50 rounded-xl";

  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "perSlot" | "log">("overview");

  /* ── Compute backtests for all 6 slots (memoised) ─────────────────────── */
  const slotResults = useMemo(() => {
    return TIME_SLOTS.map(slot => backtestSlot(resultData, slot, 30));
  }, [resultData]);

  /* ── Aggregate across all slots ───────────────────────────────────────── */
  const aggregate = useMemo(() => {
    return slotResults.reduce(
      (acc, s) => ({
        n4d:    acc.n4d    + s.totals.n4d,
        nColok: acc.nColok + s.totals.nColok,
        nShio:  acc.nShio  + s.totals.nShio,
        nEkor:  acc.nEkor  + s.totals.nEkor,
        total:  acc.total  + s.totals.total,
      }),
      { n4d: 0, nColok: 0, nShio: 0, nEkor: 0, total: 0 }
    );
  }, [slotResults]);

  /* ── Bar chart data (per-slot accuracy for a chosen category) ─────────── */
  const [chartCat, setChartCat] = useState<"colok"|"shio"|"ekor">("shio");
  const barData = slotResults.map(s => ({
    slot: s.slot,
    pColok: pct(s.totals.nColok, s.totals.total),
    pShio:  pct(s.totals.nShio,  s.totals.total),
    pEkor:  pct(s.totals.nEkor,  s.totals.total),
  }));
  const barKey: Record<string,string> = { colok:"pColok", shio:"pShio", ekor:"pEkor" };
  const barLabel: Record<string,string> = { colok:"Colok Jitu", shio:"Shio", ekor:"2D Ekor" };

  const summaryCards = [
    {
      key: "4d", label: "4D Exact", value: pct(aggregate.n4d, aggregate.total),
      hits: aggregate.n4d, total: aggregate.total,
      icon: <Target className="w-5 h-5" />, grad: "from-blue-500 to-cyan-500",
      note: "Tebak tepat 4 digit",
    },
    {
      key: "colok", label: "Colok Jitu", value: pct(aggregate.nColok, aggregate.total),
      hits: aggregate.nColok, total: aggregate.total,
      icon: <Award className="w-5 h-5" />, grad: "from-violet-500 to-purple-600",
      note: "Digit tepat di posisi",
    },
    {
      key: "shio", label: "Shio", value: pct(aggregate.nShio, aggregate.total),
      hits: aggregate.nShio, total: aggregate.total,
      icon: <Flame className="w-5 h-5" />, grad: "from-orange-400 to-red-500",
      note: "Prediksi hewan shio",
    },
    {
      key: "ekor", label: "2D Ekor", value: pct(aggregate.nEkor, aggregate.total),
      hits: aggregate.nEkor, total: aggregate.total,
      icon: <TrendingUp className="w-5 h-5" />, grad: "from-emerald-400 to-green-600",
      note: "Dua digit terakhir",
    },
  ];

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "perSlot" as const,  label: "Per Slot" },
    { id: "log" as const,      label: "Log Draw" },
  ];

  return (
    <div className="space-y-4 animate-slide-up pb-24">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-xl font-black">History Akurasi</h2>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-orange-500/40 text-orange-300 bg-orange-500/15" : "border-orange-200 text-orange-600 bg-orange-50"}`}>
                BACKTEST
              </span>
            </div>
            <p className={`text-xs ${subtle}`}>
              {aggregate.total} draw diuji · Prediksi dibuat dari data sebelum setiap draw · 30 draw terakhir per slot
            </p>
          </div>
          <div className={`flex items-center gap-1.5 text-[11px] ${subtle}`}>
            <RefreshCw className="w-3 h-3" />
            <span>Real-time dari {resultData.length} hari data</span>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 mt-4 p-1 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === t.id
                  ? isDark ? "bg-white/15 text-white shadow" : "bg-white text-slate-800 shadow"
                  : isDark ? "text-white/50 hover:text-white/70" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ TAB: OVERVIEW ══════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            {summaryCards.map(c => {
              const color = rateColor(c.value);
              return (
                <div key={c.key} className={`${card} p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center text-white`}>
                      {c.icon}
                    </div>
                    <div>
                      <div className="text-xs font-black">{c.label}</div>
                      <div className={`text-[10px] ${subtle}`}>{c.note}</div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mb-2">
                    <span className="text-3xl font-black" style={{ color }}>{c.value}%</span>
                    <span className={`text-[11px] ${subtle}`}>{c.hits}/{c.total} hit</span>
                  </div>

                  {/* Progress bar */}
                  <div className={`h-1.5 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${c.value}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bar chart per slot for selected category */}
          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm font-black">Akurasi per Slot Waktu</div>
              <div className={`flex gap-1 p-1 rounded-lg ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                {(["colok","shio","ekor"] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setChartCat(k)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      chartCat === k
                        ? isDark ? "bg-white/15 text-white" : "bg-white text-slate-800 shadow"
                        : isDark ? "text-white/50" : "text-slate-500"
                    }`}
                  >
                    {barLabel[k]}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="slot" tick={{ fontSize: 10, fill: isDark ? "#ffffff80" : "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: isDark ? "#ffffff80" : "#64748b" }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: isDark ? "#1e293b" : "#fff",
                    border: "1px solid " + (isDark ? "#334155" : "#e2e8f0"),
                    borderRadius: 10, fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}%`, barLabel[chartCat]]}
                />
                <Bar dataKey={barKey[chartCat]} radius={[6,6,0,0]}>
                  {barData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={rateColor(entry[barKey[chartCat] as keyof typeof entry] as number)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Score interpretation */}
          <div className={`${card} p-4`}>
            <div className="text-xs font-black mb-3">Interpretasi Skor</div>
            <div className="space-y-2">
              {[
                { color: "#22c55e", bg: isDark ? "bg-green-500/15" : "bg-green-50", range: "≥ 50%", label: "Baik", desc: "Prediksi cukup konsisten mengikuti pola data." },
                { color: "#f59e0b", bg: isDark ? "bg-amber-500/15" : "bg-amber-50", range: "30–49%", label: "Wajar", desc: "Konsisten sebagian — engine bekerja di atas random." },
                { color: "#ef4444", bg: isDark ? "bg-red-500/15" : "bg-red-50",    range: "< 30%", label: "Acak", desc: "Variabilitas tinggi — hasil mendekati random chance." },
              ].map(item => (
                <div key={item.range} className={`flex items-start gap-3 p-3 rounded-xl ${item.bg}`}>
                  <div className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ background: item.color }} />
                  <div className="min-w-0">
                    <span className="text-xs font-black" style={{ color: item.color }}>{item.range} — {item.label}: </span>
                    <span className={`text-xs ${subtle}`}>{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══ TAB: PER SLOT ══════════════════════════════════════════════════ */}
      {activeTab === "perSlot" && (
        <div className="space-y-3">
          {slotResults.map(s => {
            const expanded = expandedSlot === s.slot;
            const p4d    = pct(s.totals.n4d,    s.totals.total);
            const pColok = pct(s.totals.nColok, s.totals.total);
            const pShio  = pct(s.totals.nShio,  s.totals.total);
            const pEkor  = pct(s.totals.nEkor,  s.totals.total);

            return (
              <div key={s.slot} className={card}>
                {/* Slot header */}
                <button
                  className="w-full p-4 text-left"
                  onClick={() => setExpandedSlot(expanded ? null : s.slot)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-cyan-500 text-[11px] font-black`}>
                        {s.slot}
                      </div>
                      <div>
                        <div className="text-sm font-black">{SLOT_NAMES[s.slot]}</div>
                        <div className={`text-[11px] ${subtle}`}>{s.totals.total} draw diuji</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex gap-4">
                        {[
                          { label:"Colok", val: pColok },
                          { label:"Shio",  val: pShio  },
                          { label:"2D Ekor",val: pEkor  },
                        ].map(it => (
                          <div key={it.label} className="text-center">
                            <div className="text-base font-black" style={{ color: rateColor(it.val) }}>{it.val}%</div>
                            <div className={`text-[10px] ${subtle}`}>{it.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className={`flex sm:hidden items-center gap-1.5`}>
                        <span className="text-base font-black" style={{ color: rateColor(pShio) }}>{pShio}%</span>
                        <span className={`text-[10px] ${subtle}`}>Shio</span>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4 opacity-40 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 opacity-40 flex-shrink-0" />}
                    </div>
                  </div>

                  {/* Mini progress bars */}
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      { label: "4D",      val: p4d,    color: rateColor(p4d) },
                      { label: "Colok",   val: pColok, color: rateColor(pColok) },
                      { label: "Shio",    val: pShio,  color: rateColor(pShio) },
                      { label: "2D Ekor", val: pEkor,  color: rateColor(pEkor) },
                    ].map(it => (
                      <div key={it.label}>
                        <div className={`h-1 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden mb-1`}>
                          <div className="h-full rounded-full" style={{ width:`${it.val}%`, background: it.color }} />
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-[9px] ${subtle}`}>{it.label}</span>
                          <span className="text-[9px] font-bold" style={{ color: it.color }}>{it.val}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </button>

                {/* Expanded draw log */}
                {expanded && (
                  <div className={`border-t ${isDark ? "border-white/10" : "border-slate-200"} p-4`}>
                    <div className="text-[11px] font-black mb-3 uppercase tracking-widest opacity-50">30 Draw Terakhir</div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {s.rounds.map((r, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs ${subCard}`}
                        >
                          <span className={`text-[10px] ${subtle} w-20 flex-shrink-0`}>{r.tanggal}</span>
                          <span className="font-black tracking-widest w-12 flex-shrink-0">{r.actual}</span>
                          <span className={`${subtle} w-12 flex-shrink-0`}>→ {r.pred.pred4d}</span>
                          <div className="flex gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${r.hit.hitColokJitu ? "bg-green-500/20 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                              {r.hit.hitColokJitu ? "✓" : "✗"} Colok
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${r.hit.hitShio ? "bg-green-500/20 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                              {r.hit.hitShio ? "✓" : "✗"} Shio
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${r.hit.hitEkor2d ? "bg-green-500/20 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                              {r.hit.hitEkor2d ? "✓" : "✗"} 2D
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: LOG DRAW ═════════════════════════════════════════════════ */}
      {activeTab === "log" && (
        <div className={`${card} p-4`}>
          <div className="text-sm font-black mb-4">Log Semua Slot — 10 Draw Terbaru</div>
          <div className="space-y-2">
            {slotResults.flatMap(s =>
              s.rounds.slice(0, 10).map(r => ({ ...r, slot: s.slot }))
            )
              .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
              .slice(0, 60)
              .map((r, i) => {
                const anyHit = r.hit.hitColokJitu || r.hit.hitShio || r.hit.hitEkor2d;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs ${subCard}`}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${anyHit ? "bg-green-400" : "bg-red-400/50"}`} />
                    <span className={`text-[10px] ${subtle} w-24 flex-shrink-0`}>{r.tanggal}</span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-white/40" : "text-slate-400"} w-12 flex-shrink-0`}>{r.slot}</span>
                    <span className="font-black tracking-widest w-12 flex-shrink-0">{r.actual}</span>
                    <span className={`${subtle} w-12 flex-shrink-0`}>→ {r.pred.pred4d}</span>
                    <div className="flex gap-1 flex-wrap">
                      {r.hit.hitColokJitu && <span className="px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-bold">Colok ✓</span>}
                      {r.hit.hitShio      && <span className="px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 text-[10px] font-bold">{SHIO_NAMES[r.pred.shioIdx]} ✓</span>}
                      {r.hit.hitEkor2d    && <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">2D ✓</span>}
                      {r.hit.hit4d        && <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 text-[10px] font-bold">4D ✓✓✓</span>}
                      {!anyHit && !r.hit.hit4d && <span className={`text-[10px] ${subtle}`}>—</span>}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

    </div>
  );
}
