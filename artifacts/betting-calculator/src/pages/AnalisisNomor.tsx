import React, { useMemo, useState } from "react";
import { Flame, Snowflake, Star, Hash, BarChart2 } from "lucide-react";

interface ResultRow { hari: string; tanggal: string; [slot: string]: string; }

const TIME_SLOTS = ["00:01","13:00","16:00","19:00","22:00","23:00"];

export default function AnalisisNomor({
  resultData, customNumbers, isDark,
}: {
  resultData: ResultRow[];
  customNumbers: string;
  isDark: boolean;
}) {
  const [viewMode, setViewMode] = useState<"heatmap" | "list">("heatmap");
  const [days, setDays] = useState(30);

  const card = isDark
    ? "rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl"
    : "rounded-[24px] border border-slate-200 bg-white shadow-xl";

  const bettingNums = useMemo(() => new Set(customNumbers.split("*").filter(Boolean)), [customNumbers]);

  const { freq, maxFreq, totalDraws } = useMemo(() => {
    const f: Record<string, number> = {};
    let total = 0;
    resultData.slice(0, days).forEach(row => {
      TIME_SLOTS.forEach(s => {
        const v = String(row[s] || "");
        if (v.length === 4 && /^\d{4}$/.test(v)) {
          const last2 = v.slice(-2);
          f[last2] = (f[last2] || 0) + 1;
          total++;
        }
      });
    });
    const max = Math.max(0, ...Object.values(f));
    return { freq: f, maxFreq: max, totalDraws: total };
  }, [resultData, days]);

  const sorted = useMemo(() =>
    Object.entries(freq).sort((a, b) => b[1] - a[1]),
  [freq]);

  const hotNums  = sorted.slice(0, 10);
  const coldNums = sorted.slice(-10).reverse();

  function getColor(num: string): string {
    const f = freq[num] || 0;
    if (f === 0) return isDark ? "bg-slate-800/60" : "bg-slate-100";
    const pct = f / maxFreq;
    if (pct >= 0.8) return "bg-red-500";
    if (pct >= 0.6) return "bg-orange-500";
    if (pct >= 0.4) return "bg-yellow-500";
    if (pct >= 0.2) return "bg-green-500";
    return isDark ? "bg-blue-900" : "bg-blue-100";
  }

  function getTextColor(num: string): string {
    const f = freq[num] || 0;
    if (f === 0) return isDark ? "text-white/20" : "text-slate-300";
    const pct = f / maxFreq;
    if (pct >= 0.2) return "text-white";
    return isDark ? "text-white/60" : "text-slate-600";
  }

  const hasData = totalDraws > 0;

  return (
    <div className="animate-slide-up space-y-4">
      {/* Hero header */}
      <div className="rounded-[24px] bg-gradient-to-r from-cyan-700 via-blue-700 to-violet-700 text-white p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 opacity-80"/>
              <span className="text-xs font-bold opacity-70">ANALISIS FREKUENSI NOMOR</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Heatmap 2D</h1>
            <p className="text-xs opacity-70 mt-1">
              {hasData ? `${totalDraws} result · ${sorted.length} nomor · ${days} hari terakhir` : "Memuat data result..."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={days} onChange={e => setDays(+e.target.value)}
              className="text-xs font-bold px-3 py-2 rounded-xl outline-none bg-white/20 border border-white/30 text-white">
              {[7, 14, 30, 60].map(d => <option key={d} value={d} className="text-black">{d} hari</option>)}
            </select>
            <div className="flex rounded-xl overflow-hidden border border-white/30">
              {(["heatmap","list"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-2 text-xs font-bold transition-all ${viewMode === m ? "bg-white text-blue-700" : "bg-white/10 text-white/80"}`}>
                  {m === "heatmap" ? "Grid" : "List"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className={`${card} p-12 text-center`}>
          <Hash className="w-14 h-14 mx-auto mb-4 opacity-20"/>
          <h3 className="font-black text-lg mb-1">Data result belum tersedia</h3>
          <p className={`text-sm ${isDark ? "opacity-50" : "text-slate-400"}`}>Buka tab Result untuk memuat data terlebih dahulu.</p>
        </div>
      ) : (
        <div className={`${card} p-5`}>
          {viewMode === "heatmap" ? (
            <>
              <div className="flex gap-2 mb-4 text-xs flex-wrap">
                {[
                  { color:"bg-red-500",    label:"Sangat panas" },
                  { color:"bg-orange-500", label:"Panas" },
                  { color:"bg-yellow-500", label:"Sedang" },
                  { color:"bg-green-500",  label:"Jarang" },
                  { color:isDark?"bg-blue-900":"bg-blue-100", label:"Sangat jarang" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded ${l.color}`}/>
                    <span className={isDark ? "text-white/40" : "text-slate-400"}>{l.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-yellow-400"/>
                  <span className={isDark ? "text-white/40" : "text-slate-400"}>Nomor kamu</span>
                </div>
              </div>

              {/* Grid: 10-col on md+, 5-col on mobile for readability */}
              <div className="grid grid-cols-5 md:grid-cols-10 gap-1">
                {Array.from({ length: 100 }, (_, i) => {
                  const num = String(i).padStart(2, "0");
                  const isBetting = bettingNums.has(num);
                  const f = freq[num] || 0;
                  const pct = maxFreq > 0 ? Math.round((f / maxFreq) * 100) : 0;

                  return (
                    <div key={num} title={`${num}: ${f}x (${pct}%)`}
                      className={`relative flex flex-col items-center justify-center rounded-lg aspect-square text-[10px] font-black transition-all cursor-default
                        ${getColor(num)} ${getTextColor(num)}
                        ${isBetting ? "ring-2 ring-yellow-400 ring-offset-1 " + (isDark ? "ring-offset-slate-950" : "ring-offset-white") : ""}
                      `}>
                      <span>{num}</span>
                      {f > 0 && <span className="text-[7px] opacity-70 leading-none">{f}x</span>}
                      {isBetting && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 flex items-center justify-center">
                          <Star className="w-1.5 h-1.5 text-yellow-900"/>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
                    <th className="pb-2 text-left">#</th>
                    <th className="pb-2 text-left">Nomor</th>
                    <th className="pb-2 text-center">Frekuensi</th>
                    <th className="pb-2 text-center">Persentase</th>
                    <th className="pb-2 text-left">Bar</th>
                    <th className="pb-2 text-center">Pasang?</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(([num, f], i) => {
                    const pct = maxFreq > 0 ? Math.round((f / maxFreq) * 100) : 0;
                    const isBetting = bettingNums.has(num);
                    return (
                      <tr key={num} className={`border-t ${isDark ? "border-white/5" : "border-slate-50"}`}>
                        <td className={`py-1.5 text-xs ${isDark ? "text-white/30" : "text-slate-300"}`}>{i+1}</td>
                        <td className="py-1.5 font-black tabular-nums">{num}</td>
                        <td className="py-1.5 text-center font-bold">{f}x</td>
                        <td className={`py-1.5 text-center font-bold ${pct >= 80 ? "text-red-400" : pct >= 60 ? "text-orange-400" : pct >= 40 ? "text-yellow-400" : "text-blue-400"}`}>{pct}%</td>
                        <td className="py-1.5 pr-4">
                          <div className={`h-2 rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                            <div className={`h-2 rounded-full ${pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-orange-500" : pct >= 40 ? "bg-yellow-500" : "bg-blue-500"}`} style={{ width:`${pct}%` }}/>
                          </div>
                        </td>
                        <td className="py-1.5 text-center">
                          {isBetting ? <Star className="w-3.5 h-3.5 text-yellow-400 mx-auto"/> : <span className={`text-xs ${isDark ? "text-white/20" : "text-slate-200"}`}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <h3 className="font-black mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-orange-400"/>
                </div>
                Nomor Terpanas
                <span className={`ml-auto text-xs font-bold ${isDark ? "text-white/30" : "text-slate-400"}`}>Top 10</span>
              </h3>
              <div className="space-y-2">
                {hotNums.map(([num, f], i) => {
                  const isBetting = bettingNums.has(num);
                  const pct = maxFreq > 0 ? Math.round((f / maxFreq) * 100) : 0;
                  return (
                    <div key={num} className="flex items-center gap-2">
                      <span className={`w-4 text-[10px] text-right font-bold ${isDark ? "text-white/30" : "text-slate-300"}`}>{i+1}</span>
                      <span className={`w-10 text-center text-sm font-black rounded-lg py-0.5 ${isBetting ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" : isDark ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}>{num}</span>
                      {isBetting && <Star className="w-3 h-3 text-yellow-400 flex-shrink-0"/>}
                      <div className={`flex-1 rounded-full h-2 ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                        <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500" style={{ width:`${pct}%` }}/>
                      </div>
                      <span className="text-xs font-bold text-orange-400 w-8 text-right">{f}x</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <h3 className="font-black mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <Snowflake className="w-4 h-4 text-cyan-400"/>
                </div>
                Nomor Terdingin
                <span className={`ml-auto text-xs font-bold ${isDark ? "text-white/30" : "text-slate-400"}`}>Jarang Keluar</span>
              </h3>
              <div className="space-y-2">
                {coldNums.map(([num, f], i) => {
                  const isBetting = bettingNums.has(num);
                  const pct = maxFreq > 0 ? Math.round((f / maxFreq) * 100) : 0;
                  return (
                    <div key={num} className="flex items-center gap-2">
                      <span className={`w-4 text-[10px] text-right font-bold ${isDark ? "text-white/30" : "text-slate-300"}`}>{i+1}</span>
                      <span className={`w-10 text-center text-sm font-black rounded-lg py-0.5 ${isBetting ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" : isDark ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}>{num}</span>
                      {isBetting && <Star className="w-3 h-3 text-yellow-400 flex-shrink-0"/>}
                      <div className={`flex-1 rounded-full h-2 ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                        <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width:`${pct}%` }}/>
                      </div>
                      <span className="text-xs font-bold text-cyan-400 w-8 text-right">{f}x</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`${card} p-5`}>
            <h3 className="font-black mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-blue-400"/>
              </div>
              Analisis Nomor Taruhan Kamu
            </h3>
            {bettingNums.size === 0 ? (
              <p className="opacity-40 text-sm text-center py-4">Tidak ada nomor taruhan yang dikonfigurasi</p>
            ) : (
              <>
                {(() => {
                  const bettingStats = Array.from(bettingNums).map(num => ({
                    num, freq: freq[num] || 0, pct: maxFreq > 0 ? Math.round(((freq[num] || 0) / maxFreq) * 100) : 0
                  })).sort((a, b) => b.freq - a.freq);
                  const avgFreq = bettingStats.reduce((s, x) => s + x.freq, 0) / bettingStats.length;
                  const allAvg = Object.values(freq).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(freq).length);
                  return (
                    <>
                      <div className={`grid grid-cols-3 gap-3 mb-4 text-center`}>
                        {[
                          { label:"Rata-rata Frek.", val:`${avgFreq.toFixed(1)}x`, color:"text-blue-400" },
                          { label:"vs Semua Nomor", val:`${avgFreq >= allAvg ? "+" : ""}${(avgFreq - allAvg).toFixed(1)}x`, color:avgFreq >= allAvg ? "text-green-400" : "text-red-400" },
                          { label:"Total Nomor", val:`${bettingNums.size}`, color:"text-yellow-400" },
                        ].map((s, i) => (
                          <div key={i} className={`p-3 rounded-2xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                            <div className={`text-xs mb-1 ${isDark ? "text-white/40" : "text-slate-400"}`}>{s.label}</div>
                            <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-48 overflow-y-auto">
                        {bettingStats.map(({ num, freq: f, pct }) => (
                          <div key={num} title={`${num}: ${f}x`}
                            className={`flex flex-col items-center justify-center rounded-xl p-1.5 ${getFreqBg(pct, isDark)}`}>
                            <span className={`text-xs font-black ${getFreqText(pct, isDark)}`}>{num}</span>
                            <span className={`text-[9px] ${getFreqText(pct, isDark)} opacity-70`}>{f}x</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getFreqBg(pct: number, dark: boolean) {
  if (pct >= 80) return "bg-red-500/30";
  if (pct >= 60) return "bg-orange-500/30";
  if (pct >= 40) return "bg-yellow-500/30";
  if (pct >= 20) return "bg-green-500/20";
  return dark ? "bg-white/5" : "bg-slate-50";
}

function getFreqText(pct: number, dark: boolean) {
  if (pct >= 80) return "text-red-400";
  if (pct >= 60) return "text-orange-400";
  if (pct >= 40) return "text-yellow-400";
  if (pct >= 20) return "text-green-400";
  return dark ? "text-white/40" : "text-slate-400";
}
