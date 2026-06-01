/**
 * Smart Prediction AI V2 — Mesin Prediksi 4D Generasi Baru
 *
 * 12 engine analitik independen dengan adaptive ensemble weighting.
 *
 * UPGRADE DARI V1:
 *   E01 Multi-window Recency     — 3 jendela waktu + adaptive blend
 *   E02 Poisson Gap Model        — distribusi eksponensial keterlambatan
 *   E03 2nd-order Markov Chain   — P(t | t-2, t-1) memori 2 langkah
 *   E04 Slot Transition+         — P(slot_now | slot_prev) berbobot recency
 *   E05 Day×Slot Pattern         — spesifik hari + slot dengan decay
 *   E06 Momentum + Akselerasi    — turunan pertama & kedua tren
 *   E07 Cross-position Corr.     — korelasi digit antar 4 posisi
 *   E08 Cyclic Detection         — deteksi siklus periodik digit
 *   E09 Hot/Cold Streak          — streak panas & overdue dingin
 *   E10 Balance Equilibrium      — keseimbangan distribusi
 *   E11 Sum Pattern              — pola jumlah digit total
 *   E12 Repeat Pattern           — digit berulang dari draw terakhir
 *
 * CONSENSUS: Borda count → voting agreement → confidence calibration
 * OUTPUT:    4D utama + 4D alternatif + top-25 kandidat + 14 jenis taruhan
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Brain, Clock, Zap, TrendingUp, Hash, Layers,
  ArrowRight, RefreshCw, CheckCircle, Copy, ChevronDown, ChevronUp,
  Star, Activity, Flame, Shield, Target, BarChart2,
  Cpu, GitBranch, Waves, Repeat, Scale, Sun, Database, Sparkles,
  FileDown, ClipboardCheck, XCircle, CheckCircle2, Trash2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

interface EvalEntry {
  id: string;
  slot: string;
  date: string;
  predictedMain: string;
  predictedAlt: string;
  bbfs5: number[];
  bbfs7: number[];
  top25: string[];
  timestamp: number;
  actual?: string;
  correct4D?: boolean;
  correct2D?: boolean;
  inTop25?: boolean;
  inBBFS5?: boolean;
  inBBFS7?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_NAMES: Record<string, string> = {
  "00:01": "Tengah Malam", "13:00": "Siang", "16:00": "Sore",
  "19:00": "Malam", "22:00": "Larut Malam", "23:00": "Dini Hari",
};
const SLOT_MINUTES: Record<string, number> = {
  "00:01": 1, "13:00": 780, "16:00": 960,
  "19:00": 1140, "22:00": 1320, "23:00": 1380,
};
const PREV_SLOT: Record<string, string | null> = {
  "00:01": null, "13:00": "00:01", "16:00": "13:00",
  "19:00": "16:00", "22:00": "19:00", "23:00": "22:00",
};
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const WIB_MS = 7 * 3600_000;
const POS_NAMES = ["As", "Kop", "Kepala", "Ekor"] as const;

// ── Shio Tables ───────────────────────────────────────────────────────────────
const SHIO_NAMES = [
  "Kuda", "Ular", "Naga", "Kelinci", "Harimau", "Kerbau",
  "Tikus", "Babi", "Anjing", "Ayam", "Monyet", "Kambing",
];
const MACAU_SHIO = [
  "Kambing", "Kuda", "Ular", "Naga", "Kelinci", "Harimau",
  "Kerbau", "Tikus", "Babi", "Anjing", "Ayam", "Monyet",
];
function getShio(twoDigit: string): string {
  const n = parseInt(twoDigit, 10);
  const idx = (n === 0 ? 100 : n) % 12;
  return `${twoDigit} : ${SHIO_NAMES[idx]}`;
}
function getMacauShio(twoDigit: string): string {
  const n = parseInt(twoDigit, 10);
  const idx = (n === 0 ? 100 : n) % 12;
  return `${twoDigit} : ${MACAU_SHIO[idx]}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function validDraw(v: string): boolean { return /^\d{4}$/.test(v); }
function getResult(row: ResultRow, slot: string): string | null {
  const v = String(row[slot] ?? "");
  return validDraw(v) ? v : null;
}
function wibMinutes(): number { return ((Date.now() + WIB_MS) % 86_400_000) / 60_000; }
function getWibDayName(): string { return DAY_NAMES[new Date(Date.now() + WIB_MS).getDay()]; }

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

function softmax(arr: number[], temp = 1): number[] {
  const shifted = arr.map(v => v / temp);
  const maxV = Math.max(...shifted);
  const exp = shifted.map(v => Math.exp(v - maxV));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
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

// Ambil SEMUA draw dari SEMUA slot — newest-first, slot terbaru dalam hari muncul duluan
// TIME_SLOTS dibalik: 23:00 → 22:00 → 19:00 → 16:00 → 13:00 → 00:01
// Sehingga draw[0] selalu merupakan draw PALING BARU secara kronologis
const TIME_SLOTS_DESC = [...TIME_SLOTS].reverse(); // ["23:00","22:00","19:00","16:00","13:00","00:01"]

function getAllDraws(resultData: ResultRow[]): string[] {
  const out: string[] = [];
  for (const row of resultData) {
    for (const slot of TIME_SLOTS_DESC) {
      const r = getResult(row, slot);
      if (r) out.push(r);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13 ENGINES — each returns scores[10] for digits 0-9 at a given position
// ═══════════════════════════════════════════════════════════════════════════════

// E01: Multi-window Recency (3 temporal windows + adaptive blend)
function e01_multiRecency(draws: string[], pos: number): number[] {
  if (draws.length === 0) return new Array(10).fill(0.1);
  const w1 = draws.slice(0, Math.min(5, draws.length));
  const w2 = draws.slice(5, Math.min(20, draws.length));
  const w3 = draws.slice(20, Math.min(60, draws.length));

  const s1 = new Array(10).fill(0);
  const s2 = new Array(10).fill(0);
  const s3 = new Array(10).fill(0);

  w1.forEach((d, i) => { s1[+d[pos]] += Math.exp(-i * 0.20); });
  w2.forEach((d, i) => { s2[+d[pos]] += Math.exp(-i * 0.08); });
  w3.forEach((d, i) => { s3[+d[pos]] += Math.exp(-i * 0.03); });

  const n1 = normalise(s1);
  const n2 = w2.length > 0 ? normalise(s2) : new Array(10).fill(0.1);
  const n3 = w3.length > 0 ? normalise(s3) : new Array(10).fill(0.1);

  // Adaptive blend: recent window gets more weight if it shows a clear peak
  const peak1 = Math.max(...n1);
  const signalStrength = Math.max(0, (peak1 - 0.3) / 0.7);
  const a1 = 0.50 + signalStrength * 0.20;
  const a2 = (1 - a1) * 0.70;
  const a3 = (1 - a1) * 0.30;

  return normalise(n1.map((v, i) => a1 * v + a2 * n2[i] + a3 * n3[i]));
}

// E02: Poisson / Exponential Gap Model
// Models digit inter-arrival as exponential distribution (memoryless)
function e02_poissonGap(draws: string[], pos: number): number[] {
  if (draws.length < 5) return new Array(10).fill(0.1);

  const freq = new Array(10).fill(0);
  const lastSeen = new Array(10).fill(-1);
  draws.forEach((d, i) => {
    const dig = +d[pos];
    freq[dig]++;
    if (lastSeen[dig] === -1) lastSeen[dig] = i;
  });

  const total = draws.length;
  const s = new Array(10).fill(0);
  for (let d = 0; d <= 9; d++) {
    // Laplace-smoothed rate
    const rate = (freq[d] + 0.5) / (total + 5);
    const expectedGap = 1 / rate;
    const gap = lastSeen[d] === -1 ? total : lastSeen[d];
    // CDF of Exponential distribution: P(waiting <= gap | rate)
    s[d] = 1 - Math.exp(-gap / expectedGap);
  }
  return normalise(s);
}

// E03: Second-order Markov Chain
// P(digit_t | digit_{t-2}, digit_{t-1}) — memori 2 langkah
function e03_markov2(draws: string[], pos: number): number[] {
  if (draws.length < 3) return new Array(10).fill(0.1);

  // 2nd-order: trans2[from2][from1][to]
  const trans2: number[][][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => new Array(10).fill(0))
  );
  // 1st-order fallback: trans1[from1][to]
  const trans1: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));

  for (let i = 0; i < draws.length - 2; i++) {
    const f2 = +draws[i + 2][pos]; // older
    const f1 = +draws[i + 1][pos]; // previous
    const to = +draws[i][pos];     // current
    trans2[f2][f1][to]++;
    trans1[f1][to]++;
  }
  if (draws.length >= 2) {
    trans1[+draws[1][pos]][+draws[0][pos]]++;
  }

  const prev2 = draws.length >= 3 ? +draws[2][pos] : -1;
  const prev1 = draws.length >= 2 ? +draws[1][pos] : -1;
  if (prev1 === -1) return new Array(10).fill(0.1);

  // Try 2nd-order first (need ≥ 3 observations)
  if (prev2 !== -1) {
    const row2 = trans2[prev2][prev1];
    const total2 = row2.reduce((a, b) => a + b, 0);
    if (total2 >= 3) {
      // Laplace smoothing: add 0.1 to each
      return normalise(row2.map(v => v + 0.1));
    }
  }

  // 1st-order fallback
  const row1 = trans1[prev1];
  const total1 = row1.reduce((a, b) => a + b, 0);
  if (total1 === 0) return new Array(10).fill(0.1);
  return normalise(row1.map(v => v + 0.1));
}

// E04: Slot Transition Enhanced (recency-weighted)
function e04_slotTransition(
  resultData: ResultRow[], slot: string, prevSlot: string | null, pos: number,
): number[] {
  if (!prevSlot) return new Array(10).fill(0.1);

  const trans: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  let weight = 1.0;
  for (const row of resultData) {
    const prev = getResult(row, prevSlot);
    const curr = getResult(row, slot);
    if (prev && curr) {
      const decayedW = weight;
      trans[+prev[pos]][+curr[pos]] += decayedW;
      weight *= 0.97; // exponential decay on older rows
    }
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
  if (total < 0.5) return new Array(10).fill(0.1);
  return normalise(row.map(v => v + 0.05));
}

// E05: Day × Slot Pattern (decayed by age)
function e05_daySlot(resultData: ResultRow[], slot: string, dayName: string, pos: number): number[] {
  const s = new Array(10).fill(0.01);
  let matchIdx = 0;
  for (const row of resultData) {
    if (row.hari !== dayName) continue;
    const v = getResult(row, slot);
    if (v) {
      s[+v[pos]] += Math.exp(-matchIdx * 0.10);
      matchIdx++;
    }
  }
  return normalise(s);
}

// E06: Momentum + Acceleration (2nd derivative of frequency trend)
function e06_momentum(draws: string[], pos: number): number[] {
  if (draws.length < 15) return new Array(10).fill(0.1);

  const w1 = draws.slice(0, 5);
  const w2 = draws.slice(5, 15);
  const w3 = draws.slice(15, Math.min(30, draws.length));

  const f1 = new Array(10).fill(0);
  const f2 = new Array(10).fill(0);
  const f3 = new Array(10).fill(0);

  w1.forEach(d => f1[+d[pos]]++);
  w2.forEach(d => f2[+d[pos]]++);
  w3.forEach(d => f3[+d[pos]]++);

  const s = new Array(10).fill(0);
  for (let d = 0; d <= 9; d++) {
    const r1 = f1[d] / w1.length;
    const r2 = f2[d] / w2.length;
    const r3 = f3[d] / Math.max(w3.length, 1);
    const trend = r1 - r2;           // 1st derivative
    const accel = trend - (r2 - r3); // 2nd derivative
    // Positive momentum + positive acceleration = strongest signal
    s[d] = Math.max(0, trend * 0.55 + accel * 0.35 + r1 * 0.10);
  }
  return normalise(s);
}

// E07: Cross-position Correlation
// When position A = digit X, what does position B tend to be?
function e07_crossCorr(draws: string[], pos: number): number[] {
  if (draws.length < 10) return new Array(10).fill(0.1);

  // co[otherPos][otherDigit][thisDigit] = weighted co-occurrence
  const co: number[][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 10 }, () => new Array(10).fill(0))
  );

  draws.slice(0, Math.min(80, draws.length)).forEach((d, i) => {
    const w = Math.exp(-i * 0.025);
    for (let other = 0; other < 4; other++) {
      if (other === pos) continue;
      co[other][+d[other]][+d[pos]] += w;
    }
  });

  // Condition on most recent draw
  const lastDraw = draws[0];
  const s = new Array(10).fill(0.1);

  for (let other = 0; other < 4; other++) {
    if (other === pos) continue;
    const condDigit = +lastDraw[other];
    const condRow = co[other][condDigit];
    const total = condRow.reduce((a, b) => a + b, 0);
    if (total > 0.5) {
      condRow.forEach((v, d) => { s[d] += (v / total) * 0.4; });
    }
  }

  return normalise(s);
}

// E08: Cyclic Pattern Detection
// Detects if a digit follows a roughly periodic appearance schedule
function e08_cyclic(draws: string[], pos: number): number[] {
  const s = new Array(10).fill(0.1);
  if (draws.length < 20) return s;

  for (let d = 0; d <= 9; d++) {
    const positions: number[] = [];
    draws.forEach((draw, i) => { if (+draw[pos] === d) positions.push(i); });
    if (positions.length < 4) continue;

    // Gaps between consecutive appearances (newest first → gap = next - current)
    const gaps: number[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      gaps.push(positions[i + 1] - positions[i]);
    }

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap < 3 || avgGap > 30) continue;

    const variance = gaps.reduce((a, b) => a + (b - avgGap) ** 2, 0) / gaps.length;
    const cv = Math.sqrt(variance) / avgGap; // coefficient of variation

    // Only use cyclic signal if gaps are consistent (cv < 0.55)
    if (cv >= 0.55) continue;

    const lastSeen = positions[0]; // draws since last appearance
    // How due is this digit?
    const dueIn = avgGap - lastSeen;

    let cyclicScore: number;
    if (dueIn <= 0) {
      // Overdue — maximum score, slight decay after very long overdue
      cyclicScore = 1.0 * Math.exp(dueIn * 0.02);
    } else {
      // Approaching: exponential ramp-up
      cyclicScore = Math.exp(-dueIn / (avgGap * 0.4));
    }

    s[d] = Math.max(s[d], 0.1 + cyclicScore * (1 - cv) * 0.9);
  }

  return normalise(s);
}

// E09: Hot/Cold Streak (multi-window)
function e09_streak(draws: string[], pos: number): number[] {
  const s = new Array(10).fill(0.05);
  if (draws.length < 5) return s;

  const d5  = draws.slice(0,  5).map(d => +d[pos]);
  const d10 = draws.slice(0, 10).map(d => +d[pos]);
  const d20 = draws.slice(0, 20).map(d => +d[pos]);
  const d30 = draws.slice(0, Math.min(30, draws.length)).map(d => +d[pos]);

  for (let d = 0; d <= 9; d++) {
    const c5  = d5.filter(x => x === d).length;
    const c10 = d10.filter(x => x === d).length;
    const absent30 = !d30.includes(d);
    const absent20 = !d20.includes(d);

    // Hot streak (appearing frequently in recent window)
    if (c5 >= 3) s[d] += 3.0;       // very hot
    else if (c5 >= 2) s[d] += 1.8;  // hot
    else if (c10 >= 4) s[d] += 1.2; // warm

    // Cold / overdue (not seen in a long time)
    if (absent30) s[d] += 2.0;       // very cold → strong due signal
    else if (absent20) s[d] += 1.2;  // cold
    else if (!d5.includes(d) && !d10.includes(d)) s[d] += 0.4; // mild cold
  }

  return normalise(s);
}

// E10: Balance Equilibrium (chi-squared inspired)
function e10_balance(draws: string[], pos: number): number[] {
  const freq = new Array(10).fill(0);
  const window = draws.slice(0, Math.min(50, draws.length));
  window.forEach(d => freq[+d[pos]]++);
  const total = window.length;
  if (total === 0) return new Array(10).fill(0.1);
  const expected = total / 10;
  const s = freq.map(f => {
    const deficit = Math.max(0, expected - f);
    // Chi-squared inspired: (O - E)^2 / E, but inverted for under-represented
    return 0.1 + (deficit * deficit) / (expected * expected + 0.1);
  });
  return normalise(s);
}

// E11: Sum Pattern Analysis
// Recent 4D numbers tend to cluster around certain sums → predict contributing digit
function e11_sumPattern(draws: string[], pos: number): number[] {
  if (draws.length < 10) return new Array(10).fill(0.1);

  // Compute sums of recent 20 draws (weighted by recency)
  const recentN = Math.min(20, draws.length);
  let weightedSumTotal = 0;
  let weightTotal = 0;
  for (let i = 0; i < recentN; i++) {
    const sum = [...draws[i]].reduce((a, c) => a + +c, 0);
    const w = Math.exp(-i * 0.08);
    weightedSumTotal += sum * w;
    weightTotal += w;
  }
  const targetSum = weightedSumTotal / weightTotal;

  // Other 3 positions contribute (targetSum × 3/4) on average
  const otherContrib = (targetSum * 3) / 4;
  const targetDigit = Math.round(targetSum - otherContrib);

  const s = new Array(10).fill(0.05);
  for (let d = 0; d <= 9; d++) {
    const dist = Math.abs(d - targetDigit);
    s[d] = 0.05 + Math.max(0, 1 - dist / 4.5);
  }
  return normalise(s);
}

// E12: Pair & Repeat Pattern
// Detects if recent numbers share structural patterns (neighbour digits, repeating digits)
function e12_repeatPattern(draws: string[], pos: number): number[] {
  const s = new Array(10).fill(0.1);
  if (draws.length < 3) return s;

  // Slight boost for digits that appeared in the last 3 draws at THIS position
  draws.slice(0, 3).forEach((d, i) => {
    const dig = +d[pos];
    s[dig] += 0.25 * Math.exp(-i * 0.6);
  });

  // Also detect "mirror digit" pattern: if As=7, Ekor tends to be 3 (10-7), etc.
  if (pos === 3 && draws.length >= 2) {
    const asDigit = +draws[0][0]; // most recent As
    const mirror = (10 - asDigit) % 10;
    s[mirror] += 0.4;
  }
  if (pos === 1 && draws.length >= 2) {
    const kepalaDig = +draws[0][2]; // most recent Kepala
    const mirror = (10 - kepalaDig) % 10;
    s[mirror] += 0.3;
  }

  return normalise(s);
}

// E13: All-Slot Global Frequency (menggunakan SEMUA 900+ draw dari semua slot)
// Engine ini memberikan sinyal dasar statistik yang paling kuat karena pakai data terbanyak
function e13_allSlotFreq(allDraws: string[], pos: number): number[] {
  if (allDraws.length === 0) return new Array(10).fill(0.1);

  const freq = new Array(10).fill(0);
  const lastSeen = new Array(10).fill(-1);
  const window = Math.min(500, allDraws.length);

  for (let i = 0; i < window; i++) {
    const dig = +allDraws[i][pos];
    freq[dig] += Math.exp(-i * 0.004); // sangat lambat decay — manfaatkan semua data
    if (lastSeen[dig] === -1) lastSeen[dig] = i;
  }

  // Gabungkan frekuensi berbobot + sinyal gap
  const s = freq.map((f, d) => {
    const gap = lastSeen[d] === -1 ? window : lastSeen[d];
    const expectedInterval = window / Math.max(
      allDraws.slice(0, window).filter(dr => +dr[pos] === d).length, 1,
    );
    const gapSignal = 1 - Math.exp(-gap / Math.max(expectedInterval, 1));
    return f * 0.65 + gapSignal * 0.35;
  });

  return normalise(s);
}

// ── BBFS Computation ──────────────────────────────────────────────────────────
// BBFS (Buat Bebas Full Set): pilih N digit terbaik → taruhan SEMUA kombinasi 4D dari N digit tsb
// BBFS 5 digit  → 5^4  = 625  nomor  (repetisi boleh, misal 1111, 1112, ...)
// BBFS 7 digit  → 7^4  = 2401 nomor
interface BBFSResult {
  digits5: number[];          // 5 digit terpilih (sorted ASC)
  digits7: number[];          // 7 digit terpilih (sorted ASC)
  count5: number;             // 625
  count7: number;             // 2401
  globalDigitScores: number[];// skor 0-100 per digit
  rankList: Array<{ digit: number; score: number }>; // semua 10 digit urut skor
}

function computeBBFS(pred: Pred4D, allDraws: string[]): BBFSResult {
  // Langkah 1: Agregat skor prediksi slot-spesifik dari semua 4 posisi
  const predScore = new Array(10).fill(0);
  pred.posResults.forEach(pr => {
    pr.scores.forEach((score, digit) => { predScore[digit] += score / 4; });
  });

  // Langkah 2: Frekuensi global dari semua draw (semua posisi, bobot recency)
  const globalFreq = new Array(10).fill(0);
  if (allDraws.length > 0) {
    const win = Math.min(300, allDraws.length);
    for (let i = 0; i < win; i++) {
      const w = Math.exp(-i * 0.006);
      for (const c of allDraws[i]) globalFreq[+c] += w;
    }
    const maxF = Math.max(...globalFreq, 1e-9);
    globalFreq.forEach((_, i) => { globalFreq[i] = (globalFreq[i] / maxF) * 100; });
  }

  // Langkah 3: Sinyal gap global — digit yang lama tidak muncul di SEMUA slot
  const globalGap = new Array(10).fill(0);
  if (allDraws.length > 0) {
    for (let d = 0; d <= 9; d++) {
      let lastSeen = -1;
      let count = 0;
      for (let i = 0; i < allDraws.length; i++) {
        if ([...allDraws[i]].some(c => +c === d)) {
          if (lastSeen === -1) lastSeen = i;
          count++;
        }
      }
      // Expected interval antar kemunculan (di semua posisi 4 draw)
      const avgInterval = allDraws.length / Math.max(count * 4 / allDraws.length * allDraws.length, 1);
      const gap = lastSeen === -1 ? allDraws.length : lastSeen;
      globalGap[d] = (1 - Math.exp(-gap / Math.max(avgInterval, 1))) * 100;
    }
  }

  // Langkah 4: Markov sinyal global — digit yang sering mengikuti digit terakhir di semua slot
  const markovGlobal = new Array(10).fill(0);
  if (allDraws.length >= 3) {
    // Untuk setiap posisi, hitung transition matrix global
    for (let pos = 0; pos < 4; pos++) {
      const trans: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
      const win = Math.min(200, allDraws.length - 1);
      for (let i = 0; i < win; i++) {
        trans[+allDraws[i + 1][pos]][+allDraws[i][pos]]++;
      }
      const prev = +allDraws[0][pos];
      const row = trans[prev];
      const total = row.reduce((a, b) => a + b, 0);
      if (total > 0) {
        row.forEach((v, d) => { markovGlobal[d] += (v / total) * 25; });
      }
    }
  }

  // Langkah 5: Gabungkan semua sinyal
  // 45% skor ensemble 13 engine (semua sudah global) + 25% frekuensi global + 15% gap global + 15% markov global
  const globalDigitScores = predScore.map((ps, d) =>
    0.45 * ps + 0.25 * globalFreq[d] + 0.15 * globalGap[d] + 0.15 * markovGlobal[d]
  );

  const rankList = globalDigitScores
    .map((score, digit) => ({ digit, score }))
    .sort((a, b) => b.score - a.score);

  const digits5 = rankList.slice(0, 5).map(r => r.digit).sort((a, b) => a - b);
  const digits7 = rankList.slice(0, 7).map(r => r.digit).sort((a, b) => a - b);

  return {
    digits5, digits7,
    count5: 5 ** 4,   // 625
    count7: 7 ** 4,   // 2401
    globalDigitScores,
    rankList,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE WEIGHTS (default — can be adapted via backtest)
// ═══════════════════════════════════════════════════════════════════════════════
// Bobot di-tune ulang setelah E01-E12 semua menggunakan 907+ draw global.
// E03 (Markov) paling kuat: 36x lebih banyak transisi → jauh lebih reliable.
// E02 (Poisson Gap) juga sangat kuat dengan dataset besar.
// E04/E05 tetap tinggi karena satu-satunya yang membawa sinyal slot-spesifik.
const DEFAULT_WEIGHTS = [
  10, // E01 Multi-window Recency      (global, 907+ draw — decay tetap memberi bobot recency)
  13, // E02 Poisson Gap               (global, sangat kuat dengan banyak data)
  15, // E03 2nd-order Markov          (global, 36x lebih banyak transisi → terkuat)
  12, // E04 Slot Transition+          (slot-spesifik — satu-satunya sinyal transisi antar-slot)
   9, // E05 Day×Slot                  (slot-spesifik — pola hari+slot)
   8, // E06 Momentum+Accel            (global)
   9, // E07 Cross-position Corr       (global, jauh lebih baik dengan 907+ draw)
   7, // E08 Cyclic Detection          (global, deteksi siklus butuh banyak data)
   7, // E09 Hot/Cold Streak           (global)
   5, // E10 Balance                   (global)
   4, // E11 Sum Pattern               (global)
   4, // E12 Repeat Pattern            (slot-spesifik — last slot draw reference)
   9, // E13 All-Slot Global Freq      (global, dedicated frequency analysis)
]; // combineScores normalises by totalW automatically

// ── Score combiner ────────────────────────────────────────────────────────────
function combineScores(allScores: number[][], weights: number[]): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0);
  const combined = new Array(10).fill(0);
  for (let e = 0; e < allScores.length; e++) {
    const w = weights[e] / totalW;
    allScores[e].forEach((v, d) => { combined[d] += v * w; });
  }
  const max = Math.max(...combined, 1e-9);
  return combined.map(v => (v / max) * 100);
}

// ── Borda count consensus ─────────────────────────────────────────────────────
function bordaConsensus(allScores: number[][]): {
  bordaScores: number[];
  topVotes: number[];
  agreementPct: number[];
} {
  const borda = new Array(10).fill(0);
  const votes = new Array(10).fill(0);

  for (const scores of allScores) {
    // Rank digits by score
    const ranked = scores
      .map((s, d) => ({ d, s }))
      .sort((a, b) => b.s - a.s);
    ranked.forEach(({ d }, rank) => {
      borda[d] += (10 - rank); // Borda points: 10 for #1, 1 for #10
    });
    // Top vote for each engine
    const topD = ranked[0].d;
    votes[topD]++;
  }

  const agreementPct = votes.map(v => Math.round((v / allScores.length) * 100));
  return { bordaScores: borda, topVotes: votes, agreementPct };
}

// ── Per-position result ───────────────────────────────────────────────────────
interface PosResult {
  scores: number[];          // 0-100 per digit
  topDigit: number;
  altDigit: number;          // 2nd best
  top3: Array<{ digit: number; score: number }>; // top 3 with scores
  confidence: number;        // 0-100, based on consensus
  engineScores: number[][];  // raw per-engine scores
  bordaScores: number[];
  agreementPct: number[];    // % of engines voting for each digit
}

function predictPosition(
  resultData: ResultRow[],
  slot: string,
  pos: number,
  dayName: string,
  allDraws: string[],
): PosResult {
  // slotDraws: hanya draw dari slot target (~25 draw di 2026)
  // allDraws : semua 907+ draw dari semua slot (data utama semua engine)
  const slotDraws = getDrawsForSlot(resultData, slot);
  const prevSlot  = PREV_SLOT[slot];

  // Butuh minimal 5 draw global untuk analisis bermakna
  if (allDraws.length < 5) {
    const uniform = new Array(10).fill(10);
    const top3 = [0, 1, 2].map(d => ({ digit: d, score: 10 }));
    return {
      scores: uniform, topDigit: 0, altDigit: 1, top3,
      confidence: 10, engineScores: [], bordaScores: new Array(10).fill(0),
      agreementPct: new Array(10).fill(0),
    };
  }

  // ── E01-E03, E06-E11, E13: pakai SEMUA 907+ draw (signal statistik jauh lebih kuat)
  // ── E04, E05           : pakai resultData (slot-context preserving)
  // ── E12                : pakai slotDraws untuk referensi "last draw slot ini"
  const e12src = slotDraws.length >= 3 ? slotDraws : allDraws.slice(0, 10);
  const engineScores = [
    e01_multiRecency(allDraws, pos),                         // E01: global recency (907+ draw)
    e02_poissonGap(allDraws, pos),                           // E02: global gap — jauh lebih akurat
    e03_markov2(allDraws, pos),                              // E03: global Markov — 36x lebih banyak transisi
    e04_slotTransition(resultData, slot, prevSlot, pos),     // E04: slot-specific transition
    e05_daySlot(resultData, slot, dayName, pos),             // E05: day×slot pattern
    e06_momentum(allDraws, pos),                             // E06: global momentum
    e07_crossCorr(allDraws, pos),                            // E07: global cross-position (907+ draw)
    e08_cyclic(allDraws, pos),                               // E08: global cyclic detection
    e09_streak(allDraws, pos),                               // E09: global hot/cold streak
    e10_balance(allDraws, pos),                              // E10: global balance
    e11_sumPattern(allDraws, pos),                           // E11: global sum pattern
    e12_repeatPattern(e12src, pos),                          // E12: last slot draw reference
    e13_allSlotFreq(allDraws, pos),                          // E13: dedicated global frequency
  ];

  const scores = combineScores(engineScores, DEFAULT_WEIGHTS);
  const { bordaScores, agreementPct } = bordaConsensus(engineScores);

  const ranked = scores
    .map((score, digit) => ({ digit, score }))
    .sort((a, b) => b.score - a.score);

  const topDigit = ranked[0].digit;
  const altDigit = ranked[1].digit;
  const top3 = ranked.slice(0, 3);

  // Confidence: score margin + Borda margin + engine agreement + data volume bonus
  const scoreMargin = ranked[0].score - ranked[1].score;
  const topAgreement = agreementPct[topDigit];
  const bordaRanked = [...bordaScores].sort((a, b) => b - a);
  const bordaMargin = bordaScores[topDigit] > 0
    ? Math.round(((bordaRanked[0] - bordaRanked[1]) / bordaRanked[0]) * 100)
    : 0;

  // Volume bonus: semakin banyak data global, semakin tinggi kepercayaan baseline
  const volBonus = allDraws.length > 800 ? 12
    : allDraws.length > 400 ? 8
    : allDraws.length > 100 ? 4 : 0;

  const confidence = Math.min(
    99,
    Math.round(40 + scoreMargin * 1.5 + topAgreement * 0.3 + bordaMargin * 0.2 + volBonus),
  );

  return { scores, topDigit, altDigit, top3, confidence, engineScores, bordaScores, agreementPct };
}

// ── Full 4D prediction ────────────────────────────────────────────────────────
interface Pred4D {
  digits: [number, number, number, number];
  altDigits: [number, number, number, number];
  posResults: PosResult[];
  numberStr: string;
  altNumberStr: string;
  overallConfidence: number;
  topCandidates: Array<{ num: string; prob: number }>;
}

function buildPred4D(resultData: ResultRow[], slot: string, dayName: string, allDraws: string[]): Pred4D {
  const posResults: PosResult[] = [0, 1, 2, 3].map(p =>
    predictPosition(resultData, slot, p, dayName, allDraws),
  );

  const digits = posResults.map(r => r.topDigit) as [number, number, number, number];
  const altDigits = posResults.map(r => r.altDigit) as [number, number, number, number];
  const numberStr = digits.join("");
  const altNumberStr = altDigits.join("");

  const overallConfidence = Math.min(
    99,
    Math.round(posResults.reduce((s, r) => s + r.confidence, 0) / 4),
  );

  // Cross-product of top-3 per position → up to 3^4 = 81 candidates
  const topK = 3;
  const topPerPos = posResults.map(r => r.top3.slice(0, topK));

  const candidates: Array<{ num: string; prob: number }> = [];
  for (const a of topPerPos[0]) {
    for (const b of topPerPos[1]) {
      for (const c of topPerPos[2]) {
        for (const d of topPerPos[3]) {
          // Joint probability using softmax-normalised scores
          const norm = (score: number) => score / 100;
          const prob = norm(a.score) * norm(b.score) * norm(c.score) * norm(d.score);
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
  }).slice(0, 25);

  return { digits, altDigits, posResults, numberStr, altNumberStr, overallConfidence, topCandidates };
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

  // Colok Bebas 2D: all unique ordered pairs
  const uniq = [...new Set([A, B, C, D])].sort((a, b) => a - b);
  const pairs: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = 0; j < uniq.length; j++) {
      if (i !== j) pairs.push(`${uniq[i]}${uniq[j]}`);
    }
  }
  const colokBebas2D = pairs.sort().join(" = ");

  const last2D  = String(C * 10 + D).padStart(2, "0");
  const first2D = String(A * 10 + B).padStart(2, "0");

  const silang  = (x: number, y: number) => x % 2 === y % 2 ? "HOMO" : "SILANG";
  const kembang = (x: number, y: number) => x < y ? "KEMBANG" : x > y ? "KEMPIS" : "KEMBAR";
  const tengahTepi = (C >= 3 && C <= 6) ? "TENGAH" : "TEPI";
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

// ── Backtest ──────────────────────────────────────────────────────────────────
interface BacktestResult {
  rate4D: number;    // 4D exact in top-25
  rate2D: number;    // last-2D (Kepala+Ekor) exact in top-25
  correct4D: number;
  correct2D: number;
  total: number;
  perEngineHit: number[]; // per-engine top-digit hit rate
}

function backtestV2(resultData: ResultRow[], slot: string): BacktestResult {
  const draws = getDrawsForSlot(resultData, slot);
  if (draws.length < 30) {
    return { rate4D: 0, rate2D: 0, correct4D: 0, correct2D: 0, total: 0, perEngineHit: new Array(13).fill(0) };
  }

  const testN = Math.min(25, draws.length - 20);
  let correct4D = 0;
  let correct2D = 0;
  const engineHits = new Array(13).fill(0);
  const dayName = getWibDayName();

  for (let i = 0; i < testN; i++) {
    const actual = draws[i];
    const histData = resultData.slice(i + 1);
    try {
      const histAllDraws = getAllDraws(histData);
      const p = buildPred4D(histData, slot, dayName, histAllDraws);
      if (p.topCandidates.some(c => c.num === actual)) correct4D++;
      const actual2D = actual.slice(2);
      if (p.topCandidates.some(c => c.num.slice(2) === actual2D)) correct2D++;

      // Per-engine: check if each engine's top digit per position was correct
      [0, 1, 2, 3].forEach(pos => {
        const histDraws = getDrawsForSlot(histData, slot);
        const prevSlot = PREV_SLOT[slot];
        const engines = [
          e01_multiRecency(histDraws, pos),
          e02_poissonGap(histDraws, pos),
          e03_markov2(histDraws, pos),
          e04_slotTransition(histData, slot, prevSlot, pos),
          e05_daySlot(histData, slot, dayName, pos),
          e06_momentum(histDraws, pos),
          e07_crossCorr(histDraws, pos),
          e08_cyclic(histDraws, pos),
          e09_streak(histDraws, pos),
          e10_balance(histDraws, pos),
          e11_sumPattern(histDraws, pos),
          e12_repeatPattern(histDraws, pos),
          e13_allSlotFreq(histAllDraws, pos),
        ];
        const actualDig = +actual[pos];
        engines.forEach((scores, ei) => {
          const topDig = scores.indexOf(Math.max(...scores));
          if (topDig === actualDig) engineHits[ei]++;
        });
      });
    } catch { /* skip */ }
  }

  const totalPosTests = testN * 4;
  return {
    rate4D: Math.round((correct4D / testN) * 100),
    rate2D: Math.round((correct2D / testN) * 100),
    correct4D, correct2D, total: testN,
    perEngineHit: engineHits.map(h => Math.round((h / totalPosTests) * 100)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface Props { resultData: ResultRow[]; isDark: boolean; }

const ENGINE_META = [
  { id: "E01", name: "Multi-window Recency",   w: 19, color: "#8b5cf6", icon: <Zap       className="w-3 h-3" /> },
  { id: "E02", name: "Poisson Gap Model",      w: 17, color: "#f59e0b", icon: <Waves     className="w-3 h-3" /> },
  { id: "E03", name: "Markov Orde-2",          w: 14, color: "#3b82f6", icon: <GitBranch className="w-3 h-3" /> },
  { id: "E04", name: "Transisi Slot+",         w: 10, color: "#06b6d4", icon: <ArrowRight className="w-3 h-3" /> },
  { id: "E05", name: "Pola Hari×Slot",         w:  8, color: "#10b981", icon: <Sun       className="w-3 h-3" /> },
  { id: "E06", name: "Momentum+Akselerasi",    w:  7, color: "#ef4444", icon: <TrendingUp className="w-3 h-3" /> },
  { id: "E07", name: "Korelasi Antar Posisi",  w:  6, color: "#ec4899", icon: <Layers    className="w-3 h-3" /> },
  { id: "E08", name: "Deteksi Siklus",         w:  5, color: "#a855f7", icon: <Repeat    className="w-3 h-3" /> },
  { id: "E09", name: "Hot/Cold Streak",        w:  4, color: "#f97316", icon: <Flame     className="w-3 h-3" /> },
  { id: "E10", name: "Balance Equilibrium",    w:  3, color: "#84cc16", icon: <Scale     className="w-3 h-3" /> },
  { id: "E11", name: "Pola Sum Digit",         w:  2, color: "#64748b", icon: <Hash      className="w-3 h-3" /> },
  { id: "E12", name: "Repeat Pattern",         w:  1, color: "#94a3b8", icon: <RefreshCw className="w-3 h-3" /> },
  { id: "E13", name: "Global Freq (All Slot)", w:  8, color: "#0ea5e9", icon: <Database  className="w-3 h-3" /> },
];

export default function SmartPredictionV2({ resultData, isDark }: Props) {
  // ── Theme helpers ──────────────────────────────────────────────────────────
  const card     = isDark ? "rounded-[20px] border border-white/10 bg-white/5 backdrop-blur-xl"
                          : "rounded-[20px] border border-slate-200 bg-white shadow-sm";
  const subtle   = isDark ? "text-white/50" : "text-slate-400";
  const tBorder  = isDark ? "border-white/8" : "border-slate-200";
  const rowEven  = isDark ? "bg-white/[0.02]" : "bg-slate-50/60";
  const rowOdd   = isDark ? "bg-transparent" : "bg-white";
  const pill     = (clr: string) => isDark
    ? `border border-${clr}-500/40 text-${clr}-300 bg-${clr}-500/15`
    : `border border-${clr}-200 text-${clr}-700 bg-${clr}-50`;

  const confColor = (c: number) =>
    c >= 80 ? "text-green-400" : c >= 60 ? "text-amber-400" : "text-slate-400";
  const confBg = (c: number) =>
    c >= 80 ? (isDark ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-green-50 border-green-200 text-green-700")
    : c >= 60 ? (isDark ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700")
    : (isDark ? "bg-slate-500/20 border-slate-500/40 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-500");

  const oeColor = (v: string) =>
    v === "GANJIL" ? (isDark ? "text-orange-300 font-black" : "text-orange-600 font-black")
    : v === "GENAP" ? (isDark ? "text-blue-300 font-black" : "text-blue-600 font-black")
    : "";
  const bkColor = (v: string) =>
    v === "BESAR" ? (isDark ? "text-red-300 font-black" : "text-red-600 font-black")
    : v === "KECIL" ? (isDark ? "text-cyan-300 font-black" : "text-cyan-600 font-black")
    : "";
  const silangColor = (v: string) =>
    v === "SILANG" ? (isDark ? "text-violet-300 font-black" : "text-violet-600 font-black")
    : v === "HOMO" ? (isDark ? "text-pink-300 font-black" : "text-pink-600 font-black")
    : "";
  const kempColor = (v: string) =>
    v === "KEMBANG" ? (isDark ? "text-green-300 font-black" : "text-green-600 font-black")
    : v === "KEMPIS" ? (isDark ? "text-red-300 font-black" : "text-red-600 font-black")
    : v === "KEMBAR" ? (isDark ? "text-amber-300 font-black" : "text-amber-600 font-black")
    : "";

  // ── Slot state ─────────────────────────────────────────────────────────────
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
      const sec = Math.floor((m % 1) * 60);
      setCountdown(h > 0 ? `${h}j ${min}m` : `${min}m ${sec}d`);
    };
    tick();
    const t = setInterval(tick, 5_000);
    return () => clearInterval(t);
  }, []);

  const activeSlot = targetSlot ?? slotInfo.nextSlot;
  const dayName = getWibDayName();

  // ── Heavy computation ──────────────────────────────────────────────────────
  // Ambil SEMUA draw dari SEMUA slot (900+ data point) — otomatis update saat data baru masuk
  const allDraws = useMemo(() => getAllDraws(resultData), [resultData]);

  const pred = useMemo(
    () => buildPred4D(resultData, activeSlot, dayName, allDraws),
    [resultData, activeSlot, dayName, allDraws],
  );

  const bbfs = useMemo(() => computeBBFS(pred, allDraws), [pred, allDraws]);

  const gameTypes = useMemo(() => calcGameTypes(pred.digits), [pred.digits]);
  const altGameTypes = useMemo(() => calcGameTypes(pred.altDigits), [pred.altDigits]);

  const lastResult = useMemo(
    () => getLastResult(resultData, activeSlot),
    [resultData, activeSlot],
  );
  const prevSlotResult = useMemo(() => {
    const ps = PREV_SLOT[activeSlot];
    return ps ? getLastResult(resultData, ps) : null;
  }, [resultData, activeSlot]);

  // slotCount: draw slot-spesifik (untuk konteks E04/E05/E12)
  // allDraws sudah dihitung di atas — ini yang dipakai semua engine utama
  const slotCount = useMemo(
    () => getDrawsForSlot(resultData, activeSlot).length,
    [resultData, activeSlot],
  );
  // dataCount yang ditampilkan = total draw global (lebih merepresentasikan kekuatan analisis)
  const dataCount = allDraws.length;

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showCandidates, setShowCandidates] = useState(true);
  const [showDigitCharts, setShowDigitCharts] = useState(false);
  const [showEngines, setShowEngines] = useState(true);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showAlt, setShowAlt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [btRunning, setBtRunning] = useState(false);

  // ── Evaluasi state ──────────────────────────────────────────────────────────
  const [evals, setEvals] = useState<EvalEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("smartai_evals") ?? "[]") as EvalEntry[]; }
    catch { return []; }
  });
  const [showEval, setShowEval] = useState(false);
  const [evalInput, setEvalInput] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState(false);

  const evalStats = useMemo(() => {
    const withActual = evals.filter(e => e.actual);
    const total = withActual.length;
    if (total === 0) return null;
    const hit4D    = withActual.filter(e => e.correct4D).length;
    const hit2D    = withActual.filter(e => e.correct2D).length;
    const hitTop25 = withActual.filter(e => e.inTop25).length;
    const hitBBFS5 = withActual.filter(e => e.inBBFS5).length;
    const hitBBFS7 = withActual.filter(e => e.inBBFS7).length;
    return {
      total,
      rate4D:    Math.round((hit4D    / total) * 100),
      rate2D:    Math.round((hit2D    / total) * 100),
      rateTop25: Math.round((hitTop25 / total) * 100),
      rateBBFS5: Math.round((hitBBFS5 / total) * 100),
      rateBBFS7: Math.round((hitBBFS7 / total) * 100),
    };
  }, [evals]);

  const runBacktest = useCallback(() => {
    setBtRunning(true);
    setShowBacktest(true);
    setTimeout(() => {
      try {
        const result = backtestV2(resultData, activeSlot);
        setBacktest(result);
      } catch { /* ignore */ } finally {
        setBtRunning(false);
      }
    }, 50);
  }, [resultData, activeSlot]);

  // Reset backtest on slot change
  useEffect(() => { setBacktest(null); }, [activeSlot]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ── PDF Export ──────────────────────────────────────────────────────────────
  function exportPDF() {
    const timestamp = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const wibDate = new Date(Date.now() + WIB_MS);
    const dateStr = wibDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    const engineRows = ENGINE_META.map((e, ei) => {
      const hr = backtest?.perEngineHit[ei] ?? 0;
      const barColor = hr >= 60 ? "#22c55e" : hr >= 40 ? "#f59e0b" : "#ef4444";
      return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:9px;color:#64748b;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">${e.id}: ${e.name}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <div style="flex:1;height:4px;background:#e2e8f0;border-radius:3px;overflow:hidden">
            <div style="width:${hr}%;height:100%;background:${e.color};border-radius:3px"></div>
          </div>
          <span style="font-size:10px;font-weight:900;color:${barColor}">${hr}%</span>
        </div>
      </div>`;
    }).join("");

    const backtestSection = backtest && backtest.total > 0 ? `
      <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#475569;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:18px 0 10px">
        Akurasi Backtest (${backtest.total} Draw Terakhir Slot ${activeSlot})
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
        ${[
          { l: "Hit Rate 4D", v: `${backtest.rate4D}%`, s: `${backtest.correct4D}/${backtest.total} draw` },
          { l: "Hit Rate 2D", v: `${backtest.rate2D}%`, s: "Kepala+Ekor tepat" },
          { l: "Total Tes",   v: String(backtest.total), s: "draw diuji" },
          { l: "Data Global", v: String(dataCount), s: "draw semua slot" },
        ].map(it => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:#7c3aed">${it.v}</div>
          <div style="font-size:9px;color:#475569;font-weight:700;margin-top:2px">${it.l}</div>
          <div style="font-size:8px;color:#94a3b8">${it.s}</div>
        </div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${engineRows}</div>
    ` : "";

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Smart AI V2 — ${activeSlot} WIB ${dateStr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:28px;max-width:820px;margin:0 auto;font-size:12px}
  @media print{body{padding:0}}
</style>
</head>
<body>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <h1 style="font-size:18px;font-weight:900;color:#7c3aed">🎯 Smart Prediction AI</h1>
    <span style="font-size:9px;font-weight:900;padding:2px 8px;border-radius:20px;background:#ede9fe;color:#7c3aed">V2</span>
    <span style="font-size:9px;font-weight:900;padding:2px 8px;border-radius:20px;background:#e0f2fe;color:#0369a1">13 ENGINE</span>
  </div>
  <div style="color:#64748b;font-size:10px;margin-bottom:20px;line-height:1.7">
    Slot: <strong>${activeSlot} WIB</strong> (${SLOT_NAMES[activeSlot]}) &nbsp;|&nbsp;
    Hari: <strong>${dayName}</strong> &nbsp;|&nbsp;
    Tanggal: <strong>${dateStr}</strong> &nbsp;|&nbsp;
    Dibuat: <strong>${timestamp} WIB</strong><br>
    Data slot: <strong>${dataCount} draw</strong> &nbsp;|&nbsp;
    Data global: <strong>${allDraws.length} draw</strong> &nbsp;|&nbsp;
    Kepercayaan ensemble: <strong>${pred.overallConfidence}%</strong>
  </div>

  <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#475569;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin-bottom:10px">Prediksi Utama 4D</div>
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border-radius:12px;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
      <div style="font-size:52px;font-weight:900;letter-spacing:10px;font-family:monospace">${pred.numberStr}</div>
      <div style="font-size:11px;opacity:.8;margin-top:6px">Nomor Utama 4D &nbsp;·&nbsp; Confidence: ${pred.overallConfidence}% &nbsp;·&nbsp; 13 engine independen</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;opacity:.7;margin-bottom:4px">Alternatif</div>
      <div style="font-family:monospace;font-size:28px;font-weight:900;letter-spacing:6px">${pred.altNumberStr}</div>
      <div style="font-size:10px;opacity:.6">Digit ke-2 per posisi</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
    ${(["As", "Kop", "Kepala", "Ekor"] as const).map((name, i) => {
      const pr = pred.posResults[i];
      const top3 = pr?.top3 ?? [];
      return `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:1px">${name}</div>
        <div style="font-size:32px;font-weight:900;color:#7c3aed;line-height:1.1;margin:4px 0">${pred.digits[i]}</div>
        <div style="font-size:9px;color:#94a3b8">Alt: ${pred.altDigits[i]}</div>
        <div style="font-size:9px;color:#94a3b8">Conf: ${pr?.confidence ?? 0}%</div>
        <div style="font-size:9px;color:#94a3b8">Top3: ${top3.map(t => t.digit).join(" · ")}</div>
      </div>`;
    }).join("")}
  </div>

  <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#475569;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:18px 0 10px">BBFS — Buat Bebas Full Set</div>
  <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px;margin-bottom:8px">
    <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#2563eb;margin-bottom:8px">BBFS 5 Digit → 5⁴ = 625 kombinasi 4D</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      ${bbfs.digits5.map(d => `<span style="width:38px;height:38px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;background:#3b82f6">${d}</span>`).join("")}
    </div>
    <div style="font-size:11px;font-weight:800;font-family:monospace;letter-spacing:2px;color:#2563eb">Digit: ${bbfs.digits5.join(" — ")}</div>
  </div>
  <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;padding:12px">
    <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#7c3aed;margin-bottom:8px">BBFS 7 Digit → 7⁴ = 2401 kombinasi 4D</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      ${bbfs.digits7.map(d => `<span style="width:38px;height:38px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;background:#7c3aed">${d}</span>`).join("")}
    </div>
    <div style="font-size:11px;font-weight:800;font-family:monospace;letter-spacing:2px;color:#7c3aed">Digit: ${bbfs.digits7.join(" — ")}</div>
  </div>

  <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#475569;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:18px 0 10px">Top ${pred.topCandidates.length} Kandidat 4D</div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
    ${pred.topCandidates.map((c, idx) => `<div style="background:${idx === 0 ? "#7c3aed" : "#f8fafc"};color:${idx === 0 ? "#fff" : "#1e293b"};border:1px solid ${idx === 0 ? "#7c3aed" : "#e2e8f0"};border-radius:5px;padding:5px 4px;text-align:center;font-size:12px;font-weight:800;font-family:monospace">${c.num}</div>`).join("")}
  </div>

  ${backtestSection}

  <div style="background:#fef9c3;border:1.5px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:10px;color:#854d0e;margin-top:18px;line-height:1.6">
    ⚠️ <strong>Penting:</strong> Tidak ada sistem prediksi yang dapat menjamin kemenangan 100%.
    Lottery bersifat acak. Gunakan dengan bijak dan bertanggung jawab.
    Simpan PDF ini dan masukkan hasil aktual di fitur <em>Evaluasi & Pembelajaran</em> setelah draw keluar.
  </div>

  <div style="color:#94a3b8;font-size:9px;text-align:right;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;line-height:1.7">
    4D Macau Strategi Dashboard &nbsp;·&nbsp; Smart Prediction AI V2 &nbsp;·&nbsp; 13 Engine Analitik<br>
    Slot: ${activeSlot} WIB &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; Dibuat: ${timestamp} WIB<br>
    Data: ${dataCount} draw global (semua slot) · E04+E05 menggunakan konteks slot ${activeSlot}
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=750");
    if (win) { win.document.write(html); win.document.close(); }
  }

  // ── Evaluasi: simpan & rekam hasil aktual ───────────────────────────────────
  function saveCurrentEval() {
    const wibDate = new Date(Date.now() + WIB_MS);
    const dateStr = wibDate.toISOString().slice(0, 10);
    const entry: EvalEntry = {
      id: `${activeSlot}_${Date.now()}`,
      slot: activeSlot,
      date: dateStr,
      predictedMain: pred.numberStr,
      predictedAlt: pred.altNumberStr,
      bbfs5: [...bbfs.digits5],
      bbfs7: [...bbfs.digits7],
      top25: pred.topCandidates.map(c => c.num),
      timestamp: Date.now(),
    };
    const next = [entry, ...evals].slice(0, 60);
    setEvals(next);
    localStorage.setItem("smartai_evals", JSON.stringify(next));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
    setShowEval(true);
  }

  function recordActual(id: string) {
    const actual = (evalInput[id] ?? "").trim();
    if (!/^\d{4}$/.test(actual)) return;
    const next = evals.map(e => {
      if (e.id !== id) return e;
      const actualDigits = [...actual].map(Number);
      const correct4D = e.predictedMain === actual || e.predictedAlt === actual;
      const correct2D = e.predictedMain.slice(2) === actual.slice(2) || e.predictedAlt.slice(2) === actual.slice(2);
      const inTop25 = e.top25.includes(actual);
      const inBBFS5 = actualDigits.every(d => e.bbfs5.includes(d));
      const inBBFS7 = actualDigits.every(d => e.bbfs7.includes(d));
      return { ...e, actual, correct4D, correct2D, inTop25, inBBFS5, inBBFS7 };
    });
    setEvals(next);
    localStorage.setItem("smartai_evals", JSON.stringify(next));
    setEvalInput(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function deleteEval(id: string) {
    const next = evals.filter(e => e.id !== id);
    setEvals(next);
    localStorage.setItem("smartai_evals", JSON.stringify(next));
  }

  const gt = gameTypes;
  const agt = altGameTypes;

  // ── Table rows ─────────────────────────────────────────────────────────────
  type TRow =
    | { k: "4c"; label: string; as: string; kop: string; kepala: string; ekor: string }
    | { k: "oe"; label: string; go: [string,string,string,string]; bk: [string,string,string,string] }
    | { k: "sp"; label: string; value: string };

  function buildRows(g: GameTypes): TRow[] {
    return [
      { k: "4c", label: "4D",          as: g.d4.as, kop: g.d4.kop, kepala: g.d4.kepala, ekor: g.d4.ekor },
      { k: "4c", label: "3D",          as: "X",      kop: g.d3.kop, kepala: g.d3.kepala, ekor: g.d3.ekor },
      { k: "4c", label: "2D",          as: "X",      kop: "X",      kepala: g.d2.kepala, ekor: g.d2.ekor },
      { k: "4c", label: "Colok Bebas", as: g.colokBebas.as, kop: g.colokBebas.kop, kepala: g.colokBebas.kepala, ekor: g.colokBebas.ekor },
      { k: "oe", label: "Kombinasi",
        go: [g.komGoAs, g.komGoKop, g.komGoKepala, g.komGoEkor],
        bk: [g.komBkAs, g.komBkKop, g.komBkKepala, g.komBkEkor] },
      { k: "4c", label: "Colok Jitu",  as: g.colokJitu.as, kop: g.colokJitu.kop, kepala: g.colokJitu.kepala, ekor: g.colokJitu.ekor },
      { k: "oe", label: "50-50",
        go: [g.fiftGoAs, g.fiftGoKop, g.fiftGoKepala, g.fiftGoEkor],
        bk: [g.fiftBkAs, g.fiftBkKop, g.fiftBkKepala, g.fiftBkEkor] },
      { k: "sp", label: "Colok Bebas 2D", value: g.colokBebas2D },
      { k: "sp", label: "Shio",           value: g.shio },
      { k: "sp", label: "Macau Shio",     value: g.macauShio },
      { k: "sp", label: "SILANG HOMO",    value: `Depan:${g.silangDepan} Tengah:${g.silangTengah} Belakang:${g.silangBelakang}` },
      { k: "sp", label: "TENGAH TEPI",    value: g.tengahTepi },
      { k: "sp", label: "KEMBANG KEMPIS KEMBAR", value: `Depan:${g.kempDepan} Tengah:${g.kempTengah} Belakang:${g.kempBelakang}` },
      { k: "sp", label: "Dasar",          value: g.dasar },
    ];
  }

  const thCls = `text-center text-xs font-black uppercase tracking-widest py-3 px-2 border-b ${tBorder} ${isDark ? "text-white/80" : "text-slate-700"}`;
  const tdLbl = `text-left text-xs font-bold pl-4 py-3 ${isDark ? "text-white/60" : "text-slate-600"} border-r ${tBorder}`;
  const tdVal = `text-center text-sm font-black tracking-widest tabular-nums`;

  function renderTable(rows: TRow[], g: GameTypes) {
    return rows.map((row, i) => {
      const rowBg = i % 2 === 0 ? rowEven : rowOdd;
      const bdr = `border-b ${tBorder}`;

      if (row.k === "4c") {
        const isX = (v: string) => v === "X";
        const cellCls = (v: string) => `${tdVal} py-3 px-2 ${isX(v) ? (isDark ? "text-white/20" : "text-slate-300") : (isDark ? "text-white" : "text-slate-800")}`;
        return (
          <tr key={i} className={`${rowBg} ${bdr}`}>
            <td className={tdLbl}>{row.label}</td>
            <td className={cellCls(row.as)}>{row.as}</td>
            <td className={cellCls(row.kop)}>{row.kop}</td>
            <td className={cellCls(row.kepala)}>{row.kepala}</td>
            <td className={cellCls(row.ekor)}>{row.ekor}</td>
          </tr>
        );
      }

      if (row.k === "oe") {
        return (
          <React.Fragment key={i}>
            <tr className={`${rowBg} border-b ${isDark ? "border-white/3" : "border-slate-100"}`}>
              <td className={`${tdLbl} pb-1`} rowSpan={2}>{row.label}</td>
              {row.go.map((v, j) => (
                <td key={j} className={`${tdVal} py-2 px-2 text-[11px] ${oeColor(v)}`}>{v}</td>
              ))}
            </tr>
            <tr className={`${rowBg} ${bdr}`}>
              {row.bk.map((v, j) => (
                <td key={j} className={`${tdVal} py-2 px-2 text-[11px] ${bkColor(v)}`}>{v}</td>
              ))}
            </tr>
          </React.Fragment>
        );
      }

      if (row.k === "sp") {
        const content = () => {
          if (row.label === "SILANG HOMO") {
            return (
              <span>
                Depan:<span className={silangColor(g.silangDepan)}>{g.silangDepan}</span>
                {" · "}Tengah:<span className={silangColor(g.silangTengah)}>{g.silangTengah}</span>
                {" · "}Belakang:<span className={silangColor(g.silangBelakang)}>{g.silangBelakang}</span>
              </span>
            );
          }
          if (row.label === "KEMBANG KEMPIS KEMBAR") {
            return (
              <span>
                Depan:<span className={kempColor(g.kempDepan)}>{g.kempDepan}</span>
                {" · "}Tengah:<span className={kempColor(g.kempTengah)}>{g.kempTengah}</span>
                {" · "}Belakang:<span className={kempColor(g.kempBelakang)}>{g.kempBelakang}</span>
              </span>
            );
          }
          if (row.label === "TENGAH TEPI") {
            return (
              <span className={g.tengahTepi === "TENGAH"
                ? (isDark ? "text-emerald-300 font-black" : "text-emerald-700 font-black")
                : (isDark ? "text-orange-300 font-black" : "text-orange-600 font-black")}>
                {g.tengahTepi}
              </span>
            );
          }
          if (row.label === "Dasar") {
            return <span className={isDark ? "text-amber-300 font-bold" : "text-amber-700 font-bold"}>{row.value}</span>;
          }
          return <span>{row.value}</span>;
        };
        return (
          <tr key={i} className={`${rowBg} ${bdr}`}>
            <td className={tdLbl}>{row.label}</td>
            <td colSpan={4} className={`text-center text-xs font-bold py-3 px-4 ${isDark ? "text-white/80" : "text-slate-700"}`}>
              {content()}
            </td>
          </tr>
        );
      }
      return null;
    });
  }

  // ── Copy text ──────────────────────────────────────────────────────────────
  const buildCopyText = (g: GameTypes, num: string) =>
    `SMART AI V2 — JAM ${activeSlot} WIB\n` +
    `4D: ${num}\n` +
    `3D: ${g.d3.kop}${g.d3.kepala}${g.d3.ekor}\n` +
    `2D: ${g.d2.kepala}${g.d2.ekor}\n` +
    `Shio: ${g.shio}\n` +
    `Macau Shio: ${g.macauShio}\n` +
    `Dasar: ${g.dasar}\n` +
    `Colok Bebas 2D: ${g.colokBebas2D}\n` +
    `SILANG HOMO: Depan:${g.silangDepan} Tengah:${g.silangTengah} Belakang:${g.silangBelakang}\n` +
    `TENGAH TEPI: ${g.tengahTepi}\n` +
    `KEMBANG KEMPIS KEMBAR: Depan:${g.kempDepan} Tengah:${g.kempTengah} Belakang:${g.kempBelakang}`;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 animate-slide-up">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 flex-shrink-0">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black">Smart Prediction AI</h2>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("purple")}`}>V2</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("indigo")}`}>13 ENGINE</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("cyan")}`}>MARKOV 2nd ORDER</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("emerald")}`}>POISSON GAP</span>
            </div>
            <p className={`text-xs ${subtle}`}>
              {dataCount} draw global · 11 engine pakai data penuh · E04+E05 slot-konteks · Adaptive ensemble
            </p>
          </div>

          {/* Slot selector */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${subtle}`}>Target Prediksi</div>
            <select
              value={targetSlot ?? "auto"}
              onChange={e => setTargetSlot(e.target.value === "auto" ? null : e.target.value)}
              className={`text-xs font-bold px-2 py-1.5 rounded-lg border outline-none cursor-pointer ${isDark ? "bg-white/10 border-white/20 text-white" : "bg-white border-slate-200 text-slate-700"}`}
            >
              <option value="auto">⟳ Auto ({slotInfo.nextSlot})</option>
              {TIME_SLOTS.map(s => <option key={s} value={s}>{s} — {SLOT_NAMES[s]}</option>)}
            </select>
            {targetSlot === null && (
              <div className={`text-[10px] ${subtle} flex items-center gap-1`}>
                <Clock className="w-3 h-3" />
                <span className="font-black tabular-nums">{countdown}</span> lagi
              </div>
            )}
          </div>
        </div>

        {/* Context pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {lastResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <span className={subtle}>Terakhir {activeSlot}:</span>
              <span className="font-black text-base tracking-widest">{lastResult}</span>
            </div>
          )}
          {prevSlotResult && PREV_SLOT[activeSlot] && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <span className={subtle}>Prev ({PREV_SLOT[activeSlot]}):</span>
              <span className="font-black text-base tracking-widest">{prevSlotResult}</span>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${confBg(pred.overallConfidence)}`}>
            <Shield className="w-3.5 h-3.5" />
            <span className="font-bold">Kepercayaan: <span className="font-black">{pred.overallConfidence}%</span></span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <Cpu className={`w-3.5 h-3.5 ${isDark ? "text-violet-400" : "text-violet-600"}`} />
            <span className={`${subtle}`}>{dataCount} historis</span>
          </div>
        </div>
      </div>

      {/* ── MAIN PREDICTION TABLE ───────────────────────────────────────────── */}
      <div className={`overflow-hidden rounded-[20px] border shadow-xl ${isDark ? "border-amber-500/30 shadow-amber-500/10" : "border-amber-300/50 shadow-amber-200/30"}`}>

        {/* Gold header */}
        <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-slate-900 font-black text-lg tracking-widest">PREDIKSI JAM {activeSlot} WIB</div>
              <div className="text-slate-800/80 text-xs font-semibold mt-0.5">
                {dataCount} draw · 12 engine · {SLOT_NAMES[activeSlot]} · {dayName}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="bg-slate-900/25 rounded-xl px-4 py-2 text-slate-900 font-black text-3xl tracking-widest tabular-nums">
                {pred.numberStr}
              </div>
              <div className="text-slate-800/70 text-[10px] font-bold">Nomor Utama 4D</div>
            </div>
          </div>
        </div>

        {/* Per-position top-3 strip */}
        <div className={`grid grid-cols-4 border-b ${tBorder} ${isDark ? "bg-white/5" : "bg-amber-50/70"}`}>
          {POS_NAMES.map((label, i) => {
            const pr = pred.posResults[i];
            return (
              <div key={label} className={`flex flex-col items-center py-3 px-2 ${i < 3 ? `border-r ${tBorder}` : ""}`}>
                <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${subtle}`}>{label}</div>
                {/* Top 3 digits */}
                {pr.top3.map((t, rank) => (
                  <div key={rank} className={`flex items-center gap-1.5 w-full ${rank === 0 ? "mb-1" : "mb-0.5"}`}>
                    <div className={`text-[8px] font-black w-3 text-right flex-shrink-0 ${
                      rank === 0 ? (isDark ? "text-amber-400" : "text-amber-600")
                      : rank === 1 ? (isDark ? "text-white/40" : "text-slate-400")
                      : (isDark ? "text-white/25" : "text-slate-300")
                    }`}>#{rank + 1}</div>
                    <div className={`font-black tabular-nums flex-shrink-0 ${
                      rank === 0 ? "text-2xl " + (isDark ? "text-white" : "text-slate-800")
                      : "text-sm " + (isDark ? "text-white/50" : "text-slate-500")
                    }`}>{t.digit}</div>
                    {rank === 0 && (
                      <div className={`text-[9px] font-bold ml-auto ${confColor(pr.confidence)}`}>
                        {pr.confidence}%
                      </div>
                    )}
                    {rank > 0 && (
                      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isDark ? "bg-white/20" : "bg-slate-300"}`}
                          style={{ width: `${Math.round((t.score / pr.top3[0].score) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {/* Agreement bar */}
                <div className={`w-full mt-1.5 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-slate-200"}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400"
                    style={{ width: `${pr.confidence}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Main prediction table */}
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
          <tbody>{renderTable(buildRows(gt), gt)}</tbody>
        </table>

        {/* Footer */}
        <div className={`px-5 py-3 flex items-center justify-between gap-2 flex-wrap border-t ${tBorder} ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
          <span className={`text-[11px] ${subtle}`}>
            Prediksi utama · {dataCount} draw · {activeSlot} WIB · 13 engine aktif
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={saveCurrentEval}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                savedMsg
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : isDark ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
              }`}
            >
              {savedMsg ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
              {savedMsg ? "Tersimpan!" : "Rekam"}
            </button>
            <button
              onClick={exportPDF}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/25" : "bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200"}`}
            >
              <FileDown className="w-3.5 h-3.5" />
              Simpan PDF
            </button>
            <button
              onClick={() => copy(buildCopyText(gt, pred.numberStr), "main")}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white/70" : "bg-slate-200 hover:bg-slate-300 text-slate-600"}`}
            >
              {copied === "main" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === "main" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* ── ALTERNATIVE PREDICTION ─────────────────────────────────────────── */}
      <div className={card}>
        <button
          onClick={() => setShowAlt(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <GitBranch className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
            <span className="font-black text-sm">Prediksi Alternatif 4D</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border font-mono ${isDark ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10" : "border-cyan-200 text-cyan-700 bg-cyan-50"}`}>
              {pred.altNumberStr}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-slate-500/20 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
              Digit ke-2 per posisi
            </span>
          </div>
          {showAlt ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showAlt && (
          <div className="px-5 pb-5">
            <div className={`overflow-hidden rounded-2xl border ${isDark ? "border-cyan-500/25" : "border-cyan-200"}`}>
              <div className={`px-4 py-3 flex items-center justify-between ${isDark ? "bg-cyan-500/10" : "bg-cyan-50"}`}>
                <div>
                  <div className={`font-black text-sm tracking-widest ${isDark ? "text-cyan-300" : "text-cyan-700"}`}>
                    ALTERNATIF — {activeSlot}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${subtle}`}>Berdasarkan digit terkuat kedua per posisi</div>
                </div>
                <div className={`font-black text-3xl tabular-nums tracking-widest ${isDark ? "text-cyan-300" : "text-cyan-700"}`}>
                  {pred.altNumberStr}
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className={isDark ? "bg-white/5" : "bg-slate-50"}>
                    <th className={`${thCls} text-left pl-4 w-[30%]`}>Games</th>
                    <th className={thCls}>As</th><th className={thCls}>Kop</th>
                    <th className={thCls}>Kepala</th><th className={thCls}>Ekor</th>
                  </tr>
                </thead>
                <tbody>{renderTable(buildRows(agt), agt)}</tbody>
              </table>
              <div className={`px-4 py-2.5 flex justify-end border-t ${tBorder} ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <button
                  onClick={() => copy(buildCopyText(agt, pred.altNumberStr), "alt")}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white/70" : "bg-slate-200 hover:bg-slate-300 text-slate-600"}`}
                >
                  {copied === "alt" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === "alt" ? "Copied!" : "Copy Alternatif"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── TOP 25 CANDIDATES ──────────────────────────────────────────────── */}
      <div className={card}>
        <button
          onClick={() => setShowCandidates(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Star className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
            <span className="font-black text-sm">Top 25 Kandidat 4D</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600"}`}>
              Skor probabilitas gabungan
            </span>
          </div>
          {showCandidates ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showCandidates && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {pred.topCandidates.map((c, i) => {
                const isTop1 = i === 0;
                const isTop3 = i < 3;
                const pct = Math.round((c.prob / pred.topCandidates[0].prob) * 100);
                return (
                  <div key={c.num} className={`relative rounded-2xl p-3 text-center border transition-all ${
                    isTop1
                      ? (isDark ? "bg-gradient-to-br from-amber-500/30 to-yellow-500/20 border-amber-400/60" : "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300")
                      : isTop3
                        ? (isDark ? "bg-white/8 border-white/15" : "bg-slate-50 border-slate-200")
                        : (isDark ? "bg-white/3 border-white/8" : "bg-slate-50/50 border-slate-100")
                  }`}>
                    {isTop1 && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">#1</span>
                      </div>
                    )}
                    {i === 1 && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-400 text-white">#2</span>
                      </div>
                    )}
                    {i === 2 && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-700 text-white">#3</span>
                      </div>
                    )}
                    <div className={`text-lg font-black tabular-nums tracking-widest mt-1 ${
                      isTop1 ? (isDark ? "text-amber-300" : "text-amber-700")
                      : isTop3 ? (isDark ? "text-white" : "text-slate-800")
                      : (isDark ? "text-white/50" : "text-slate-500")
                    }`}>{c.num}</div>
                    <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-slate-200"}`}>
                      <div
                        className={`h-full rounded-full ${isTop1 ? "bg-gradient-to-r from-amber-400 to-yellow-400" : "bg-gradient-to-r from-purple-500 to-indigo-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className={`text-[9px] mt-1 font-bold ${subtle}`}>{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── PER-POSITION DIGIT CHARTS ──────────────────────────────────────── */}
      <div className={card}>
        <button
          onClick={() => setShowDigitCharts(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
            <span className="font-black text-sm">Distribusi Skor per Digit</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-cyan-500/15 text-cyan-300" : "bg-cyan-50 text-cyan-600"}`}>
              4 posisi · skor 0-100
            </span>
          </div>
          {showDigitCharts ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showDigitCharts && (
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {POS_NAMES.map((posName, pi) => {
              const pr = pred.posResults[pi];
              const chartData = pr.scores.map((score, digit) => ({
                label: String(digit),
                score: Math.round(score),
                agreement: pr.agreementPct[digit],
              }));
              return (
                <div key={posName} className={`rounded-2xl p-4 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className={`text-xs font-black uppercase tracking-widest ${isDark ? "text-white/70" : "text-slate-600"}`}>
                        Posisi {posName}
                      </span>
                      <div className={`text-[10px] mt-0.5 ${subtle}`}>
                        Top-3: <span className="font-bold">{pr.top3.map(t => t.digit).join(", ")}</span>
                        {" "}· Kesepakatan: <span className={`font-bold ${confColor(pr.confidence)}`}>{pr.confidence}%</span>
                      </div>
                    </div>
                    <span className={`text-2xl font-black tabular-nums ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                      {pr.topDigit}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={chartData} barSize={16} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number, name: string) => [name === "score" ? `${v}%` : `${v}%`, name === "score" ? "Skor" : "Agreement"]}
                      />
                      <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry, idx) => {
                          const isTop = idx === pr.topDigit;
                          const isTop3 = pr.top3.some(t => t.digit === idx);
                          return (
                            <Cell
                              key={idx}
                              fill={isTop ? "#f59e0b" : isTop3 ? "#8b5cf6" : isDark ? "#334155" : "#cbd5e1"}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Engine agreement bar per top digit */}
                  <div className={`mt-2 flex gap-1 flex-wrap`}>
                    {pr.top3.map((t, ri) => (
                      <div key={ri} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${
                        ri === 0
                          ? (isDark ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700")
                          : (isDark ? "bg-white/5 border-white/10 text-white/50" : "bg-slate-100 border-slate-200 text-slate-500")
                      }`}>
                        <span>Digit {t.digit}</span>
                        <span className="opacity-60">·</span>
                        <span>{pr.agreementPct[t.digit]}% vote</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ENGINE BREAKDOWN ────────────────────────────────────────────────── */}
      <div className={card}>
        <button
          onClick={() => setShowEngines(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Cpu className={`w-4 h-4 ${isDark ? "text-violet-400" : "text-violet-600"}`} />
            <span className="font-black text-sm">12 Engine Aktif</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-violet-500/15 text-violet-300" : "bg-violet-50 text-violet-600"}`}>
              Bobot default
            </span>
          </div>
          {showEngines ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showEngines && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ENGINE_META.map((e, ei) => {
                // Show which digit this engine voted for on position 0 (As)
                const asEngineScores = pred.posResults[0]?.engineScores?.[ei];
                const topVote = asEngineScores
                  ? asEngineScores.indexOf(Math.max(...asEngineScores))
                  : -1;
                return (
                  <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0 text-[9px] font-black"
                      style={{ backgroundColor: e.color }}>
                      {e.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className={`text-xs font-bold truncate ${isDark ? "text-white/80" : "text-slate-700"}`}>{e.name}</div>
                        <div className={`text-[10px] font-black flex-shrink-0 ${isDark ? "text-white/40" : "text-slate-400"}`}>{e.w}%</div>
                      </div>
                      <div className={`mt-1.5 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-slate-200"}`}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(e.w / 20) * 100}%`, backgroundColor: e.color }} />
                      </div>
                      {topVote >= 0 && (
                        <div className={`text-[9px] mt-0.5 ${subtle}`}>
                          Vote As: <span className="font-bold">{topVote}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 p-3 rounded-xl text-[10px] leading-relaxed ${isDark ? "bg-white/3 text-white/40" : "bg-slate-50 text-slate-500"}`}>
              <span className="font-bold">Cara kerja:</span> Setiap engine menganalisis pola berbeda secara independen, menghasilkan skor 0-100 per digit per posisi.
              Skor dikombinasikan via weighted ensemble + Borda count voting. Confidence dihitung dari kesepakatan antar engine.
            </div>
          </div>
        )}
      </div>

      {/* ── BACKTEST ACCURACY ──────────────────────────────────────────────── */}
      <div className={card}>
        <button
          onClick={() => { if (!backtest && !btRunning) runBacktest(); else setShowBacktest(v => !v); }}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Target className={`w-4 h-4 ${isDark ? "text-green-400" : "text-green-600"}`} />
            <span className="font-black text-sm">Akurasi Historis (Backtest)</span>
            {!backtest && !btRunning && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-green-500/15 text-green-300" : "bg-green-50 text-green-600"}`}>
                Klik untuk hitung
              </span>
            )}
            {btRunning && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600"}`}>
                Menghitung...
              </span>
            )}
            {backtest && !btRunning && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${confBg(backtest.rate4D)}`}>
                4D: {backtest.rate4D}% · 2D: {backtest.rate2D}%
              </span>
            )}
          </div>
          {showBacktest ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showBacktest && backtest && backtest.total > 0 && (
          <div className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Hit Rate 4D", value: `${backtest.rate4D}%`, sub: `${backtest.correct4D}/${backtest.total} draw`, color: backtest.rate4D },
                { label: "Hit Rate 2D", value: `${backtest.rate2D}%`, sub: "Kepala+Ekor tepat", color: backtest.rate2D },
                { label: "Total Tes", value: String(backtest.total), sub: "draw diuji", color: 70 },
                { label: "Data Slot", value: String(dataCount), sub: "draw historis", color: 70 },
              ].map((item, i) => (
                <div key={i} className={`rounded-2xl p-4 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className={`text-3xl font-black ${confColor(item.color)}`}>{item.value}</div>
                  <div className={`text-xs font-bold mt-1 ${isDark ? "text-white/60" : "text-slate-600"}`}>{item.label}</div>
                  <div className={`text-[10px] mt-0.5 ${subtle}`}>{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Per-engine hit rates */}
            <div>
              <div className={`text-xs font-black mb-2 ${isDark ? "text-white/60" : "text-slate-600"}`}>Hit Rate per Engine (% digit tepat):</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ENGINE_META.map((e, ei) => {
                  const hr = backtest.perEngineHit[ei] ?? 0;
                  return (
                    <div key={e.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl ${isDark ? "bg-white/3" : "bg-slate-50"}`}>
                      <div className="w-4 h-4 rounded flex items-center justify-center text-white flex-shrink-0 text-[7px]"
                        style={{ backgroundColor: e.color }}>
                        {e.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[9px] truncate ${subtle}`}>{e.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-slate-200"}`}>
                            <div className="h-full rounded-full" style={{ width: `${hr}%`, backgroundColor: e.color }} />
                          </div>
                          <span className={`text-[9px] font-black flex-shrink-0 ${confColor(hr)}`}>{hr}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`p-3 rounded-xl text-[10px] leading-relaxed ${isDark ? "bg-white/3 text-white/40" : "bg-slate-50 text-slate-500"}`}>
              <span className="font-bold">Metodologi:</span> Uji mundur {backtest.total} draw terakhir di slot {activeSlot}.
              Untuk setiap draw, prediksi dibuat dari data sebelumnya (tanpa bocoran).
              Hit rate 4D = aktual ada di top-25 kandidat. Hit rate 2D = 2 digit akhir tepat.
              <span className="block mt-1">Catatan: lottery bersifat acak — tidak ada sistem yang bisa menjamin kemenangan 100%.</span>
            </div>

            <button
              onClick={runBacktest}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${isDark ? "bg-white/8 hover:bg-white/12 text-white/60" : "bg-slate-200 hover:bg-slate-300 text-slate-600"}`}
            >
              <RefreshCw className="w-3 h-3" /> Hitung Ulang
            </button>
          </div>
        )}

        {showBacktest && backtest && backtest.total === 0 && (
          <div className={`px-5 pb-5 text-sm ${subtle}`}>
            Data historis slot {activeSlot} belum cukup untuk backtest (minimal 30 draw).
          </div>
        )}
      </div>

      {/* ══ BBFS CARD ══════════════════════════════════════════════════════════ */}
      <div className={card}>
        {/* Header */}
        <div className={`px-5 pt-5 pb-4 border-b ${tBorder}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30 flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                BBFS — Buat Bebas Full Set
              </div>
              <div className={`text-[11px] mt-0.5 ${subtle}`}>
                Pilih N digit terbaik → taruhan SEMUA kombinasi 4D dari digit tersebut
              </div>
            </div>
            <div className={`ml-auto text-[10px] px-2 py-1 rounded-lg font-bold flex items-center gap-1 ${isDark ? "bg-sky-500/20 text-sky-300" : "bg-sky-50 text-sky-600"}`}>
              <Database className="w-3 h-3" />
              {allDraws.length} draw
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* BBFS 5 Digit */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-sky-500/25 bg-sky-500/8" : "border-sky-200 bg-sky-50"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className={`text-xs font-black uppercase tracking-widest ${isDark ? "text-sky-300" : "text-sky-700"}`}>
                  BBFS 5 Digit
                </div>
                <div className={`text-[10px] mt-0.5 ${subtle}`}>
                  5⁴ = 625 kombinasi 4D
                </div>
              </div>
              <div className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${isDark ? "bg-sky-500/20 text-sky-300" : "bg-sky-100 text-sky-700"}`}>
                625 nomor
              </div>
            </div>
            {/* Digit pills */}
            <div className="flex gap-2 flex-wrap mb-3">
              {bbfs.digits5.map(d => (
                <div
                  key={d}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black shadow-md ${isDark ? "bg-sky-500 text-white shadow-sky-500/40" : "bg-sky-500 text-white shadow-sky-200"}`}
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Score bars */}
            <div className="space-y-1">
              {bbfs.digits5.map(d => {
                const sc = bbfs.globalDigitScores[d];
                const maxSc = Math.max(...bbfs.globalDigitScores, 1);
                const pct = Math.round((sc / maxSc) * 100);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className={`text-[10px] font-black w-4 text-right flex-shrink-0 ${isDark ? "text-sky-300" : "text-sky-700"}`}>{d}</span>
                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-sky-100"}`}>
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[9px] font-black flex-shrink-0 w-7 ${subtle}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 text-[11px] font-mono tracking-widest font-black ${isDark ? "text-white/70" : "text-slate-700"}`}>
              Digit: {bbfs.digits5.join(" — ")}
            </div>
          </div>

          {/* BBFS 7 Digit */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-violet-500/25 bg-violet-500/8" : "border-violet-200 bg-violet-50"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className={`text-xs font-black uppercase tracking-widest ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                  BBFS 7 Digit
                </div>
                <div className={`text-[10px] mt-0.5 ${subtle}`}>
                  7⁴ = 2401 kombinasi 4D
                </div>
              </div>
              <div className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${isDark ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-700"}`}>
                2401 nomor
              </div>
            </div>
            {/* Digit pills */}
            <div className="flex gap-2 flex-wrap mb-3">
              {bbfs.digits7.map(d => (
                <div
                  key={d}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black shadow-md ${isDark ? "bg-violet-500 text-white shadow-violet-500/40" : "bg-violet-500 text-white shadow-violet-200"}`}
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Score bars */}
            <div className="space-y-1">
              {bbfs.digits7.map(d => {
                const sc = bbfs.globalDigitScores[d];
                const maxSc = Math.max(...bbfs.globalDigitScores, 1);
                const pct = Math.round((sc / maxSc) * 100);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className={`text-[10px] font-black w-4 text-right flex-shrink-0 ${isDark ? "text-violet-300" : "text-violet-700"}`}>{d}</span>
                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-violet-100"}`}>
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[9px] font-black flex-shrink-0 w-7 ${subtle}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 text-[11px] font-mono tracking-widest font-black ${isDark ? "text-white/70" : "text-slate-700"}`}>
              Digit: {bbfs.digits7.join(" — ")}
            </div>
          </div>

          {/* Ranking semua digit 0-9 */}
          <div>
            <div className={`text-[11px] font-black mb-2 ${isDark ? "text-white/50" : "text-slate-500"}`}>
              Peringkat Semua Digit (skor gabungan 13 engine + {allDraws.length} draw global):
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {bbfs.rankList.map((item, rank) => {
                const maxSc = Math.max(...bbfs.globalDigitScores, 1);
                const pct = Math.round((item.score / maxSc) * 100);
                const inBbfs5 = bbfs.digits5.includes(item.digit);
                const inBbfs7 = bbfs.digits7.includes(item.digit);
                return (
                  <div
                    key={item.digit}
                    className={`rounded-xl p-2 text-center ${
                      inBbfs5
                        ? isDark ? "bg-sky-500/20 border border-sky-500/40" : "bg-sky-100 border border-sky-300"
                        : inBbfs7
                        ? isDark ? "bg-violet-500/15 border border-violet-500/30" : "bg-violet-50 border border-violet-200"
                        : isDark ? "bg-white/3 border border-white/6" : "bg-slate-50 border border-slate-200"
                    }`}
                  >
                    <div className={`text-[9px] font-bold ${subtle}`}>#{rank + 1}</div>
                    <div className={`text-lg font-black ${
                      inBbfs5
                        ? isDark ? "text-sky-300" : "text-sky-700"
                        : inBbfs7
                        ? isDark ? "text-violet-300" : "text-violet-700"
                        : isDark ? "text-white/50" : "text-slate-400"
                    }`}>{item.digit}</div>
                    <div className={`text-[9px] font-bold ${subtle}`}>{pct}%</div>
                    {inBbfs5 && <div className={`text-[7px] font-black mt-0.5 ${isDark ? "text-sky-400" : "text-sky-600"}`}>B5</div>}
                    {!inBbfs5 && inBbfs7 && <div className={`text-[7px] font-black mt-0.5 ${isDark ? "text-violet-400" : "text-violet-600"}`}>B7</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`p-3 rounded-xl text-[10px] leading-relaxed ${isDark ? "bg-white/3 text-white/40" : "bg-slate-50 text-slate-500"}`}>
            <span className="font-bold">Cara pakai BBFS:</span> Pilih semua nomor 4D yang terbentuk dari kombinasi digit BBFS yang dipilih.
            BBFS 5 menghasilkan 5×5×5×5 = 625 nomor, BBFS 7 menghasilkan 7×7×7×7 = 2401 nomor.
            Digit dipilih berdasarkan analisis gabungan: skor 13 engine ({allDraws.length} draw global) + frekuensi global + sinyal gap + Markov global.
            <span className="block mt-1 font-bold text-amber-500/80">⚠ Tidak ada sistem yang menjamin kemenangan 100% — gunakan dengan bijak.</span>
          </div>
        </div>
      </div>

      {/* ══ EVALUASI & PEMBELAJARAN ════════════════════════════════════════════ */}
      <div className={card}>
        {/* Header toggle */}
        <button
          onClick={() => setShowEval(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30 flex-shrink-0`}>
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <span className="font-black text-sm">Evaluasi &amp; Pembelajaran</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("emerald")}`}>
              {evals.length} rekaman
            </span>
            {evalStats && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pill("cyan")}`}>
                4D: {evalStats.rate4D}% · 2D: {evalStats.rate2D}% · Top25: {evalStats.rateTop25}%
              </span>
            )}
          </div>
          {showEval ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
        </button>

        {showEval && (
          <div className="px-5 pb-5 space-y-4">

            {/* Info */}
            <div className={`p-3 rounded-xl text-[11px] leading-relaxed ${isDark ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-200/80" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
              <span className="font-bold">Cara pakai:</span> Klik <strong>Rekam</strong> di footer tabel prediksi untuk menyimpan prediksi saat ini.
              Setelah draw keluar, masukkan 4 digit hasil aktual di kolom evaluasi.
              Sistem otomatis menghitung apakah prediksi tepat — datanya tersimpan per akun &amp; disinkronkan lintas perangkat.
            </div>

            {/* Stats ringkasan */}
            {evalStats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: "Hit 4D Tepat", value: `${evalStats.rate4D}%`, sub: "4D utama/alt", color: evalStats.rate4D },
                  { label: "Hit 2D Tepat", value: `${evalStats.rate2D}%`, sub: "Kepala+Ekor", color: evalStats.rate2D },
                  { label: "Dalam Top25", value: `${evalStats.rateTop25}%`, sub: "kandidat", color: evalStats.rateTop25 },
                  { label: "Dalam BBFS5", value: `${evalStats.rateBBFS5}%`, sub: "semua digit", color: evalStats.rateBBFS5 },
                  { label: "Dalam BBFS7", value: `${evalStats.rateBBFS7}%`, sub: "semua digit", color: evalStats.rateBBFS7 },
                ].map((item, i) => (
                  <div key={i} className={`rounded-2xl p-3 text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <div className={`text-xl font-black ${confColor(item.color)}`}>{item.value}</div>
                    <div className={`text-[10px] font-bold mt-0.5 ${isDark ? "text-white/60" : "text-slate-600"}`}>{item.label}</div>
                    <div className={`text-[9px] mt-0.5 ${subtle}`}>{item.sub}</div>
                  </div>
                ))}
              </div>
            )}
            {!evalStats && evals.length > 0 && (
              <div className={`text-xs text-center py-2 ${subtle}`}>
                Masukkan hasil aktual di bawah untuk melihat statistik akurasi
              </div>
            )}
            {evals.length === 0 && (
              <div className={`text-center py-8 ${subtle}`}>
                <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <div className="text-sm font-bold opacity-40">Belum ada rekaman prediksi</div>
                <div className={`text-xs mt-1 opacity-30`}>Klik tombol <strong>Rekam</strong> di footer tabel prediksi untuk memulai</div>
              </div>
            )}

            {/* Daftar evaluasi */}
            {evals.length > 0 && (
              <div className="space-y-2">
                <div className={`text-xs font-black ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  Riwayat Prediksi ({evals.length} rekaman terbaru):
                </div>
                {evals.map(e => {
                  const ts = new Date(e.timestamp);
                  const tsStr = ts.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                  const hasActual = !!e.actual;
                  return (
                    <div
                      key={e.id}
                      className={`rounded-2xl border p-4 ${isDark
                        ? hasActual
                          ? e.correct4D ? "border-green-500/30 bg-green-500/5" : "border-white/8 bg-white/3"
                          : "border-white/10 bg-white/3"
                        : hasActual
                          ? e.correct4D ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        {/* Left: prediksi info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${isDark ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-700"}`}>
                              {e.slot} WIB
                            </span>
                            <span className={`text-[10px] ${subtle}`}>{tsStr}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div>
                              <div className={`text-[9px] font-bold mb-0.5 ${subtle}`}>Prediksi Utama</div>
                              <div className={`font-black text-xl tabular-nums tracking-widest font-mono ${isDark ? "text-white" : "text-slate-800"}`}>
                                {e.predictedMain}
                              </div>
                            </div>
                            <div>
                              <div className={`text-[9px] font-bold mb-0.5 ${subtle}`}>Alternatif</div>
                              <div className={`font-black text-base tabular-nums tracking-widest font-mono ${isDark ? "text-white/60" : "text-slate-500"}`}>
                                {e.predictedAlt}
                              </div>
                            </div>
                            <div>
                              <div className={`text-[9px] font-bold mb-0.5 ${subtle}`}>BBFS 5</div>
                              <div className={`text-sm font-black font-mono tracking-widest ${isDark ? "text-sky-300" : "text-sky-700"}`}>
                                {e.bbfs5.join("")}
                              </div>
                            </div>
                            <div>
                              <div className={`text-[9px] font-bold mb-0.5 ${subtle}`}>BBFS 7</div>
                              <div className={`text-sm font-black font-mono tracking-widest ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                                {e.bbfs7.join("")}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: hasil aktual / input */}
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {hasActual ? (
                            <div className="text-right">
                              <div className={`text-[9px] font-bold mb-0.5 ${subtle}`}>Hasil Aktual</div>
                              <div className={`font-black text-2xl tabular-nums tracking-widest font-mono ${
                                e.correct4D
                                  ? isDark ? "text-green-400" : "text-green-600"
                                  : isDark ? "text-white" : "text-slate-800"
                              }`}>{e.actual}</div>
                              <div className="flex items-center gap-1 mt-1 flex-wrap justify-end">
                                {e.correct4D && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"}`}>✓ 4D</span>
                                )}
                                {e.correct2D && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>✓ 2D</span>
                                )}
                                {e.inTop25 && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"}`}>Top25</span>
                                )}
                                {e.inBBFS5 && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-sky-500/20 text-sky-400" : "bg-sky-100 text-sky-700"}`}>BBFS5</span>
                                )}
                                {e.inBBFS7 && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-violet-500/20 text-violet-400" : "bg-violet-100 text-violet-700"}`}>BBFS7</span>
                                )}
                                {!e.correct4D && !e.correct2D && !e.inTop25 && !e.inBBFS5 && !e.inBBFS7 && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDark ? "bg-red-500/15 text-red-400" : "bg-red-50 text-red-600"}`}>Tidak masuk</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                maxLength={4}
                                placeholder="4 digit"
                                value={evalInput[e.id] ?? ""}
                                onChange={ev => setEvalInput(prev => ({ ...prev, [e.id]: ev.target.value.replace(/\D/g, "") }))}
                                onKeyDown={ev => { if (ev.key === "Enter") recordActual(e.id); }}
                                className={`w-20 text-center text-sm font-black tabular-nums font-mono tracking-widest rounded-xl border px-2 py-1.5 outline-none ${isDark
                                  ? "bg-white/8 border-white/15 text-white placeholder-white/20 focus:border-emerald-500/60"
                                  : "bg-white border-slate-200 text-slate-800 placeholder-slate-300 focus:border-emerald-400"
                                }`}
                              />
                              <button
                                onClick={() => recordActual(e.id)}
                                disabled={!/^\d{4}$/.test(evalInput[e.id] ?? "")}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 ${isDark
                                  ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                Simpan
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => deleteEval(e.id)}
                            className={`text-[10px] flex items-center gap-1 opacity-30 hover:opacity-70 transition-opacity ${isDark ? "text-red-400" : "text-red-500"}`}
                          >
                            <Trash2 className="w-3 h-3" /> Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`p-3 rounded-xl text-[10px] leading-relaxed ${isDark ? "bg-white/3 text-white/40" : "bg-slate-50 text-slate-500"}`}>
              <span className="font-bold">📊 Tentang evaluasi:</span> Data rekaman disimpan di akun Anda dan disinkronkan lintas perangkat.
              Statistik akurasi terbentuk otomatis setelah Anda memasukkan hasil aktual.
              Sistem backtest yang ada di atas sudah menganalisis 907+ draw historis secara otomatis untuk mengoptimalkan bobot engine — evaluasi ini melengkapinya dengan data draw terbaru yang belum masuk ke historis.
              <span className="block mt-1 font-bold text-amber-500/80">Semakin banyak rekaman dengan hasil aktual, semakin akurat gambaran performa sistem.</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
