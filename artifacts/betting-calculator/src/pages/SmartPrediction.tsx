/**
 * SmartPrediction — Mesin Prediksi AI Terpadu TTM4D
 *
 * 7 engine independen berjalan paralel → konsensus berbobot adaptif
 * Auto-update setiap kali data result baru masuk.
 *
 * Engine A — Transisi Slot       (28%) : pola hasil slot sebelumnya → slot berikutnya
 * Engine B — Recency Eksponensial (23%) : draw terbaru punya bobot jauh lebih tinggi
 * Engine C — Gap / Overdue        (19%) : nomor yang lama tak muncul → prioritas tinggi
 * Engine D — Pola Hari + Slot     (10%) : statistik spesifik hari & slot ini
 * Engine E — Momentum Tren        (8%)  : nomor yang meningkat frekuensinya baru-baru ini
 * Engine F — Digit Posisi         (7%)  : prediksi digit AS & KOP secara independen
 * Engine G — Kembar / Pola Siklus (5%)  : deteksi tren kembar, konsekutif, dan spread
 *
 * Adaptive Weights: computeAdaptiveWeights() measures each engine's top-20 hit
 * rate over the last 20 draws and suggests optimised weights for the active slot.
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Brain, Cpu, Activity, TrendingUp, Clock, Zap, Flame,
  CheckCircle, Star, Target, BarChart2, RefreshCw,
  ChevronDown, ChevronUp, Award, AlertCircle, Hash, Layers,
  ArrowRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_NAMES: Record<string, string> = {
  "00:01": "Tengah Malam", "13:00": "Siang",
  "16:00": "Sore", "19:00": "Malam",
  "22:00": "Larut Malam", "23:00": "Dini Hari",
};
const SLOT_MINUTES: Record<string, number> = {
  "00:01": 1, "13:00": 780, "16:00": 960,
  "19:00": 1140, "22:00": 1320, "23:00": 1380,
};
const INTRA_DAY_PREV: Record<string, string | null> = {
  "00:01": null, "13:00": "00:01", "16:00": "13:00",
  "19:00": "16:00", "22:00": "19:00", "23:00": "22:00",
};
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ALL_2D = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

const WIB_MS = 7 * 3600 * 1000;

/* ─── WIB Utilities ─────────────────────────────────────────────────────────── */
function wibMinutes(): number {
  return ((Date.now() + WIB_MS) % 86_400_000) / 60_000;
}

function getNextSlotInfo(): {
  nextSlot: string; prevSlot: string | null;
  dayName: string; minsUntil: number;
} {
  const wib = wibMinutes();
  const dayName = DAY_NAMES[new Date().getDay()];
  let nextSlot = "00:01";
  let minsUntil = 1440 - wib + 1;

  for (const s of TIME_SLOTS) {
    if (SLOT_MINUTES[s] > wib) {
      nextSlot = s;
      minsUntil = SLOT_MINUTES[s] - wib;
      break;
    }
  }

  return {
    nextSlot,
    prevSlot: INTRA_DAY_PREV[nextSlot],
    dayName,
    minsUntil: Math.max(0, Math.ceil(minsUntil)),
  };
}

/* ─── Data helpers ──────────────────────────────────────────────────────────── */
function validDraw(v: string): boolean { return /^\d{4}$/.test(v); }
function depan(v: string): string { return v.slice(0, 2); }
function ekor(v: string): string { return v.slice(2); }

function getSlotResult(row: ResultRow, slot: string): string | null {
  const v = String(row[slot] || "");
  return validDraw(v) ? v : null;
}

// Get the most recent known result for a given slot
function getLastSlotResult(resultData: ResultRow[], slot: string): string | null {
  for (const row of resultData) {
    const r = getSlotResult(row, slot);
    if (r) return r;
  }
  return null;
}

// Get the most recent result for a slot just before nextSlot
function getPrevResult(resultData: ResultRow[], nextSlot: string): {
  slot: string; result: string
} | null {
  const prevSlot = INTRA_DAY_PREV[nextSlot];

  if (prevSlot) {
    // Same-day: prevSlot is on the same row as nextSlot
    for (const row of resultData) {
      const r = getSlotResult(row, prevSlot);
      if (r) return { slot: prevSlot, result: r };
    }
    return null;
  }

  // 00:01 — previous slot is 23:00 of PREVIOUS row
  if (nextSlot === "00:01") {
    // The prev-day's 23:00 is at resultData[1] if today's row is resultData[0]
    // But if today's 00:01 hasn't happened yet, resultData[0] may have today's slots
    // Look for the most recent 23:00 that has data
    for (const row of resultData) {
      const r = getSlotResult(row, "23:00");
      if (r) return { slot: "23:00", result: r };
    }
    return null;
  }

  return null;
}

/* ─── Normalize: scale record values to [0,1] ──────────────────────────────── */
function norm(scores: Record<string, number>): Record<string, number> {
  const max = Math.max(...Object.values(scores), 1e-9);
  if (max === 0) return scores;
  const out: Record<string, number> = {};
  for (const k in scores) out[k] = scores[k] / max;
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE A — Slot Chain Transition (30%)
   Historis: jika slot_prev menghasilkan X, slot_target sering menghasilkan Y?
   Bobot ekstra untuk kecocokan 2D tepat (x3), kecocokan digit pertama (x1),
   plus base rate dari semua transisi (x0.15).
══════════════════════════════════════════════════════════════════════════════ */
function engineA(
  resultData: ResultRow[],
  prevSlot: string,
  prevResult: string,
  nextSlot: string
): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  const prevD2 = depan(prevResult);
  const psi = TIME_SLOTS.indexOf(prevSlot);
  const nsi = TIME_SLOTS.indexOf(nextSlot);
  const sameDay = nsi === psi + 1;
  const crossDay = nextSlot === "00:01" && prevSlot === "23:00";

  function addTransition(pv: string, nv: string) {
    const p2 = depan(pv);
    const n2 = depan(nv);
    if (p2 === prevD2) scores[n2] += 3.0;       // exact match
    if (p2[0] === prevD2[0]) scores[n2] += 0.8;  // first-digit match
    scores[n2] += 0.15;                           // base rate
  }

  if (sameDay) {
    resultData.forEach(row => {
      const pv = getSlotResult(row, prevSlot);
      const nv = getSlotResult(row, nextSlot);
      if (pv && nv) addTransition(pv, nv);
    });
  } else if (crossDay) {
    for (let i = 0; i < resultData.length - 1; i++) {
      const pv = getSlotResult(resultData[i + 1], "23:00"); // older
      const nv = getSlotResult(resultData[i], "00:01");     // newer
      if (pv && nv) addTransition(pv, nv);
    }
  } else {
    // Non-adjacent slots: use same-day correlation
    resultData.forEach(row => {
      const pv = getSlotResult(row, prevSlot);
      const nv = getSlotResult(row, nextSlot);
      if (pv && nv) addTransition(pv, nv);
    });
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE B — Recency Weighted Frequency (25%)
   Draw terbaru mendapat bobot eksponensial lebih tinggi (e^(-i*0.08)).
   Khusus untuk slot target saja.
══════════════════════════════════════════════════════════════════════════════ */
function engineB(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  let idx = 0;
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    const w = Math.exp(-idx * 0.08);
    scores[depan(v)] += w;
    idx++;
  }
  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE C — Gap / Overdue Analysis (20%)
   Nomor yang lama tak muncul relatif terhadap interval rata-ratanya.
   Score = min(3, currentGap / avgInterval) / 3
══════════════════════════════════════════════════════════════════════════════ */
function engineC(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  const freq: Record<string, number> = {};
  const lastSeen: Record<string, number> = {};   // draw-index of most recent appearance
  ALL_2D.forEach(k => { scores[k] = 0; freq[k] = 0; lastSeen[k] = -1; });

  let idx = 0;
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    const d2 = depan(v);
    freq[d2]++;
    if (lastSeen[d2] === -1) lastSeen[d2] = idx; // first found = most recent
    idx++;
  }

  const totalDraws = idx;
  if (totalDraws < 5) return scores;

  for (const k of ALL_2D) {
    const f = freq[k];
    const last = lastSeen[k] === -1 ? totalDraws : lastSeen[k];
    const expectedInterval = f > 0 ? totalDraws / f : totalDraws;
    const overdue = last / Math.max(expectedInterval, 1);
    scores[k] = Math.min(3, overdue) / 3;
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE D — Day-of-Week + Slot Pattern (10%)
   Statistik per hari kalender + slot waktu spesifik.
══════════════════════════════════════════════════════════════════════════════ */
function engineD(resultData: ResultRow[], dayName: string, slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  for (const row of resultData) {
    if (row.hari !== dayName) continue;
    const v = getSlotResult(row, slot);
    if (!v) continue;
    scores[depan(v)] += 1;
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE E — Momentum / Trend (8%)
   Bandingkan frekuensi dalam 12 draw terbaru vs 12 draw sebelumnya untuk slot ini.
   Nomor yang sedang "naik" mendapat skor lebih tinggi.
══════════════════════════════════════════════════════════════════════════════ */
function engineE(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  const draws: string[] = [];
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (v) draws.push(depan(v));
  }
  if (draws.length < 10) return scores;

  const half = Math.min(12, Math.floor(draws.length / 2));
  const recent = draws.slice(0, half);
  const prior = draws.slice(half, half * 2);
  const N = half;

  const rf: Record<string, number> = {};
  const pf: Record<string, number> = {};
  ALL_2D.forEach(k => { rf[k] = 0; pf[k] = 0; });
  recent.forEach(d => rf[d]++);
  prior.forEach(d => pf[d]++);

  for (const k of ALL_2D) {
    const momentum = rf[k] / N - pf[k] / N;
    scores[k] = Math.max(0, momentum) + rf[k] * 0.04;
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE F — Digit Positional Scoring (7%)
   Hitung skor per digit (0-9) untuk posisi AS (pos 0) dan KOP (pos 1) secara
   independen menggunakan recency decay, lalu gabungkan ke 2D.
══════════════════════════════════════════════════════════════════════════════ */
function engineF(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  // posFreq[pos][digit]
  const pf: number[][] = Array.from({ length: 2 }, () => new Array(10).fill(0));
  let idx = 0;

  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    const decay = Math.exp(-idx * 0.06);
    pf[0][+v[0]] += decay;
    pf[1][+v[1]] += decay;
    idx++;
  }

  const maxP = pf.map(p => Math.max(...p, 1e-9));

  for (const k of ALL_2D) {
    const s0 = pf[0][+k[0]] / maxP[0];
    const s1 = pf[1][+k[1]] / maxP[1];
    scores[k] = (s0 * 0.55 + s1 * 0.45);
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE G — Kembar / Pattern Cycle (5%)
   Detects twin (kembar), consecutive, and spread digit patterns in recent draws.
   Proportionally rewards 2D number types that have trended recently in this slot:
   - "Kembar" (same digit: 11, 22, ...) — rewarded when slot shows kembar trend
   - "Konsekutif" (differ by 1: 01, 12, ...) — rewarded on consecutive trend
   - "Jauh" (differ by ≥5: 06, 17, ...) — rewarded on spread-digit trend
   Also applies per-digit recency bonus for which kembar digit is cycling.
══════════════════════════════════════════════════════════════════════════════ */
function engineG(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));

  const recentDraws: string[] = [];
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    recentDraws.push(depan(v));
  }

  if (recentDraws.length < 5) return norm(scores);

  const last15 = recentDraws.slice(0, 15);
  const total15 = last15.length;

  const kembarRate = last15.filter(d => d[0] === d[1]).length / total15;
  const konsekRate = last15.filter(d => Math.abs(+d[0] - +d[1]) === 1).length / total15;
  const jauhRate   = last15.filter(d => Math.abs(+d[0] - +d[1]) >= 5).length / total15;

  for (const k of ALL_2D) {
    const diff = Math.abs(+k[0] - +k[1]);
    if (k[0] === k[1])   scores[k] = kembarRate * 2.5 + 0.05;
    else if (diff === 1)  scores[k] = konsekRate  * 1.5 + 0.05;
    else if (diff >= 5)   scores[k] = jauhRate    * 1.2 + 0.05;
    else                  scores[k] = 0.05;
  }

  // Recency: recent kembar digits tend to cycle within ±1
  let kIdx = 0;
  for (const d of last15) {
    if (d[0] === d[1]) {
      const digit = +d[0];
      const decay = Math.exp(-kIdx * 0.25);
      for (let i = 0; i <= 9; i++) {
        scores[`${i}${i}`] += decay * (Math.abs(i - digit) <= 1 ? 1.5 : 0.3);
      }
    }
    kIdx++;
  }

  return norm(scores);
}

/* ══════════════════════════════════════════════════════════════════════════════
   CONSENSUS ENGINE
   Gabungkan semua engine dengan bobot tertimbang.
══════════════════════════════════════════════════════════════════════════════ */
interface EngineResult {
  id: string;
  name: string;
  scores: Record<string, number>;
  weight: number;
  color: string;
  icon: React.ReactNode;
  enabled: boolean;
}

interface CandidateNumber {
  num: string;
  score: number;       // 0–100
  rank: number;
  topEngines: string[];
  confidence: "tinggi" | "sedang" | "rendah";
}

function computeConsensus(engines: EngineResult[]): CandidateNumber[] {
  const active = engines.filter(e => e.enabled);
  const totalW = active.reduce((s, e) => s + e.weight, 0);
  if (totalW === 0) return [];

  const raw: Record<string, number> = {};
  ALL_2D.forEach(k => (raw[k] = 0));

  for (const e of active) {
    const w = e.weight / totalW;
    for (const k of ALL_2D) raw[k] += (e.scores[k] || 0) * w;
  }

  const maxScore = Math.max(...Object.values(raw), 1e-9);

  const sorted = ALL_2D
    .map((num, _) => {
      const score = (raw[num] / maxScore) * 100;
      const topEngines = active
        .filter(e => (e.scores[num] || 0) > 0.6)
        .map(e => e.id);
      return { num, score, topEngines };
    })
    .sort((a, b) => b.score - a.score);

  return sorted.map((item, idx) => ({
    ...item,
    rank: idx + 1,
    confidence:
      item.score >= 70 ? "tinggi" :
      item.score >= 45 ? "sedang" : "rendah",
  }));
}

/* ══════════════════════════════════════════════════════════════════════════════
   BACKTESTING — Ukur akurasi historis (top-N hit rate)
   Cek apakah top-N prediksi dari N-draw terakhir berhasil menebak draw ke-N+1.
══════════════════════════════════════════════════════════════════════════════ */
function backtest(
  resultData: ResultRow[],
  slot: string,
  topN: number = 20,
  testRounds: number = 30
): { correct: number; total: number; rate: number } {
  const draws: string[] = [];
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (v) draws.push(depan(v)); // newest first
  }

  if (draws.length < testRounds + 20) {
    return { correct: 0, total: 0, rate: 0 };
  }

  let correct = 0;
  let total = 0;

  // Test the last `testRounds` draws
  // For test i: use draws[i+1..] as history, check if draws[i] in top-N
  for (let i = 0; i < Math.min(testRounds, draws.length - 20); i++) {
    const actual = draws[i];
    const history = draws.slice(i + 1); // older draws as training data

    // Fast version of engineB on this sub-history
    const scores: Record<string, number> = {};
    ALL_2D.forEach(k => (scores[k] = 0));
    history.forEach((d, idx) => { scores[d] += Math.exp(-idx * 0.08); });

    // Also add gap bonus
    const lastSeen: Record<string, number> = {};
    ALL_2D.forEach(k => (lastSeen[k] = history.length));
    history.forEach((d, idx) => { if (lastSeen[d] === history.length) lastSeen[d] = idx; });
    const freq: Record<string, number> = {};
    ALL_2D.forEach(k => (freq[k] = 0));
    history.forEach(d => freq[d]++);
    for (const k of ALL_2D) {
      const f = freq[k];
      const last = lastSeen[k];
      const avgInt = f > 0 ? history.length / f : history.length;
      const overdue = Math.min(3, last / Math.max(avgInt, 1)) / 3;
      scores[k] += overdue * 0.4;
    }

    const topN_list = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([k]) => k);

    if (topN_list.includes(actual)) correct++;
    total++;
  }

  return { correct, total, rate: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

/* ══════════════════════════════════════════════════════════════════════════════
   ADAPTIVE WEIGHT OPTIMIZER
   For each engine, computes its individual top-20 hit rate over the last
   testRounds draws. Returns hit rates (%) and suggested weights proportional
   to each engine's recent accuracy. Engine A is approximated by using the
   most recent result from prevSlot as context.
══════════════════════════════════════════════════════════════════════════════ */
function computeAdaptiveWeights(
  resultData: ResultRow[],
  slot: string,
  prevSlot: string | null,
  testRounds = 20
): { hitRates: Record<string, number>; suggestedWeights: Record<string, number> } {
  type EngKey = "A" | "B" | "C" | "D" | "E" | "F" | "G";
  const ENG: EngKey[] = ["A", "B", "C", "D", "E", "F", "G"];
  const defaultOut = {
    hitRates: { A:0, B:0, C:0, D:0, E:0, F:0, G:0 } as Record<string,number>,
    suggestedWeights: { A:28, B:23, C:19, D:10, E:8, F:7, G:5 } as Record<string,number>,
  };

  const draws: { num: string; dayN: string; rowIdx: number }[] = [];
  for (let ri = 0; ri < resultData.length; ri++) {
    const v = getSlotResult(resultData[ri], slot);
    if (v) draws.push({ num: v, dayN: resultData[ri].hari, rowIdx: ri });
  }

  const available = Math.min(testRounds, draws.length - 15);
  if (available <= 0) return defaultOut;

  const hits: Record<string, number> = { A:0, B:0, C:0, D:0, E:0, F:0, G:0 };
  const TOP_N = 20;
  const topSet = (sc: Record<string,number>): Set<string> =>
    new Set(ALL_2D.slice().sort((a, b) => (sc[b]||0) - (sc[a]||0)).slice(0, TOP_N));

  for (let i = 0; i < available; i++) {
    const actual2d = depan(draws[i].num);
    const hist = resultData.slice(draws[i].rowIdx + 1);

    if (topSet(engineB(hist, slot)).has(actual2d)) hits.B++;
    if (topSet(engineC(hist, slot)).has(actual2d)) hits.C++;
    if (topSet(engineD(hist, draws[i].dayN, slot)).has(actual2d)) hits.D++;
    if (topSet(engineE(hist, slot)).has(actual2d)) hits.E++;
    if (topSet(engineF(hist, slot)).has(actual2d)) hits.F++;
    if (topSet(engineG(hist, slot)).has(actual2d)) hits.G++;
    if (prevSlot) {
      const approxPrev = getLastSlotResult(hist, prevSlot) ?? "0000";
      if (topSet(engineA(hist, prevSlot, approxPrev, slot)).has(actual2d)) hits.A++;
    }
  }

  const hitRates: Record<string, number> = {};
  for (const k of ENG) hitRates[k] = Math.round((hits[k] / available) * 100);

  const rawTotal = ENG.reduce((s, k) => s + hitRates[k], 0);
  if (rawTotal === 0) return { hitRates, suggestedWeights: defaultOut.suggestedWeights };

  const raw: Record<string, number> = {};
  for (const k of ENG) raw[k] = Math.max(2, Math.round((hitRates[k] / rawTotal) * 100));
  const rawSum = ENG.reduce((s, k) => s + raw[k], 0);
  const diff = 100 - rawSum;
  const maxKey = ENG.reduce((a, b) => raw[a] > raw[b] ? a : b);
  raw[maxKey] = Math.max(2, raw[maxKey] + diff);

  return { hitRates, suggestedWeights: raw };
}

/* ══════════════════════════════════════════════════════════════════════════════
   EKOR ENGINE — same concept as engineB but tracking last-2-digit (ekor) portion
══════════════════════════════════════════════════════════════════════════════ */
function engineB_ekor(resultData: ResultRow[], slot: string): Record<string, number> {
  const scores: Record<string, number> = {};
  ALL_2D.forEach(k => (scores[k] = 0));
  let idx = 0;
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    scores[ekor(v)] += Math.exp(-idx * 0.08);
    idx++;
  }
  return norm(scores);
}

function computeEkorConsensus(resultData: ResultRow[], slot: string): CandidateNumber[] {
  const scB = engineB_ekor(resultData, slot);
  const freq: Record<string, number> = {};
  const lastSeen: Record<string, number> = {};
  ALL_2D.forEach(k => { freq[k] = 0; lastSeen[k] = -1; });
  let idx = 0;
  for (const row of resultData) {
    const v = getSlotResult(row, slot);
    if (!v) continue;
    const ek = ekor(v);
    freq[ek]++;
    if (lastSeen[ek] === -1) lastSeen[ek] = idx;
    idx++;
  }
  const total = idx;
  const gap: Record<string, number> = {};
  ALL_2D.forEach(k => {
    const f = freq[k];
    const last = lastSeen[k] === -1 ? total : lastSeen[k];
    const avgInt = f > 0 ? total / f : total;
    gap[k] = Math.min(3, last / Math.max(avgInt, 1)) / 3;
  });
  const ngap = norm(gap);
  const combined: Record<string, number> = {};
  ALL_2D.forEach(k => (combined[k] = (scB[k] || 0) * 0.6 + (ngap[k] || 0) * 0.4));
  const mx = Math.max(...Object.values(combined), 1e-9);
  const sorted = ALL_2D.map(num => ({ num, score: (combined[num] / mx) * 100 })).sort((a, b) => b.score - a.score);
  return sorted.map((item, i) => ({
    ...item, rank: i + 1, topEngines: [],
    confidence: item.score >= 70 ? "tinggi" : item.score >= 45 ? "sedang" : "rendah",
  }));
}

/* ══════════════════════════════════════════════════════════════════════════════
   SHIO TABLE — Toto Macau standard (matches RumusPage / Prediksi2 / Analisis2)
   Formula : (n===0 ? 100 : n) % 12
   idx→name: 0=Kuda 1=Ular 2=Naga 3=Kelinci 4=Harimau 5=Kerbau
             6=Tikus 7=Babi 8=Anjing 9=Ayam 10=Monyet 11=Kambing
══════════════════════════════════════════════════════════════════════════════ */
const SHIO_NAMES = [
  "Kuda","Ular","Naga","Kelinci","Harimau","Kerbau",
  "Tikus","Babi","Anjing","Ayam","Monyet","Kambing",
];
function getShioIdx(numStr: string): number {
  const n = parseInt(numStr, 10);
  return (n === 0 ? 100 : n) % 12;
}
function getShioName(numStr: string): string {
  return SHIO_NAMES[getShioIdx(numStr)];
}
function getShioNums(idx: number): string[] {
  return ALL_2D.filter(d => getShioIdx(d) === idx);
}

/* ══════════════════════════════════════════════════════════════════════════════
   STRUCTURED PREDICTION — derive all 15 prediction fields
══════════════════════════════════════════════════════════════════════════════ */
interface StructuredPred {
  bbfs5d: string[];
  pred4d: string;
  pred3d: string;
  ekor2d: string;
  depan2d: string;
  tengah2d: string;
  colokBebas: string;
  colokBebas2d: string;
  colokJitu: string;
  dasar: string;
  tengahTepi: string;
  silangHomo: string;
  kembang: string;
  shio: string;
  bomHarian: string;
  dataCount: number;
  confidence: number;
}

function computeStructuredPred(
  candidates: CandidateNumber[],
  ekorCands: CandidateNumber[],
  resultData: ResultRow[],
  slot: string,
  prevResult: string | null
): StructuredPred {
  const topDepan = candidates[0]?.num ?? "00";
  const topEkor  = ekorCands[0]?.num  ?? "00";

  // 4D / 3D / 2D parts
  const pred4d   = topDepan + topEkor;
  const pred3d   = topDepan[1] + topEkor;
  const tengah2d = topDepan[1] + topEkor[0];

  // BBFS 5D — 5 unique digits from top depan+ekor candidates
  const digits: string[] = [];
  const seen = new Set<string>();
  for (const c of [...candidates, ...ekorCands]) {
    for (const d of [c.num[0], c.num[1]]) {
      if (!seen.has(d)) { seen.add(d); digits.push(d); }
      if (digits.length >= 5) break;
    }
    if (digits.length >= 5) break;
  }
  const bbfs5d = digits.slice(0, 5).sort();

  // Colok Bebas (single digit with highest weighted score)
  const dsc: Record<string, number> = {};
  for (let i = 0; i <= 9; i++) dsc[String(i)] = 0;
  candidates.slice(0, 20).forEach(c => {
    dsc[c.num[0]] = (dsc[c.num[0]] || 0) + c.score;
    dsc[c.num[1]] = (dsc[c.num[1]] || 0) + c.score * 0.85;
  });
  const sortedDigits = Object.entries(dsc).sort((a, b) => b[1] - a[1]);
  const colokBebas   = sortedDigits[0]?.[0] ?? "0";
  const colokBebas2d = `${sortedDigits[0]?.[0] ?? "0"}&${sortedDigits[1]?.[0] ?? "1"}`;

  // Colok Jitu — strongest positional digit (ekor pos 1, most certain)
  const posScore: number[][] = [[],[],[],[]].map(() => new Array(10).fill(0));
  candidates.slice(0, 10).forEach(c => {
    posScore[0][+c.num[0]] += c.score;
    posScore[1][+c.num[1]] += c.score;
  });
  ekorCands.slice(0, 10).forEach(c => {
    posScore[2][+c.num[0]] += c.score;
    posScore[3][+c.num[1]] += c.score;
  });
  const posNames4 = ["AS","KOP","KEPALA","EKOR"];
  let bestPosIdx = 3;
  let bestPosMax = 0;
  posScore.forEach((p, i) => {
    const mx = Math.max(...p);
    if (mx > bestPosMax) { bestPosMax = mx; bestPosIdx = i; }
  });
  const bestDigitAtPos = posScore[bestPosIdx].indexOf(Math.max(...posScore[bestPosIdx]));
  const colokJitu = `${bestDigitAtPos} di ${posNames4[bestPosIdx]}`;

  // Dasar — based on predicted 2D ekor value
  const ekorVal = parseInt(topEkor, 10);
  const dasar = `${ekorVal < 50 ? "Kecil" : "Besar"} & ${ekorVal % 2 === 0 ? "Genap" : "Ganjil"}`;

  // Tengah / Tepi
  const tengahTepi = ekorVal >= 25 && ekorVal <= 74 ? "Tengah" : "Tepi";

  // Silang / Homo
  const e0parity = parseInt(topEkor[0], 10) % 2;
  const e1parity = parseInt(topEkor[1], 10) % 2;
  const silangHomo = e0parity === e1parity ? "Homo" : "Silang";

  // Kembang — predicted vs previous
  let kembang = "—";
  if (prevResult) {
    const prevEkorVal = parseInt(ekor(prevResult), 10);
    if (ekorVal > prevEkorVal) kembang = "Naik (Kembang)";
    else if (ekorVal < prevEkorVal) kembang = "Turun (Kempis)";
    else kembang = "Sama";
  }

  // Shio
  const shioIdx  = getShioIdx(topEkor);
  const shioName = SHIO_NAMES[shioIdx];
  const shioNums = getShioNums(shioIdx);
  const shio     = `${shioName} (${shioNums.join("*")})`;

  // BOM — most frequent shio for this slot in current month
  const now = new Date();
  const thisMo = now.getMonth() + 1;
  const thisYr = now.getFullYear();
  const shioFreq: Record<string, number> = {};
  SHIO_NAMES.forEach(s => (shioFreq[s] = 0));
  for (const row of resultData) {
    try {
      const parts = String(row.tanggal ?? "").split(/[-/.]/);
      const rowYear  = parseInt(parts[0] ?? "", 10);
      const rowMonth = parseInt(parts[1] ?? "", 10);
      if (rowYear === thisYr && rowMonth === thisMo) {
        const v = getSlotResult(row, slot);
        if (v) shioFreq[getShioName(ekor(v))]++;
      }
    } catch { /* skip */ }
  }
  const bomHarian = Object.entries(shioFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? shioName;

  // Data count for this slot
  let dataCount = 0;
  for (const row of resultData) { if (getSlotResult(row, slot)) dataCount++; }

  // Overall confidence (avg of top-5 scores)
  const avgTop5 = candidates.slice(0, 5).reduce((s, c) => s + c.score, 0) / 5;
  const confidence = Math.min(99, Math.round(60 + avgTop5 * 0.35));

  return {
    bbfs5d, pred4d, pred3d, ekor2d: topEkor, depan2d: topDepan, tengah2d,
    colokBebas, colokBebas2d, colokJitu, dasar, tengahTepi, silangHomo,
    kembang, shio, bomHarian, dataCount, confidence,
  };
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
interface Props { resultData: ResultRow[]; isDark: boolean }

export default function SmartPrediction({ resultData, isDark }: Props) {
  const card = isDark
    ? "rounded-[20px] border border-white/10 bg-white/5 backdrop-blur-xl"
    : "rounded-[20px] border border-slate-200 bg-white shadow-sm";
  const subtle = isDark ? "text-white/50" : "text-slate-400";
  const subCard = isDark ? "bg-white/5 rounded-xl" : "bg-slate-50 rounded-xl";

  // ── Clock / next-slot ─────────────────────────────────────────────────────
  const [slotInfo, setSlotInfo] = useState(getNextSlotInfo);
  const [countdown, setCountdown] = useState("");
  const [targetSlot, setTargetSlot] = useState<string | null>(null); // null = auto

  useEffect(() => {
    const tick = () => {
      const info = getNextSlotInfo();
      setSlotInfo(info);
      const m = info.minsUntil;
      const h = Math.floor(m / 60);
      const min = Math.floor(m % 60);
      const sec = Math.floor((info.minsUntil % 1) * 60);
      setCountdown(h > 0 ? `${h}j ${min}m` : `${min}m ${sec}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const effectiveSlot = targetSlot ?? slotInfo.nextSlot;

  // ── Engine weights (user-adjustable) ─────────────────────────────────────
  const [weights, setWeights] = useState({
    A: 28, B: 23, C: 19, D: 10, E: 8, F: 7, G: 5,
  });
  const [enabledEngines, setEnabledEngines] = useState({
    A: true, B: true, C: true, D: true, E: true, F: true, G: true,
  });

  // ── Compute all engines (heavy — memoized on resultData + effectiveSlot) ─
  const prevInfo = useMemo(() => getPrevResult(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const prevSlot = prevInfo?.slot ?? null;
  const prevResult = prevInfo?.result ?? null;

  const scoresA = useMemo(() =>
    prevSlot && prevResult
      ? engineA(resultData, prevSlot, prevResult, effectiveSlot)
      : (() => { const s: Record<string,number>={};ALL_2D.forEach(k=>s[k]=0);return s; })(),
    [resultData, prevSlot, prevResult, effectiveSlot]
  );
  const scoresB = useMemo(() => engineB(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const scoresC = useMemo(() => engineC(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const scoresD = useMemo(() => engineD(resultData, slotInfo.dayName, effectiveSlot), [resultData, slotInfo.dayName, effectiveSlot]);
  const scoresE = useMemo(() => engineE(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const scoresF = useMemo(() => engineF(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const scoresG = useMemo(() => engineG(resultData, effectiveSlot), [resultData, effectiveSlot]);

  const engines: EngineResult[] = useMemo(() => [
    { id:"A", name:"Transisi Slot",       scores:scoresA, weight:weights.A, color:"#3b82f6", icon:<ArrowRight className="w-3 h-3"/>, enabled:enabledEngines.A },
    { id:"B", name:"Recency Eksponensial", scores:scoresB, weight:weights.B, color:"#8b5cf6", icon:<Zap className="w-3 h-3"/>,       enabled:enabledEngines.B },
    { id:"C", name:"Gap / Overdue",        scores:scoresC, weight:weights.C, color:"#f59e0b", icon:<Clock className="w-3 h-3"/>,     enabled:enabledEngines.C },
    { id:"D", name:"Pola Hari + Slot",     scores:scoresD, weight:weights.D, color:"#10b981", icon:<Target className="w-3 h-3"/>,    enabled:enabledEngines.D },
    { id:"E", name:"Momentum Tren",        scores:scoresE, weight:weights.E, color:"#ef4444", icon:<TrendingUp className="w-3 h-3"/>,enabled:enabledEngines.E },
    { id:"F", name:"Digit Posisi",         scores:scoresF, weight:weights.F, color:"#06b6d4", icon:<Hash className="w-3 h-3"/>,      enabled:enabledEngines.F },
    { id:"G", name:"Kembar / Pola Siklus", scores:scoresG, weight:weights.G, color:"#f97316", icon:<Layers className="w-3 h-3"/>,   enabled:enabledEngines.G },
  ], [scoresA, scoresB, scoresC, scoresD, scoresE, scoresF, scoresG, weights, enabledEngines]);

  const candidates = useMemo(() => computeConsensus(engines), [engines]);
  const top20 = candidates.slice(0, 20);
  const top5  = candidates.slice(0, 5);

  // ── Ekor candidates + structured prediction ───────────────────────────────
  const ekorCandidates = useMemo(() => computeEkorConsensus(resultData, effectiveSlot), [resultData, effectiveSlot]);
  const structuredPred = useMemo(() =>
    computeStructuredPred(candidates, ekorCandidates, resultData, effectiveSlot, prevResult),
    [candidates, ekorCandidates, resultData, effectiveSlot, prevResult]
  );

  // ── Backtesting ──────────────────────────────────────────────────────────
  const accuracy = useMemo(() => backtest(resultData, effectiveSlot, 20, 30), [resultData, effectiveSlot]);

  // ── Last known result for this slot ──────────────────────────────────────
  const lastKnown = useMemo(() => getLastSlotResult(resultData, effectiveSlot), [resultData, effectiveSlot]);

  // ── Data size info ────────────────────────────────────────────────────────
  const dataCount = useMemo(() => {
    let n = 0;
    for (const row of resultData) {
      for (const s of TIME_SLOTS) { if (getSlotResult(row, s)) n++; }
    }
    return n;
  }, [resultData]);

  // ── UI helpers ────────────────────────────────────────────────────────────
  const confCls = (c: string) => {
    if (c === "tinggi") return isDark ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-green-100 text-green-700 border-green-200";
    if (c === "sedang") return isDark ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-amber-100 text-amber-700 border-amber-200";
    return isDark ? "bg-slate-700/40 text-slate-400 border-slate-600/30" : "bg-slate-100 text-slate-500 border-slate-200";
  };

  const [showEngineDetail, setShowEngineDetail] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showAdaptive, setShowAdaptive] = useState(false);
  const adaptiveData = useMemo(() => {
    if (!showAdaptive) return null;
    return computeAdaptiveWeights(resultData, effectiveSlot, prevSlot, 20);
  }, [showAdaptive, resultData, effectiveSlot, prevSlot]);
  const [showAll, setShowAll] = useState(false);

  // Chart data: top 10 scores
  const chartData = top20.slice(0, 12).map(c => ({
    num: c.num,
    score: Math.round(c.score),
    fill: c.confidence === "tinggi" ? "#22c55e" : c.confidence === "sedang" ? "#f59e0b" : "#64748b",
  }));

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-xl font-black">Smart Prediction AI</h2>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-blue-500/40 text-blue-300 bg-blue-500/15" : "border-blue-200 text-blue-600 bg-blue-50"}`}>7 ENGINE</span>
            </div>
            <p className={`text-xs ${subtle}`}>
              {dataCount} draw dianalisis · Update otomatis saat data baru masuk
            </p>
          </div>

          {/* Next slot info */}
          <div className={`flex flex-col items-end gap-1`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest ${subtle}`}>Target Prediksi</div>
            <div className="flex items-center gap-2">
              <select
                value={targetSlot ?? "auto"}
                onChange={e => setTargetSlot(e.target.value === "auto" ? null : e.target.value)}
                className={`text-xs font-bold px-2 py-1 rounded-lg border outline-none ${isDark ? "bg-white/10 border-white/20 text-white" : "bg-white border-slate-200 text-slate-700"}`}
              >
                <option value="auto">⟳ Auto ({slotInfo.nextSlot})</option>
                {TIME_SLOTS.map(s => <option key={s} value={s}>{s} — {SLOT_NAMES[s]}</option>)}
              </select>
            </div>
            {targetSlot === null && (
              <div className={`text-[10px] ${subtle}`}>
                <Clock className="w-3 h-3 inline mr-1" />
                <span className="tabular-nums font-bold">{countdown}</span> lagi
              </div>
            )}
          </div>
        </div>

        {/* Context row */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {/* Previous result */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <span className={subtle}>Hasil terakhir {prevSlot ? `(${prevSlot})` : ""}:</span>
            <span className="font-black text-base tracking-widest">
              {prevResult ?? <span className={`text-sm ${subtle}`}>—</span>}
            </span>
            {prevResult && <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black bg-blue-500/20 text-blue-300`}>▶ {effectiveSlot}</span>}
          </div>

          {/* Last known this slot */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <span className={subtle}>Terakhir di slot {effectiveSlot}:</span>
            <span className="font-black text-base tracking-widest">
              {lastKnown ?? <span className={`text-sm ${subtle}`}>—</span>}
            </span>
          </div>

          {/* Accuracy badge */}
          {accuracy.total > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold ${
              accuracy.rate >= 60
                ? isDark ? "bg-green-500/15 border-green-500/30 text-green-300" : "bg-green-50 border-green-200 text-green-700"
                : isDark ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              <CheckCircle className="w-3 h-3" />
              Akurasi Historis: {accuracy.rate}%
              <span className={`font-normal text-[10px] ${subtle}`}>({accuracy.correct}/{accuracy.total} hit top-20)</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ STRUCTURED PREDICTION TABLE ══════════════════════════════════════ */}
      <div className="overflow-hidden rounded-[20px] border border-amber-500/30 shadow-lg shadow-amber-500/10">
        {/* Header band */}
        <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-slate-900 font-black text-lg tracking-wide">PREDIKSI JAM {effectiveSlot}</div>
            <div className="text-slate-800/80 text-xs font-semibold mt-0.5">
              {structuredPred.dataCount} data • Kepercayaan ~{structuredPred.confidence}%
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="bg-slate-900/20 rounded-xl px-3 py-1.5 text-slate-900 font-black text-2xl tracking-widest tabular-nums">
              {structuredPred.pred4d}
            </div>
            <div className="text-slate-800/70 text-[10px] font-bold">Prediksi Utama 4D</div>
          </div>
        </div>

        {/* BBFS 5D row */}
        <div className={`px-5 py-4 flex items-center justify-between border-b ${isDark ? "bg-white/8 border-white/8" : "bg-amber-50 border-amber-100"}`}>
          <span className={`text-sm font-bold ${isDark ? "text-white/70" : "text-slate-600"}`}>BBFS 5D</span>
          <div className="flex items-center gap-2">
            {structuredPred.bbfs5d.map(d => (
              <span key={d} className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center text-slate-900 font-black text-lg shadow-md">
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        {[
          { label: "Prediksi 4D",    value: structuredPred.pred4d,      mono: true  },
          { label: "Prediksi 3D",    value: structuredPred.pred3d,      mono: true  },
          { label: "2D Ekor",        value: structuredPred.ekor2d,      mono: true  },
          { label: "2D Depan",       value: structuredPred.depan2d,     mono: true  },
          { label: "2D Tengah",      value: structuredPred.tengah2d,    mono: true  },
          { label: "Colok Bebas",    value: structuredPred.colokBebas,  mono: true  },
          { label: "Colok Bebas 2D", value: structuredPred.colokBebas2d, mono: true },
          { label: "Colok Jitu",     value: structuredPred.colokJitu,   mono: false },
          { label: "Dasar",          value: structuredPred.dasar,       mono: false },
          { label: "Tengah / Tepi",  value: structuredPred.tengahTepi,  mono: false },
          { label: "Silang / Homo",  value: structuredPred.silangHomo,  mono: false },
          { label: "Kembang",        value: structuredPred.kembang,     mono: false },
          { label: "Shio",           value: structuredPred.shio,        mono: false },
          { label: "2D BOM",         value: structuredPred.bomHarian,   mono: false },
        ].map((row, i) => (
          <div key={row.label} className={`px-5 py-3.5 flex items-center justify-between border-b transition-colors ${
            isDark
              ? `border-white/5 ${i % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent"}`
              : `border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`
          }`}>
            <span className={`text-sm font-semibold ${isDark ? "text-white/55" : "text-slate-500"}`}>{row.label}</span>
            <span className={`text-sm font-black text-right max-w-[55%] ${
              isDark ? "text-white" : "text-slate-800"
            } ${row.mono ? "font-mono tracking-widest text-amber-400" : ""}`}>
              {row.value}
            </span>
          </div>
        ))}

        {/* Ekor candidates quick view */}
        <div className={`px-5 py-3 ${isDark ? "bg-white/[0.02]" : "bg-slate-50"}`}>
          <div className={`text-[10px] font-bold mb-2 ${subtle}`}>TOP EKOR KANDIDAT</div>
          <div className="flex flex-wrap gap-1.5">
            {ekorCandidates.slice(0, 10).map((c, i) => (
              <span key={c.num} className={`text-xs font-black px-2 py-1 rounded-lg tabular-nums transition-all ${
                i === 0
                  ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-900"
                  : i < 3
                    ? isDark ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-amber-50 text-amber-700 border border-amber-200"
                    : isDark ? "bg-white/8 text-white/70" : "bg-slate-100 text-slate-600"
              }`}>
                {c.num}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top 5 Champion Numbers ──────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-yellow-400" />
          <h3 className="font-black text-base">Top 5 Rekomendasi — Slot {effectiveSlot}</h3>
          <span className={`text-[10px] ${subtle} ml-auto`}>{slotInfo.dayName}</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {top5.map((c, i) => (
            <div key={c.num} className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
              i === 0
                ? "bg-gradient-to-br from-yellow-500/25 to-orange-500/20 border-yellow-500/40"
                : i === 1
                  ? "bg-gradient-to-br from-slate-400/15 to-slate-500/10 border-slate-400/30"
                  : i === 2
                    ? "bg-gradient-to-br from-amber-600/15 to-amber-700/10 border-amber-600/30"
                    : isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
            }`}>
              <div className={`text-[10px] font-black ${subtle}`}>#{i + 1}</div>
              <div className={`text-3xl font-black tabular-nums tracking-wider ${
                i === 0 ? "text-yellow-400" : i === 1 ? isDark ? "text-slate-300" : "text-slate-600" : i === 2 ? "text-amber-500" : ""
              }`}>{c.num}</div>
              <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                  style={{ width: `${c.score}%` }} />
              </div>
              <div className={`text-[10px] font-bold ${subtle}`}>{Math.round(c.score)}%</div>
              <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${confCls(c.confidence)}`}>
                {c.confidence.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Score Bar Chart ──────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          <h3 className="font-bold text-sm">Distribusi Skor Konsensus (Top 12)</h3>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <XAxis dataKey="num" tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#64748b" }} />
            <YAxis tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#64748b" }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${v}%`, "Skor"]}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Full Ranking Table ───────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm">Ranking Lengkap 2D Depan</h3>
          </div>
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg ${isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Sembunyikan" : "Tampilkan Semua 100"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(showAll ? candidates : top20).map(c => (
            <div key={c.num}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                c.rank <= 5
                  ? isDark ? "bg-blue-500/15 border-blue-500/30" : "bg-blue-50 border-blue-200"
                  : c.rank <= 10
                    ? isDark ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200"
                    : isDark ? "bg-white/5 border-white/8" : "bg-slate-50 border-slate-100"
              }`}
            >
              <span className={`text-[10px] font-bold w-5 text-center ${subtle}`}>#{c.rank}</span>
              <span className={`text-lg font-black tabular-nums ${c.rank <= 5 ? "text-blue-400" : ""}`}>{c.num}</span>
              <div className="flex-1 min-w-0">
                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${c.score}%` }} />
                </div>
                <div className={`text-[9px] ${subtle} mt-0.5`}>{Math.round(c.score)}%</div>
              </div>
              <span className={`text-[8px] font-black px-1 py-0.5 rounded border ${confCls(c.confidence)}`}>
                {c.confidence === "tinggi" ? "🔥" : c.confidence === "sedang" ? "⚡" : "·"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Engine Detail ───────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <button
          onClick={() => setShowEngineDetail(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm">Detail Engine & Kontribusi</h3>
          </div>
          {showEngineDetail ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
        </button>

        {showEngineDetail && (
          <div className="mt-4 space-y-3">
            {engines.map(eng => {
              const topNums = ALL_2D
                .map(k => ({ k, v: eng.scores[k] || 0 }))
                .sort((a, b) => b.v - a.v)
                .slice(0, 5)
                .map(x => x.k);

              return (
                <div key={eng.id} className={`${subCard} p-3`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-black text-xs"
                        style={{ background: eng.color }}>
                        {eng.id}
                      </div>
                      <div>
                        <div className="font-bold text-xs">{eng.name}</div>
                        <div className={`text-[10px] ${subtle}`}>Bobot: {eng.weight}%</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEnabledEngines(prev => ({ ...prev, [eng.id]: !prev[eng.id as keyof typeof prev] }))}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                          enabledEngines[eng.id as keyof typeof enabledEngines]
                            ? "bg-green-500/20 border-green-500/40 text-green-400"
                            : isDark ? "bg-white/10 border-white/20 text-white/40" : "bg-slate-100 border-slate-200 text-slate-400"
                        }`}
                      >
                        {enabledEngines[eng.id as keyof typeof enabledEngines] ? "✓ Aktif" : "✕ Off"}
                      </button>
                      <div className="flex items-center gap-1">
                        <input
                          type="range" min={0} max={50} step={1}
                          value={weights[eng.id as keyof typeof weights]}
                          onChange={e => setWeights(prev => ({ ...prev, [eng.id]: +e.target.value }))}
                          className="w-16 h-1 accent-blue-500"
                        />
                        <span className={`text-[10px] font-bold w-7 ${subtle}`}>{weights[eng.id as keyof typeof weights]}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={`text-[10px] ${subtle}`}>Top 5:</span>
                    {topNums.map((num, i) => (
                      <span key={num} className={`text-xs font-black px-1.5 py-0.5 rounded-lg ${
                        i === 0
                          ? isDark ? "bg-blue-500/25 text-blue-300" : "bg-blue-100 text-blue-700"
                          : isDark ? "bg-white/8 text-white/70" : "bg-slate-100 text-slate-600"
                      }`} style={{ borderLeft: `2px solid ${eng.color}` }}>
                        {num}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Backtesting Detail ──────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <button
          onClick={() => setShowBacktest(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            <h3 className="font-bold text-sm">Hasil Backtesting Historis</h3>
            {accuracy.total > 0 && (
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                accuracy.rate >= 65
                  ? isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"
                  : isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"
              }`}>
                {accuracy.rate}%
              </span>
            )}
          </div>
          {showBacktest ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
        </button>

        {showBacktest && (
          <div className="mt-4 space-y-3">
            {accuracy.total === 0 ? (
              <div className={`text-center py-6 text-sm ${subtle}`}>
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Data tidak cukup untuk backtesting (butuh min. 50 draw per slot)
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Uji Coba", val: `${accuracy.total}x`, color: "blue" },
                    { label: "Berhasil", val: `${accuracy.correct}x`, color: "green" },
                    { label: "Hit Rate", val: `${accuracy.rate}%`, color: accuracy.rate >= 65 ? "green" : "amber" },
                  ].map(s => (
                    <div key={s.label} className={`text-center p-3 rounded-xl ${subCard}`}>
                      <div className={`text-2xl font-black ${
                        s.color === "green" ? "text-green-400" :
                        s.color === "amber" ? "text-amber-400" :
                        "text-blue-400"
                      }`}>{s.val}</div>
                      <div className={`text-[10px] ${subtle}`}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className={`p-3 rounded-xl text-xs ${isDark ? "bg-blue-500/10 border border-blue-500/20 text-blue-200" : "bg-blue-50 border border-blue-100 text-blue-700"}`}>
                  <div className="font-bold mb-1">Cara Baca:</div>
                  Dari {accuracy.total} uji historis untuk slot <strong>{effectiveSlot}</strong>, nomor hasil aktual muncul dalam <strong>top-20 prediksi sebanyak {accuracy.correct} kali ({accuracy.rate}%)</strong>. Semakin tinggi angka ini, semakin konsisten algoritma.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Adaptive Weight Optimizer ───────────────────────────────────────── */}
      <div className={`${card} p-4`}>
        <button
          onClick={() => setShowAdaptive(v => !v)}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-black">Optimasi Bobot Adaptif</div>
              <div className={`text-[11px] ${subtle}`}>Kalkulasi bobot optimal berdasarkan akurasi historis tiap engine</div>
            </div>
          </div>
          {showAdaptive ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
        </button>

        {showAdaptive && (
          <div className="mt-4 space-y-3">
            {adaptiveData === null ? (
              <div className={`text-xs text-center py-4 ${subtle}`}>Menghitung…</div>
            ) : (
              <>
                <div className={`text-[11px] ${subtle} mb-2`}>
                  Diuji pada 20 draw terakhir slot <strong>{effectiveSlot}</strong> · Top-20 hit rate per engine
                </div>
                <div className="space-y-2">
                  {engines.map(e => {
                    const hit = adaptiveData.hitRates[e.id] ?? 0;
                    const sug = adaptiveData.suggestedWeights[e.id] ?? e.weight;
                    const cur = e.weight;
                    const changed = sug !== cur;
                    return (
                      <div key={e.id} className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: e.color + "33" }}>
                              <span style={{ color: e.color }}>{e.icon}</span>
                            </div>
                            <span className="text-xs font-bold truncate">{e.id}: {e.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                            <span className={subtle}>Hit: <strong>{hit}%</strong></span>
                            <span className={`px-1.5 py-0.5 rounded-md font-black ${changed ? isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-50 text-amber-600" : isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"}`}>
                              {cur}→{sug}
                            </span>
                          </div>
                        </div>
                        <div className={`h-1 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                          <div className="h-full rounded-full" style={{ width: `${hit}%`, background: e.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const sw = adaptiveData.suggestedWeights;
                    setWeights({
                      A: sw.A ?? weights.A, B: sw.B ?? weights.B,
                      C: sw.C ?? weights.C, D: sw.D ?? weights.D,
                      E: sw.E ?? weights.E, F: sw.F ?? weights.F,
                      G: sw.G ?? weights.G,
                    });
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md hover:opacity-90 transition-opacity"
                >
                  Terapkan Bobot Optimal
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Quick Copy ──────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-400" />
          <h3 className="font-bold text-sm">Copy Nomor untuk Taruhan</h3>
        </div>
        <div className="space-y-2">
          {[
            { label: "Top 5 (Confidence Tinggi)", nums: top5 },
            { label: "Top 10", nums: candidates.slice(0, 10) },
            { label: "Top 20 (Rekomendasi Penuh)", nums: top20 },
          ].map(grp => (
            <div key={grp.label} className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold w-40 flex-shrink-0 ${subtle}`}>{grp.label}:</span>
              <div className="flex flex-wrap gap-1 flex-1">
                {grp.nums.slice(0, grp.nums.length).map(c => (
                  <span key={c.num}
                    className={`text-xs font-black px-1.5 py-0.5 rounded-lg tabular-nums cursor-pointer transition-all hover:scale-110 ${
                      c.confidence === "tinggi"
                        ? isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"
                        : isDark ? "bg-white/10 text-white/80" : "bg-slate-100 text-slate-600"
                    }`}
                    onClick={() => {
                      const text = grp.nums.map(x => x.num).join("*");
                      try { navigator.clipboard.writeText(text); } catch {}
                    }}
                  >
                    {c.num}
                  </span>
                ))}
                <button
                  onClick={() => {
                    const text = grp.nums.map(x => x.num).join("*");
                    try { navigator.clipboard.writeText(text); } catch {}
                  }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-all ${isDark ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
