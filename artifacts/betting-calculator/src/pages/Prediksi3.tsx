/**
 * Prediksi 3 — Analisis Statistik Profesional Toto Macau 4D
 * Frekuensi · Hot/Cold · Besar/Kecil · Ganjil/Genap ·
 * Kembar/Mirror · Sum · Transisi · BBFS · Top 4D
 */
import React, { useState, useMemo } from "react";
import {
  BarChart2, Flame, Snowflake, Target, Star, Award,
  AlertCircle, Info, ArrowRight, TrendingUp, Hash,
  CheckCircle, Zap
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS  = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const ALL_SLOTS   = "Semua Slot";
const POS_NAMES   = ["AS (Ribuan)", "KOP (Ratusan)", "KEPALA (Puluhan)", "EKOR (Satuan)"];
const POS_SHORT   = ["AS", "KOP", "KP", "EK"];
const WINDOWS     = [10, 30, 50, 100, 200] as const;
type  WinNum      = typeof WINDOWS[number];

// ─── Scoring helpers ─────────────────────────────────────────────────────────
function confLabel(score: number, max: number): "tinggi" | "sedang" | "rendah" {
  const r = score / (max || 1);
  return r >= 0.65 ? "tinggi" : r >= 0.35 ? "sedang" : "rendah";
}
function confCls(c: "tinggi" | "sedang" | "rendah", dark: boolean) {
  if (c === "tinggi") return dark ? "bg-green-500/20 text-green-300"  : "bg-green-100 text-green-700";
  if (c === "sedang") return dark ? "bg-amber-500/20 text-amber-300"  : "bg-amber-100 text-amber-700";
  return dark ? "bg-slate-500/20 text-slate-400" : "bg-slate-100 text-slate-500";
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { resultData: ResultRow[]; isDark: boolean; }

export default function Prediksi3({ resultData, isDark }: Props) {
  const card = isDark
    ? "bg-white/6 border border-white/10 rounded-[20px]"
    : "bg-white border border-slate-200 rounded-[20px] shadow-sm";

  const [slot,   setSlot]   = useState<string>(ALL_SLOTS);
  const [win,    setWin]    = useState<WinNum>(50);
  const [tab,    setTab]    = useState<"ringkasan"|"digit"|"pola"|"kandidat"|"anomali">("ringkasan");

  // ── Collect numbers based on filters ────────────────────────────────────────
  const nums = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const row of resultData) {
      for (const s of (slot === ALL_SLOTS ? TIME_SLOTS : [slot])) {
        const v = String(row[s] || "");
        if (/^\d{4}$/.test(v)) out.push(v);
      }
    }
    return out.slice(0, win);
  }, [resultData, slot, win]);

  const N = nums.length;

  // ── Digit frequency ──────────────────────────────────────────────────────────
  const digitFreq = useMemo(() => {
    const byPos = Array.from({ length: 4 }, () => new Array(10).fill(0)) as number[][];
    const overall = new Array(10).fill(0) as number[];
    nums.forEach(v => {
      for (let p = 0; p < 4; p++) {
        const d = parseInt(v[p], 10);
        if (!isNaN(d)) { byPos[p][d]++; overall[d]++; }
      }
    });
    return { byPos, overall };
  }, [nums]);

  // ── 2D Depan frequency ───────────────────────────────────────────────────────
  const d2Freq = useMemo(() => {
    const freq: Record<string, number> = {};
    const rec10: Record<string, number> = {};
    nums.forEach((v, idx) => {
      const d = v.slice(0, 2);
      freq[d] = (freq[d] || 0) + 1;
      if (idx < 10) rec10[d] = (rec10[d] || 0) + 1;
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return { freq, rec10, sorted };
  }, [nums]);

  // ── Big/Small (0-4 kecil, 5-9 besar) ────────────────────────────────────────
  const bigSmall = useMemo(() => {
    const counts = Array.from({ length: 4 }, () => ({ big: 0, small: 0 }));
    const patCnt: Record<string, number> = {};
    nums.forEach(v => {
      const pat = v.split("").map(d => parseInt(d) >= 5 ? "B" : "K").join("");
      patCnt[pat] = (patCnt[pat] || 0) + 1;
      for (let p = 0; p < 4; p++) {
        if (parseInt(v[p]) >= 5) counts[p].big++; else counts[p].small++;
      }
    });
    const topPat = Object.entries(patCnt).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { counts, topPat };
  }, [nums]);

  // ── Odd/Even ─────────────────────────────────────────────────────────────────
  const oddEven = useMemo(() => {
    const counts = Array.from({ length: 4 }, () => ({ odd: 0, even: 0 }));
    const patCnt: Record<string, number> = {};
    nums.forEach(v => {
      const pat = v.split("").map(d => parseInt(d) % 2 === 0 ? "G" : "J").join("");
      patCnt[pat] = (patCnt[pat] || 0) + 1;
      for (let p = 0; p < 4; p++) {
        if (parseInt(v[p]) % 2 === 0) counts[p].even++; else counts[p].odd++;
      }
    });
    const topPat = Object.entries(patCnt).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { counts, topPat };
  }, [nums]);

  // ── Digit sum distribution ────────────────────────────────────────────────────
  const sumStats = useMemo(() => {
    const dist: Record<number, number> = {};
    let total = 0;
    nums.forEach(v => {
      const s = v.split("").reduce((a, d) => a + parseInt(d), 0);
      dist[s] = (dist[s] || 0) + 1;
      total += s;
    });
    return { dist, avg: N > 0 ? total / N : 0 };
  }, [nums, N]);

  // ── Special numbers ───────────────────────────────────────────────────────────
  const special = useMemo(() => {
    let twins = 0, mirrors = 0, straights = 0;
    nums.forEach(v => {
      if (v[0]===v[1] || v[1]===v[2] || v[2]===v[3]) twins++;
      if (v[0]===v[3] && v[1]===v[2]) mirrors++;
      if (v[0]===v[1] && v[1]===v[2] && v[2]===v[3]) straights++;
    });
    return { twins, mirrors, straights };
  }, [nums]);

  // ── Transition (2D depan → 2D depan next) ────────────────────────────────────
  const transitions = useMemo(() => {
    const tr: Record<string, Record<string, number>> = {};
    for (let i = 0; i < nums.length - 1; i++) {
      const from = nums[i].slice(0, 2);
      const to   = nums[i + 1].slice(0, 2);
      if (!tr[from]) tr[from] = {};
      tr[from][to] = (tr[from][to] || 0) + 1;
    }
    return tr;
  }, [nums]);

  // ── Top 10 digit candidates ───────────────────────────────────────────────────
  const topDigits = useMemo(() => {
    const n = N || 1;
    return Array.from({ length: 10 }, (_, d) => {
      const ov  = digitFreq.overall[d];
      const ovS = (ov / (n * 4)) * 100;

      // Recency last-10
      const rec = nums.slice(0, 10).filter(v => v.includes(String(d))).length;
      const recS = (rec / 10) * 100;

      // Gap (overdue)
      let lastIdx = -1;
      for (let i = 0; i < nums.length; i++) {
        if (nums[i].includes(String(d))) { lastIdx = i; break; }
      }
      const gapS = lastIdx === -1 ? 30 : lastIdx > 5 ? Math.min(28, lastIdx * 2.5) : 0;

      // Position dominance
      const maxPos = Math.max(...digitFreq.byPos.map(pa => pa[d]));
      const posS   = (maxPos / n) * 100;

      const total = ovS*0.35 + recS*0.40 + gapS*0.15 + posS*0.10;
      return { digit: d, total, ov, rec, lastIdx, gapS };
    }).sort((a, b) => b.total - a.total);
  }, [nums, N, digitFreq]);

  // ── Top 20 2D BBFS ────────────────────────────────────────────────────────────
  const top20_2D = useMemo(() => {
    const n = N || 1;
    return d2Freq.sorted.slice(0, 20).map(([num, cnt]) => {
      const rec   = d2Freq.rec10[num] || 0;
      let lastIdx = -1;
      for (let i = 0; i < nums.length; i++) {
        if (nums[i].slice(0, 2) === num) { lastIdx = i; break; }
      }
      const score = (cnt / n)*60 + (rec / 10)*30 + (lastIdx > 15 ? 10 : 0);
      return { num, cnt, rec, lastIdx, score };
    }).sort((a, b) => b.score - a.score);
  }, [d2Freq, nums, N]);

  const maxBBFS = top20_2D[0]?.score || 1;

  // ── Top 10 4D ─────────────────────────────────────────────────────────────────
  const top10_4D = useMemo(() => {
    const freq4: Record<string, number> = {};
    nums.forEach(v => { freq4[v] = (freq4[v] || 0) + 1; });
    const digScores = topDigits.map(d => d.total);
    const scoreIt = (num: string) =>
      (freq4[num] || 0) * 25 +
      num.split("").reduce((a, d) => a + digScores[parseInt(d)], 0) * 0.6;

    const seen = new Set<string>();
    const list: { num: string; cnt: number; score: number }[] = [];

    // First: actual occurrences
    Object.entries(freq4).forEach(([num, cnt]) => {
      list.push({ num, cnt, score: scoreIt(num) });
      seen.add(num);
    });

    // Fill up to 10 with top-digit combos if needed
    if (list.length < 10) {
      const top4 = topDigits.slice(0, 5).map(d => String(d.digit));
      for (let i = 0; i < top4.length && list.length < 10; i++) {
        for (let j = 0; j < top4.length && list.length < 10; j++) {
          for (let k = 0; k < top4.length && list.length < 10; k++) {
            for (let l = 0; l < top4.length && list.length < 10; l++) {
              const num = top4[i] + top4[j] + top4[k] + top4[l];
              if (!seen.has(num)) { seen.add(num); list.push({ num, cnt: 0, score: scoreIt(num) }); }
            }
          }
        }
      }
    }
    return list.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [nums, topDigits]);

  // ── Anomalies ─────────────────────────────────────────────────────────────────
  const anomalies = useMemo(() => {
    const list: { type: "warn"|"info"; text: string }[] = [];
    if (N < 5) return list;
    const exp = (N * 4) / 10;
    for (let d = 0; d <= 9; d++) {
      const cnt = digitFreq.overall[d];
      if (cnt < exp * 0.45) list.push({ type: "warn", text: `Digit ${d} sangat jarang muncul: ${cnt}× (ekspektasi ~${exp.toFixed(0)}×) — kandidat overdue kuat` });
      else if (cnt > exp * 1.85) list.push({ type: "info", text: `Digit ${d} dominan: ${cnt}× = ${((cnt/(N*4))*100).toFixed(0)}% — lebih tinggi dari rata-rata` });
    }
    // Check consecutive same 2D
    let sameConsec = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      if (nums[i].slice(0,2) === nums[i+1].slice(0,2)) sameConsec++;
    }
    if (sameConsec > N * 0.12) list.push({ type: "warn", text: `Pengulangan 2D depan berturut-turut tinggi: ${sameConsec}× (${((sameConsec/N)*100).toFixed(0)}%)` });
    // Big/small imbalance per position
    bigSmall.counts.forEach(({ big, small }, pi) => {
      const tot = big + small || 1;
      if (Math.abs(big - small) / tot > 0.42) {
        list.push({ type: "info", text: `Posisi ${POS_SHORT[pi]}: ${big > small ? "BESAR" : "KECIL"} dominan ${big}B/${small}K (${((Math.max(big,small)/tot)*100).toFixed(0)}%)` });
      }
    });
    return list.slice(0, 8);
  }, [N, nums, digitFreq, bigSmall]);

  const TABS = [
    { id: "ringkasan", label: "Ringkasan" },
    { id: "digit",     label: "Digit Freq" },
    { id: "pola",      label: "Pola" },
    { id: "kandidat",  label: "Kandidat" },
    { id: "anomali",   label: "Anomali" },
  ] as const;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-slide-up">

      {/* ══ Header ══ */}
      <div className="rounded-[22px] bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 text-white p-4 md:p-5 shadow-2xl">
        <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
          <BarChart2 className="w-6 h-6"/>Prediksi 3 — Analisis Statistik Profesional
        </h1>
        <p className="text-white/70 text-xs mt-1">
          Frekuensi · Hot/Cold · Besar/Kecil · Ganjil/Genap · Kembar/Mirror · Transisi · BBFS · 4D
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <select
            value={slot}
            onChange={e => setSlot(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/30 text-white text-xs font-bold focus:outline-none cursor-pointer"
          >
            <option value={ALL_SLOTS}>{ALL_SLOTS}</option>
            {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-1">
            {WINDOWS.map(n => (
              <button
                key={n}
                onClick={() => setWin(n)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  win === n ? "bg-white text-black border-white" : "bg-white/15 border-white/30 hover:bg-white/25"
                }`}
              >{n}</button>
            ))}
          </div>
          <span className="text-white/50 text-xs">{N} draw</span>
        </div>
      </div>

      {/* ══ Tab bar ══ */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.id
                ? "bg-teal-600 text-white shadow-sm"
                : isDark ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ══ RINGKASAN ══ */}
      {tab === "ringkasan" && (
        <div className="space-y-3">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { label: "Total Draw",    val: N,                                                         color: "text-blue-400" },
              { label: "Avg Sum Digit", val: sumStats.avg.toFixed(2),                                   color: "text-purple-400" },
              { label: "Kembar Digit",  val: `${special.twins} (${N ? (special.twins/N*100).toFixed(0) : 0}%)`, color: "text-amber-400" },
              { label: "Angka Mirror",  val: `${special.mirrors} (${N ? (special.mirrors/N*100).toFixed(0) : 0}%)`, color: "text-cyan-400" },
            ].map(s => (
              <div key={s.label} className={`${card} p-3.5 text-center`}>
                <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[10px] opacity-50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Today's results */}
          {resultData[0] && (
            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-sm">Hasil Hari Ini</h3>
                <span className="text-xs opacity-50">{resultData[0].hari} {resultData[0].tanggal}</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {TIME_SLOTS.map(s => {
                  const v = String(resultData[0][s] || "");
                  const ok = /^\d{4}$/.test(v);
                  return (
                    <div key={s} className={`p-2.5 rounded-xl text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                      <div className="text-[10px] opacity-40 mb-1">{s}</div>
                      <div className={`font-mono font-black text-base ${ok ? "text-green-400" : "opacity-15"}`}>{ok ? v : "—"}</div>
                      {ok && <div className="text-[9px] opacity-50 mt-0.5">D:{v.slice(0,2)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hot numbers */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-400"/>Hot Numbers 2D Depan (Sering Muncul)
            </h3>
            <div className="flex flex-wrap gap-2">
              {d2Freq.sorted.slice(0, 10).map(([num, cnt], i) => (
                <div key={num} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold ${
                  i === 0 ? "bg-red-500 text-white" :
                  i === 1 ? "bg-orange-500 text-white" :
                  i === 2 ? "bg-amber-500 text-black" :
                  isDark  ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"
                }`}>
                  <span className="font-mono text-sm">{num}</span>
                  <span className="text-[10px] opacity-70">{cnt}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cold numbers */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-blue-400"/>Cold Numbers 2D Depan (Jarang / Overdue)
            </h3>
            <div className="flex flex-wrap gap-2">
              {d2Freq.sorted.slice(-10).reverse().map(([num, cnt]) => (
                <div key={num} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold ${isDark ? "bg-blue-900/30 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                  <span className="font-mono text-sm text-blue-400">{num}</span>
                  <span className="text-[10px] text-blue-400 opacity-60">{cnt}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent chain */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-purple-400"/>10 Result Terakhir
            </h3>
            <div className="flex flex-wrap gap-1.5 items-center">
              {nums.slice(0, 10).map((v, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ArrowRight className="w-2.5 h-2.5 opacity-20"/>}
                  <div className={`px-2.5 py-1.5 rounded-xl font-mono font-black text-xs ${
                    i === 0
                      ? isDark ? "bg-teal-500/30 border border-teal-400/50 text-teal-200" : "bg-teal-50 border border-teal-300 text-teal-700"
                      : isDark ? "bg-white/8 text-white/80" : "bg-slate-100 text-slate-700"
                  }`}>{v}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ DIGIT FREQ ══ */}
      {tab === "digit" && (
        <div className="space-y-3">
          {/* Bar chart keseluruhan */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3">Frekuensi Digit 0–9 (Semua Posisi)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={digitFreq.overall.map((cnt, d) => ({ d: String(d), cnt }))}>
                <XAxis dataKey="d" tick={{ fill: isDark ? "#aaa" : "#555", fontSize: 11 }}/>
                <YAxis tick={{ fill: isDark ? "#aaa" : "#555", fontSize: 10 }}/>
                <Tooltip
                  contentStyle={{
                    background: isDark ? "#1e293b" : "#fff",
                    border: "none", borderRadius: 12, fontSize: 12
                  }}
                />
                <Bar dataKey="cnt" radius={[4, 4, 0, 0]}>
                  {digitFreq.overall.map((cnt, i) => (
                    <Cell
                      key={i}
                      fill={cnt === Math.max(...digitFreq.overall) ? "#ef4444" :
                            cnt === Math.min(...digitFreq.overall) ? "#3b82f6" : "#14b8a6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 text-[10px] mt-1 justify-center opacity-60">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block"/>Tertinggi</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block"/>Terendah</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-teal-500 inline-block"/>Normal</span>
            </div>
          </div>

          {/* Per-position bar */}
          {digitFreq.byPos.map((posArr, pi) => {
            const maxCnt = Math.max(...posArr, 1);
            return (
              <div key={pi} className={`${card} p-4`}>
                <h3 className="font-black text-sm mb-3">{POS_NAMES[pi]}</h3>
                <div className="flex items-end gap-1.5 h-20">
                  {posArr.map((cnt, d) => {
                    const h = Math.max(4, Math.round((cnt / maxCnt) * 72));
                    const isMax = cnt === maxCnt;
                    const isMin = cnt === Math.min(...posArr);
                    return (
                      <div key={d} className="flex flex-col items-center gap-0.5 flex-1">
                        <span className="text-[9px] font-bold opacity-60">{cnt}</span>
                        <div
                          className={`w-full rounded-t-md ${isMax ? "bg-red-500" : isMin ? "bg-blue-500" : isDark ? "bg-white/20" : "bg-slate-300"}`}
                          style={{ height: h }}
                        />
                        <span className={`text-[10px] font-bold ${isMax ? "text-red-400" : isMin ? "text-blue-400" : "opacity-40"}`}>{d}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2 text-[10px] opacity-50">
                  <span>Terbanyak: <b className="text-red-400">{posArr.indexOf(maxCnt)}</b> ({maxCnt}×)</span>
                  <span>·</span>
                  <span>Paling jarang: <b className="text-blue-400">{posArr.indexOf(Math.min(...posArr))}</b> ({Math.min(...posArr)}×)</span>
                </div>
              </div>
            );
          })}

          {/* Digit sum distribution */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-1">Distribusi Penjumlahan Digit (Sum 0–36)</h3>
            <p className="text-xs opacity-40 mb-3">Rata-rata: {sumStats.avg.toFixed(2)} · Mode sum terakhir tren</p>
            <div className="flex items-end gap-px h-20 overflow-x-auto scrollbar-none">
              {Array.from({ length: 37 }, (_, s) => {
                const cnt = sumStats.dist[s] || 0;
                const maxS = Math.max(...Object.values(sumStats.dist), 1);
                const h   = Math.max(2, Math.round((cnt / maxS) * 72));
                return (
                  <div key={s} className="flex flex-col items-center flex-shrink-0" style={{ width: 11 }}>
                    <div
                      className={`w-full rounded-sm ${cnt > 0 ? "bg-teal-500" : isDark ? "bg-white/8" : "bg-slate-200"}`}
                      style={{ height: h }}
                      title={`Sum ${s}: ${cnt}×`}
                    />
                    {s % 6 === 0 && <span className="text-[7px] opacity-30 mt-0.5">{s}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ POLA ══ */}
      {tab === "pola" && (
        <div className="space-y-3">
          {/* Big/Small */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-400"/>Pola Besar (5–9) vs Kecil (0–4) per Posisi
            </h3>
            <div className="space-y-2.5">
              {bigSmall.counts.map(({ big, small }, pi) => {
                const tot    = big + small || 1;
                const bigPct = Math.round(big / tot * 100);
                const smPct  = 100 - bigPct;
                return (
                  <div key={pi}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold opacity-60">{POS_NAMES[pi]}</span>
                      <span className="opacity-40">B:{big} K:{small}</span>
                    </div>
                    <div className="h-6 rounded-full overflow-hidden flex text-[10px] font-bold">
                      <div className="bg-red-500 flex items-center justify-center text-white" style={{ width: `${bigPct}%` }}>
                        {bigPct >= 18 && `${bigPct}%`}
                      </div>
                      <div className="bg-blue-500 flex items-center justify-center text-white" style={{ width: `${smPct}%` }}>
                        {smPct >= 18 && `${smPct}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2 text-[10px] opacity-40">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block"/>Besar (5–9)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block"/>Kecil (0–4)</span>
            </div>
            <div className="mt-3">
              <div className="text-[10px] font-bold opacity-40 mb-2">Top Pola Dominan (BBKK = Besar-Besar-Kecil-Kecil, dll)</div>
              <div className="flex flex-wrap gap-2">
                {bigSmall.topPat.map(([pat, cnt]) => (
                  <div key={pat} className={`px-2.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                    {pat}
                    <span className="opacity-50 text-[10px]">{cnt}×  {N ? (cnt/N*100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Odd/Even */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4 text-purple-400"/>Pola Ganjil (J) vs Genap (G) per Posisi
            </h3>
            <div className="space-y-2.5">
              {oddEven.counts.map(({ odd, even }, pi) => {
                const tot    = odd + even || 1;
                const oddPct = Math.round(odd / tot * 100);
                const evPct  = 100 - oddPct;
                return (
                  <div key={pi}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold opacity-60">{POS_NAMES[pi]}</span>
                      <span className="opacity-40">J:{odd} G:{even}</span>
                    </div>
                    <div className="h-6 rounded-full overflow-hidden flex text-[10px] font-bold">
                      <div className="bg-purple-500 flex items-center justify-center text-white" style={{ width: `${oddPct}%` }}>
                        {oddPct >= 18 && `${oddPct}%`}
                      </div>
                      <div className="bg-emerald-500 flex items-center justify-center text-white" style={{ width: `${evPct}%` }}>
                        {evPct >= 18 && `${evPct}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3">
              <div className="text-[10px] font-bold opacity-40 mb-2">Top Pola (JGJG = Ganjil-Genap-Ganjil-Genap, dll)</div>
              <div className="flex flex-wrap gap-2">
                {oddEven.topPat.map(([pat, cnt]) => (
                  <div key={pat} className={`px-2.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                    {pat}
                    <span className="opacity-50 text-[10px]">{cnt}× {N ? (cnt/N*100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Special numbers */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400"/>Angka Kembar & Mirror
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Kembar Digit",    val: special.twins,     desc: "Ada digit berulang bersebelahan (misal: 1124, 3312)",   color: "text-purple-400" },
                { label: "Angka Mirror",    val: special.mirrors,   desc: "Pola ABBA (misal: 1221, 5665)",                        color: "text-cyan-400" },
                { label: "Full Kembar",     val: special.straights, desc: "Semua digit sama (1111, 2222, 3333)",                   color: "text-pink-400" },
              ].map(s => (
                <div key={s.label} className={`p-3 rounded-xl text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                  <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                  <div className="text-[10px] opacity-50 mt-0.5">{N ? (s.val/N*100).toFixed(1) : 0}%</div>
                  <div className="text-[10px] font-bold opacity-60 mt-1">{s.label}</div>
                  <div className="text-[9px] opacity-30 mt-0.5 leading-tight">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Transition top 5 */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-400"/>Pola Transisi 2D Depan (Result → Result Berikutnya)
            </h3>
            <p className="text-xs opacity-40 mb-3">Top transisi yang paling sering terjadi secara berturut-turut</p>
            <div className="space-y-1.5">
              {Object.entries(transitions)
                .flatMap(([from, targets]) =>
                  Object.entries(targets).map(([to, cnt]) => ({ from, to, cnt }))
                )
                .sort((a, b) => b.cnt - a.cnt)
                .slice(0, 10)
                .map((tr, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <span className="text-[10px] opacity-40 w-4">{i+1}</span>
                    <span className="font-mono font-black">{tr.from}</span>
                    <ArrowRight className="w-3 h-3 opacity-40"/>
                    <span className="font-mono font-black">{tr.to}</span>
                    <span className="ml-auto text-xs font-bold text-teal-400">{tr.cnt}×</span>
                    <span className="text-[10px] opacity-40">{N > 0 ? (tr.cnt/(N-1)*100).toFixed(1) : 0}%</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ══ KANDIDAT ══ */}
      {tab === "kandidat" && (
        <div className="space-y-3">
          {/* Top 10 digit */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-2 flex items-center gap-2">
              <Target className="w-4 h-4 text-teal-400"/>10 Digit Kandidat Terkuat (0–9)
            </h3>
            <p className="text-xs opacity-40 mb-3">
              Skor: frekuensi keseluruhan (35%) + kemunculan 10 draw terakhir (40%) +
              gap/overdue (15%) + dominansi posisi (10%)
            </p>
            <div className="space-y-2">
              {topDigits.map((d, idx) => {
                const max = topDigits[0].total || 1;
                const bw  = Math.round((d.total / max) * 100);
                const cf  = confLabel(d.total, max);
                return (
                  <div key={d.digit} className={`flex items-center gap-3 p-2.5 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${
                      idx === 0 ? "bg-yellow-500 text-black" :
                      idx  < 3  ? "bg-teal-600 text-white" :
                      isDark    ? "bg-white/15 text-white" : "bg-slate-200 text-slate-600"
                    }`}>{d.digit}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${confCls(cf, isDark)}`}>{cf}</span>
                        <span className="text-[10px] opacity-40">total {d.ov}× · 10 terakhir {d.rec}×</span>
                        {d.lastIdx > 4 && (
                          <span className="text-[10px] text-amber-400 font-bold">{d.lastIdx} draw overdue</span>
                        )}
                      </div>
                      <div className={`h-2 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                        <div className={`h-full rounded-full ${idx < 3 ? "bg-teal-500" : "bg-blue-400"}`} style={{ width: `${bw}%` }}/>
                      </div>
                    </div>
                    <span className="text-xs font-black opacity-30">#{idx+1}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 20 BBFS */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-2 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400"/>20 Kombinasi BBFS Terbaik (2D Depan)
            </h3>
            <p className="text-xs opacity-40 mb-3">
              Ranking dari: frekuensi historis (60%) + kemunculan 10 draw terakhir (30%) + overdue bonus (10%)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {top20_2D.map((item, idx) => {
                const cf = confLabel(item.score, maxBBFS);
                return (
                  <div key={item.num} className={`p-2.5 rounded-xl border ${
                    cf === "tinggi" ? isDark ? "border-green-500/40 bg-green-500/10" : "border-green-200 bg-green-50" :
                    cf === "sedang" ? isDark ? "border-amber-500/30 bg-amber-500/8" : "border-amber-200 bg-amber-50" :
                    isDark ? "border-white/8 bg-white/4" : "border-slate-100"
                  }`}>
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-mono font-black text-xl">{item.num}</span>
                      <span className="text-[9px] opacity-30 font-bold">#{idx+1}</span>
                    </div>
                    <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-block mb-1 ${confCls(cf, isDark)}`}>{cf}</div>
                    <div className="text-[10px] opacity-40">
                      {item.cnt}× total · {item.rec}× baru
                      {item.lastIdx > 15 && <span className="text-amber-400 ml-1">overdue</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 10 4D */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-400"/>10 Kombinasi 4D dengan Probabilitas Tertinggi
            </h3>
            <p className="text-xs opacity-40 mb-3">
              Berdasarkan kemunculan historis + skor gabungan digit kandidat terkuat.
              Tingkat keyakinan berdasarkan dukungan data — bukan prediksi pasti.
            </p>
            <div className="space-y-2">
              {top10_4D.map((item, idx) => {
                const cf = idx < 3 ? "tinggi" : idx < 6 ? "sedang" : "rendah";
                return (
                  <div key={idx} className={`flex items-center gap-3 p-3 rounded-2xl border ${
                    idx < 3
                      ? isDark ? "border-purple-500/40 bg-purple-500/10" : "border-purple-200 bg-purple-50"
                      : isDark ? "border-white/8 bg-white/4" : "border-slate-100"
                  }`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      idx === 0 ? "bg-yellow-500 text-black" :
                      idx === 1 ? "bg-slate-400 text-black" :
                      idx === 2 ? "bg-amber-700 text-white" :
                      isDark    ? "bg-white/15 text-white/60" : "bg-slate-200 text-slate-500"
                    }`}>{idx+1}</div>

                    <span className="font-mono font-black text-2xl flex-1 tracking-widest">{item.num}</span>

                    <div className="text-right">
                      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-block mb-0.5 ${confCls(cf as "tinggi"|"sedang"|"rendah", isDark)}`}>{cf}</div>
                      {item.cnt > 0 && <div className="text-xs font-bold text-green-400">Historis: {item.cnt}×</div>}
                      <div className="text-[10px] opacity-30">skor {item.score.toFixed(1)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`mt-4 p-3 rounded-xl text-xs ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
              <p className="opacity-50 leading-relaxed">
                ⚠️ <strong>Penting:</strong> Analisis ini murni statistik historis. Tidak ada sistem yang dapat memprediksi
                hasil lotere secara pasti. Gunakan hanya sebagai referensi dan bukan acuan taruhan mutlak.
                Tingkat keyakinan menunjukkan kekuatan dukungan data historis, bukan jaminan hasil.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══ ANOMALI ══ */}
      {tab === "anomali" && (
        <div className="space-y-3">
          {/* Anomaly list */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400"/>Pola Anomali & Insight Statistik
            </h3>
            {anomalies.length === 0 ? (
              <div className="text-center py-6 opacity-40">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400"/>
                <p className="text-sm">Tidak ada anomali signifikan dalam {N} draw terakhir.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {anomalies.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 p-3 rounded-xl ${
                    a.type === "warn"
                      ? isDark ? "bg-amber-500/10 border border-amber-500/25" : "bg-amber-50 border border-amber-200"
                      : isDark ? "bg-blue-500/10 border border-blue-500/25" : "bg-blue-50 border border-blue-200"
                  }`}>
                    {a.type === "warn"
                      ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"/>
                      : <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5"/>}
                    <p className={`text-xs ${a.type === "warn" ? "text-amber-300" : "text-blue-300"}`}>{a.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4 insight cards */}
          <div className={`${card} p-4`}>
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400"/>4 Insight Utama dari {N} Draw Terakhir
            </h3>
            <div className="space-y-3">
              {/* 1. Dominant digit */}
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold opacity-50 mb-1">① Digit Paling Dominan</div>
                <p className="text-xs">
                  Digit <strong className="text-red-400">{topDigits[0]?.digit}</strong> muncul{" "}
                  <strong>{topDigits[0]?.ov}×</strong> dari {N * 4} posisi total{" "}
                  ({N > 0 ? ((topDigits[0]?.ov ?? 0) / (N * 4) * 100).toFixed(1) : 0}%).
                  Digit <strong className="text-blue-400">{topDigits[9]?.digit}</strong> paling jarang{" "}
                  ({topDigits[9]?.ov}×).
                </p>
              </div>
              {/* 2. Big/small */}
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold opacity-50 mb-1">② Pola Besar/Kecil Dominan</div>
                <p className="text-xs">
                  Pola dominan: <strong className="font-mono">{bigSmall.topPat[0]?.[0] ?? "–"}</strong>{" "}
                  muncul {bigSmall.topPat[0]?.[1] ?? 0}× ({N > 0 ? ((bigSmall.topPat[0]?.[1] ?? 0)/N*100).toFixed(0) : 0}%).{" "}
                  Posisi AS: {bigSmall.counts[0].big > bigSmall.counts[0].small ? "BESAR" : "KECIL"} lebih sering{" "}
                  ({Math.round(Math.max(bigSmall.counts[0].big, bigSmall.counts[0].small) / (bigSmall.counts[0].big + bigSmall.counts[0].small || 1) * 100)}%).
                </p>
              </div>
              {/* 3. Odd/even */}
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold opacity-50 mb-1">③ Pola Ganjil/Genap Dominan</div>
                <p className="text-xs">
                  Pola dominan: <strong className="font-mono">{oddEven.topPat[0]?.[0] ?? "–"}</strong>{" "}
                  muncul {oddEven.topPat[0]?.[1] ?? 0}× ({N > 0 ? ((oddEven.topPat[0]?.[1] ?? 0)/N*100).toFixed(0) : 0}%).{" "}
                  Posisi EKOR: {oddEven.counts[3].odd > oddEven.counts[3].even ? "GANJIL" : "GENAP"} lebih sering{" "}
                  ({Math.round(Math.max(oddEven.counts[3].odd, oddEven.counts[3].even) / (oddEven.counts[3].odd + oddEven.counts[3].even || 1) * 100)}%).
                </p>
              </div>
              {/* 4. Hot 2D vs overdue */}
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold opacity-50 mb-1">④ 2D Depan Terpanas vs Overdue</div>
                <p className="text-xs">
                  Paling sering: <strong className="text-red-400 font-mono">{d2Freq.sorted[0]?.[0]}</strong>{" "}
                  ({d2Freq.sorted[0]?.[1]}×). Paling jarang:{" "}
                  <strong className="text-blue-400 font-mono">{d2Freq.sorted[d2Freq.sorted.length-1]?.[0]}</strong>{" "}
                  ({d2Freq.sorted[d2Freq.sorted.length-1]?.[1]}×).{" "}
                  Avg sum digit: {sumStats.avg.toFixed(1)} (range optimal 13–23 secara statistik).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
