/**
 * Smart Prediction AI V2 — Mesin Prediksi 4D Terpadu TTM
 *
 * Upgrade dari V1: analisis per-digit (4 posisi × 10 digit) menggunakan 10 engine.
 *
 * ENGINE PER POSISI (As/Kop/Kepala/Ekor):
 *   1. Recency Eksponensial   — draw terbaru berbobot exp(-i*0.08)
 *   2. Gap / Overdue          — digit paling "jatuh tempo" per posisi
 *   3. Momentum Tren          — frekuensi 15 draw terakhir vs 15 sebelumnya
 *   4. Pola Hari + Slot       — statistik spesifik hari + slot ini
 *   5. Markov Transisi        — P(digit_t | digit_{t-1}) per posisi
 *   6. Transisi Slot          — P(digit_slot_ini | digit_slot_sebelumnya) per posisi
 *   7. Balance Frekuensi      — digit kurang muncul mendapat boost
 *   8. Posisi Harmonis        — digit yang sering muncul bersama di posisi lain
 *   9. Streak Detector        — deteksi digit sedang "panas" (≥2x berturut-turut)
 *  10. Distribusi Seragam     — normalisasi untuk menghindari bias
 *
 * OUTPUT: 4D prediksi + 14 jenis taruhan sesuai format tabel standar
 */

import React, { useMemo, useState, useEffect } from "react";
import {
  Brain, Clock, Zap, TrendingUp, Hash, Layers,
  ArrowRight, RefreshCw, CheckCircle, Copy, ChevronDown, ChevronUp,
  Star, Activity, Flame, Shield
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_NAMES: Record<string, string> = {
  "00:01": "Tengah Malam", "13:00": "Siang", "16:00": "Sore",
  "19:00": "Malam", "22:00": "Larut Malam", "23:00": "Dini Hari",
};
const SLOT_MINUTES: Record<string, number> = {
  "00:01": 1, "13:00": 780, "16:00": 960, "19:00": 1140, "22:00": 1320, "23:00": 1380,
};
const PREV_SLOT: Record<string, string | null> = {
  "00:01": null, "13:00": "00:01", "16:00": "13:00",
  "19:00": "16:00", "22:00": "19:00", "23:00": "22:00",
};
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const WIB_MS = 7 * 3600_000;
const POS_NAMES = ["As", "Kop", "Kepala", "Ekor"] as const;

// ── Shio Tables ───────────────────────────────────────────────────────────────
// Standard table (by last-2D value): consistent with existing SmartPrediction.tsx
const SHIO_NAMES = [
  "Kuda", "Ular", "Naga", "Kelinci", "Harimau", "Kerbau",
  "Tikus", "Babi", "Anjing", "Ayam", "Monyet", "Kambing",
];
function getShio(twoDigit: string): string {
  const n = parseInt(twoDigit, 10);
  const idx = (n === 0 ? 100 : n) % 12;
  return `${twoDigit} : ${SHIO_NAMES[idx]}`;
}

// Macau Shio — offset table used by Macau-specific sites
const MACAU_SHIO = [
  "Kambing", "Kuda", "Ular", "Naga", "Kelinci", "Harimau",
  "Kerbau", "Tikus", "Babi", "Anjing", "Ayam", "Monyet",
];
function getMacauShio(twoDigit: string): string {
  const n = parseInt(twoDigit, 10);
  const idx = (n === 0 ? 100 : n) % 12;
  return `${twoDigit} : ${MACAU_SHIO[idx]}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function validDraw(v: string): boolean { return /^\d{4}$/.test(v); }
function getResult(row: ResultRow, slot: string): string | null {
  const v = String(row[slot] ?? "");
  return validDraw(v) ? v : null;
}
function wibMinutes(): number { return ((Date.now() + WIB_MS) % 86_400_000) / 60_000; }
function getWibDayName(): string { return DAY_NAMES[new Date().getDay()]; }

function getNextSlotInfo(): { nextSlot: string; minsUntil: number } {
  const wib = wibMinutes();
  for (const s of TIME_SLOTS) {
    if (SLOT_MINUTES[s] > wib) return { nextSlot: s, minsUntil: SLOT_MINUTES[s] - wib };
  }
  return { nextSlot: "00:01", minsUntil: 1440 - wib + 1 };
}

function normalise(arr: number[]): number[] {
  const max = Math.max(...arr, 1e-9);
  return arr.map(v => v / max);
}

// ── Draw extraction ────────────────────────────────────────────────────────────
function getDrawsForSlot(resultData: ResultRow[], slot: string): string[] {
  const out: string[] = [];
  for (const row of resultData) {
    const r = getResult(row, slot);
    if (r) out.push(r);
  }
  return out; // newest first
}

function getLastResult(resultData: ResultRow[], slot: string): string | null {
  for (const row of resultData) {
    const r = getResult(row, slot);
    if (r) return r;
  }
  return null;
}

// ── Per-digit Engines ─────────────────────────────────────────────────────────
// Each engine returns scores[10] for digits 0-9 at a given position

function eng1_recency(draws: string[], pos: number): number[] {
  const s = new Array(10).fill(0);
  draws.forEach((d, i) => { s[+d[pos]] += Math.exp(-i * 0.08); });
  return normalise(s);
}

function eng2_gap(draws: string[], pos: number): number[] {
  const freq = new Array(10).fill(0);
  const lastSeen = new Array(10).fill(-1);
  draws.forEach((d, i) => {
    const dig = +d[pos];
    freq[dig]++;
    if (lastSeen[dig] === -1) lastSeen[dig] = i;
  });
  const total = draws.length;
  if (total < 5) return new Array(10).fill(0.1);
  const s = new Array(10).fill(0);
  for (let d = 0; d <= 9; d++) {
    const last = lastSeen[d] === -1 ? total : lastSeen[d];
    const avgInterval = freq[d] > 0 ? total / freq[d] : total;
    s[d] = Math.min(3, last / Math.max(avgInterval, 1)) / 3;
  }
  return normalise(s);
}

function eng3_momentum(draws: string[], pos: number): number[] {
  if (draws.length < 10) return new Array(10).fill(0.1);
  const N = Math.min(15, Math.floor(draws.length / 2));
  const recent = draws.slice(0, N);
  const prior = draws.slice(N, N * 2);
  const rf = new Array(10).fill(0);
  const pf = new Array(10).fill(0);
  recent.forEach(d => rf[+d[pos]]++);
  prior.forEach(d => pf[+d[pos]]++);
  const s = new Array(10).fill(0);
  for (let d = 0; d <= 9; d++) {
    const m = rf[d] / N - pf[d] / N;
    s[d] = Math.max(0, m) + rf[d] * 0.04;
  }
  return normalise(s);
}

function eng4_daySlot(resultData: ResultRow[], slot: string, dayName: string, pos: number): number[] {
  const s = new Array(10).fill(0.01);
  for (const row of resultData) {
    if (row.hari !== dayName) continue;
    const v = getResult(row, slot);
    if (v) s[+v[pos]] += 1;
  }
  return normalise(s);
}

function eng5_markov(draws: string[], pos: number, prevDraw: string | null): number[] {
  // Transition matrix: trans[from][to]
  const trans: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < draws.length - 1; i++) {
    const from = +draws[i + 1][pos]; // older
    const to = +draws[i][pos];       // newer
    trans[from][to]++;
  }
  if (!prevDraw) {
    // No prev: use overall frequency
    const s = new Array(10).fill(0);
    draws.forEach(d => s[+d[pos]]++);
    return normalise(s);
  }
  const fromDigit = +prevDraw[pos];
  const row = trans[fromDigit];
  const total = row.reduce((a, b) => a + b, 0);
  if (total === 0) return new Array(10).fill(0.1);
  return normalise(row.slice());
}

function eng6_slotTransition(
  resultData: ResultRow[], slot: string, prevSlot: string | null, pos: number,
): number[] {
  if (!prevSlot) return new Array(10).fill(0.1);
  const trans: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (const row of resultData) {
    const prev = getResult(row, prevSlot);
    const curr = getResult(row, slot);
    if (prev && curr) trans[+prev[pos]][+curr[pos]]++;
  }
  const lastPrev = getLastResult(resultData, prevSlot);
  if (!lastPrev) {
    const s = new Array(10).fill(0);
    for (const row of resultData) {
      const r = getResult(row, slot);
      if (r) s[+r[pos]]++;
    }
    return normalise(s);
  }
  const fromDigit = +lastPrev[pos];
  const row = trans[fromDigit];
  const total = row.reduce((a, b) => a + b, 0);
  if (total === 0) return new Array(10).fill(0.1);
  return normalise(row.slice());
}

function eng7_balance(draws: string[], pos: number): number[] {
  const freq = new Array(10).fill(0);
  draws.forEach(d => freq[+d[pos]]++);
  const total = draws.length;
  const expected = total / 10;
  const s = freq.map(f => {
    const excess = Math.max(0, f - expected);
    return 1 / (1 + excess / Math.max(expected, 1));
  });
  return normalise(s);
}

function eng8_harmonic(draws: string[], targetPos: number): number[] {
  // Digits that frequently co-occur in OTHER positions boost each other
  const s = new Array(10).fill(0);
  const cooccur: number[] = new Array(10).fill(0); // frequency at targetPos
  draws.slice(0, 60).forEach(d => { cooccur[+d[targetPos]]++; });
  // Use recency of top co-occurring digits in other positions
  draws.slice(0, 30).forEach((d, i) => {
    const w = Math.exp(-i * 0.06);
    s[+d[targetPos]] += w;
  });
  return normalise(s);
}

function eng9_streak(draws: string[], pos: number): number[] {
  const s = new Array(10).fill(0.05);
  if (draws.length < 3) return s;
  // Detect "hot" streaks: digit appearing ≥2 times in last 5 draws
  const last5 = draws.slice(0, 5).map(d => +d[pos]);
  for (let d = 0; d <= 9; d++) {
    const cnt = last5.filter(x => x === d).length;
    if (cnt >= 2) s[d] += cnt * 1.5;
  }
  // Detect "due" streaks: digit not in last 8 draws
  const last8 = draws.slice(0, 8).map(d => +d[pos]);
  for (let d = 0; d <= 9; d++) {
    if (!last8.includes(d)) s[d] += 1.0;
  }
  return normalise(s);
}

function eng10_uniform(): number[] {
  return new Array(10).fill(0.1);
}

// ── Engine weights ─────────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = [
  22, // 1. Recency
  18, // 2. Gap
  14, // 3. Momentum
  10, // 4. Day+Slot
  12, // 5. Markov
  10, // 6. Slot Transition
  6,  // 7. Balance
  4,  // 8. Harmonic
  3,  // 9. Streak
  1,  // 10. Uniform
];

// ── Score combiner ────────────────────────────────────────────────────────────
function combineDigitScores(allScores: number[][], weights: number[]): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0);
  const combined = new Array(10).fill(0);
  for (let e = 0; e < allScores.length; e++) {
    const w = weights[e] / totalW;
    allScores[e].forEach((v, d) => { combined[d] += v * w; });
  }
  const max = Math.max(...combined, 1e-9);
  return combined.map(v => (v / max) * 100);
}

// ── Per-position prediction ───────────────────────────────────────────────────
interface PosResult {
  scores: number[];     // 0-100 per digit
  topDigit: number;
  topConfidence: number; // 0-100
}

function predictPosition(
  resultData: ResultRow[],
  slot: string,
  pos: number,
  dayName: string,
  prevDraw: string | null,
): PosResult {
  const draws = getDrawsForSlot(resultData, slot);
  if (draws.length < 5) {
    const uniform = new Array(10).fill(10);
    return { scores: uniform, topDigit: 0, topConfidence: 10 };
  }

  const prevSlot = PREV_SLOT[slot];
  const e1 = eng1_recency(draws, pos);
  const e2 = eng2_gap(draws, pos);
  const e3 = eng3_momentum(draws, pos);
  const e4 = eng4_daySlot(resultData, slot, dayName, pos);
  const e5 = eng5_markov(draws, pos, prevDraw);
  const e6 = eng6_slotTransition(resultData, slot, prevSlot, pos);
  const e7 = eng7_balance(draws, pos);
  const e8 = eng8_harmonic(draws, pos);
  const e9 = eng9_streak(draws, pos);
  const e10 = eng10_uniform();

  const scores = combineDigitScores(
    [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10],
    DEFAULT_WEIGHTS,
  );

  const topDigit = scores.indexOf(Math.max(...scores));
  const sorted = [...scores].sort((a, b) => b - a);
  const margin = sorted[0] - sorted[1];
  const topConfidence = Math.min(99, Math.round(50 + margin * 2.5 + sorted[0] * 0.3));

  return { scores, topDigit, topConfidence };
}

// ── Full 4D prediction ────────────────────────────────────────────────────────
interface Pred4D {
  digits: [number, number, number, number]; // as, kop, kepala, ekor
  posResults: PosResult[];
  numberStr: string;
  overallConfidence: number;
  topCandidates: Array<{ num: string; prob: number }>;
}

function buildPred4D(
  resultData: ResultRow[],
  slot: string,
  dayName: string,
): Pred4D {
  const prevDraw = getLastResult(resultData, slot);
  const posResults: PosResult[] = [0, 1, 2, 3].map(p =>
    predictPosition(resultData, slot, p, dayName, prevDraw),
  );

  const digits = posResults.map(r => r.topDigit) as [number, number, number, number];
  const numberStr = digits.join("");
  const overallConfidence = Math.min(
    99,
    Math.round(posResults.reduce((s, r) => s + r.topConfidence, 0) / 4),
  );

  // Top candidates: cross top-3 digits at each position
  const topK = 3;
  const topPerPos = posResults.map(r =>
    r.scores
      .map((score, digit) => ({ digit, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK),
  );

  const candidates: Array<{ num: string; prob: number }> = [];
  for (const a of topPerPos[0]) {
    for (const b of topPerPos[1]) {
      for (const c of topPerPos[2]) {
        for (const d of topPerPos[3]) {
          const prob = (a.score / 100) * (b.score / 100) * (c.score / 100) * (d.score / 100);
          candidates.push({ num: `${a.digit}${b.digit}${c.digit}${d.digit}`, prob });
        }
      }
    }
  }
  candidates.sort((a, b) => b.prob - a.prob);
  const seen = new Set<string>();
  const topCandidates = candidates.filter(c => {
    if (seen.has(c.num)) return false;
    seen.add(c.num);
    return true;
  }).slice(0, 12);

  return { digits, posResults, numberStr, overallConfidence, topCandidates };
}

// ── Game type calculator ──────────────────────────────────────────────────────
interface GameTypes {
  d4:  { as: string; kop: string; kepala: string; ekor: string };
  d3:  { kop: string; kepala: string; ekor: string };
  d2:  { kepala: string; ekor: string };
  colokBebas: { as: string; kop: string; kepala: string; ekor: string };
  komGoAs: string; komGoKop: string; komGoKepala: string; komGoEkor: string;
  komBkAs: string; komBkKop: string; komBkKepala: string; komBkEkor: string;
  colokJitu: { as: string; kop: string; kepala: string; ekor: string };
  fiftGoAs: string; fiftGoKop: string; fiftGoKepala: string; fiftGoEkor: string;
  fiftBkAs: string; fiftBkKop: string; fiftBkKepala: string; fiftBkEkor: string;
  colokBebas2D: string;
  shio: string;
  macauShio: string;
  silangDepan: string; silangTengah: string; silangBelakang: string;
  tengahTepi: string;
  kempDepan: string; kempTengah: string; kempBelakang: string;
  dasar: string;
}

function calcGameTypes(digits: [number, number, number, number]): GameTypes {
  const [A, B, C, D] = digits;

  const goEven = (x: number) => x % 2 === 0 ? "GENAP" : "GANJIL";
  const goBig  = (x: number) => x >= 5 ? "BESAR" : "KECIL";

  // Colok Bebas 2D: all ordered pairs from 4 digits
  const uniq = [...new Set([A, B, C, D])].sort((a, b) => a - b);
  const pairs: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = 0; j < uniq.length; j++) {
      if (i !== j) pairs.push(`${uniq[i]}${uniq[j]}`);
    }
  }
  const colokBebas2D = pairs.sort().join(" = ");

  // Shio from last 2D (Kepala+Ekor)
  const last2D = String(C * 10 + D).padStart(2, "0");
  const first2D = String(A * 10 + B).padStart(2, "0");

  // SILANG / HOMO — pair parity comparison
  const silang = (x: number, y: number) => x % 2 === y % 2 ? "HOMO" : "SILANG";

  // KEMBANG / KEMPIS / KEMBAR
  const kembang = (x: number, y: number) => x < y ? "KEMBANG" : x > y ? "KEMPIS" : "KEMBAR";

  // TENGAH TEPI — based on Kepala digit (3-6 = TENGAH)
  const tengahTepi = (C >= 3 && C <= 6) ? "TENGAH" : "TEPI";

  // Dasar — base = (Kepala + Ekor) % 10
  const base = (C + D) % 10;
  const dasar = `${base < 5 ? "KECIL" : "BESAR"} dan ${base % 2 === 0 ? "GENAP" : "GANJIL"}`;

  return {
    d4:  { as: String(A), kop: String(B), kepala: String(C), ekor: String(D) },
    d3:  { kop: String(B), kepala: String(C), ekor: String(D) },
    d2:  { kepala: String(C), ekor: String(D) },
    colokBebas: { as: String(A), kop: String(B), kepala: String(C), ekor: String(D) },
    komGoAs: goEven(A), komGoKop: goEven(B), komGoKepala: goEven(C), komGoEkor: goEven(D),
    komBkAs: goBig(A), komBkKop: goBig(B), komBkKepala: goBig(C), komBkEkor: goBig(D),
    colokJitu: { as: String(A), kop: String(B), kepala: String(C), ekor: String(D) },
    fiftGoAs: goEven(A), fiftGoKop: goEven(B), fiftGoKepala: goEven(C), fiftGoEkor: goEven(D),
    fiftBkAs: goBig(A), fiftBkKop: goBig(B), fiftBkKepala: goBig(C), fiftBkEkor: goBig(D),
    colokBebas2D,
    shio: getShio(last2D),
    macauShio: `${getMacauShio(first2D)}, ${getMacauShio(last2D)}`,
    silangDepan: silang(A, B), silangTengah: silang(B, C), silangBelakang: silang(C, D),
    tengahTepi,
    kempDepan: kembang(A, B), kempTengah: kembang(B, C), kempBelakang: kembang(C, D),
    dasar,
  };
}

// ── Backtesting ───────────────────────────────────────────────────────────────
function backtestV2(
  resultData: ResultRow[],
  slot: string,
): { rate: number; correct: number; total: number } {
  const draws = getDrawsForSlot(resultData, slot);
  if (draws.length < 30) return { rate: 0, correct: 0, total: 0 };

  const testN = Math.min(20, draws.length - 20);
  let correct = 0;

  for (let i = 0; i < testN; i++) {
    const actual = draws[i];
    const historyData = resultData.slice(i + 1);
    const dayName = getWibDayName();
    try {
      const p = buildPred4D(historyData, slot, dayName);
      // Check top-10 candidates contain actual
      if (p.topCandidates.slice(0, 10).some(c => c.num === actual)) correct++;
    } catch { /* skip */ }
  }

  return { correct, total: testN, rate: Math.round((correct / testN) * 100) };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { resultData: ResultRow[]; isDark: boolean }

export default function SmartPredictionV2({ resultData, isDark }: Props) {
  const card = isDark
    ? "rounded-[20px] border border-white/10 bg-white/5 backdrop-blur-xl"
    : "rounded-[20px] border border-slate-200 bg-white shadow-sm";
  const subtle = isDark ? "text-white/50" : "text-slate-400";
  const tableBorder = isDark ? "border-white/8" : "border-slate-200";
  const tableRowEven = isDark ? "bg-white/[0.02]" : "bg-slate-50/60";
  const tableRowOdd = isDark ? "bg-transparent" : "bg-white";

  // ── Slot state ──────────────────────────────────────────────────────────────
  const [targetSlot, setTargetSlot] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const [slotInfo, setSlotInfo] = useState(getNextSlotInfo);

  useEffect(() => {
    const tick = () => {
      const info = getNextSlotInfo();
      setSlotInfo(info);
      const m = info.minsUntil;
      const h = Math.floor(m / 60);
      const min = Math.floor(m % 60);
      setCountdown(h > 0 ? `${h}j ${min}m` : `${min}m`);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  const activeSlot = targetSlot ?? slotInfo.nextSlot;
  const dayName = getWibDayName();

  // ── Heavy computations ──────────────────────────────────────────────────────
  const pred = useMemo(
    () => buildPred4D(resultData, activeSlot, dayName),
    [resultData, activeSlot, dayName],
  );

  const gameTypes = useMemo(
    () => calcGameTypes(pred.digits),
    [pred.digits],
  );

  const lastResult = useMemo(
    () => getLastResult(resultData, activeSlot),
    [resultData, activeSlot],
  );

  const prevSlotResult = useMemo(() => {
    const ps = PREV_SLOT[activeSlot];
    return ps ? getLastResult(resultData, ps) : null;
  }, [resultData, activeSlot]);

  const dataCount = useMemo(
    () => getDrawsForSlot(resultData, activeSlot).length,
    [resultData, activeSlot],
  );

  const [showBacktest, setShowBacktest] = useState(false);
  const accuracy = useMemo(() => {
    if (!showBacktest) return null;
    return backtestV2(resultData, activeSlot);
  }, [showBacktest, resultData, activeSlot]);

  const [showDigitCharts, setShowDigitCharts] = useState(false);
  const [showCandidates, setShowCandidates] = useState(true);
  const [copied, setCopied] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Colour helpers
  const confColour = (c: number) =>
    c >= 80 ? "text-green-400" : c >= 60 ? "text-amber-400" : "text-slate-400";

  const oddEvenColour = (v: string) => {
    if (v === "GANJIL") return isDark ? "text-orange-300 font-black" : "text-orange-600 font-black";
    if (v === "GENAP")  return isDark ? "text-blue-300 font-black"   : "text-blue-600 font-black";
    return "";
  };
  const bigSmallColour = (v: string) => {
    if (v === "BESAR") return isDark ? "text-red-300 font-black"   : "text-red-600 font-black";
    if (v === "KECIL") return isDark ? "text-cyan-300 font-black"  : "text-cyan-600 font-black";
    return "";
  };
  const silangColour = (v: string) => {
    if (v === "SILANG") return isDark ? "text-violet-300 font-black" : "text-violet-600 font-black";
    if (v === "HOMO")   return isDark ? "text-pink-300 font-black"   : "text-pink-600 font-black";
    return "";
  };
  const kempColour = (v: string) => {
    if (v === "KEMBANG") return isDark ? "text-green-300 font-black"  : "text-green-600 font-black";
    if (v === "KEMPIS")  return isDark ? "text-red-300 font-black"    : "text-red-600 font-black";
    if (v === "KEMBAR")  return isDark ? "text-amber-300 font-black"  : "text-amber-600 font-black";
    return "";
  };

  const gt = gameTypes;

  // ── Prediction table rows ───────────────────────────────────────────────────
  type TableRow =
    | { kind: "4col"; label: string; as: string; kop: string; kepala: string; ekor: string; style?: string }
    | { kind: "4col_style"; label: string; cols: { v: string; cls: string }[] }
    | { kind: "span"; label: string; value: string; cls?: string }
    | { kind: "4col_oe"; label: string; go: [string,string,string,string]; bk: [string,string,string,string] };

  const tableRows: TableRow[] = [
    { kind: "4col", label: "4D",
      as: gt.d4.as, kop: gt.d4.kop, kepala: gt.d4.kepala, ekor: gt.d4.ekor },
    { kind: "4col", label: "3D",
      as: "X", kop: gt.d3.kop, kepala: gt.d3.kepala, ekor: gt.d3.ekor },
    { kind: "4col", label: "2D",
      as: "X", kop: "X", kepala: gt.d2.kepala, ekor: gt.d2.ekor },
    { kind: "4col", label: "Colok Bebas",
      as: gt.colokBebas.as, kop: gt.colokBebas.kop,
      kepala: gt.colokBebas.kepala, ekor: gt.colokBebas.ekor },
    { kind: "4col_oe", label: "Kombinasi",
      go: [gt.komGoAs, gt.komGoKop, gt.komGoKepala, gt.komGoEkor],
      bk: [gt.komBkAs, gt.komBkKop, gt.komBkKepala, gt.komBkEkor] },
    { kind: "4col", label: "Colok Jitu",
      as: gt.colokJitu.as, kop: gt.colokJitu.kop,
      kepala: gt.colokJitu.kepala, ekor: gt.colokJitu.ekor },
    { kind: "4col_oe", label: "50-50",
      go: [gt.fiftGoAs, gt.fiftGoKop, gt.fiftGoKepala, gt.fiftGoEkor],
      bk: [gt.fiftBkAs, gt.fiftBkKop, gt.fiftBkKepala, gt.fiftBkEkor] },
    { kind: "span", label: "Colok Bebas 2D", value: gt.colokBebas2D },
    { kind: "span", label: "Shio", value: gt.shio },
    { kind: "span", label: "Macau Shio", value: gt.macauShio },
    { kind: "span", label: "SILANG HOMO",
      value: `Depan:${gt.silangDepan}  Tengah:${gt.silangTengah}  Belakang:${gt.silangBelakang}`,
      cls: "tracking-wide" },
    { kind: "span", label: "TENGAH TEPI", value: gt.tengahTepi },
    { kind: "span", label: "KEMBANG KEMPIS KEMBAR",
      value: `Depan:${gt.kempDepan}  Tengah:${gt.kempTengah}  Belakang:${gt.kempBelakang}` },
    { kind: "span", label: "Dasar", value: gt.dasar },
  ];

  const thCls = `text-center text-xs font-black uppercase tracking-widest py-3 px-2 border-b ${tableBorder} ${isDark ? "text-white/80" : "text-slate-700"}`;
  const tdLabelCls = `text-left text-xs font-bold pl-4 py-3 ${isDark ? "text-white/60" : "text-slate-600"} border-r ${tableBorder}`;
  const tdValueCls = `text-center text-sm font-black tracking-widest tabular-nums`;

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black">Smart Prediction AI</h2>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-purple-500/40 text-purple-300 bg-purple-500/15" : "border-purple-200 text-purple-700 bg-purple-50"}`}>V2</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-indigo-500/40 text-indigo-300 bg-indigo-500/15" : "border-indigo-200 text-indigo-700 bg-indigo-50"}`}>10 ENGINE</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/15" : "border-cyan-200 text-cyan-700 bg-cyan-50"}`}>4D POSISI</span>
            </div>
            <p className={`text-xs ${subtle}`}>
              {dataCount} draw dianalisis · Per-digit As/Kop/Kepala/Ekor · Update otomatis
            </p>
          </div>

          {/* Slot selector */}
          <div className="flex flex-col items-end gap-1.5">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${subtle}`}>Target Prediksi</div>
            <select
              value={targetSlot ?? "auto"}
              onChange={e => setTargetSlot(e.target.value === "auto" ? null : e.target.value)}
              className={`text-xs font-bold px-2 py-1.5 rounded-lg border outline-none transition-all ${isDark ? "bg-white/10 border-white/20 text-white" : "bg-white border-slate-200 text-slate-700"}`}
            >
              <option value="auto">⟳ Auto ({slotInfo.nextSlot})</option>
              {TIME_SLOTS.map(s => <option key={s} value={s}>{s} — {SLOT_NAMES[s]}</option>)}
            </select>
            {targetSlot === null && (
              <div className={`text-[10px] ${subtle}`}>
                <Clock className="w-3 h-3 inline mr-0.5" />
                <span className="font-bold tabular-nums">{countdown}</span> lagi
              </div>
            )}
          </div>
        </div>

        {/* Context pills */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <span className={subtle}>Terakhir di {activeSlot}:</span>
            <span className="font-black text-base tracking-widest">{lastResult ?? "—"}</span>
          </div>
          {prevSlotResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <span className={subtle}>Prev slot ({PREV_SLOT[activeSlot]}):</span>
              <span className="font-black text-base tracking-widest">{prevSlotResult}</span>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-purple-500/15 border-purple-500/30 text-purple-300" : "bg-purple-50 border-purple-200 text-purple-700"}`}>
            <Shield className="w-3.5 h-3.5" />
            <span className="font-bold">Kepercayaan: <span className={`${confColour(pred.overallConfidence)}`}>{pred.overallConfidence}%</span></span>
          </div>
        </div>
      </div>

      {/* ══ PREDICTION TABLE (matches image format) ══════════════════════════ */}
      <div className={`overflow-hidden rounded-[20px] border shadow-xl ${isDark ? "border-amber-500/30 shadow-amber-500/10" : "border-amber-300/50 shadow-amber-200/30"}`}>
        {/* Gold header */}
        <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-slate-900 font-black text-lg tracking-widest">PREDIKSI JAM {activeSlot}</div>
            <div className="text-slate-800/80 text-xs font-semibold mt-0.5">
              {dataCount} data · 10 engine · Kepercayaan {pred.overallConfidence}%
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="bg-slate-900/25 rounded-xl px-4 py-2 text-slate-900 font-black text-3xl tracking-widest tabular-nums">
              {pred.numberStr}
            </div>
            <div className="text-slate-800/70 text-[10px] font-bold">Prediksi Utama 4D</div>
          </div>
        </div>

        {/* Per-position confidence strip */}
        <div className={`grid grid-cols-4 border-b ${tableBorder} ${isDark ? "bg-white/5" : "bg-amber-50/70"}`}>
          {(["As", "Kop", "Kepala", "Ekor"] as const).map((label, i) => (
            <div key={label} className={`flex flex-col items-center py-2.5 px-2 ${i < 3 ? `border-r ${tableBorder}` : ""}`}>
              <div className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>{label}</div>
              <div className={`text-2xl font-black tabular-nums mt-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                {pred.digits[i]}
              </div>
              <div className={`text-[9px] font-bold mt-0.5 ${confColour(pred.posResults[i].topConfidence)}`}>
                {pred.posResults[i].topConfidence}%
              </div>
            </div>
          ))}
        </div>

        {/* Main table */}
        <table className="w-full border-collapse">
          <thead>
            <tr className={isDark ? "bg-white/8" : "bg-slate-100/80"}>
              <th className={`${thCls} text-left pl-4 w-[30%]`}>Games</th>
              <th className={thCls}>As</th>
              <th className={thCls}>Kop</th>
              <th className={thCls}>Kepala</th>
              <th className={thCls}>Ekor</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => {
              const rowBg = i % 2 === 0 ? tableRowEven : tableRowOdd;
              const bdr = `border-b ${tableBorder}`;

              if (row.kind === "4col") {
                const isX = (v: string) => v === "X";
                const cellCls = (v: string) => `${tdValueCls} py-3 px-2 ${isX(v) ? (isDark ? "text-white/20" : "text-slate-300") : (isDark ? "text-white" : "text-slate-800")}`;
                return (
                  <tr key={i} className={`${rowBg} ${bdr}`}>
                    <td className={tdLabelCls}>{row.label}</td>
                    <td className={cellCls(row.as)}>{row.as}</td>
                    <td className={cellCls(row.kop)}>{row.kop}</td>
                    <td className={cellCls(row.kepala)}>{row.kepala}</td>
                    <td className={cellCls(row.ekor)}>{row.ekor}</td>
                  </tr>
                );
              }

              if (row.kind === "4col_oe") {
                return (
                  <React.Fragment key={i}>
                    <tr className={`${rowBg} border-b ${isDark ? "border-white/3" : "border-slate-100"}`}>
                      <td className={`${tdLabelCls} pb-1`} rowSpan={2}>{row.label}</td>
                      {row.go.map((v, j) => (
                        <td key={j} className={`${tdValueCls} py-2 px-2 text-[11px] ${oddEvenColour(v)}`}>{v}</td>
                      ))}
                    </tr>
                    <tr className={`${rowBg} ${bdr}`}>
                      {row.bk.map((v, j) => (
                        <td key={j} className={`${tdValueCls} py-2 px-2 text-[11px] ${bigSmallColour(v)}`}>{v}</td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              }

              if (row.kind === "span") {
                const isShio = row.label === "SILANG HOMO" || row.label === "KEMBANG KEMPIS KEMBAR";
                return (
                  <tr key={i} className={`${rowBg} ${bdr}`}>
                    <td className={tdLabelCls}>{row.label}</td>
                    <td colSpan={4} className={`text-center text-xs font-bold py-3 px-4 ${row.cls ?? ""} ${isDark ? "text-white/80" : "text-slate-700"}`}>
                      {row.label === "SILANG HOMO" ? (
                        <span>
                          Depan:<span className={silangColour(gt.silangDepan)}>{gt.silangDepan}</span>
                          {" · "}Tengah:<span className={silangColour(gt.silangTengah)}>{gt.silangTengah}</span>
                          {" · "}Belakang:<span className={silangColour(gt.silangBelakang)}>{gt.silangBelakang}</span>
                        </span>
                      ) : row.label === "KEMBANG KEMPIS KEMBAR" ? (
                        <span>
                          Depan:<span className={kempColour(gt.kempDepan)}>{gt.kempDepan}</span>
                          {" · "}Tengah:<span className={kempColour(gt.kempTengah)}>{gt.kempTengah}</span>
                          {" · "}Belakang:<span className={kempColour(gt.kempBelakang)}>{gt.kempBelakang}</span>
                        </span>
                      ) : row.label === "TENGAH TEPI" ? (
                        <span className={isDark ? (gt.tengahTepi === "TENGAH" ? "text-emerald-300 font-black" : "text-orange-300 font-black") : (gt.tengahTepi === "TENGAH" ? "text-emerald-600 font-black" : "text-orange-600 font-black")}>
                          {gt.tengahTepi}
                        </span>
                      ) : row.value}
                    </td>
                  </tr>
                );
              }

              return null;
            })}
          </tbody>
        </table>

        {/* Copy button */}
        <div className={`px-5 py-3 flex items-center justify-between border-t ${tableBorder} ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
          <span className={`text-[11px] ${subtle}`}>Prediksi dibuat dari {dataCount} draw historis · {activeSlot} WIB</span>
          <button
            onClick={() => copy(
              `SMART AI V2 — ${activeSlot} WIB\n4D: ${pred.numberStr}\n3D: ${gt.d3.kop}${gt.d3.kepala}${gt.d3.ekor}\n2D: ${gt.d2.kepala}${gt.d2.ekor}\nShio: ${gt.shio}\nDasar: ${gt.dasar}\nColok Bebas 2D: ${gt.colokBebas2D}`
            )}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white/70" : "bg-slate-200 hover:bg-slate-300 text-slate-600"}`}
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* ══ TOP 12 CANDIDATES ════════════════════════════════════════════════ */}
      <div className={card}>
        <button
          onClick={() => setShowCandidates(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Star className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
            <span className="font-black text-sm">Top 12 Kandidat 4D</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600"}`}>
              Kombinasi terbaik per posisi
            </span>
          </div>
          {showCandidates ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showCandidates && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pred.topCandidates.map((c, i) => {
                const isTop = i === 0;
                const pct = Math.round((c.prob / pred.topCandidates[0].prob) * 100);
                return (
                  <div key={c.num} className={`relative rounded-2xl p-3 text-center border transition-all ${
                    isTop
                      ? "bg-gradient-to-br from-amber-500/25 to-yellow-500/15 border-amber-400/50"
                      : i < 3
                        ? isDark ? "bg-white/8 border-white/15" : "bg-slate-50 border-slate-200"
                        : isDark ? "bg-white/5 border-white/8" : "bg-slate-50/60 border-slate-100"
                  }`}>
                    {isTop && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                        #1
                      </span>
                    )}
                    <div className={`text-xl font-black tabular-nums tracking-widest ${isTop ? (isDark ? "text-amber-300" : "text-amber-600") : ""}`}>
                      {c.num}
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className={`text-[9px] mt-1 font-bold ${subtle}`}>rel. {pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══ PER-POSITION DIGIT CHARTS ════════════════════════════════════════ */}
      <div className={card}>
        <button
          onClick={() => setShowDigitCharts(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
            <span className="font-black text-sm">Distribusi Digit Per Posisi</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-cyan-500/15 text-cyan-300" : "bg-cyan-50 text-cyan-600"}`}>
              Skor 0-100 per digit
            </span>
          </div>
          {showDigitCharts ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showDigitCharts && (
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {POS_NAMES.map((posName, pi) => {
              const scores = pred.posResults[pi].scores;
              const topDig = pred.posResults[pi].topDigit;
              const chartData = scores.map((score, digit) => ({
                label: String(digit),
                score: Math.round(score),
                fill: digit === topDig ? "#f59e0b" : score > 60 ? "#8b5cf6" : "#475569",
              }));
              return (
                <div key={posName} className={`rounded-2xl p-4 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-black uppercase tracking-widest ${isDark ? "text-white/70" : "text-slate-600"}`}>
                      Posisi {posName}
                    </span>
                    <span className={`text-xl font-black tabular-nums ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                      {topDig}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={chartData} barSize={14} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number) => [`${v}%`, "Skor"]}
                      />
                      <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ ENGINE BREAKDOWN ════════════════════════════════════════════════ */}
      <div className={card}>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className={`w-4 h-4 ${isDark ? "text-violet-400" : "text-violet-600"}`} />
            <span className="font-black text-sm">10 Engine Aktif</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { id: "1", name: "Recency Eksponensial", w: 22, color: "#8b5cf6", icon: <Zap className="w-3 h-3" /> },
              { id: "2", name: "Gap / Overdue",         w: 18, color: "#f59e0b", icon: <Clock className="w-3 h-3" /> },
              { id: "3", name: "Momentum Tren",         w: 14, color: "#ef4444", icon: <TrendingUp className="w-3 h-3" /> },
              { id: "4", name: "Pola Hari + Slot",      w: 10, color: "#10b981", icon: <Activity className="w-3 h-3" /> },
              { id: "5", name: "Markov Transisi",       w: 12, color: "#3b82f6", icon: <ArrowRight className="w-3 h-3" /> },
              { id: "6", name: "Transisi Slot",         w: 10, color: "#06b6d4", icon: <Layers className="w-3 h-3" /> },
              { id: "7", name: "Balance Frekuensi",     w:  6, color: "#84cc16", icon: <Hash className="w-3 h-3" /> },
              { id: "8", name: "Posisi Harmonis",       w:  4, color: "#f97316", icon: <Star className="w-3 h-3" /> },
              { id: "9", name: "Streak Detector",       w:  3, color: "#ec4899", icon: <Flame className="w-3 h-3" /> },
              { id:"10", name: "Distribusi Seragam",    w:  1, color: "#64748b", icon: <RefreshCw className="w-3 h-3" /> },
            ].map(e => (
              <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: e.color }}>
                  {e.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold truncate ${isDark ? "text-white/80" : "text-slate-700"}`}>{e.name}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${e.w}%`, backgroundColor: e.color }} />
                  </div>
                </div>
                <div className={`text-xs font-black tabular-nums flex-shrink-0 ${isDark ? "text-white/50" : "text-slate-400"}`}>{e.w}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ BACKTESTING ════════════════════════════════════════════════════ */}
      <div className={card}>
        <button
          onClick={() => setShowBacktest(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className={`w-4 h-4 ${isDark ? "text-green-400" : "text-green-600"}`} />
            <span className="font-black text-sm">Akurasi Historis (Backtest)</span>
            {!showBacktest && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-green-500/15 text-green-300" : "bg-green-50 text-green-600"}`}>
                Klik untuk hitung
              </span>
            )}
          </div>
          {showBacktest ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showBacktest && accuracy && (
          <div className="px-5 pb-5">
            {accuracy.total === 0 ? (
              <p className={`text-sm ${subtle}`}>Data historis tidak cukup untuk backtest.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div className={`flex-1 min-w-[140px] rounded-2xl p-4 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className={`text-4xl font-black ${confColour(accuracy.rate)}`}>{accuracy.rate}%</div>
                  <div className={`text-xs mt-1 ${subtle}`}>Hit Rate Top-10</div>
                </div>
                <div className={`flex-1 min-w-[140px] rounded-2xl p-4 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className="text-4xl font-black">{accuracy.correct}</div>
                  <div className={`text-xs mt-1 ${subtle}`}>Tepat dari {accuracy.total} tes</div>
                </div>
                <div className={`flex-1 min-w-[200px] rounded-2xl p-4 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <p className={`text-xs ${subtle} leading-relaxed`}>
                    Backtest mengecek apakah 4D aktual masuk dalam top-10 kandidat prediksi,
                    menggunakan data historis slot <strong className={isDark ? "text-white/70" : "text-slate-600"}>{activeSlot}</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
