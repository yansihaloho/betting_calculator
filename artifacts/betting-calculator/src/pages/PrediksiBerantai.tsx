/**
 * PrediksiBerantai — Prediksi berantai antar-slot
 * Gunakan hasil slot sebelumnya untuk memprediksi slot berikutnya.
 * Setiap prediksi disertai penjelasan detail dan tracking akurasi otomatis.
 */
import React, { useState, useMemo, useEffect } from "react";
import {
  Brain, ArrowRight, CheckCircle, XCircle, Clock,
  AlertCircle, Info, Star, BarChart2, Award, Zap
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_LABELS: Record<string, string> = {
  "00:01": "Tengah Malam", "13:00": "Siang",
  "16:00": "Sore",        "19:00": "Malam",
  "22:00": "Larut Malam", "23:00": "Dini Hari",
};

function ls<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
}
function lsSet(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

// ─── Chain Database ──────────────────────────────────────────────────────────
// Stores slot-to-slot transition frequencies for both 2D depan and per-digit
interface ChainDB {
  // depan[prevSlot][prev2DDepan][nextSlot][next2DDepan] = count
  depan: Record<string, Record<string, Record<string, Record<string, number>>>>;
  // digit[prevSlot][pos][prevDigit][nextSlot][pos][nextDigit] = count
  digit: Record<string, Record<number, Record<string, Record<string, Record<number, Record<string, number>>>>>>;
  // slotFreqDepan[slot][2DDepan] = count
  slotFreqDepan: Record<string, Record<string, number>>;
  // recencyDepan[slot][2DDepan] = rowIndex of most recent appearance (0 = newest)
  recencyDepan: Record<string, Record<string, number>>;
  totalRows: number;
  totalBySlot: Record<string, number>;
}

function buildChainDB(rows: ResultRow[]): ChainDB {
  const db: ChainDB = {
    depan: {}, digit: {}, slotFreqDepan: {},
    recencyDepan: {}, totalRows: rows.length, totalBySlot: {}
  };

  rows.forEach((row, rowIdx) => {
    TIME_SLOTS.forEach((slot, si) => {
      const v = String(row[slot] || "");
      if (!/^\d{4}$/.test(v)) return;

      const dep = v.slice(0, 2); // 2D DEPAN = AS + KOP (yang dipakai untuk taruhan)

      // Slot frequency
      if (!db.slotFreqDepan[slot]) db.slotFreqDepan[slot] = {};
      db.slotFreqDepan[slot][dep] = (db.slotFreqDepan[slot][dep] || 0) + 1;
      db.totalBySlot[slot] = (db.totalBySlot[slot] || 0) + 1;

      // Recency tracking (rowIdx 0 = most recent draw)
      if (!db.recencyDepan[slot]) db.recencyDepan[slot] = {};
      if (db.recencyDepan[slot][dep] === undefined) db.recencyDepan[slot][dep] = rowIdx;

      // Forward chain to next slot
      const nextSlot = TIME_SLOTS[si + 1];
      if (!nextSlot) return;
      const nv = String(row[nextSlot] || "");
      if (!/^\d{4}$/.test(nv)) return;

      const ndep = nv.slice(0, 2);

      // 2D depan chain
      if (!db.depan[slot]) db.depan[slot] = {};
      if (!db.depan[slot][dep]) db.depan[slot][dep] = {};
      if (!db.depan[slot][dep][nextSlot]) db.depan[slot][dep][nextSlot] = {};
      db.depan[slot][dep][nextSlot][ndep] = (db.depan[slot][dep][nextSlot][ndep] || 0) + 1;

      // Per-digit chain for positions 0 (AS) and 1 (KOP) only — 2D depan positions
      for (let pos = 0; pos <= 1; pos++) {
        const pd = v[pos];
        const nd2 = nv[pos];
        if (!db.digit[slot]) db.digit[slot] = {};
        if (!db.digit[slot][pos]) db.digit[slot][pos] = {};
        if (!db.digit[slot][pos][pd]) db.digit[slot][pos][pd] = {};
        if (!db.digit[slot][pos][pd][nextSlot]) db.digit[slot][pos][pd][nextSlot] = {};
        if (!db.digit[slot][pos][pd][nextSlot][pos]) db.digit[slot][pos][pd][nextSlot][pos] = {};
        const rec = db.digit[slot][pos][pd][nextSlot][pos];
        rec[nd2] = (rec[nd2] || 0) + 1;
      }
    });
  });

  return db;
}

// ─── Score a single 2D-depan candidate ──────────────────────────────────────
export interface CandidateScore {
  num: string;
  score: number;
  chainCount: number;
  chainTotal: number;
  digitScore: number;
  freqScore: number;
  gapScore: number;
  reasons: string[];
}

function scoreCandidate(
  num: string,
  prevSlot: string,
  prevResult: string,
  nextSlot: string,
  db: ChainDB,
): CandidateScore {
  const reasons: string[] = [];
  const prevDep = prevResult.slice(0, 2);

  // 1. 2D-depan chain transition (weight 45%)
  const chainData  = db.depan[prevSlot]?.[prevDep]?.[nextSlot] || {};
  const chainTotal = Object.values(chainData).reduce((a, b) => a + b, 0);
  const chainCount = chainData[num] || 0;
  let chainScore = 0;
  if (chainTotal >= 3) {
    chainScore = (chainCount / chainTotal) * 100;
    if (chainCount > 0) {
      const pct = ((chainCount / chainTotal) * 100).toFixed(0);
      reasons.push(
        `Setelah ${prevSlot} depan ${prevDep} → ${nextSlot} depan ${num} muncul ${chainCount}×/${chainTotal} kali (${pct}%)`
      );
    }
  } else if (chainTotal > 0 && chainCount > 0) {
    chainScore = (chainCount / chainTotal) * 55;
    reasons.push(`Data transisi terbatas (${chainTotal} sampel) — ${num} pernah muncul ${chainCount}×`);
  }

  // 2. Per-digit transition for AS (pos 0) and KOP (pos 1) (weight 25%)
  let digitScore = 0;
  const posNames = ["AS", "KOP"];
  for (const pos of [0, 1]) {
    const pd = prevResult[pos];
    const transData  = db.digit[prevSlot]?.[pos]?.[pd]?.[nextSlot]?.[pos] || {};
    const transTotal = Object.values(transData).reduce((a, b) => a + b, 0);
    const nd         = num[pos];
    if (transTotal >= 3) {
      const cnt = transData[nd] || 0;
      const pct = cnt / transTotal;
      digitScore += pct * 50;
      if (pct >= 0.20) {
        reasons.push(
          `Digit ${posNames[pos]} (${pd}→${nd}): muncul ${cnt}×/${transTotal} (${(pct*100).toFixed(0)}%)`
        );
      }
    }
  }

  // 3. Slot-level overall frequency (weight 15%)
  const freqData  = db.slotFreqDepan[nextSlot] || {};
  const freqTotal = db.totalBySlot[nextSlot] || 1;
  const freqCount = freqData[num] || 0;
  const freqScore = (freqCount / freqTotal) * 100;
  if (freqCount > 0) {
    const pct = ((freqCount / freqTotal) * 100).toFixed(1);
    if (Number(pct) >= 3.0) {
      reasons.push(`Frekuensi umum di slot ${nextSlot}: ${num} muncul ${freqCount}× total (${pct}%)`);
    }
  }

  // 4. Gap / overdue analysis (weight 15%)
  const lastSeen = db.recencyDepan[nextSlot]?.[num];
  let gapScore = 0;
  if (lastSeen === undefined) {
    gapScore = 28;
    reasons.push(`${num} belum pernah muncul di slot ${nextSlot} — sangat overdue`);
  } else if (lastSeen > 0) {
    const expectedGap = freqTotal / Math.max(freqCount, 1);
    if (lastSeen > expectedGap * 1.4) {
      gapScore = Math.min(28, (lastSeen / expectedGap) * 7);
      reasons.push(
        `${num} terakhir muncul ${lastSeen} hari lalu (rata-rata tiap ${expectedGap.toFixed(0)} hari — overdue)`
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Pola frekuensi umum — belum ada transisi spesifik yang kuat`);
  }

  // Weighted total
  const total =
    chainScore  * 0.45 +
    digitScore  * 0.25 +
    freqScore   * 0.15 +
    gapScore    * 0.15;

  return {
    num, score: Math.min(100, total),
    chainCount, chainTotal,
    digitScore, freqScore, gapScore,
    reasons,
  };
}

function predictNextSlot(
  prevSlot: string,
  prevResult: string,
  nextSlot: string,
  db: ChainDB,
  topN = 10
): CandidateScore[] {
  const ALL = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  return ALL
    .map(num => scoreCandidate(num, prevSlot, prevResult, nextSlot, db))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── Accuracy tracking ───────────────────────────────────────────────────────
interface PredictionRecord {
  tanggal: string;
  slot: string;
  fromSlot: string;
  fromResult: string;
  predicted2D: string[];   // top-8 predicted 2D depan
  actual?: string;         // actual 4D result when available
  hitTop5?: boolean;       // did actual 2D depan appear in top-5 predictions?
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface Props {
  resultData: ResultRow[];
  isDark: boolean;
}

export default function PrediksiBerantai({ resultData, isDark }: Props) {
  const card = isDark
    ? "bg-white/6 border border-white/10 rounded-[20px]"
    : "bg-white border border-slate-200 rounded-[20px] shadow-sm";

  const [manualSeed, setManualSeed] = useState<Partial<Record<string, string>>>({});
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [accuracyRecords, setAccuracyRecords] = useState<PredictionRecord[]>(
    () => ls("prediksiBerantai_records", [])
  );

  // Build chain DB from historical data (all rows; today is row 0 — may be partial)
  const db = useMemo(() => buildChainDB(resultData.slice(1)), [resultData]);

  const today = resultData[0] ?? null;
  const todayTanggal = today?.tanggal ?? "";

  // ── Slot info: actual or predicted for each slot today ─────────────────────
  interface SlotInfo {
    slot: string;
    actual: string | null;
    predicted: CandidateScore[];
    fromSlot: string | null;
    fromResult: string | null;
    chainSampleCount: number;
  }

  const slotInfos = useMemo((): SlotInfo[] => {
    const infos: SlotInfo[] = [];
    let lastKnownSlot: string | null = null;
    let lastKnownResult: string | null = null;

    for (const slot of TIME_SLOTS) {
      const raw = today ? String(today[slot] || "") : "";
      const seed = manualSeed[slot] || "";
      const actual = /^\d{4}$/.test(raw) ? raw : /^\d{4}$/.test(seed) ? seed : null;

      let predicted: CandidateScore[] = [];
      let chainSampleCount = 0;

      if (!actual && lastKnownSlot && lastKnownResult) {
        predicted = predictNextSlot(lastKnownSlot, lastKnownResult, slot, db, 10);
        const cd = db.depan[lastKnownSlot]?.[lastKnownResult.slice(0, 2)]?.[slot] || {};
        chainSampleCount = Object.values(cd).reduce((a, b) => a + b, 0);
      }

      infos.push({ slot, actual, predicted, fromSlot: lastKnownSlot, fromResult: lastKnownResult, chainSampleCount });
      if (actual) { lastKnownSlot = slot; lastKnownResult = actual; }
    }
    return infos;
  }, [today, db, manualSeed]);

  // ── Auto-update accuracy records when actuals arrive ───────────────────────
  useEffect(() => {
    if (!todayTanggal) return;
    setAccuracyRecords(prev => {
      let updated = [...prev];
      let changed = false;

      slotInfos.forEach(info => {
        if (!info.actual || !info.fromSlot || !info.fromResult) return;
        const existing = updated.find(r => r.tanggal === todayTanggal && r.slot === info.slot);
        if (existing && existing.actual === undefined) {
          existing.actual = info.actual;
          existing.hitTop5 = existing.predicted2D.includes(info.actual.slice(0, 2));
          changed = true;
        } else if (!existing) {
          const preds = predictNextSlot(info.fromSlot, info.fromResult, info.slot, db, 8);
          updated.push({
            tanggal: todayTanggal, slot: info.slot,
            fromSlot: info.fromSlot, fromResult: info.fromResult,
            predicted2D: preds.map(p => p.num),
            actual: info.actual,
            hitTop5: preds.slice(0, 5).some(p => p.num === info.actual!.slice(0, 2)),
          });
          changed = true;
        }
      });

      if (!changed) return prev;
      const trimmed = updated.slice(-180);
      lsSet("prediksiBerantai_records", trimmed);
      return trimmed;
    });
  }, [slotInfos, todayTanggal, db]);

  // ── Accuracy stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const done = accuracyRecords.filter(r => r.actual !== undefined);
    const hits = done.filter(r => r.hitTop5).length;
    const byTrans: Record<string, { total: number; hit: number }> = {};
    done.forEach(r => {
      const k = `${r.fromSlot}→${r.slot}`;
      if (!byTrans[k]) byTrans[k] = { total: 0, hit: 0 };
      byTrans[k].total++;
      if (r.hitTop5) byTrans[k].hit++;
    });
    return { total: done.length, hits, pct: done.length ? (hits / done.length * 100).toFixed(1) : "0.0", byTrans };
  }, [accuracyRecords]);

  const selected = slotInfos.find(s => s.slot === selectedSlot) ?? slotInfos.find(s => !s.actual && s.fromResult) ?? null;

  return (
    <div className="space-y-4 animate-slide-up">

      {/* ══ Header ══ */}
      <div className="rounded-[22px] bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
              <Brain className="w-6 h-6"/>Prediksi Berantai
            </h1>
            <p className="text-white/70 text-xs mt-1">
              Setiap slot diprediksi dari hasil slot sebelumnya · {db.totalRows} hari data historis
            </p>
          </div>
          <button
            onClick={() => setShowAccuracy(v => !v)}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Award className="w-3.5 h-3.5"/>Akurasi {stats.pct}%
          </button>
        </div>

        {/* Sample quality pills */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          {TIME_SLOTS.slice(0, -1).map((slot, i) => {
            const next = TIME_SLOTS[i + 1];
            const allCounts = Object.values(db.depan[slot] || {}).flatMap(ns =>
              Object.values(ns[next] || {})
            );
            const total = allCounts.reduce((a, b) => a + b, 0);
            return (
              <span key={slot} className={`px-2 py-0.5 rounded-full border ${
                total >= 20 ? "bg-green-500/30 border-green-400/50 text-green-100" :
                total >= 8  ? "bg-yellow-500/30 border-yellow-400/50 text-yellow-100" :
                              "bg-red-500/30 border-red-400/50 text-red-100"
              }`}>
                {slot}→{next} · {total} sampel
              </span>
            );
          })}
        </div>
      </div>

      {/* ══ Accuracy Panel ══ */}
      {showAccuracy && (
        <div className={`${card} p-4`}>
          <h3 className="font-black text-sm mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400"/>Riwayat Akurasi Prediksi
          </h3>
          {stats.total === 0 ? (
            <p className="text-xs opacity-50 text-center py-4">
              Belum ada riwayat. Data akurasi terakumulasi otomatis seiring waktu.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Prediksi", val: stats.total, color: "text-blue-400" },
                  { label: "Tepat (Top-5)", val: stats.hits, color: "text-green-400" },
                  { label: "Akurasi", val: `${stats.pct}%`, color: "text-purple-400" },
                ].map(s => (
                  <div key={s.label} className={`p-3 rounded-xl text-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                    <div className="text-[10px] opacity-50">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-transition accuracy */}
              <div className="space-y-1.5">
                {Object.entries(stats.byTrans).map(([trans, st]) => (
                  <div key={trans} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <span className="text-xs font-bold font-mono">{trans}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-green-400 font-bold">{st.hit}/{st.total}</span>
                      <span className="opacity-40">{st.total ? (st.hit/st.total*100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent records */}
              <div className="space-y-1">
                {[...accuracyRecords].reverse().slice(0, 15).map((r, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-[11px] ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <span className="opacity-50">{r.tanggal} · {r.slot}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono opacity-70">{r.fromResult}→</span>
                      <span className="font-mono font-bold">{r.actual ?? "?"}</span>
                      {r.actual !== undefined
                        ? r.hitTop5
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-400"/>
                          : <XCircle className="w-3.5 h-3.5 text-red-400"/>
                        : <Clock className="w-3.5 h-3.5 opacity-30"/>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ Today's chain ══ */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-sm">Rantai Hari Ini</h3>
          <span className="text-xs opacity-50">{today?.hari} {todayTanggal}</span>
        </div>

        {/* Seed input if 00:01 not yet available */}
        {!slotInfos[0]?.actual && (
          <div className={`mb-3 p-3 rounded-xl border ${isDark ? "bg-amber-500/10 border-amber-500/30" : "bg-amber-50 border-amber-200"}`}>
            <p className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5"/>
              Masukkan hasil slot 00:01 untuk memulai prediksi berantai hari ini
            </p>
            <div className="flex gap-2">
              <input
                type="text" maxLength={4} placeholder="Contoh: 4192"
                value={manualSeed["00:01"] || ""}
                onChange={e => setManualSeed(p => ({ ...p, "00:01": e.target.value.replace(/\D/g, "") }))}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-mono font-black border outline-none focus:ring-2 focus:ring-amber-400/50 ${
                  isDark ? "bg-white/10 border-white/20 text-white" : "bg-white border-slate-300"
                }`}
              />
              {Object.values(manualSeed).some(Boolean) && (
                <button onClick={() => setManualSeed({})} className="px-3 py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold">
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* Horizontal slot chain */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {slotInfos.map((info, idx) => {
            const isSelected = selected?.slot === info.slot;
            const hasResult  = !!info.actual;
            const isNext     = !hasResult && !!info.fromResult;
            return (
              <React.Fragment key={info.slot}>
                {idx > 0 && (
                  <ArrowRight className={`w-3 h-3 flex-shrink-0 ${hasResult ? "text-green-500/50" : "opacity-20"}`}/>
                )}
                <button
                  onClick={() => setSelectedSlot(info.slot)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-2.5 rounded-2xl border transition-all min-w-[68px] ${
                    isSelected
                      ? "border-purple-500 bg-purple-500/20 ring-1 ring-purple-500/40 scale-105"
                      : hasResult
                        ? isDark ? "border-green-500/50 bg-green-500/10" : "border-green-300 bg-green-50"
                        : isNext
                          ? isDark ? "border-amber-500/50 bg-amber-500/10" : "border-amber-200 bg-amber-50"
                          : isDark ? "border-white/10 bg-white/3" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <span className={`text-[9px] font-bold mb-1 ${
                    hasResult ? "text-green-400" : isNext ? "text-amber-400" : "opacity-30"
                  }`}>{info.slot}</span>

                  {hasResult ? (
                    <>
                      <span className="font-mono font-black text-sm text-green-400">{info.actual}</span>
                      <CheckCircle className="w-2.5 h-2.5 text-green-400 mt-0.5"/>
                    </>
                  ) : info.fromResult ? (
                    <>
                      <span className="text-[9px] opacity-40">prediksi</span>
                      <span className={`font-mono font-black text-sm ${isNext ? "text-amber-400" : "opacity-20"}`}>
                        {info.predicted[0]?.num ?? "??"}
                      </span>
                      <Zap className="w-2.5 h-2.5 text-amber-400 mt-0.5"/>
                    </>
                  ) : (
                    <span className="text-[9px] opacity-20 mt-1">–</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ══ Selected slot detail ══ */}
      {selected && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-black text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400"/>
                Slot {selected.slot} — {SLOT_LABELS[selected.slot]}
              </h3>
              {selected.fromSlot && selected.fromResult && (
                <p className="text-xs opacity-60 mt-0.5">
                  Berdasarkan hasil <b>{selected.fromSlot}</b> ={" "}
                  <span className="font-mono font-bold text-amber-400">{selected.fromResult}</span>
                  {" "}· Depan: <span className="font-mono font-bold">{selected.fromResult.slice(0, 2)}</span>
                  {" "}· Belakang: <span className="font-mono font-bold">{selected.fromResult.slice(2)}</span>
                </p>
              )}
            </div>
            {selected.actual && (
              <div className="text-right">
                <div className="text-[10px] opacity-40">Hasil Aktual</div>
                <div className="font-mono font-black text-2xl text-green-400">{selected.actual}</div>
              </div>
            )}
          </div>

          {selected.actual ? (
            /* ── Hasil sudah keluar ── */
            <div className={`p-3 rounded-xl ${isDark ? "bg-green-500/10 border border-green-500/20" : "bg-green-50 border border-green-200"}`}>
              <p className="text-xs font-bold text-green-400 mb-3 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5"/>
                Hasil sudah keluar: <span className="font-mono text-lg ml-1">{selected.actual}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div className={`p-2.5 rounded-xl ${isDark ? "bg-white/5" : "bg-white border border-slate-100"}`}>
                  <div className="opacity-40 mb-1">2D Depan (AS+KOP)</div>
                  <div className="font-mono font-black text-2xl">{selected.actual.slice(0, 2)}</div>
                  <div className="opacity-40 text-[10px]">Digit taruhan</div>
                </div>
                <div className={`p-2.5 rounded-xl ${isDark ? "bg-white/5" : "bg-white border border-slate-100"}`}>
                  <div className="opacity-40 mb-1">2D Belakang (Kepala+Ekor)</div>
                  <div className="font-mono font-black text-2xl">{selected.actual.slice(2)}</div>
                  <div className="opacity-40 text-[10px]">Info tambahan</div>
                </div>
              </div>
              {selected.fromSlot && (
                <p className="text-[11px] opacity-50">
                  Transisi: {selected.fromSlot} ({selected.fromResult?.slice(0,2)})
                  {" "}→ {selected.slot} ({selected.actual.slice(0,2)}) —{" "}
                  model belajar dari transisi ini untuk prediksi berikutnya.
                </p>
              )}
            </div>

          ) : selected.fromResult ? (
            /* ── Prediksi detail ── */
            <div className="space-y-3">
              {/* Warning if low sample */}
              {selected.chainSampleCount < 5 && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${
                  isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"
                }`}>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"/>
                  <span className="text-amber-400">
                    Data transisi spesifik untuk depan <b>{selected.fromResult.slice(0,2)}</b> pada{" "}
                    {selected.fromSlot}→{selected.slot} masih{" "}
                    <b>{selected.chainSampleCount} sampel</b>. Prediksi lebih mengandalkan
                    pola frekuensi umum. Akurasi meningkat seiring bertambahnya data historis.
                  </span>
                </div>
              )}

              <div className="text-[10px] font-bold opacity-50 uppercase tracking-wider">
                Top {selected.predicted.length} Kandidat 2D Depan (AS+KOP)
              </div>

              <div className="space-y-2">
                {selected.predicted.map((c, idx) => {
                  const maxScore  = selected.predicted[0]?.score || 1;
                  const barWidth  = Math.round((c.score / maxScore) * 100);
                  const isTop     = idx < 3;
                  const confColor = c.chainCount >= 3 ? "text-green-400" : c.chainCount >= 1 ? "text-amber-400" : "text-slate-400";
                  return (
                    <div key={c.num} className={`p-3 rounded-2xl border transition-all ${
                      isTop
                        ? isDark ? "border-purple-500/40 bg-purple-500/10" : "border-purple-200 bg-purple-50"
                        : isDark ? "border-white/8 bg-white/4" : "border-slate-100 bg-slate-50/50"
                    }`}>
                      <div className="flex items-start gap-3">
                        {/* Rank badge */}
                        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center font-black text-sm ${
                          idx === 0 ? "bg-yellow-500 text-black" :
                          idx === 1 ? "bg-slate-400 text-black" :
                          idx === 2 ? "bg-amber-700 text-white" :
                          isDark ? "bg-white/10 text-white/40" : "bg-slate-200 text-slate-400"
                        }`}>
                          #{idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-mono font-black text-xl">{c.num}</span>
                            <span className={`text-xs font-bold ${confColor}`}>
                              {c.chainCount > 0 ? `${c.chainCount}/${c.chainTotal} sampel` : "pola umum"}
                            </span>
                            {isTop && <Star className="w-3 h-3 text-yellow-400"/>}
                          </div>

                          {/* Progress bar */}
                          <div className={`h-1.5 rounded-full mb-2 ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                            <div
                              className={`h-full rounded-full ${
                                c.chainCount >= 3 ? "bg-gradient-to-r from-green-500 to-emerald-400" :
                                c.chainCount >= 1 ? "bg-gradient-to-r from-amber-500 to-yellow-400" :
                                "bg-gradient-to-r from-slate-500 to-slate-400"
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>

                          {/* Score breakdown pills */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {c.chainCount > 0 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                                Chain {c.chainTotal > 0 ? ((c.chainCount / Math.max(c.chainTotal, 1)) * 100).toFixed(0) : 0}%
                              </span>
                            )}
                            {c.digitScore > 2 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"}`}>
                                Digit {c.digitScore.toFixed(0)}%
                              </span>
                            )}
                            {c.freqScore > 2 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"}`}>
                                Frek {c.freqScore.toFixed(0)}%
                              </span>
                            )}
                            {c.gapScore > 5 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isDark ? "bg-orange-500/20 text-orange-300" : "bg-orange-100 text-orange-700"}`}>
                                Gap {c.gapScore.toFixed(0)}%
                              </span>
                            )}
                          </div>

                          {/* Detailed reasoning */}
                          <ul className="space-y-0.5">
                            {c.reasons.map((r, ri) => (
                              <li key={ri} className="text-[11px] opacity-65 flex items-start gap-1">
                                <span className="text-purple-400 flex-shrink-0 mt-px">▸</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Manual actual input for chaining */}
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
                <p className="text-[11px] font-bold opacity-60 mb-2 flex items-center gap-1.5">
                  <Info className="w-3 h-3"/>
                  Masukkan hasil aktual {selected.slot} (jika sudah keluar) untuk lanjutkan rantai:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text" maxLength={4} placeholder="4 digit angka..."
                    value={manualSeed[selected.slot] || ""}
                    onChange={e => setManualSeed(p => ({ ...p, [selected.slot]: e.target.value.replace(/\D/g, "") }))}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-mono font-bold border outline-none focus:ring-2 focus:ring-purple-400/40 ${
                      isDark ? "bg-white/10 border-white/20 text-white" : "bg-white border-slate-300"
                    }`}
                  />
                  {(manualSeed[selected.slot] || "").length === 4 && (
                    <span className="text-xs text-green-400 self-center font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5"/>Siap
                    </span>
                  )}
                </div>
                <p className="text-[10px] opacity-30 mt-1">
                  Hasil ini akan dipakai sebagai seed prediksi slot berikutnya
                </p>
              </div>
            </div>

          ) : (
            <div className="text-center py-8 opacity-30">
              <Clock className="w-8 h-8 mx-auto mb-2"/>
              <p className="text-sm">Menunggu hasil slot sebelumnya untuk memulai prediksi</p>
            </div>
          )}
        </div>
      )}

      {/* ══ Historical transition breakdown ══ */}
      <div className={`${card} p-4`}>
        <h3 className="font-black text-sm mb-1 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400"/>Pola Transisi Historis
        </h3>
        <p className="text-xs opacity-40 mb-3">
          2D Depan yang paling sering muncul di tiap slot, berdasarkan {db.totalRows} hari data.
          Dipakai sebagai baseline frekuensi pada prediksi.
        </p>
        <div className="space-y-2.5">
          {TIME_SLOTS.slice(0, -1).map((slot, i) => {
            const next     = TIME_SLOTS[i + 1];
            const freqData = db.slotFreqDepan[next] || {};
            const total    = db.totalBySlot[next] || 1;
            const top5     = Object.entries(freqData).sort((a, b) => b[1] - a[1]).slice(0, 5);
            return (
              <div key={slot} className={`p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="font-bold text-blue-400">{slot}</span>
                  <ArrowRight className="w-3 h-3 opacity-30"/>
                  <span className="font-bold text-purple-400">{next}</span>
                  <span className="opacity-30 text-[10px]">({total} draw)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {top5.map(([num, cnt]) => (
                    <div key={num} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold ${isDark ? "bg-white/10 border border-white/10" : "bg-white border border-slate-200"}`}>
                      <span className="font-mono">{num}</span>
                      <span className="opacity-40 text-[9px]">{((cnt/total)*100).toFixed(0)}%</span>
                    </div>
                  ))}
                  {top5.length === 0 && <span className="text-xs opacity-30">Belum ada data</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
