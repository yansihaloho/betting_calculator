import { useMemo, useState, useEffect } from "react";
import {
  Trash2, RefreshCw, Copy, CheckCircle2, Clock,
  TrendingUp, BookOpen, Eye, EyeOff, Flame,
} from "lucide-react";
import { toast } from "sonner";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

function extractTengah2D(resultData: ResultRow[]): { num: string; tanggal: string; slot: string }[] {
  const out: { num: string; tanggal: string; slot: string }[] = [];
  for (const row of resultData) {
    for (const slot of [...TIME_SLOTS].reverse()) {
      const v = String(row[slot] || "");
      if (/^\d{4}$/.test(v)) {
        out.push({ num: v.slice(1, 3), tanggal: row.tanggal, slot });
      }
    }
  }
  return out;
}

function copyText(t: string) {
  try { navigator.clipboard.writeText(t); return true; } catch { return false; }
}

interface HistoryEntry {
  id: string; tanggal: string; killed: string[]; live: string[];
  nextDraws: string[]; hits: string[]; watermark?: string; newDrawsSeen?: number;
}

const LS_KEY = "2d_tengah_history";
function loadHistory(): HistoryEntry[] { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; } }
function saveHistory(h: HistoryEntry[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(h)); } catch {} }

interface Props { resultData: ResultRow[]; isDark: boolean }

export default function TwoDTengahPage({ resultData, isDark }: Props) {
  const [killCount, setKillCount] = useState(30);
  const [mode, setMode] = useState<"recency" | "frequency" | "hybrid">("hybrid");
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [showKilled, setShowKilled] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");

  const card = isDark ? "bg-slate-800/70 border border-white/8 rounded-2xl" : "bg-white border border-slate-200 rounded-2xl shadow-sm";
  const muted = isDark ? "text-white/50" : "text-slate-400";
  const sub = isDark ? "bg-white/5" : "bg-slate-50";

  const allTengah = useMemo(() => extractTengah2D(resultData), [resultData]);

  const analysis = useMemo(() => {
    const freq = new Array(100).fill(0).map((_, i) => ({ num: String(i).padStart(2, "0"), freq: 0, lastPos: 9999, score: 0 }));
    allTengah.forEach((e, pos) => {
      const idx = parseInt(e.num);
      if (idx < 0 || idx > 99 || isNaN(idx)) return;
      freq[idx].freq++;
      if (pos < freq[idx].lastPos) freq[idx].lastPos = pos;
    });
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
    const liveWithStats = live.map(num => {
      const f = freq.find(x => x.num === num)!;
      return { num, freq: f.freq, lastPos: f.lastPos };
    }).sort((a, b) => b.freq - a.freq);
    const recent = allTengah.slice(0, 30).map(e => e.num);
    return { killed, live, liveWithStats, freq, recent };
  }, [allTengah, killCount, mode]);

  function doCopy(text: string, key: string) {
    if (copyText(text)) { setCopied(key); toast.success("Dicopy!"); setTimeout(() => setCopied(null), 2000); }
  }

  function buildWatermark(tengah: typeof allTengah): string {
    if (!tengah.length) return "";
    const e = tengah[0];
    return `${e.tanggal}|${e.slot}|${e.num}`;
  }
  function findWatermarkIdx(tengah: typeof allTengah, wm: string): number {
    return tengah.findIndex(e => `${e.tanggal}|${e.slot}|${e.num}` === wm);
  }
  function computeHitsFromWatermark(entry: HistoryEntry, tengah: typeof allTengah): { hits: string[]; newDrawsSeen: number } {
    if (!entry.watermark) return { hits: entry.hits, newDrawsSeen: 0 };
    const wmIdx = findWatermarkIdx(tengah, entry.watermark);
    const newDraws = wmIdx > 0 ? tengah.slice(0, wmIdx).map(e => e.num) : [];
    const hits = newDraws.filter(n => entry.live.includes(n));
    return { hits, newDrawsSeen: newDraws.length };
  }
  function saveToHistory() {
    const wm = buildWatermark(allTengah);
    const entry: HistoryEntry = {
      id: Date.now().toString(), tanggal: new Date().toLocaleString("id-ID"),
      killed: analysis.killed, live: analysis.live, nextDraws: [], hits: [],
      watermark: wm, newDrawsSeen: 0,
    };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated); saveHistory(updated); toast.success("Disimpan ke riwayat!");
  }
  function updateAccuracy(id: string) {
    const updated = history.map(entry => {
      if (entry.id !== id) return entry;
      const { hits, newDrawsSeen } = computeHitsFromWatermark(entry, allTengah);
      return { ...entry, hits, newDrawsSeen };
    });
    setHistory(updated); saveHistory(updated);
    const entry = updated.find(e => e.id === id);
    if (entry) toast.success(`Akurasi diperbarui — ${entry.newDrawsSeen ?? 0} draw baru, ${entry.hits.length} hit`);
  }
  function updateAllAccuracy() {
    const updated = history.map(entry => {
      if (!entry.watermark) return entry;
      const { hits, newDrawsSeen } = computeHitsFromWatermark(entry, allTengah);
      return { ...entry, hits, newDrawsSeen };
    });
    setHistory(updated); saveHistory(updated);
  }
  useEffect(() => {
    if (history.length === 0) return;
    updateAllAccuracy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTengah]);
  function deleteHistory(id: string) {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated); saveHistory(updated); toast.success("Riwayat dihapus");
  }
  function clearHistory() {
    if (!confirm("Hapus semua riwayat?")) return;
    setHistory([]); saveHistory([]); toast.success("Semua riwayat dihapus");
  }

  const NumCell = ({ num, status }: { num: string; status: "live" | "killed" }) => {
    const isRecentHit = analysis.recent.slice(0, 10).includes(num);
    return (
      <div className={`flex items-center justify-center rounded-xl text-xs font-black aspect-square min-w-0
        ${status === "killed"
          ? isDark ? "bg-red-900/30 text-red-400/60 line-through ring-1 ring-red-500/20" : "bg-red-50 text-red-300 line-through ring-1 ring-red-200"
          : isRecentHit
          ? isDark ? "bg-gradient-to-br from-purple-500/30 to-violet-600/30 text-purple-400 ring-1 ring-purple-500/40" : "bg-purple-100 text-purple-700 ring-1 ring-purple-300"
          : isDark ? "bg-white/8 text-white/80 hover:bg-white/12 ring-1 ring-white/5" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
        } transition-all cursor-default select-none`}>
        {num}
      </div>
    );
  };

  return (
    <div className="animate-slide-up space-y-4 pb-8">
      <div className="rounded-[22px] bg-gradient-to-r from-purple-700 via-violet-700 to-indigo-700 text-white p-4 md:p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black">2D Tengah</h1>
            <p className="opacity-70 text-xs mt-0.5">Kill {killCount} angka mati → {100 - killCount} angka hidup (digit KOP+KEPALA, posisi 2–3)</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={saveToHistory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
              <BookOpen className="w-3.5 h-3.5" />Simpan Riwayat
            </button>
            <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />Riwayat ({history.length})
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Kill:</span>
            {[20, 25, 30, 35, 40].map(v => (
              <button key={v} onClick={() => setKillCount(v)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${killCount === v ? "bg-white text-purple-700" : "bg-white/20 hover:bg-white/30"}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70">Mode:</span>
            {([["hybrid", "Hybrid"], ["recency", "Recency"], ["frequency", "Frekuensi"]] as const).map(([val, lbl]) => (
              <button key={val} onClick={() => setMode(val)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${mode === val ? "bg-white text-purple-700" : "bg-white/20 hover:bg-white/30"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">✅ Hidup: {100 - killCount} angka</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">❌ Mati: {killCount} angka</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">📊 Data: {allTengah.length} draw</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15">🟣 = keluar 10 draw terakhir</span>
        </div>
      </div>

      <div className={card}>
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? "border-white/8" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setActiveTab("grid")} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "grid" ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-800" : `${muted} hover:opacity-80`}`}>Grid</button>
            <button onClick={() => setActiveTab("list")} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === "list" ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-800" : `${muted} hover:opacity-80`}`}>Daftar</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowKilled(v => !v)} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
              {showKilled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKilled ? "Sembunyikan" : "Tampilkan"} Mati
            </button>
            <button onClick={() => doCopy(analysis.live.join(", "), "live")} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl transition-all ${isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-100 hover:bg-slate-200"}`}>
              {copied === "live" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              Copy {100 - killCount} Angka
            </button>
          </div>
        </div>
        {activeTab === "grid" ? (
          <div className="p-5 space-y-4">
            <div>
              <div className={`text-xs font-black mb-2 flex items-center gap-2 ${isDark ? "text-purple-400" : "text-purple-600"}`}>
                <Flame className="w-3.5 h-3.5" />ANGKA HIDUP ({100 - killCount})
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")).map(num => {
                  const isLive = analysis.live.includes(num);
                  return <NumCell key={num} num={num} status={isLive ? "live" : "killed"} />;
                })}
              </div>
            </div>
            {showKilled && (
              <div>
                <div className="text-xs font-black mb-2 flex items-center gap-2 text-red-400">ANGKA MATI ({killCount})</div>
                <div className="grid grid-cols-10 gap-1">
                  {analysis.killed.map(num => <NumCell key={num} num={num} status="killed" />)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5">
            <div className={`text-xs font-black mb-3 ${isDark ? "text-purple-400" : "text-purple-600"}`}>TOP 20 ANGKA HIDUP (by frekuensi)</div>
            <div className="space-y-2">
              {analysis.liveWithStats.slice(0, 20).map((item, idx) => (
                <div key={item.num} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${sub}`}>
                  <span className={`text-xs font-black w-5 text-center ${muted}`}>#{idx + 1}</span>
                  <span className="font-black text-lg font-mono w-10">{item.num}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-500" style={{ width: `${Math.min((item.freq / (analysis.liveWithStats[0]?.freq || 1)) * 100, 100)}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${muted}`}>{item.freq}×</span>
                  <span className={`text-xs ${muted}`}>{item.lastPos === 9999 ? "–" : `#${item.lastPos + 1}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={card}>
        <div className={`flex items-center gap-2 px-5 py-4 border-b ${isDark ? "border-white/8" : "border-slate-100"}`}>
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <span className="font-black text-sm">15 Draw Terakhir (Tengah 2D)</span>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-2">
          {allTengah.slice(0, 15).map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className={`px-2.5 py-1.5 rounded-xl text-sm font-black font-mono ${
                analysis.live.includes(e.num)
                  ? isDark ? "bg-purple-500/25 text-purple-300 ring-1 ring-purple-500/40" : "bg-purple-100 text-purple-700 ring-1 ring-purple-300"
                  : isDark ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/20" : "bg-red-50 text-red-400 ring-1 ring-red-200"
              }`}>{e.num}</span>
              <span className={`text-[9px] ${muted}`}>{e.slot}</span>
            </div>
          ))}
        </div>
      </div>

      {showHistory && (
        <div className={card}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/8" : "border-slate-100"}`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="font-black text-sm">Riwayat Simpan</span>
            </div>
            {history.length > 0 && (
              <button onClick={clearHistory} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg transition-all">
                <Trash2 className="w-3.5 h-3.5" />Hapus Semua
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className={`p-8 text-center text-sm ${muted}`}>Belum ada riwayat.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {history.map(entry => {
                const hitRate = entry.newDrawsSeen && entry.newDrawsSeen > 0 ? Math.round((entry.hits.length / entry.newDrawsSeen) * 100) : null;
                const hitColor = hitRate === null ? muted : hitRate >= 50 ? "text-green-400" : hitRate >= 25 ? "text-yellow-400" : muted;
                return (
                  <div key={entry.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold">{entry.tanggal}</div>
                        <div className={`text-[11px] ${muted}`}>Hidup: {entry.live.length} | Mati: {entry.killed.length}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hitRate !== null && <span className={`text-xs font-black ${hitColor}`}>{entry.hits.length} hit / {entry.newDrawsSeen} ({hitRate}%)</span>}
                        <button onClick={() => updateAccuracy(entry.id)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"} transition-all`}>
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteHistory(entry.id)} className="p-1.5 rounded-lg text-red-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {entry.live.slice(0, 30).map(n => (
                        <span key={n} className={`px-2 py-0.5 rounded-lg text-xs font-bold ${entry.hits.includes(n) ? "bg-green-500/25 text-green-400 ring-1 ring-green-500/40" : isDark ? "bg-white/8" : "bg-slate-100"}`}>{n}</span>
                      ))}
                      {entry.live.length > 30 && <span className={`text-xs ${muted}`}>+{entry.live.length - 30} lagi</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
