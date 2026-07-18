import { useMemo, useState, useEffect } from "react";
import {
  Trash2, RefreshCw, Copy, CheckCircle2, Clock, ChevronDown, ChevronUp,
  Hash, TrendingUp, BookOpen, Eye, EyeOff, Flame, Target,
} from "lucide-react";
import { toast } from "sonner";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

function extractEkor2D(resultData: ResultRow[]): { num: string; tanggal: string; slot: string }[] {
  const out: { num: string; tanggal: string; slot: string }[] = [];
  for (const row of resultData) {
    for (const slot of [...TIME_SLOTS].reverse()) {
      const v = String(row[slot] || "");
      if (/^\d{4}$/.test(v)) {
        out.push({ num: v.slice(2), tanggal: row.tanggal, slot });
      }
    }
  }
  return out;
}

function copyText(t: string) {
  try { navigator.clipboard.writeText(t); return true; } catch { return false; }
}

interface HistoryEntry {
  id: string;
  tanggal: string;
  killed: string[];
  live: string[];
  nextDraws: string[];
  hits: string[];
  watermark?: string; // "tanggal|slot|num" of most-recent draw at save time
  newDrawsSeen?: number; // how many new draws have been checked
}

const LS_KEY = "2d_belakang_history";

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function saveHistory(h: HistoryEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(h)); } catch {}
}

interface Props { resultData: ResultRow[]; isDark: boolean }

export default function TwoDBelakangPage({ resultData, isDark }: Props) {
  const [killCount, setKillCount] = useState(30);
  const [mode, setMode] = useState<"recency" | "frequency" | "hybrid">("hybrid");
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [showKilled, setShowKilled] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");

  const card = isDark
    ? "bg-slate-800/70 border border-white/8 rounded-2xl"
    : "bg-white border border-slate-200 rounded-2xl shadow-sm";
  const muted = isDark ? "text-white/50" : "text-slate-400";
  const sub = isDark ? "bg-white/5" : "bg-slate-50";

  const allEkor = useMemo(() => extractEkor2D(resultData), [resultData]);

  const analysis = useMemo(() => {
    // Build score for each 00-99
    const freq = new Array(100).fill(0).map((_, i) => ({ num: String(i).padStart(2, "0"), freq: 0, lastPos: 9999, score: 0 }));

    allEkor.forEach((e, pos) => {
      const idx = parseInt(e.num);
      if (idx < 0 || idx > 99 || isNaN(idx)) return;
      freq[idx].freq++;
      if (pos < freq[idx].lastPos) freq[idx].lastPos = pos;
    });

    // Score: hybrid = recency + frequency
    freq.forEach(item => {
      const recencyScore = item.lastPos === 9999 ? 0 : Math.max(0, 50 - item.lastPos) * 2;
      const freqScore = Math.min(item.freq * 3, 30);
      if (mode === "recency") item.score = recencyScore;
      else if (mode === "frequency") item.score = freqScore;
      else item.score = recencyScore * 0.6 + freqScore * 0.4;
    });

    const sorted = [...freq].sort((a, b) => b.score - a.score);
    const killed = sorted.slice(0, killCount).map(x => x.num).sort();
    const live   = sorted.slice(killCount).map(x => x.num).sort();

    // Frequency stats for live numbers
    const liveWithStats = live.map(num => {
      const f = freq.find(x => x.num === num)!;
      return { num, freq: f.freq, lastPos: f.lastPos };
    }).sort((a, b) => b.freq - a.freq);

    // Recent draws for reference
    const recent = allEkor.slice(0, 30).map(e => e.num);

    return { killed, live, liveWithStats, freq, recent };
  }, [allEkor, killCount, mode]);

  function doCopy(text: string, key: string) {
    if (copyText(text)) {
      setCopied(key);
      toast.success("Dicopy!");
      setTimeout(() => setCopied(null), 2000);
    }
  }

  // Build watermark from the most-recent draw at save time
  function buildWatermark(ekor: typeof allEkor): string {
    if (!ekor.length) return "";
    const e = ekor[0];
    return `${e.tanggal}|${e.slot}|${e.num}`;
  }

  // Find index of the watermark draw in allEkor; returns -1 if not found
  function findWatermarkIdx(ekor: typeof allEkor, wm: string): number {
    return ekor.findIndex(e => `${e.tanggal}|${e.slot}|${e.num}` === wm);
  }

  function computeHitsFromWatermark(entry: HistoryEntry, ekor: typeof allEkor): { hits: string[]; newDrawsSeen: number } {
    if (!entry.watermark) return { hits: entry.hits, newDrawsSeen: 0 };
    const wmIdx = findWatermarkIdx(ekor, entry.watermark);
    // Draws with index < wmIdx are newer (allEkor is newest-first)
    const newDraws = wmIdx > 0 ? ekor.slice(0, wmIdx).map(e => e.num) : [];
    const hits = newDraws.filter(n => entry.live.includes(n));
    return { hits, newDrawsSeen: newDraws.length };
  }

  function saveToHistory() {
    const wm = buildWatermark(allEkor);
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      tanggal: new Date().toLocaleString("id-ID"),
      killed: analysis.killed,
      live: analysis.live,
      nextDraws: [],
      hits: [],
      watermark: wm,
      newDrawsSeen: 0,
    };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated);
    saveHistory(updated);
    toast.success("Disimpan ke riwayat!");
  }

  function updateAccuracy(id: string) {
    const updated = history.map(entry => {
      if (entry.id !== id) return entry;
      const { hits, newDrawsSeen } = computeHitsFromWatermark(entry, allEkor);
      return { ...entry, hits, newDrawsSeen };
    });
    setHistory(updated);
    saveHistory(updated);
    const entry = updated.find(e => e.id === id);
    if (entry) {
      toast.success(`Akurasi diperbarui — ${entry.newDrawsSeen ?? 0} draw baru, ${entry.hits.length} hit`);
    }
  }

  function updateAllAccuracy() {
    const updated = history.map(entry => {
      if (!entry.watermark) return entry;
      const { hits, newDrawsSeen } = computeHitsFromWatermark(entry, allEkor);
      return { ...entry, hits, newDrawsSeen };
    });
    setHistory(updated);
    saveHistory(updated);
  }

  // Auto-refresh accuracy whenever resultData changes
  useEffect(() => {
    if (history.length === 0) return;
    updateAllAccuracy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEkor]);

  function deleteHistory(id: string) {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
    toast.success("Riwayat dihapus");
  }

  function clearHistory() {
    if (!confirm("Hapus semua riwayat?")) return;
    setHistory([]);
    saveHistory([]);
    toast.success("Semua riwayat dihapus");
  }

  const NumCell = ({ num, status }: { num: string; status: "live" | "killed" | "recent" }) => {
    const isRecentHit = analysis.recent.slice(0, 10).includes(num);
    return (
      <div className={`
        flex items-center justify-center rounded-xl text-xs font-black aspect-square min-w-0
        ${status === "killed"
          ? isDark ? "bg-red-900/30 text-red-400/60 line-through ring-1 ring-red-500/20" : "bg-red-50 text-red-300 line-through ring-1 ring-red-200"
          : isRecentHit && status === "live"
          ? isDark ? "bg-gradient-to-br from-green-500/30 to-emerald-600/30 text-green-400 ring-1 ring-green-500/40" : "bg-green-100 text-green-700 ring-1 ring-green-300"
          : isDark ? "bg-white/8 text-white/80 hover:bg-white/12 ring-1 ring-white/5" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
        }
        transition-all cursor-default select-none
      `}>
        {num}
      </div>
    );
  };

  return (
    <div className="animate-slide-up space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-[22px] bg-gradient-to-r from-red-700 via-rose-700 to-pink-700 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black">2D Belakang</h1>
            <p className="opacity-70 text-xs mt-0.5">Kill {killCount} angka mati → {100 - killCount} angka hidup dari 00–99</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={saveToHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
              <BookOpen className="w-3.5 h-3.5" />Simpan Riwayat
            </button>
            <button onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />Riwayat ({history.length})
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {/* Kill count */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Kill:</span>
            {[20, 25, 30, 35, 40].map(v => (
              <button key={v} onClick={() => setKillCount(v)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${killCount === v ? "bg-white text-rose-700" : "bg-white/20 hover:bg-white/30"}`}>
                {v}
              </button>
            ))}
          </div>
          {/* Mode */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Mode:</span>
            {([["hybrid", "Hybrid"], ["recency", "Recency"], ["frequency", "Frekuensi"]] as const).map(([val, lbl]) => (
              <button key={val} onClick={() => setMode(val)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${mode === val ? "bg-white text-rose-700" : "bg-white/20 hover:bg-white/30"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {/* Quick stats */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
            ✅ Hidup: {100 - killCount} angka
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
            ❌ Mati: {killCount} angka
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
            📊 Data: {allEkor.length} draw
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">
            🟢 = keluar 10 draw terakhir
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className={card}>
        {/* Toolbar */}
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? "border-white/8" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setActiveTab("grid")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "grid" ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-800" : `${muted} hover:opacity-80`}`}>
              Grid
            </button>
            <button onClick={() => setActiveTab("list")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "list" ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-800" : `${muted} hover:opacity-80`}`}>
              Daftar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowKilled(v => !v)}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
              {showKilled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKilled ? "Sembunyikan" : "Tampilkan"} Angka Mati
            </button>
            <button onClick={() => doCopy(analysis.live.join(", "), "live")}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
              {copied === "live" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              Copy {100 - killCount} Angka
            </button>
          </div>
        </div>

        {activeTab === "grid" ? (
          <div className="p-5">
            {/* Grid 10x10 */}
            <div className="grid grid-cols-10 gap-1.5">
              {Array.from({ length: 100 }, (_, i) => {
                const num = String(i).padStart(2, "0");
                const isKilled = analysis.killed.includes(num);
                if (!showKilled && isKilled) {
                  return (
                    <div key={num} className={`flex items-center justify-center rounded-xl text-xs font-black aspect-square ${isDark ? "bg-red-900/20 text-red-500/40" : "bg-red-50 text-red-200"}`}>
                      ✕
                    </div>
                  );
                }
                return <NumCell key={num} num={num} status={isKilled ? "killed" : "live"} />;
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded-md ${isDark ? "bg-white/8 ring-1 ring-white/5" : "bg-slate-100 ring-1 ring-slate-200"}`} />
                <span className={muted}>Hidup</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded-md ${isDark ? "bg-green-500/30 ring-1 ring-green-500/40" : "bg-green-100 ring-1 ring-green-300"}`} />
                <span className={muted}>Hidup + baru keluar</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded-md ${isDark ? "bg-red-900/30" : "bg-red-50"}`} />
                <span className={muted}>Mati (dikill)</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Live numbers list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-sm text-green-400">✅ {100 - killCount} Angka HIDUP</span>
                <button onClick={() => doCopy(analysis.live.join(" "), "live2")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
                  <Copy className="w-3 h-3" />Copy
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.liveWithStats.map(item => {
                  const isHot = analysis.recent.slice(0, 10).includes(item.num);
                  return (
                    <div key={item.num} className={`flex flex-col items-center gap-0.5 cursor-default`}>
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black ${
                        isHot ? isDark ? "bg-green-500/25 text-green-400 ring-1 ring-green-500/40" : "bg-green-100 text-green-700 ring-1 ring-green-300"
                        : isDark ? "bg-white/8 text-white/80" : "bg-slate-100 text-slate-700"
                      }`}>{item.num}</span>
                      <span className={`text-[9px] font-bold ${muted}`}>{item.freq}x</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Killed numbers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-sm text-red-400">❌ {killCount} Angka MATI</span>
                <button onClick={() => doCopy(analysis.killed.join(" "), "kill2")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
                  <Copy className="w-3 h-3" />Copy
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.killed.map(num => (
                  <span key={num} className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black line-through ${isDark ? "bg-red-900/25 text-red-400/60" : "bg-red-50 text-red-300"}`}>{num}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top live numbers */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="font-black">Top 20 Angka Hidup Terkuat</span>
          <span className={`text-xs ${muted}`}>(frekuensi tertinggi dari angka hidup)</span>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-10 gap-2">
          {analysis.liveWithStats.slice(0, 20).map((item, i) => {
            const isHot = analysis.recent.slice(0, 10).includes(item.num);
            return (
              <div key={item.num} className="relative">
                {i < 3 && (
                  <span className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-slate-400 text-black" : "bg-amber-700 text-white"}`}>{i + 1}</span>
                )}
                <div className={`${sub} rounded-xl p-2.5 text-center`}>
                  <div className={`font-black text-base ${isHot ? "text-green-400" : isDark ? "text-white" : "text-slate-800"}`}>{item.num}</div>
                  <div className={`text-[10px] ${muted}`}>{item.freq}x</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent draw results reference */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="font-black">15 Draw Terakhir (Ekor 2D)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allEkor.slice(0, 15).map((e, i) => {
            const isKilled = analysis.killed.includes(e.num);
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-sm font-black font-mono ${
                  isKilled
                    ? isDark ? "bg-red-900/30 text-red-400 ring-1 ring-red-500/30" : "bg-red-50 text-red-400 ring-1 ring-red-200"
                    : isDark ? "bg-gradient-to-br from-blue-600/25 to-cyan-700/25 text-blue-400 ring-1 ring-blue-500/30" : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                }`}>{e.num}</span>
                <span className={`text-[9px] ${muted} font-mono`}>{e.slot}</span>
              </div>
            );
          })}
        </div>
        <p className={`text-xs ${muted} mt-3`}>
          <span className={isDark ? "text-blue-400" : "text-blue-600"}>Biru</span> = hidup &nbsp;|&nbsp; <span className={isDark ? "text-red-400" : "text-red-500"}>Merah</span> = sudah dikill
        </p>
      </div>

      {/* History */}
      <div className={card}>
        <button onClick={() => setShowHistory(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <div className="text-left">
              <div className="font-black text-sm">Riwayat Analisa</div>
              <div className={`text-[11px] ${muted}`}>{history.length} riwayat tersimpan</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button onClick={e => { e.stopPropagation(); clearHistory(); }}
                className={`p-1.5 rounded-lg ${isDark ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "bg-red-50 text-red-400 hover:bg-red-100"}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {showHistory ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
          </div>
        </button>
        {showHistory && (
          <div className={`border-t ${isDark ? "border-white/8" : "border-slate-100"}`}>
            {history.length === 0 ? (
              <div className="p-8 text-center opacity-40 text-sm">
                Belum ada riwayat. Klik "Simpan Riwayat" untuk menyimpan analisa saat ini.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {history.map(entry => {
                  const hitCount = entry.hits.length;
                  const newDrawsSeen = entry.newDrawsSeen ?? 0;
                  const hitRate = newDrawsSeen > 0 ? Math.round((hitCount / newDrawsSeen) * 100) : null;
                  const hasWatermark = !!entry.watermark;
                  return (
                    <div key={entry.id} className="px-5 py-4 space-y-3">
                      {/* Entry header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-black text-sm">{entry.tanggal}</div>
                          <div className={`text-xs ${muted}`}>
                            Kill {entry.killed.length} → Hidup {entry.live.length} angka
                            {newDrawsSeen > 0 && (
                              <span className="ml-2 opacity-70">· {newDrawsSeen} draw dicek</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Hit rate badge */}
                          {hitRate !== null && (
                            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
                              hitRate >= 50
                                ? isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"
                                : hitRate >= 25
                                ? isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                                : isDark ? "bg-white/8 text-white/50" : "bg-slate-100 text-slate-500"
                            }`}>
                              {hitCount} hit / {newDrawsSeen} ({hitRate}%)
                            </span>
                          )}
                          {hitCount > 0 && hitRate === null && (
                            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"}`}>
                              {hitCount} HIT ✓
                            </span>
                          )}
                          {/* Update accuracy button */}
                          {hasWatermark && (
                            <button
                              onClick={() => updateAccuracy(entry.id)}
                              title="Perbarui akurasi dengan draw terbaru"
                              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-bold transition-all ${isDark ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}>
                              <Target className="w-3 h-3" />
                              Update
                            </button>
                          )}
                          <button onClick={() => deleteHistory(entry.id)}
                            className={`p-1.5 rounded-lg ${isDark ? "bg-white/5 hover:bg-red-500/15 text-white/30 hover:text-red-400" : "bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-400"}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Live numbers grid (colored by hit) */}
                      <div className="flex flex-wrap gap-1">
                        {entry.live.slice(0, 35).map(num => {
                          const isHit = entry.hits.includes(num);
                          return (
                            <span key={num} className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black ${
                              isHit
                                ? isDark ? "bg-green-500/25 text-green-400 ring-1 ring-green-500/40" : "bg-green-100 text-green-700 ring-1 ring-green-300"
                                : isDark ? "bg-white/5 text-white/50" : "bg-slate-100 text-slate-500"
                            }`}>{num}</span>
                          );
                        })}
                        {entry.live.length > 35 && (
                          <span className={`inline-flex items-center justify-center px-2 h-8 rounded-lg text-[10px] font-bold ${muted}`}>
                            +{entry.live.length - 35} lagi
                          </span>
                        )}
                      </div>

                      {/* Hit detail */}
                      {hitCount > 0 && (
                        <div className={`text-xs px-3 py-2 rounded-xl ${isDark ? "bg-green-500/10 text-green-400" : "bg-green-50 text-green-700"}`}>
                          🎯 Hit: <span className="font-black">{entry.hits.join(", ")}</span> muncul di draw setelah analisa
                        </div>
                      )}
                      {newDrawsSeen === 0 && hasWatermark && (
                        <div className={`text-xs px-3 py-2 rounded-xl ${isDark ? "bg-white/5 text-white/30" : "bg-slate-50 text-slate-400"}`}>
                          Belum ada draw baru sejak analisa disimpan. Klik "Update" setelah draw keluar.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
