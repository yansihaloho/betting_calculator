import { useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, BarChart2, RefreshCw, ChevronDown, ChevronUp, Flame, Snowflake,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

// Toto Macau Shio — (n===0?100:n)%12
// 0=Kuda 1=Ular 2=Naga 3=Kelinci 4=Harimau 5=Kerbau 6=Tikus 7=Babi 8=Anjing 9=Ayam 10=Monyet 11=Kambing
const SHIO_LIST = [
  { name: "Kuda",     emoji: "🐴", idx: 0, color: "#f97316" },
  { name: "Ular",     emoji: "🐍", idx: 1, color: "#84cc16" },
  { name: "Naga",     emoji: "🐉", idx: 2, color: "#ef4444" },
  { name: "Kelinci",  emoji: "🐰", idx: 3, color: "#ec4899" },
  { name: "Harimau",  emoji: "🐯", idx: 4, color: "#f59e0b" },
  { name: "Kerbau",   emoji: "🐂", idx: 5, color: "#6366f1" },
  { name: "Tikus",    emoji: "🐭", idx: 6, color: "#06b6d4" },
  { name: "Babi",     emoji: "🐷", idx: 7, color: "#d946ef" },
  { name: "Anjing",   emoji: "🐶", idx: 8, color: "#8b5cf6" },
  { name: "Ayam",     emoji: "🐔", idx: 9, color: "#10b981" },
  { name: "Monyet",   emoji: "🐒", idx: 10, color: "#3b82f6" },
  { name: "Kambing",  emoji: "🐐", idx: 11, color: "#64748b" },
];

// Shio numbers: which 2D ekor values belong to each shio
function getShioForNum(n: number): number {
  return (n === 0 ? 100 : n) % 12;
}

function getShioNumbers(): Record<number, string[]> {
  const result: Record<number, string[]> = {};
  SHIO_LIST.forEach(s => (result[s.idx] = []));
  for (let i = 0; i <= 99; i++) {
    const shio = getShioForNum(i);
    result[shio].push(String(i).padStart(2, "0"));
  }
  return result;
}

interface DrawEntry { full: string; ekor: string; shioIdx: number; tanggal: string; slot: string; }

function extractDraws(resultData: ResultRow[]): DrawEntry[] {
  const out: DrawEntry[] = [];
  for (const row of resultData) {
    for (const slot of [...TIME_SLOTS].reverse()) {
      const v = String(row[slot] || "");
      if (/^\d{4}$/.test(v)) {
        const ekor = v.slice(2);
        const ekorNum = parseInt(ekor, 10);
        out.push({ full: v, ekor, shioIdx: getShioForNum(ekorNum), tanggal: row.tanggal, slot });
      }
    }
  }
  return out;
}

interface Props { resultData: ResultRow[]; isDark: boolean }

export default function ShioPage({ resultData, isDark }: Props) {
  const [n, setN] = useState(60);
  const [activeShio, setActiveShio] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState("chart");
  const shioNumbers = useMemo(() => getShioNumbers(), []);

  const card = isDark ? "bg-slate-800/70 border border-white/8 rounded-2xl" : "bg-white border border-slate-200 rounded-2xl shadow-sm";
  const muted = isDark ? "text-white/50" : "text-slate-400";
  const sub = isDark ? "bg-white/5" : "bg-slate-50";

  const allDraws = useMemo(() => extractDraws(resultData), [resultData]);
  const draws = useMemo(() => allDraws.slice(0, n), [allDraws, n]);

  // Frequency per shio
  const shioStats = useMemo(() => {
    const freq = Array(12).fill(0);
    const lastPos = Array(12).fill(9999);
    draws.forEach((d, pos) => {
      freq[d.shioIdx]++;
      if (pos < lastPos[d.shioIdx]) lastPos[d.shioIdx] = pos;
    });
    const avgFreq = draws.length / 12;
    return SHIO_LIST.map(s => ({
      ...s,
      freq: freq[s.idx],
      lastPos: lastPos[s.idx],
      expected: Math.round(avgFreq),
      diff: freq[s.idx] - avgFreq,
      status: freq[s.idx] > avgFreq * 1.2 ? "hot" : freq[s.idx] < avgFreq * 0.8 ? "cold" : "normal",
    })).sort((a, b) => b.freq - a.freq);
  }, [draws]);

  // Per-slot shio frequency
  const slotShioStats = useMemo(() => {
    return TIME_SLOTS.map(slot => {
      const slotDraws = draws.filter(d => d.slot === slot);
      const freq = Array(12).fill(0);
      slotDraws.forEach(d => freq[d.shioIdx]++);
      const topShio = freq.reduce((best, v, i) => v > (freq[best] || 0) ? i : best, 0);
      return { slot, total: slotDraws.length, freq, topShio };
    });
  }, [draws]);

  // Recent 20 draws
  const recentDraws = draws.slice(0, 20);

  // Streak: current consecutive shio from most recent
  const currentStreak = useMemo(() => {
    if (!draws.length) return null;
    const first = draws[0].shioIdx;
    let count = 0;
    for (const d of draws) {
      if (d.shioIdx === first) count++;
      else break;
    }
    return { shioIdx: first, count };
  }, [draws]);

  const toggleSection = (id: string) => setOpenSection(s => s === id ? "" : id);

  const SectionHeader = ({ id, title, subtitle }: { id: string; title: string; subtitle: string }) => (
    <button onClick={() => toggleSection(id)}
      className={`w-full flex items-center justify-between px-5 py-4 transition-all rounded-2xl ${openSection === id ? isDark ? "bg-white/5 rounded-b-none" : "bg-slate-50 rounded-b-none" : ""}`}>
      <div className="text-left">
        <div className="font-black text-sm">{title}</div>
        <div className={`text-[11px] ${muted}`}>{subtitle}</div>
      </div>
      {openSection === id ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
    </button>
  );

  return (
    <div className="animate-slide-up space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-[22px] bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black">Analisis Shio</h1>
            <p className="opacity-70 text-xs mt-0.5">Frekuensi & pola 12 shio dari ekor 2D (00–99)</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Basis:</span>
            {[30, 60, 90, 120].map(v => (
              <button key={v} onClick={() => setN(v)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${n === v ? "bg-white text-orange-700" : "bg-white/20 hover:bg-white/30"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">📊 {draws.length} draw dianalisis</span>
          {currentStreak && currentStreak.count >= 2 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
              🔥 Streak {SHIO_LIST.find(s => s.idx === currentStreak.shioIdx)?.emoji} {SHIO_LIST.find(s => s.idx === currentStreak.shioIdx)?.name} — {currentStreak.count} draw berturut
            </span>
          )}
        </div>
      </div>

      {/* Shio Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {shioStats.map((s, rank) => (
          <button key={s.idx} onClick={() => setActiveShio(activeShio === s.idx ? null : s.idx)}
            className={`${card} p-4 text-left transition-all hover:scale-[1.02] ${activeShio === s.idx ? "ring-2 ring-amber-400" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{s.emoji}</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                s.status === "hot" ? "bg-red-500/20 text-red-400" :
                s.status === "cold" ? "bg-blue-500/20 text-blue-400" :
                isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"
              }`}>
                {s.status === "hot" ? "🔥 HOT" : s.status === "cold" ? "❄ COLD" : "NORMAL"}
              </span>
            </div>
            <div className="font-black text-sm">{s.name}</div>
            <div className={`text-2xl font-black ${s.status === "hot" ? "text-red-400" : s.status === "cold" ? "text-blue-400" : isDark ? "text-white" : "text-slate-800"}`}>
              {s.freq}×
            </div>
            <div className={`text-[10px] ${muted} mt-1`}>
              {s.diff > 0 ? "+" : ""}{s.diff.toFixed(1)} vs rata-rata
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((s.freq / (draws.length / 8)) * 100, 100)}%`, backgroundColor: s.color }} />
            </div>
            <div className={`text-[10px] ${muted} mt-1`}>Rank #{rank + 1}</div>
          </button>
        ))}
      </div>

      {/* Detail shio terpilih */}
      {activeShio !== null && (() => {
        const s = SHIO_LIST.find(sh => sh.idx === activeShio)!;
        const nums = shioNumbers[activeShio];
        const recentHits = recentDraws.filter(d => d.shioIdx === activeShio);
        return (
          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{s.emoji}</span>
              <div>
                <div className="font-black text-lg">Shio {s.name}</div>
                <div className={`text-sm ${muted}`}>{nums.length} angka ekor 2D — {shioStats.find(x => x.idx === activeShio)?.freq || 0}× dalam {draws.length} draw</div>
              </div>
            </div>
            <div>
              <div className={`text-xs font-black mb-2 ${muted}`}>ANGKA EKOR 2D ({nums.length})</div>
              <div className="flex flex-wrap gap-2">
                {nums.map(num => (
                  <span key={num} className={`px-2.5 py-1.5 rounded-xl text-sm font-black font-mono ${isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800"}`}>{num}</span>
                ))}
              </div>
            </div>
            {recentHits.length > 0 && (
              <div>
                <div className={`text-xs font-black mb-2 text-amber-400`}>KEMUNCULAN TERBARU</div>
                <div className="flex flex-wrap gap-2">
                  {recentHits.map((d, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span className={`px-2.5 py-1.5 rounded-xl text-sm font-black font-mono bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30`}>{d.full}</span>
                      <span className={`text-[9px] ${muted}`}>{d.tanggal.split(" ")[0]} {d.slot}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Chart */}
      <div className={card}>
        <SectionHeader id="chart" title="Grafik Frekuensi Shio" subtitle={`Distribusi ${draws.length} draw terakhir`} />
        {openSection === "chart" && (
          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={shioStats.map(s => ({ name: s.emoji, freq: s.freq, color: s.color }))}>
                <XAxis dataKey="name" tick={{ fontSize: 16 }} />
                <YAxis tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#94a3b8" }} />
                <Tooltip
                  contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid #334155", borderRadius: 12, fontSize: 12 }}
                  formatter={(val, _, props) => [`${val}×`, SHIO_LIST.find(s => s.emoji === props.payload.name)?.name || ""]}
                />
                <Bar dataKey="freq" radius={[6, 6, 0, 0]}>
                  {shioStats.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per slot */}
      <div className={card}>
        <SectionHeader id="slot" title="Shio Terkuat Per Slot" subtitle="Shio yang paling sering muncul di tiap slot waktu" />
        {openSection === "slot" && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slotShioStats.map(ss => {
                const topShio = SHIO_LIST.find(s => s.idx === ss.topShio)!;
                const topFreq = ss.freq[ss.topShio];
                return (
                  <div key={ss.slot} className={`${sub} rounded-xl p-4`}>
                    <div className={`text-xs font-black ${muted} mb-2`}>{ss.slot} WIB</div>
                    <div className="text-2xl mb-1">{topShio.emoji}</div>
                    <div className="font-black text-sm">{topShio.name}</div>
                    <div className={`text-xs ${muted}`}>{topFreq}× dari {ss.total} draw</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ss.freq.map((v, i) => v > 0 && (
                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded-lg font-bold ${i === ss.topShio ? "bg-amber-500/20 text-amber-400" : isDark ? "bg-white/8" : "bg-slate-100"}`}>
                          {SHIO_LIST.find(s => s.idx === i)?.emoji}{v}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent draws */}
      <div className={card}>
        <SectionHeader id="recent" title="20 Draw Terakhir" subtitle="Shio dari setiap draw" />
        {openSection === "recent" && (
          <div className="px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              {recentDraws.map((d, i) => {
                const s = SHIO_LIST.find(sh => sh.idx === d.shioIdx)!;
                return (
                  <div key={i} className={`flex flex-col items-center gap-0.5 ${sub} rounded-xl px-3 py-2 min-w-[52px]`}>
                    <span className="font-black text-sm font-mono">{d.full}</span>
                    <span className="text-base">{s.emoji}</span>
                    <span className={`text-[9px] ${muted}`}>{s.name}</span>
                    <span className={`text-[9px] ${muted}`}>{d.slot}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Prediksi shio */}
      <div className={card}>
        <SectionHeader id="prediksi" title="Rekomendasi Shio" subtitle="Berdasarkan frekuensi & pola overdue" />
        {openSection === "prediksi" && (
          <div className="px-5 pb-5 space-y-3">
            <div className={`text-xs ${muted} mb-3`}>Shio yang underperform (jarang keluar) memiliki probabilitas lebih tinggi untuk segera keluar.</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className={`text-xs font-black mb-2 text-red-400 flex items-center gap-1`}><Flame className="w-3 h-3" />OVERDUE — Potensi Segera Keluar</div>
                {[...shioStats].sort((a, b) => b.lastPos - a.lastPos).slice(0, 3).map(s => (
                  <div key={s.idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 ${isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"}`}>
                    <span className="text-xl">{s.emoji}</span>
                    <div>
                      <div className="font-black text-sm">{s.name}</div>
                      <div className={`text-xs ${muted}`}>Terakhir: draw #{s.lastPos === 9999 ? "belum" : s.lastPos + 1} — {s.freq}× total</div>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className={`text-xs font-black mb-2 text-blue-400 flex items-center gap-1`}><Snowflake className="w-3 h-3" />PANAS — Frekuensi Tertinggi</div>
                {shioStats.slice(0, 3).map(s => (
                  <div key={s.idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                    <span className="text-xl">{s.emoji}</span>
                    <div>
                      <div className="font-black text-sm">{s.name}</div>
                      <div className={`text-xs ${muted}`}>{s.freq}× dalam {draws.length} draw (+{s.diff.toFixed(1)} vs rata-rata)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
