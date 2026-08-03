import { useMemo, useState } from "react";
import {
  Flame, Snowflake, Copy, CheckCircle2, ChevronDown, ChevronUp, Hash, BarChart2,
} from "lucide-react";
import { toast } from "sonner";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

function copyText(t: string) {
  try { navigator.clipboard.writeText(t); return true; } catch { return false; }
}

// Extract 3D Belakang (KOP+KEPALA+EKOR = positions 1,2,3 = last 3 digits)
function extract3D(resultData: ResultRow[]): { num: string; tanggal: string; slot: string }[] {
  const out: { num: string; tanggal: string; slot: string }[] = [];
  for (const row of resultData) {
    for (const slot of [...TIME_SLOTS].reverse()) {
      const v = String(row[slot] || "");
      if (/^\d{4}$/.test(v)) {
        out.push({ num: v.slice(1), tanggal: row.tanggal, slot });
      }
    }
  }
  return out;
}

interface Props { resultData: ResultRow[]; isDark: boolean }

export default function ThreeDPage({ resultData, isDark }: Props) {
  const [n, setN] = useState(60);
  const [activePos, setActivePos] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState("posisi");
  const [copied, setCopied] = useState<string | null>(null);

  const card = isDark ? "bg-slate-800/70 border border-white/8 rounded-2xl" : "bg-white border border-slate-200 rounded-2xl shadow-sm";
  const muted = isDark ? "text-white/50" : "text-slate-400";
  const sub = isDark ? "bg-white/5" : "bg-slate-50";

  const all3D = useMemo(() => extract3D(resultData), [resultData]);
  const draws = useMemo(() => all3D.slice(0, n), [all3D, n]);

  // Per-position digit analysis (3 positions: KOP, KEPALA, EKOR)
  const posLabels = ["KOP", "KEPALA", "EKOR"];
  const posAnalysis = useMemo(() => {
    return [0, 1, 2].map(pos => {
      const freq = Array(10).fill(0).map((_, d) => ({ digit: d, freq: 0, lastPos: 9999 }));
      draws.forEach((d, i) => {
        const digit = parseInt(d.num[pos]);
        if (!isNaN(digit)) {
          freq[digit].freq++;
          if (i < freq[digit].lastPos) freq[digit].lastPos = i;
        }
      });
      const sorted = [...freq].sort((a, b) => b.freq - a.freq);
      const hot = sorted.slice(0, 3).map(x => x.digit);
      const cold = sorted.slice(7).map(x => x.digit);
      return { pos, label: posLabels[pos], freq, sorted, hot, cold };
    });
  }, [draws]);

  // Top 3D combinations (most frequent from draws)
  const top3D = useMemo(() => {
    const freq: Record<string, number> = {};
    draws.forEach(d => { freq[d.num] = (freq[d.num] || 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([num, count]) => ({ num, count }));
  }, [draws]);

  // Build BBFS 3D from hot digits per position
  const bbfs3D = useMemo(() => {
    const hotPerPos = posAnalysis.map(p => p.hot.slice(0, 3));
    const combos: string[] = [];
    for (const a of hotPerPos[0]) {
      for (const b of hotPerPos[1]) {
        for (const c of hotPerPos[2]) {
          combos.push(`${a}${b}${c}`);
        }
      }
    }
    return combos.slice(0, 27); // 3^3 = 27 max
  }, [posAnalysis]);

  // Overdue 3D (not appeared recently)
  const overdue3D = useMemo(() => {
    const posIdx: Record<string, number> = {};
    draws.forEach((d, i) => { if (!(d.num in posIdx)) posIdx[d.num] = i; });
    return Object.entries(posIdx)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([num, lastIdx]) => ({ num, lastIdx }));
  }, [draws]);

  function doCopy(text: string, key: string) {
    if (copyText(text)) { setCopied(key); toast.success("Dicopy!"); setTimeout(() => setCopied(null), 2000); }
  }

  const toggleSection = (id: string) => setOpenSection(s => s === id ? "" : id);

  const SectionHeader = ({ id, title, subtitle, badge }: { id: string; title: string; subtitle: string; badge?: string }) => (
    <button onClick={() => toggleSection(id)}
      className={`w-full flex items-center justify-between px-5 py-4 transition-all rounded-2xl ${openSection === id ? isDark ? "bg-white/5 rounded-b-none" : "bg-slate-50 rounded-b-none" : ""}`}>
      <div className="text-left">
        <div className="flex items-center gap-2">
          <span className="font-black text-sm">{title}</span>
          {badge && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-teal-500/25 text-teal-300" : "bg-teal-100 text-teal-600"}`}>{badge}</span>}
        </div>
        <div className={`text-[11px] ${muted}`}>{subtitle}</div>
      </div>
      {openSection === id ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
    </button>
  );

  const DigitBadge = ({ d, type }: { d: number; type: "hot" | "warm" | "cold" | "neutral" }) => {
    const cls = type === "hot" ? "bg-red-500/25 text-red-400 ring-1 ring-red-500/30"
      : type === "warm" ? "bg-orange-500/25 text-orange-400 ring-1 ring-orange-500/30"
      : type === "cold" ? "bg-blue-500/25 text-blue-400 ring-1 ring-blue-500/30"
      : isDark ? "bg-white/10 text-white/60" : "bg-slate-100 text-slate-600";
    return <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-black ${cls}`}>{d}</span>;
  };

  return (
    <div className="animate-slide-up space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-[22px] bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-700 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black">3D Belakang</h1>
            <p className="opacity-70 text-xs mt-0.5">Analisis digit KOP+KEPALA+EKOR (3 digit terakhir dari 4D)</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Basis:</span>
            {[30, 60, 90, 120].map(v => (
              <button key={v} onClick={() => setN(v)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${n === v ? "bg-white text-teal-700" : "bg-white/20 hover:bg-white/30"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">📊 {draws.length} draw dianalisis</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">🎯 BBFS-27: {bbfs3D.length} kombinasi</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">🏆 Top 3D: {top3D[0]?.num || "–"} ({top3D[0]?.count || 0}×)</span>
        </div>
      </div>

      {/* Posisi analysis */}
      <div className={card}>
        <SectionHeader id="posisi" title="Analisis Per Posisi" subtitle="Digit hot/cold untuk KOP, KEPALA, EKOR" />
        {openSection === "posisi" && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {posAnalysis.map(p => (
                <button key={p.pos} onClick={() => setActivePos(activePos === p.pos ? null : p.pos)}
                  className={`${sub} rounded-2xl p-4 text-left transition-all hover:scale-[1.01] ${activePos === p.pos ? "ring-2 ring-teal-400" : ""}`}>
                  <div className={`text-xs font-black mb-3 ${isDark ? "text-teal-400" : "text-teal-600"}`}>POSISI {p.pos + 1} — {p.label}</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {p.sorted.map((item, rank) => (
                      <DigitBadge key={item.digit} d={item.digit}
                        type={rank < 3 ? "hot" : rank < 5 ? "warm" : rank >= 7 ? "cold" : "neutral"} />
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Flame className="w-3 h-3 text-red-400" />
                      <span className={`text-xs ${muted}`}>HOT:</span>
                      <span className="text-xs font-black text-red-400">{p.hot.join(", ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Snowflake className="w-3 h-3 text-blue-400" />
                      <span className={`text-xs ${muted}`}>COLD:</span>
                      <span className="text-xs font-black text-blue-400">{p.cold.join(", ")}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail posisi terpilih */}
            {activePos !== null && (() => {
              const p = posAnalysis[activePos];
              return (
                <div className={`mt-4 ${isDark ? "bg-teal-500/10 border border-teal-500/20" : "bg-teal-50 border border-teal-200"} rounded-2xl p-4`}>
                  <div className={`font-black text-sm mb-3 ${isDark ? "text-teal-300" : "text-teal-700"}`}>Detail Posisi {activePos + 1} — {p.label}</div>
                  <div className="space-y-2">
                    {p.sorted.map((item, rank) => (
                      <div key={item.digit} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-white"}`}>
                        <span className={`text-xs font-black w-5 text-center ${muted}`}>#{rank + 1}</span>
                        <span className="font-black text-lg w-8">{item.digit}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${(item.freq / (draws.length || 1)) * 100 * (10 / 3)}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${muted}`}>{item.freq}×</span>
                        <span className={`text-xs ${item.lastPos === 9999 ? muted : "text-teal-400"}`}>{item.lastPos === 9999 ? "belum" : `#${item.lastPos + 1}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* BBFS-27 */}
      <div className={card}>
        <SectionHeader id="bbfs" title="BBFS-27 (Hot per Posisi)" subtitle="27 kombinasi dari 3 digit terkuat tiap posisi" badge={`${bbfs3D.length} angka`} />
        {openSection === "bbfs" && (
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`text-xs ${muted}`}>
                KOP: [{posAnalysis[0]?.hot.join(",")}] × KEPALA: [{posAnalysis[1]?.hot.join(",")}] × EKOR: [{posAnalysis[2]?.hot.join(",")}]
              </div>
              <button onClick={() => doCopy(bbfs3D.join(" "), "bbfs")} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
                {copied === "bbfs" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
              {bbfs3D.map(num => (
                <div key={num} className={`flex items-center justify-center py-2.5 rounded-xl text-sm font-black font-mono ${
                  top3D.some(t => t.num === num)
                    ? isDark ? "bg-gradient-to-br from-teal-500/30 to-cyan-600/30 text-teal-400 ring-1 ring-teal-500/40" : "bg-teal-100 text-teal-700 ring-1 ring-teal-300"
                    : isDark ? "bg-white/8 text-white/80 ring-1 ring-white/5" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                }`}>
                  {num}
                </div>
              ))}
            </div>
            <div className={`text-[11px] ${muted} mt-3`}>🟢 = termasuk top frekuensi</div>
          </div>
        )}
      </div>

      {/* Top 3D frequencies */}
      <div className={card}>
        <SectionHeader id="top" title="Top 20 Frekuensi 3D" subtitle="Kombinasi 3D yang paling sering muncul" />
        {openSection === "top" && (
          <div className="px-5 pb-5">
            <div className="space-y-2">
              {top3D.map((item, idx) => (
                <div key={item.num} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${sub}`}>
                  <span className={`text-xs font-black w-5 text-center ${muted}`}>#{idx + 1}</span>
                  <span className="font-black text-xl font-mono w-14">{item.num}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${(item.count / (top3D[0]?.count || 1)) * 100}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${muted}`}>{item.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Overdue */}
      <div className={card}>
        <SectionHeader id="overdue" title="Overdue — Lama Tidak Keluar" subtitle="3D yang sudah lama tidak muncul" />
        {openSection === "overdue" && (
          <div className="px-5 pb-5">
            <div className={`text-xs ${muted} mb-3`}>Angka-angka di bawah sudah lama tidak keluar — berpotensi segera muncul.</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {overdue3D.map((item, i) => (
                <div key={item.num} className={`${sub} rounded-xl p-3 text-center`}>
                  <div className="font-black text-2xl font-mono mb-1">{item.num}</div>
                  <div className={`text-[11px] ${muted}`}>#{i + 1} overdue</div>
                  <div className={`text-[10px] text-red-400 font-bold`}>draw #{item.lastIdx + 1} lalu</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent 3D draws */}
      <div className={card}>
        <SectionHeader id="recent" title="20 Draw Terakhir (3D)" subtitle="KOP+KEPALA+EKOR" />
        {openSection === "recent" && (
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {draws.slice(0, 20).map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`px-2.5 py-2 rounded-xl text-base font-black font-mono ${isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800"}`}>{d.num}</span>
                <span className={`text-[9px] ${muted}`}>{d.slot}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
