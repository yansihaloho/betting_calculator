import React, { useEffect, useState, useCallback } from "react";
import { Tv, ExternalLink, Clock, Calendar, Radio, Play, Youtube, RefreshCw } from "lucide-react";

/* ─────────────── constants ─────────────── */
const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const HARI_ID  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

const JADWAL = [
  { label: "Tengah Malam", slot: "00:01", emoji: "🌙", query: "live toto macau 4d tengah malam" },
  { label: "Siang",        slot: "13:00", emoji: "☀️", query: "live toto macau 4d siang" },
  { label: "Sore",         slot: "16:00", emoji: "🌅", query: "live toto macau 4d sore" },
  { label: "Malam",        slot: "19:00", emoji: "🌆", query: "live toto macau 4d malam" },
  { label: "Malam Akhir",  slot: "22:00", emoji: "🌃", query: "live toto macau 4d malam akhir" },
  { label: "Dini Hari",    slot: "23:00", emoji: "🌠", query: "live toto macau 4d dini hari" },
] as const;

const PRE_SEC  = 15 * 60;
const POST_SEC = 90 * 60;

/* ─────────────── helpers ─────────────── */
function getWIBNow(): Date {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function slotDiffSec(slot: string): number {
  const now = getWIBNow();
  const [h, m] = slot.split(":").map(Number);
  const nowSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const tgtSec = h * 3600 + m * 60;
  let diff = tgtSec - nowSec;
  if (diff < -43200) diff += 86400;
  if (diff >  43200) diff -= 86400;
  return diff;
}

type SlotStatus = "live" | "upcoming" | "done";

function getSlotStatus(slot: string): SlotStatus {
  const diff = slotDiffSec(slot);
  if (diff >= -POST_SEC && diff <= PRE_SEC) return "live";
  if (diff > PRE_SEC) return "upcoming";
  return "done";
}

function msUntilSlot(slot: string): number {
  const diff = slotDiffSec(slot);
  return diff > 0 ? diff * 1000 : (diff + 86400) * 1000;
}

function formatCD(ms: number): string {
  const s  = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

function getTodayLabel(): string {
  const w = getWIBNow();
  return `${HARI_ID[w.getUTCDay()]}, ${w.getUTCDate()} ${BULAN_ID[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

function getActiveSlot() {
  return JADWAL.find(j => getSlotStatus(j.slot) === "live") ?? null;
}

function nextUpcomingSlot(): (typeof JADWAL)[number] | null {
  let best: (typeof JADWAL)[number] | null = null;
  let bestMs = Infinity;
  for (const j of JADWAL) {
    const diff = slotDiffSec(j.slot);
    if (diff > PRE_SEC) {
      const ms = diff * 1000;
      if (ms < bestMs) { bestMs = ms; best = j; }
    }
  }
  if (!best) {
    let minMs = Infinity;
    for (const j of JADWAL) {
      const ms = msUntilSlot(j.slot);
      if (ms < minMs) { minMs = ms; best = j; }
    }
  }
  return best;
}

/* build YouTube embed search URL */
function buildYTSearchEmbed(query: string, autoplay = false): string {
  const encoded = encodeURIComponent(query);
  const params = new URLSearchParams({
    listType: "search",
    list: query,
    autoplay: autoplay ? "1" : "0",
    mute: "0",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
  });
  return `https://www.youtube.com/embed?${params.toString()}`;
}

/* ─────────────── types ─────────────── */
type SourceId = "youtube" | "toto";

interface Source {
  id: SourceId;
  label: string;
  colorCls: string;
  activeCls: string;
}

const SOURCES: Source[] = [
  {
    id: "youtube",
    label: "YouTube Live",
    colorCls: "text-red-400",
    activeCls: "bg-red-600 text-white shadow-lg shadow-red-600/30",
  },
  {
    id: "toto",
    label: "TotoMacauNew",
    colorCls: "text-orange-400",
    activeCls: "bg-orange-500 text-white shadow-lg shadow-orange-500/30",
  },
];

/* ─────────────── main component ─────────────── */
interface Props {
  isDark: boolean;
  resultData: { tanggal: string; [slot: string]: string }[];
}

export default function LivePage({ isDark }: Props) {
  const [source, setSource]     = useState<SourceId>("youtube");
  const [tick, setTick]         = useState(0);
  const [ytQuery, setYtQuery]   = useState("live toto macau 4d");
  const [ytKey, setYtKey]       = useState(0);   // forces iframe remount on refresh
  const [iframeError, setErr]   = useState(false);

  const todayLabel   = getTodayLabel();
  const activeSlot   = getActiveSlot();
  const onAir        = activeSlot !== null;

  /* 1-second heartbeat */
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* auto-update YouTube query based on live slot */
  useEffect(() => {
    if (activeSlot) {
      const w = getWIBNow();
      const dateStr = `${w.getUTCDate()} ${BULAN_ID[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
      setYtQuery(`${activeSlot.query} ${dateStr}`);
    } else {
      setYtQuery("live toto macau 4d");
    }
  }, [activeSlot?.slot]);

  const handleRefresh = useCallback(() => {
    setErr(false);
    setYtKey(k => k + 1);
  }, []);

  const card = isDark ? "bg-slate-800/60 border-white/10" : "bg-white border-slate-200";

  return (
    <div className="animate-slide-up pb-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tv className={`w-5 h-5 ${isDark ? "text-white" : "text-slate-700"}`} />
          <span className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>
            Tonton LIVE
          </span>
          {onAir && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              LIVE
            </span>
          )}
        </div>
        <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{todayLabel}</span>
      </div>

      {/* ── Source tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {SOURCES.map(src => (
          <button
            key={src.id}
            onClick={() => { setSource(src.id); setErr(false); }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              source === src.id
                ? src.activeCls
                : isDark
                  ? "bg-white/10 text-white/60 hover:bg-white/15"
                  : "bg-slate-200 text-slate-500 hover:bg-slate-300"
            }`}
          >
            {src.label}
          </button>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

        {/* ── Video area ── */}
        <div className="flex flex-col rounded-2xl overflow-hidden border border-red-900/60"
             style={{ background: "linear-gradient(135deg,#1a0000 0%,#2d0808 60%,#1a0000 100%)" }}>

          <div className="relative aspect-video w-full bg-black">
            {source === "youtube" ? (
              <YouTubeEmbed
                key={`yt-${ytKey}-${ytQuery}`}
                query={ytQuery}
                onAir={onAir}
                onError={() => setErr(true)}
                hasError={iframeError}
                onRefresh={handleRefresh}
                isDark={isDark}
              />
            ) : (
              <TotoEmbed isDark={isDark} />
            )}
          </div>

          {/* bottom bar */}
          <div className="flex items-center justify-between px-4 py-2 text-xs border-t border-red-900/40">
            <div className="flex items-center gap-2">
              {source === "youtube" ? (
                <>
                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-white/40">
                    {onAir ? `Pencarian: "${ytQuery}"` : "YouTube Live — Toto Macau 4D"}
                  </span>
                </>
              ) : (
                <span className="text-white/40">totomacaunew.us</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {source === "youtube" && (
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
                  title="Refresh video"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="text-[11px]">Refresh</span>
                </button>
              )}
              <a
                href={source === "youtube"
                  ? `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}&sp=EgJAAQ%3D%3D`
                  : "https://totomacaunew.us/video.php"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-orange-400 hover:text-orange-300 font-medium transition-colors"
              >
                Buka di tab baru <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-3">

          {/* Status Siaran */}
          <div className={`rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${onAir ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
              <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Status Siaran</span>
            </div>
            {onAir && activeSlot ? (
              <div className="rounded-xl bg-green-500/15 border border-green-500/30 px-3 py-2 text-center">
                <span className="text-green-400 font-black text-sm animate-pulse">● SEDANG ON AIR</span>
                <p className={`text-xs font-bold mt-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                  {activeSlot.emoji} {activeSlot.label} · {activeSlot.slot} WIB
                </p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-white/40" : "text-slate-500"}`}>
                  Live stream sedang berlangsung
                </p>
              </div>
            ) : (
              (() => {
                const next = nextUpcomingSlot();
                const ms   = next ? msUntilSlot(next.slot) : 0;
                return (
                  <div className="rounded-xl bg-slate-500/10 border border-slate-500/20 px-3 py-2 text-center">
                    <span className={`font-bold text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>Off Air — Berikutnya:</span>
                    {next && (
                      <>
                        <p className={`font-black text-sm mt-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                          {next.emoji} {next.label} · {next.slot} WIB
                        </p>
                        <p className="text-red-400 font-black text-lg tabular-nums mt-1">{formatCD(ms)}</p>
                      </>
                    )}
                  </div>
                );
              })()
            )}
          </div>

          {/* Jadwal Siaran */}
          <div className={`rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-yellow-400" />
              <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                Jadwal Siaran
              </span>
              <span className={`text-[10px] ml-auto ${isDark ? "text-white/30" : "text-slate-400"}`}>
                Setiap Hari · WIB
              </span>
            </div>
            <div className="space-y-1.5">
              {JADWAL.map((j) => {
                const status = getSlotStatus(j.slot);
                const ms     = msUntilSlot(j.slot);
                return (
                  <div key={j.slot} className={`rounded-xl px-3 py-2.5 border transition-all ${
                    status === "live"
                      ? isDark
                        ? "bg-red-500/15 border-red-500/40"
                        : "bg-red-50 border-red-200"
                      : status === "upcoming"
                        ? isDark
                          ? "bg-white/5 border-white/10"
                          : "bg-slate-50 border-slate-100"
                        : isDark
                          ? "bg-white/[0.02] border-white/5 opacity-50"
                          : "bg-slate-50/50 border-slate-100 opacity-50"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{j.emoji}</span>
                        <span className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-700"}`}>
                          {j.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className={`w-3 h-3 ${status === "live" ? "text-red-400" : isDark ? "text-white/30" : "text-slate-400"}`} />
                        <span className={`text-xs font-black tabular-nums ${
                          status === "live" ? "text-red-400" : isDark ? "text-white/60" : "text-slate-600"
                        }`}>
                          {j.slot}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1">
                      {status === "live" ? (
                        <span className="text-[10px] font-black text-red-400 animate-pulse">● SEDANG LIVE</span>
                      ) : status === "upcoming" ? (
                        <span className={`text-[10px] font-medium tabular-nums ${isDark ? "text-white/40" : "text-slate-400"}`}>
                          Mulai dalam{" "}
                          <span className={`font-black ${isDark ? "text-red-400" : "text-red-500"}`}>{formatCD(ms)}</span>
                        </span>
                      ) : (
                        <span className={`text-[10px] ${isDark ? "text-white/25" : "text-slate-300"}`}>Selesai</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─────────────── YouTube Embed ─────────────── */
function YouTubeEmbed({
  query, onAir, onError, hasError, onRefresh, isDark,
}: {
  query: string;
  onAir: boolean;
  onError: () => void;
  hasError: boolean;
  onRefresh: () => void;
  isDark: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const embedUrl = buildYTSearchEmbed(query, false);

  if (hasError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
        <Youtube className="w-12 h-12 text-red-500/40" />
        <p className="text-white/40 text-sm text-center px-4">
          YouTube tidak dapat dimuat.<br />
          <span className="text-white/25 text-xs">Mungkin diblokir oleh browser atau jaringan.</span>
        </p>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Coba Lagi
          </button>
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgJAAQ%3D%3D`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Buka YouTube
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-10">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-xl shadow-red-700/50">
              <Youtube className="w-8 h-8 text-white" />
            </div>
            <span className="absolute inset-0 rounded-full border-2 border-red-500/40 animate-ping" />
          </div>
          <p className="text-white font-black text-lg">YouTube Live</p>
          <p className="text-white/50 text-sm">Toto Macau 4D</p>
          {onAir && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-300 text-xs font-bold">Memuat live stream...</span>
            </div>
          )}
          <p className="text-white/25 text-[11px] px-6 text-center max-w-xs">
            Mencari: "{query}"
          </p>
        </div>
      )}
      <iframe
        src={embedUrl}
        className="absolute inset-0 w-full h-full border-0"
        title="YouTube Live Toto Macau 4D"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        onError={onError}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </>
  );
}

/* ─────────────── TotoMacauNew Embed ─────────────── */
function TotoEmbed({ isDark }: { isDark: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
        <Radio className="w-12 h-12 text-orange-500/40" />
        <p className="text-white/40 text-sm text-center px-4">
          TotoMacauNew tidak dapat dimuat sebagai embed.
        </p>
        <a
          href="https://totomacaunew.us/video.php"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-orange-700/40"
        >
          <Play className="w-4 h-4 fill-white" />
          Buka TotoMacauNew
        </a>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-10">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center shadow-xl shadow-orange-700/50">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <span className="absolute inset-0 rounded-full border-2 border-orange-500/40 animate-ping" />
          </div>
          <p className="text-white font-black text-lg">TotoMacauNew</p>
          <p className="text-white/50 text-sm">Memuat live stream...</p>
        </div>
      )}
      <iframe
        src="https://totomacaunew.us/video.php"
        className="absolute inset-0 w-full h-full border-0"
        title="TotoMacauNew Live"
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  );
}
