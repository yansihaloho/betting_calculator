import { useMemo, useState } from "react";
import {
  Flame, Snowflake, BarChart2, Hash, TrendingUp, RefreshCw,
  Copy, CheckCircle2, ChevronDown, ChevronUp, Zap, Star, BookOpen,
} from "lucide-react";
import { toast } from "sonner";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const TIME_SLOTS_DESC = [...TIME_SLOTS].reverse();
const SLOT_NAMES: Record<string, string> = {
  "semua":  "Semua Slot",
  "00:01":  "Dini Hari",
  "13:00":  "Siang",
  "16:00":  "Sore",
  "19:00":  "Malam",
  "22:00":  "Larut",
  "23:00":  "Tengah Malam",
};

function extractAllDraws(resultData: ResultRow[]): string[] {
  const draws: string[] = [];
  for (const row of [...resultData].reverse()) {
    for (const slot of TIME_SLOTS_DESC) {
      const v = String(row[slot] || "");
      if (/^\d{4}$/.test(v)) draws.unshift(v);
    }
  }
  return draws;
}

function extractSlotDraws(resultData: ResultRow[], slot: string): string[] {
  const draws: string[] = [];
  for (const row of resultData) {
    const v = String(row[slot] || "");
    if (/^\d{4}$/.test(v)) draws.push(v);
  }
  return draws;
}

function copyText(t: string) {
  try { navigator.clipboard.writeText(t); return true; } catch { return false; }
}

interface Props { resultData: ResultRow[]; isDark: boolean }

export default function AnalisaProPage({ resultData, isDark }: Props) {
  const [n, setN] = useState(30);
  const [activeSlot, setActiveSlot] = useState("semua");
  const [view, setView] = useState<"analisa" | "bandingkan">("analisa");
  const [openSection, setOpenSection] = useState<string>("freq");
  const [copied, setCopied] = useState<string | null>(null);

  const card = isDark
    ? "bg-slate-800/70 border border-white/8 rounded-2xl"
    : "bg-white border border-slate-200 rounded-2xl shadow-sm";
  const muted = isDark ? "text-white/50" : "text-slate-400";
  const sub = isDark ? "bg-white/5" : "bg-slate-50";

  const allDraws = useMemo(() => extractAllDraws(resultData), [resultData]);
  const slotDraws = useMemo(
    () => activeSlot === "semua" ? allDraws : extractSlotDraws(resultData, activeSlot),
    [allDraws, resultData, activeSlot]
  );
  const draws = useMemo(() => slotDraws.slice(0, n), [slotDraws, n]);

  // ── Per-slot comparison data ──────────────────────────────────────────────
  const slotStats = useMemo(() => {
    return TIME_SLOTS.map(slot => {
      const sd = extractSlotDraws(resultData, slot).slice(0, n);
      if (!sd.length) return { slot, count: 0, hot: [], warm: [], cold: [], xCold: [], posTop: ["–","–","–","–"], bbfs6: [] };

      // Global digit frequency
      const gFreq = Array(10).fill(0);
      sd.forEach(d => d.split("").forEach(c => { gFreq[parseInt(c)]++; }));
      const ranked = gFreq.map((v, i) => ({ digit: i, count: v })).sort((a, b) => b.count - a.count);

      // Per-position top digit
      const posTop = [0,1,2,3].map(pi => {
        const pf = Array(10).fill(0);
        sd.forEach(d => { pf[parseInt(d[pi])]++; });
        const topIdx = pf.indexOf(Math.max(...pf));
        return String(topIdx);
      });

      // BBFS-6: top 6 most balanced digits (appear in ≥2 positions, then by total freq)
      const posFreqs = [0,1,2,3].map(pi => {
        const pf = Array(10).fill(0);
        sd.forEach(d => { pf[parseInt(d[pi])]++; });
        return pf;
      });
      const balanced = Array(10).fill(0).map((_, d) => {
        const posCount = posFreqs.filter(pf => pf[d] > 0).length;
        return { digit: d, posCount, total: gFreq[d] };
      }).sort((a, b) => b.posCount - a.posCount || b.total - a.total);
      const bbfs6 = balanced.slice(0, 6).map(x => x.digit).sort((a,b) => a-b);

      return {
        slot,
        count: sd.length,
        hot:   ranked.slice(0, 3).map(x => x.digit),
        warm:  ranked.slice(3, 6).map(x => x.digit),
        cold:  ranked.slice(6, 8).map(x => x.digit),
        xCold: ranked.slice(8, 10).map(x => x.digit),
        posTop,
        bbfs6,
      };
    });
  }, [resultData, n]);

  function doCopy(text: string, key: string) {
    if (copyText(text)) {
      setCopied(key);
      toast.success("Dicopy!");
      setTimeout(() => setCopied(null), 2000);
    }
  }

  // ── 1. Extract posisi ────────────────────────────────────────────────────────
  const posLabels = ["As", "Kop", "Kepala", "Ekor"];
  const posByIndex = useMemo(
    () => [0, 1, 2, 3].map(i => draws.map(d => parseInt(d[i]))),
    [draws]
  );

  // ── 2. Frekuensi digit global ──────────────────────────────────────────────
  const freqData = useMemo(() => {
    const freq = Array(10).fill(0);
    draws.forEach(d => d.split("").forEach(c => { freq[parseInt(c)]++; }));
    const total = freq.reduce((s, v) => s + v, 0);
    const sorted = freq.map((v, i) => ({ digit: i, count: v, pct: total ? Math.round((v / total) * 100) : 0 }));
    const ranked = [...sorted].sort((a, b) => b.count - a.count);
    return { freq, total, sorted, ranked };
  }, [draws]);

  const hotDigits  = freqData.ranked.slice(0, 3).map(x => x.digit);
  const warmDigits = freqData.ranked.slice(3, 6).map(x => x.digit);
  const coldDigits = freqData.ranked.slice(6, 8).map(x => x.digit);
  const xColdDigits = freqData.ranked.slice(8, 10).map(x => x.digit);

  // ── 3. Per-posisi top-2 ────────────────────────────────────────────────────
  const perPosiTop2 = useMemo(
    () => posByIndex.map(pos => {
      const f = Array(10).fill(0);
      pos.forEach(d => f[d]++);
      return f.map((v, i) => ({ digit: i, count: v })).sort((a, b) => b.count - a.count).slice(0, 2);
    }),
    [posByIndex]
  );

  // ── 4. Sum control ─────────────────────────────────────────────────────────
  const sumData = useMemo(() => {
    const sums = draws.map(d => d.split("").reduce((s, c) => s + parseInt(c), 0));
    if (!sums.length) return null;
    const avg10 = sums.slice(0, 10).reduce((s, v) => s + v, 0) / Math.min(10, sums.length);
    const avg20 = sums.slice(0, 20).reduce((s, v) => s + v, 0) / Math.min(20, sums.length);
    const min = Math.min(...sums), max = Math.max(...sums);
    const safeMin = Math.max(0, Math.round(avg20) - 4);
    const safeMax = Math.min(36, Math.round(avg20) + 4);
    return { sums, avg10: Math.round(avg10 * 10) / 10, avg20: Math.round(avg20 * 10) / 10, min, max, safeMin, safeMax };
  }, [draws]);

  // ── 5. Ganjil/Genap ────────────────────────────────────────────────────────
  const ggData = useMemo(() => {
    const counts: Record<string, number> = {};
    draws.forEach(d => {
      const odd = d.split("").filter(c => parseInt(c) % 2 !== 0).length;
      const even = 4 - odd;
      const key = `${odd}G-${even}E`;
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted;
  }, [draws]);

  // ── 6. Besar/Kecil ─────────────────────────────────────────────────────────
  const bkData = useMemo(() => {
    const counts: Record<string, number> = {};
    draws.forEach(d => {
      const besar = d.split("").filter(c => parseInt(c) >= 5).length;
      const kecil = 4 - besar;
      const key = `${besar}B-${kecil}K`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [draws]);

  // ── 7. Selisih antar digit ─────────────────────────────────────────────────
  const selisihData = useMemo(() => {
    const patterns: Record<string, number> = {};
    draws.forEach(d => {
      const digits = d.split("").map(Number);
      const diffs = [
        Math.abs(digits[1] - digits[0]),
        Math.abs(digits[2] - digits[1]),
        Math.abs(digits[3] - digits[2]),
      ].join("-");
      patterns[diffs] = (patterns[diffs] || 0) + 1;
    });
    return Object.entries(patterns).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [draws]);

  // ── 8. Angka kembar ────────────────────────────────────────────────────────
  const kembarData = useMemo(() => {
    const double2 = draws.filter(d => {
      for (let i = 0; i < 3; i++) if (d[i] === d[i + 1]) return true;
      return false;
    });
    const double2Any = draws.filter(d => {
      const s = new Set(d.split(""));
      return d.split("").some(c => d.split("").filter(x => x === c).length >= 2);
    });
    const triple = draws.filter(d => {
      for (let i = 0; i < 2; i++) if (d[i] === d[i + 1] && d[i + 1] === d[i + 2]) return true;
      return false;
    });
    const kembarExamples = double2.slice(0, 5);
    return {
      doubleConsec: double2.length,
      doubleAny: double2Any.length,
      triple: triple.length,
      examples: kembarExamples,
      pctDouble: draws.length ? Math.round((double2Any.length / draws.length) * 100) : 0,
    };
  }, [draws]);

  // ── 9. Pola pembalikan / mirror ────────────────────────────────────────────
  const mirrorData = useMemo(() => {
    let mirrorCount = 0;
    const mirrorPairs: string[] = [];
    for (let i = 0; i < draws.length - 1; i++) {
      const rev = draws[i].split("").reverse().join("");
      if (draws.slice(i + 1, i + 8).includes(rev)) {
        mirrorCount++;
        mirrorPairs.push(`${draws[i]}→${rev}`);
      }
    }
    return { count: mirrorCount, pairs: mirrorPairs.slice(0, 5) };
  }, [draws]);

  // ── 10. Kombinasi 2D & 3D ──────────────────────────────────────────────────
  const combo2D = useMemo(() => {
    const freq: Record<string, number> = {};
    draws.forEach(d => {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 4; j++) {
          const k = d[i] + d[j];
          freq[k] = (freq[k] || 0) + 1;
        }
      }
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [draws]);

  const combo3D = useMemo(() => {
    const freq: Record<string, number> = {};
    draws.forEach(d => {
      for (let i = 0; i < 2; i++) {
        for (let j = i + 1; j < 3; j++) {
          for (let k = j + 1; k < 4; k++) {
            const key = d[i] + d[j] + d[k];
            freq[key] = (freq[key] || 0) + 1;
          }
        }
      }
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [draws]);

  // ── 11. BBFS 8 digit ───────────────────────────────────────────────────────
  const bbfs8 = freqData.ranked.slice(0, 8).map(x => x.digit).sort((a, b) => a - b);

  // ── 12. Prediksi kombinasi final ──────────────────────────────────────────
  const predictions = useMemo(() => {
    const pos = perPosiTop2;
    const hot = hotDigits;
    const warm = warmDigits;
    const cold = coldDigits;
    const safe = sumData;

    function checkConstraints(d: number[]): boolean {
      const sum = d.reduce((s, v) => s + v, 0);
      if (safe && (sum < safe.safeMin || sum > safe.safeMax)) return false;
      return true;
    }

    const candidates: string[] = [];
    for (let a = 0; a <= 9 && candidates.length < 30; a++) {
      for (let b = 0; b <= 9 && candidates.length < 30; b++) {
        for (let c = 0; c <= 9 && candidates.length < 30; c++) {
          for (let d = 0; d <= 9 && candidates.length < 30; d++) {
            const combo = [a, b, c, d];
            const str = combo.map(x => x.toString()).join("");
            if (checkConstraints(combo)) {
              const hasHot = combo.some(x => hot.includes(x));
              const hasWarm = combo.some(x => warm.includes(x));
              const hasPos = [0,1,2,3].every(i => {
                const top = pos[i].map(x => x.digit);
                return top.includes(combo[i]);
              });
              if (hasHot && hasWarm && hasPos) candidates.push(str);
            }
          }
        }
      }
    }

    if (candidates.length < 5) {
      for (let a = 0; a <= 9 && candidates.length < 10; a++) {
        for (let b = 0; b <= 9 && candidates.length < 10; b++) {
          for (let c = 0; c <= 9 && candidates.length < 10; c++) {
            for (let d = 0; d <= 9 && candidates.length < 10; d++) {
              const combo = [a, b, c, d];
              if (checkConstraints(combo)) {
                const hasHot = combo.some(x => hot.includes(x));
                const hasWarm = combo.some(x => warm.includes(x));
                if (hasHot && hasWarm) {
                  const str = combo.map(x => x.toString()).join("");
                  if (!candidates.includes(str)) candidates.push(str);
                }
              }
            }
          }
        }
      }
    }

    const main = candidates.slice(0, 5);
    const backup = candidates.slice(5, 10);
    return { main, backup };
  }, [perPosiTop2, hotDigits, warmDigits, coldDigits, sumData]);

  // ── Angka Mati per posisi ─────────────────────────────────────────────────
  const angkaMati = useMemo(() => {
    return [0, 1, 2, 3].map((posIdx) => {
      const f = Array(10).fill(0);
      draws.slice(0, 15).forEach(d => f[parseInt(d[posIdx])]++);
      const mati = f
        .map((v, i) => ({ digit: i, count: v }))
        .filter(x => x.count === 0 || x.count <= 1)
        .sort((a, b) => a.count - b.count)
        .slice(0, 3)
        .map(x => x.digit);
      return mati;
    });
  }, [draws]);

  const ekorMati = useMemo(() => {
    const f = Array(10).fill(0);
    draws.slice(0, 15).forEach(d => f[parseInt(d[3])]++);
    return f.map((v, i) => ({ digit: i, count: v })).sort((a, b) => a.count - b.count).slice(0, 5).map(x => x.digit);
  }, [draws]);

  function toggleSection(s: string) {
    setOpenSection(prev => prev === s ? "" : s);
  }

  function SectionHeader({ id, icon, title, sub: subtitle, badge }: {
    id: string; icon: React.ReactNode; title: string; sub: string; badge?: string;
  }) {
    const open = openSection === id;
    return (
      <button
        onClick={() => toggleSection(id)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-all rounded-2xl ${open ? (isDark ? "bg-white/5 rounded-b-none" : "bg-slate-50 rounded-b-none") : ""}`}
      >
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0">{icon}</span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-black text-sm">{title}</span>
              {badge && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-violet-500/25 text-violet-300" : "bg-violet-100 text-violet-600"}`}>{badge}</span>}
            </div>
            <div className={`text-[11px] ${muted}`}>{subtitle}</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
      </button>
    );
  }

  const DigitBadge = ({ d, type }: { d: number; type: "hot" | "warm" | "cold" | "xcold" | "neutral" }) => {
    const cls = type === "hot"   ? "bg-red-500/25 text-red-400 ring-1 ring-red-500/30" :
                type === "warm"  ? "bg-orange-500/25 text-orange-400 ring-1 ring-orange-500/30" :
                type === "cold"  ? "bg-blue-500/25 text-blue-400 ring-1 ring-blue-500/30" :
                type === "xcold" ? "bg-slate-500/40 text-slate-400 ring-1 ring-slate-500/30" :
                isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-700";
    return (
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-black ${cls}`}>{d}</span>
    );
  };

  const NumCard = ({ num }: { num: string }) => (
    <div className={`flex items-center justify-center px-3 py-2 rounded-xl font-black text-lg tracking-widest font-mono ${isDark ? "bg-gradient-to-br from-violet-600/30 to-indigo-700/30 text-white ring-1 ring-violet-500/30" : "bg-gradient-to-br from-violet-50 to-indigo-50 text-indigo-800 ring-1 ring-violet-200"}`}>
      {num}
    </div>
  );

  if (!draws.length) return (
    <div className={`${card} p-12 text-center`}>
      <RefreshCw className="w-10 h-10 mx-auto opacity-20 mb-3" />
      <p className="opacity-40">Belum ada data. Refresh hasil terlebih dahulu.</p>
    </div>
  );

  return (
    <div className="animate-slide-up space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-[22px] bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black">Analisa Pro AI</h1>
            <p className="opacity-70 text-xs mt-0.5">
              {view === "bandingkan"
                ? `Perbandingan 6 Slot — basis ${n} draw`
                : <>12-Step Analisis Statistik — {draws.length} draw{activeSlot !== "semua" && <span className="ml-1 font-black">· Slot {activeSlot}</span>}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden border border-white/20">
              <button onClick={() => setView("analisa")}
                className={`px-3 py-1.5 text-xs font-black transition-all ${view === "analisa" ? "bg-white text-purple-700" : "hover:bg-white/15"}`}>
                Analisa
              </button>
              <button onClick={() => setView("bandingkan")}
                className={`px-3 py-1.5 text-xs font-black transition-all ${view === "bandingkan" ? "bg-white text-purple-700" : "hover:bg-white/15"}`}>
                Bandingkan Slot
              </button>
            </div>
            <span className="text-xs opacity-70">|</span>
            <span className="text-xs opacity-70">Draw:</span>
            {[18, 30, 42].map(v => (
              <button key={v} onClick={() => setN(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${n === v ? "bg-white text-purple-700" : "bg-white/20 hover:bg-white/30"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {/* Slot selector — only in analisa view */}
        {view === "analisa" && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {["semua", ...TIME_SLOTS].map(slot => (
              <button
                key={slot}
                onClick={() => setActiveSlot(slot)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
                  activeSlot === slot
                    ? "bg-white text-purple-700 shadow-sm"
                    : "bg-white/15 hover:bg-white/25"
                }`}
              >
                {slot === "semua" ? "Semua" : slot}
                {slot !== "semua" && (
                  <span className="ml-1 opacity-70 font-normal">{SLOT_NAMES[slot]?.split(" ")[0]}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Quick summary pills — analisa view only */}
        {view === "analisa" && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
              🔥 HOT: {hotDigits.join(", ")}
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
              ❄️ COLD: {[...coldDigits, ...xColdDigits].join(", ")}
            </span>
            {sumData && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
                📊 Range Aman: {sumData.safeMin}–{sumData.safeMax}
              </span>
            )}
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
              🎯 BBFS-8: {bbfs8.join("")}
            </span>
          </div>
        )}
      </div>

      {/* ══ BANDINGKAN SLOT VIEW ══════════════════════════════════════════════ */}
      {view === "bandingkan" && (
        <div className="space-y-4">
          {/* Legend */}
          <div className={`${card} px-5 py-3`}>
            <div className="flex flex-wrap gap-3 text-xs items-center">
              <span className="font-black opacity-60">Legenda:</span>
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-orange-500/20 text-orange-300" : "bg-orange-100 text-orange-700"}`}>🔥 HOT — 3 terbanyak</span>
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700"}`}>🌤️ WARM — 3 berikutnya</span>
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>❄️ COLD — 4 paling jarang</span>
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-700"}`}>🎯 BBFS-6 — 6 digit paling seimbang</span>
            </div>
          </div>

          {/* Card per slot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {slotStats.map(ss => {
              const DigitBadge = ({ d, type }: { d: number; type: "hot"|"warm"|"cold"|"xcold" }) => {
                const cls = type === "hot"   ? isDark ? "bg-orange-500/25 text-orange-300 ring-1 ring-orange-500/30" : "bg-orange-100 text-orange-700 ring-1 ring-orange-300"
                          : type === "warm"  ? isDark ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30" : "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300"
                          : type === "cold"  ? isDark ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/25" : "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                          : isDark ? "bg-slate-700/60 text-white/25 ring-1 ring-white/5" : "bg-slate-100 text-slate-300 ring-1 ring-slate-200";
                return (
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-sm font-black ${cls}`}>{d}</span>
                );
              };
              return (
                <div key={ss.slot} className={`${card} p-4 space-y-3`}>
                  {/* Slot header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-black text-base">{ss.slot}</div>
                      <div className={`text-[11px] ${muted}`}>{SLOT_NAMES[ss.slot]} · {ss.count} draw</div>
                    </div>
                    {ss.count === 0 && (
                      <span className={`text-[11px] ${muted}`}>Tidak ada data</span>
                    )}
                  </div>

                  {ss.count > 0 && (
                    <>
                      {/* Digit rows */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black w-14 shrink-0 ${muted}`}>🔥 HOT</span>
                          <div className="flex gap-1.5">
                            {ss.hot.map(d => <DigitBadge key={d} d={d} type="hot" />)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black w-14 shrink-0 ${muted}`}>🌤️ WARM</span>
                          <div className="flex gap-1.5">
                            {ss.warm.map(d => <DigitBadge key={d} d={d} type="warm" />)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black w-14 shrink-0 ${muted}`}>❄️ COLD</span>
                          <div className="flex gap-1.5">
                            {ss.cold.map(d => <DigitBadge key={d} d={d} type="cold" />)}
                            {ss.xCold.map(d => <DigitBadge key={d} d={d} type="xcold" />)}
                          </div>
                        </div>
                      </div>

                      {/* Per-posisi top digit */}
                      <div className={`rounded-xl p-3 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                        <div className={`text-[10px] font-black mb-2 ${muted}`}>DIGIT TERKUAT PER POSISI</div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {["As","Kop","Kepala","Ekor"].map((lbl, i) => (
                            <div key={lbl} className="space-y-0.5">
                              <div className={`text-[9px] ${muted} font-bold`}>{lbl}</div>
                              <div className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{ss.posTop[i]}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* BBFS-6 */}
                      <div className={`rounded-xl px-3 py-2.5 flex items-center justify-between ${isDark ? "bg-violet-500/10 ring-1 ring-violet-500/20" : "bg-violet-50 ring-1 ring-violet-200"}`}>
                        <span className={`text-[10px] font-black ${isDark ? "text-violet-400" : "text-violet-600"}`}>🎯 BBFS-6</span>
                        <div className="flex gap-1">
                          {ss.bbfs6.map(d => (
                            <span key={d} className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${isDark ? "bg-violet-500/25 text-violet-300" : "bg-violet-100 text-violet-700"}`}>{d}</span>
                          ))}
                        </div>
                        <button
                          onClick={() => doCopy(ss.bbfs6.join(""), `bbfs6-${ss.slot}`)}
                          className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-violet-500/20 text-violet-400" : "hover:bg-violet-100 text-violet-500"}`}>
                          {copied === `bbfs6-${ss.slot}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cross-slot HOT digit heatmap */}
          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="font-black text-sm">Heatmap Digit HOT Lintas Slot</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={`text-left pb-2 pr-4 font-black ${muted}`}>Digit</th>
                    {TIME_SLOTS.map(sl => (
                      <th key={sl} className={`text-center pb-2 px-2 font-black ${muted}`}>{sl}</th>
                    ))}
                    <th className={`text-center pb-2 pl-2 font-black ${muted}`}>Total HOT</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }, (_, d) => {
                    const hotInSlots = slotStats.filter(ss => ss.hot.includes(d));
                    const warmInSlots = slotStats.filter(ss => ss.warm.includes(d));
                    const totalScore = hotInSlots.length * 3 + warmInSlots.length * 1;
                    return (
                      <tr key={d} className={`border-t ${isDark ? "border-white/5" : "border-slate-100"}`}>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-sm ${isDark ? "bg-white/8 text-white" : "bg-slate-100 text-slate-700"}`}>{d}</span>
                        </td>
                        {slotStats.map(ss => {
                          const isHot  = ss.hot.includes(d);
                          const isWarm = ss.warm.includes(d);
                          const isCold = ss.cold.includes(d) || ss.xCold.includes(d);
                          return (
                            <td key={ss.slot} className="text-center px-2">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black ${
                                isHot  ? isDark ? "bg-orange-500/30 text-orange-300" : "bg-orange-100 text-orange-700"
                                : isWarm ? isDark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700"
                                : isCold ? isDark ? "bg-blue-500/15 text-blue-400" : "bg-blue-50 text-blue-500"
                                : isDark ? "bg-white/5 text-white/20" : "bg-slate-50 text-slate-300"
                              }`}>
                                {isHot ? "🔥" : isWarm ? "🌤" : isCold ? "❄" : "·"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center pl-2">
                          <span className={`inline-flex items-center justify-center px-2 h-7 rounded-lg font-black text-xs ${
                            totalScore >= 9  ? isDark ? "bg-orange-500/30 text-orange-300" : "bg-orange-100 text-orange-700"
                            : totalScore >= 5 ? isDark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700"
                            : isDark ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400"
                          }`}>{totalScore}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={`text-[11px] ${muted} mt-3`}>
              Skor = 3 poin tiap slot HOT + 1 poin tiap slot WARM. Digit dengan skor tinggi konsisten muncul di banyak slot.
            </p>
          </div>
        </div>
      )}

      {/* ── Prediksi Utama — always visible ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className="font-black">5 Prediksi Utama</span>
          </div>
          <button onClick={() => doCopy(predictions.main.join(", "), "main")}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>
            {copied === "main" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </button>
        </div>
        {predictions.main.length === 0 ? (
          <p className={`text-sm ${muted} text-center py-4`}>Tidak cukup data untuk membuat prediksi. Coba naikkan jumlah draw.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {predictions.main.map((n, i) => (
              <div key={n} className="relative">
                <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? "bg-yellow-500 text-black" : isDark ? "bg-white/20 text-white/80" : "bg-slate-200 text-slate-600"}`}>{i + 1}</span>
                <NumCard num={n} />
              </div>
            ))}
          </div>
        )}
        {predictions.backup.length > 0 && (
          <>
            <div className={`flex items-center gap-2 mt-4 mb-3`}>
              <span className="font-bold text-sm">5 Prediksi Cadangan</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {predictions.backup.map((n, i) => (
                <div key={n} className="relative">
                  <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${isDark ? "bg-white/10 text-white/60" : "bg-slate-100 text-slate-500"}`}>{i + 6}</span>
                  <div className={`flex items-center justify-center px-3 py-2 rounded-xl font-black text-lg tracking-widest font-mono ${isDark ? "bg-white/5 text-white/70 ring-1 ring-white/10" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>{n}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── BBFS & Ekor Mati — always visible ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BBFS */}
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-cyan-400" />
            <span className="font-black">BBFS Hari Ini (8 Digit)</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {bbfs8.map(d => <DigitBadge key={d} d={d} type="hot" />)}
          </div>
          <p className={`text-xs ${muted} mt-3`}>Bet semua kombinasi 4D dari 8 digit ini</p>
          <button onClick={() => doCopy(bbfs8.join(""), "bbfs")}
            className={`mt-3 flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>
            {copied === "bbfs" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {bbfs8.join("")}
          </button>
        </div>

        {/* Angka Mati */}
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Snowflake className="w-4 h-4 text-blue-400" />
            <span className="font-black">Angka Mati per Posisi</span>
          </div>
          <div className="space-y-2">
            {posLabels.map((lbl, i) => (
              <div key={lbl} className="flex items-center gap-2">
                <span className={`text-[10px] font-black w-14 text-right ${muted}`}>{lbl}</span>
                <div className="flex gap-1">
                  {angkaMati[i].map(d => (
                    <span key={d} className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${isDark ? "bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/30" : "bg-blue-50 text-blue-600 ring-1 ring-blue-200"}`}>{d}</span>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-white/5">
              <span className={`text-[10px] font-black w-14 text-right ${muted}`}>Ekor</span>
              <div className="flex gap-1">
                {ekorMati.map(d => (
                  <span key={d} className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${isDark ? "bg-orange-900/40 text-orange-400 ring-1 ring-orange-500/30" : "bg-orange-50 text-orange-600 ring-1 ring-orange-200"}`}>{d}</span>
                ))}
              </div>
              <span className={`text-[10px] ${muted}`}>5 ekor mati</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Collapsible sections ── */}
      {/* 2. Frekuensi */}
      <div className={card}>
        <SectionHeader id="freq" icon={<BarChart2 className="w-4 h-4 text-violet-400" />}
          title="Analisis Frekuensi Digit (HOT-WARM-COLD)"
          sub="Klasifikasi digit 0–9 berdasarkan kemunculan" />
        {openSection === "freq" && (
          <div className="px-5 pb-5 space-y-4">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "🔥 HOT", digits: hotDigits, color: "text-red-400" },
                { label: "🌡️ WARM", digits: warmDigits, color: "text-orange-400" },
                { label: "❄️ COLD", digits: coldDigits, color: "text-blue-400" },
                { label: "🧊 X-COLD", digits: xColdDigits, color: "text-slate-400" },
              ].map(grp => (
                <div key={grp.label} className={`${sub} rounded-xl p-3 text-center`}>
                  <div className={`text-[10px] font-black mb-2 ${grp.color}`}>{grp.label}</div>
                  <div className="flex justify-center gap-1 flex-wrap">
                    {grp.digits.map(d => <DigitBadge key={d} d={d} type={grp.label.includes("HOT") ? "hot" : grp.label.includes("WARM") ? "warm" : grp.label.includes("X-COLD") ? "xcold" : "cold"} />)}
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${isDark ? "bg-white/5" : "bg-slate-50"} text-xs`}>
                    <th className="p-2 text-left font-black">Digit</th>
                    {freqData.sorted.map(x => <th key={x.digit} className="p-2 text-center font-black">{x.digit}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`p-2 text-xs font-bold ${muted}`}>Jumlah</td>
                    {freqData.sorted.map(x => (
                      <td key={x.digit} className="p-2 text-center">
                        <div className={`font-black text-sm ${hotDigits.includes(x.digit) ? "text-red-400" : warmDigits.includes(x.digit) ? "text-orange-400" : coldDigits.includes(x.digit) ? "text-blue-400" : "text-slate-400"}`}>{x.count}</div>
                        <div className={`text-[10px] ${muted}`}>{x.pct}%</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Per posisi */}
      <div className={card}>
        <SectionHeader id="posisi" icon={<TrendingUp className="w-4 h-4 text-green-400" />}
          title="Analisis Per Posisi (As-Kop-Kepala-Ekor)"
          sub="2 digit terkuat di setiap posisi" />
        {openSection === "posisi" && (
          <div className="px-5 pb-5 space-y-4">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {posLabels.map((lbl, i) => (
                <div key={lbl} className={`${sub} rounded-xl p-4 text-center`}>
                  <div className={`text-xs font-black mb-3 ${muted}`}>{lbl} (Pos {i + 1})</div>
                  <div className="flex justify-center gap-2">
                    {perPosiTop2[i].map((x, rank) => (
                      <div key={x.digit} className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-base font-black ${rank === 0 ? "bg-gradient-to-br from-yellow-500/30 to-orange-500/30 text-yellow-400 ring-2 ring-yellow-500/40" : isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>{x.digit}</span>
                        <span className={`text-[10px] ${muted}`}>{x.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Sum control */}
      <div className={card}>
        <SectionHeader id="sum" icon={<Hash className="w-4 h-4 text-cyan-400" />}
          title="Analisis Jumlah Total (Sum Control)"
          sub={sumData ? `Range Aman: ${sumData.safeMin}–${sumData.safeMax}` : "Menghitung..."} />
        {openSection === "sum" && sumData && (
          <div className="px-5 pb-5 space-y-4">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Rata-rata 10 terakhir", value: sumData.avg10 },
                { label: "Rata-rata 20 terakhir", value: sumData.avg20 },
                { label: "Minimum", value: sumData.min },
                { label: "Maksimum", value: sumData.max },
              ].map(x => (
                <div key={x.label} className={`${sub} rounded-xl p-4 text-center`}>
                  <div className={`text-[10px] ${muted} mb-1`}>{x.label}</div>
                  <div className="font-black text-2xl text-cyan-400">{x.value}</div>
                </div>
              ))}
            </div>
            <div className={`flex items-center justify-between px-5 py-3 rounded-xl ${isDark ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-cyan-50 border border-cyan-200"}`}>
              <span className="font-black text-cyan-400">🎯 Range Aman Prediksi</span>
              <span className="font-black text-2xl text-cyan-400">{sumData.safeMin} – {sumData.safeMax}</span>
            </div>
          </div>
        )}
      </div>

      {/* 5 & 6. Ganjil/Genap + Besar/Kecil */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <SectionHeader id="gg" icon={<Zap className="w-4 h-4 text-yellow-400" />}
            title="Ganjil / Genap" sub={ggData[0] ? `Dominan: ${ggData[0][0]} (${ggData[0][1]}x)` : ""} />
          {openSection === "gg" && (
            <div className="px-5 pb-5">
              <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
              <div className="space-y-2">
                {ggData.map(([key, count]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-xs font-black w-16 ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>{key}</span>
                    <div className="flex-1 h-2 rounded-full bg-yellow-500/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500"
                        style={{ width: `${Math.round((count / draws.length) * 100)}%` }} />
                    </div>
                    <span className={`text-xs font-black w-8 text-right ${muted}`}>{count}x</span>
                  </div>
                ))}
              </div>
              {ggData[0] && (
                <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-bold ${isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"}`}>
                  💡 Prediksi selanjutnya: {ggData[1]?.[0] || ggData[0]?.[0] || "-"}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={card}>
          <SectionHeader id="bk" icon={<TrendingUp className="w-4 h-4 text-pink-400" />}
            title="Besar / Kecil" sub={bkData[0] ? `Dominan: ${bkData[0][0]} (${bkData[0][1]}x)` : ""} />
          {openSection === "bk" && (
            <div className="px-5 pb-5">
              <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
              <div className="space-y-2">
                {bkData.map(([key, count]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-xs font-black w-16 ${isDark ? "text-pink-400" : "text-pink-600"}`}>{key}</span>
                    <div className="flex-1 h-2 rounded-full bg-pink-500/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500"
                        style={{ width: `${Math.round((count / draws.length) * 100)}%` }} />
                    </div>
                    <span className={`text-xs font-black w-8 text-right ${muted}`}>{count}x</span>
                  </div>
                ))}
              </div>
              <div className={`mt-3 px-3 py-2 rounded-xl text-xs ${muted}`}>0–4 = Kecil &nbsp;|&nbsp; 5–9 = Besar</div>
            </div>
          )}
        </div>
      </div>

      {/* 7. Selisih */}
      <div className={card}>
        <SectionHeader id="selisih" icon={<TrendingUp className="w-4 h-4 text-indigo-400" />}
          title="Analisis Selisih Antar Digit"
          sub="Pola gap antar digit berurutan" />
        {openSection === "selisih" && (
          <div className="px-5 pb-5">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {selisihData.map(([pattern, count]) => (
                <div key={pattern} className={`${sub} rounded-xl p-3 text-center`}>
                  <div className="font-black text-indigo-400 tracking-widest text-sm">{pattern}</div>
                  <div className={`text-xs ${muted} mt-0.5`}>{count}x</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 8. Kembar */}
      <div className={card}>
        <SectionHeader id="kembar" icon={<Flame className="w-4 h-4 text-amber-400" />}
          title="Analisis Angka Kembar"
          sub={`${kembarData.pctDouble}% draw punya angka kembar`} />
        {openSection === "kembar" && (
          <div className="px-5 pb-5">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: "Double Berurutan", value: kembarData.doubleConsec },
                { label: "Double (Any)", value: kembarData.doubleAny },
                { label: "Triple", value: kembarData.triple },
              ].map(x => (
                <div key={x.label} className={`${sub} rounded-xl p-3 text-center`}>
                  <div className={`text-[10px] ${muted} mb-1`}>{x.label}</div>
                  <div className="font-black text-xl text-amber-400">{x.value}x</div>
                </div>
              ))}
            </div>
            {kembarData.examples.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {kembarData.examples.map((d, i) => (
                  <span key={i} className={`px-2.5 py-1 rounded-lg text-sm font-black font-mono ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700"}`}>{d}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 9. Pembalikan */}
      <div className={card}>
        <SectionHeader id="mirror" icon={<RefreshCw className="w-4 h-4 text-teal-400" />}
          title="Pola Pembalikan / Mirror"
          sub={`${mirrorData.count} pasang mirror terdeteksi`} />
        {openSection === "mirror" && (
          <div className="px-5 pb-5">
            <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
            {mirrorData.count === 0 ? (
              <p className={`text-sm ${muted} text-center py-4`}>Tidak ada pola mirror terdeteksi dalam range ini</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mirrorData.pairs.map((p, i) => (
                  <span key={i} className={`px-3 py-1.5 rounded-xl text-sm font-black font-mono ${isDark ? "bg-teal-500/15 text-teal-400" : "bg-teal-50 text-teal-700"}`}>{p}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 10. 2D & 3D Combo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <SectionHeader id="2d" icon={<BookOpen className="w-4 h-4 text-emerald-400" />}
            title="10 Kombinasi 2D Terkuat" sub="Pasangan digit paling sering muncul bersama" />
          {openSection === "2d" && (
            <div className="px-5 pb-5">
              <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
              <div className="grid grid-cols-2 gap-2">
                {combo2D.map(([combo, count], i) => (
                  <div key={combo} className={`${sub} rounded-xl px-3 py-2 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 ${muted}`}>{i + 1}.</span>
                      <span className="font-black text-emerald-400 text-base tracking-widest font-mono">{combo}</span>
                    </div>
                    <span className={`text-xs font-bold ${muted}`}>{count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={card}>
          <SectionHeader id="3d" icon={<BookOpen className="w-4 h-4 text-lime-400" />}
            title="5 Kombinasi 3D Terkuat" sub="Triplet digit paling sering muncul bersama" />
          {openSection === "3d" && (
            <div className="px-5 pb-5">
              <div className={`h-px ${isDark ? "bg-white/8" : "bg-slate-100"} mb-4`} />
              <div className="space-y-2">
                {combo3D.map(([combo, count], i) => (
                  <div key={combo} className={`${sub} rounded-xl px-3 py-2 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 ${muted}`}>{i + 1}.</span>
                      <span className="font-black text-lime-400 text-base tracking-widest font-mono">{combo}</span>
                    </div>
                    <span className={`text-xs font-bold ${muted}`}>{count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ringkasan logika */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-violet-400" />
          <span className="font-black">Ringkasan Logika Statistik</span>
        </div>
        <div className={`text-sm leading-relaxed ${muted} space-y-1.5`}>
          <p>🔥 <strong>HOT digits ({hotDigits.join(", ")})</strong> — muncul {freqData.ranked.slice(0, 3).map(x => x.count).join(", ")}x dalam {draws.length} draw. Prioritas utama.</p>
          <p>📍 <strong>Posisi terkuat</strong> — As:{perPosiTop2[0][0]?.digit}/{perPosiTop2[0][1]?.digit}, Kop:{perPosiTop2[1][0]?.digit}/{perPosiTop2[1][1]?.digit}, Kepala:{perPosiTop2[2][0]?.digit}/{perPosiTop2[2][1]?.digit}, Ekor:{perPosiTop2[3][0]?.digit}/{perPosiTop2[3][1]?.digit}</p>
          {sumData && <p>📊 <strong>Sum rata-rata 20 draw</strong> = {sumData.avg20}. Range aman {sumData.safeMin}–{sumData.safeMax}.</p>}
          <p>🎲 <strong>Pola GG dominan</strong>: {ggData[0]?.[0] || "-"} ({ggData[0]?.[1] || 0}x) — <strong>BK dominan</strong>: {bkData[0]?.[0] || "-"} ({bkData[0]?.[1] || 0}x)</p>
          <p>🔮 <strong>BBFS 8 digit</strong>: {bbfs8.join("")} — kombinasikan untuk taruhan maksimal.</p>
        </div>
      </div>
    </div>
  );
}
