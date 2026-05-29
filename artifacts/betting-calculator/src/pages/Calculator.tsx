import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";

import SaldoPage from "./SaldoPage";
import {
  Sun, Moon, Download, Copy, RotateCcw, Trash2, RefreshCw,
  TrendingUp, TrendingDown, HelpCircle, User, Bell, X, CheckCircle,
  AlertCircle, BarChart2, FileText, Target, Wallet, Award, Info, Menu,
  Cloud, CloudOff, CloudUpload, CloudDownload, Database, KeyRound, Github,
  Settings, Save, Loader2, Wifi, WifiOff, Timer, Edit3, Shield, Flame,
  Snowflake, PenLine, PlusCircle, Zap, Star, Upload, BellRing, CalendarDays,
  Undo2, Banknote, Hash, CheckCircle2, XCircle
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { toast } from "sonner";

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_NUMBERS =
  "05*06*07*08*09*14*15*16*17*18*23*24*25*26*27*32*33*34*35*36*41*42*43*44*45*50*51*52*53*54*59*60*61*62*63*68*69*70*71*72*77*78*79*80*81*86*87*88*89*90*95*96*97*98*99";
const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const DB_VERSION = "v6";

const FALLBACK_RESULTS = [
  { hari:"Rabu",   tanggal:"27 Mei 2026", "00:01":"8765","13:00":"0040","16:00":"0773","19:00":"3940","22:00":"0981","23:00":"-" },
  { hari:"Selasa", tanggal:"26 Mei 2026", "00:01":"3318","13:00":"3678","16:00":"2784","19:00":"5665","22:00":"1067","23:00":"2792" },
  { hari:"Senin",  tanggal:"25 Mei 2026", "00:01":"9872","13:00":"6178","16:00":"6951","19:00":"1364","22:00":"5589","23:00":"5869" },
  { hari:"Minggu", tanggal:"24 Mei 2026", "00:01":"8997","13:00":"2437","16:00":"5320","19:00":"5184","22:00":"1312","23:00":"7645" },
  { hari:"Sabtu",  tanggal:"23 Mei 2026", "00:01":"5502","13:00":"9404","16:00":"6643","19:00":"8672","22:00":"3935","23:00":"5644" },
  { hari:"Jumat",  tanggal:"22 Mei 2026", "00:01":"3707","13:00":"1030","16:00":"8200","19:00":"8722","22:00":"3681","23:00":"4578" },
  { hari:"Kamis",  tanggal:"21 Mei 2026", "00:01":"7096","13:00":"1109","16:00":"1036","19:00":"4522","22:00":"1284","23:00":"2513" },
];

// ─── Sohokartu Scraper ────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const HARI_ID = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function hourToSlot(h: number): string | null {
  if (h === 0) return "00:01";
  if (h === 13) return "13:00";
  if (h === 16) return "16:00";
  if (h === 19) return "19:00";
  if (h === 22) return "22:00";
  if (h === 23) return "23:00";
  return null;
}

function parseTotoMacauHTML(html: string): ResultRow[] | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Find table that contains "Toto Macau" heading
    let targetTable: Element | null = null;
    const allText = Array.from(doc.querySelectorAll("h2,h3,h4,b,strong,p,div,td,th,span"));
    for (const el of allText) {
      const txt = el.textContent || "";
      if (txt.includes("Toto Macau") && txt.includes("4D")) {
        // Walk siblings/parents to find the next table
        const findTable = (node: Element | null): Element | null => {
          if (!node) return null;
          let cur: Element | null = node;
          while (cur) {
            if (cur.tagName === "TABLE") return cur;
            const t = cur.querySelector("table");
            if (t) return t;
            cur = cur.nextElementSibling;
          }
          return null;
        };
        targetTable = findTable(el.nextElementSibling) ||
          findTable(el.parentElement?.nextElementSibling ?? null) ||
          findTable(el.parentElement?.parentElement?.nextElementSibling ?? null);
        if (targetTable) break;
      }
    }

    // Fallback: use any table with Tanggal/Periode/Angka headers
    if (!targetTable) {
      for (const table of doc.querySelectorAll("table")) {
        const headers = table.querySelector("tr")?.textContent || "";
        if (headers.includes("Tanggal") && headers.includes("Angka")) {
          targetTable = table;
          break;
        }
      }
    }

    if (!targetTable) return null;

    const entries: { date: string; hour: number; angka: string }[] = [];
    for (const row of targetTable.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) continue;
      const tanggalText = cells[0].textContent?.trim() || "";
      const angka = cells[2].textContent?.trim() || "";
      if (!angka || !/^\d{4}$/.test(angka)) continue;
      const m = tanggalText.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
      if (!m) continue;
      const [, yr, mo, dy, hh] = m;
      entries.push({ date: `${yr}-${mo}-${dy}`, hour: parseInt(hh), angka });
    }

    if (entries.length === 0) return null;

    const byDate: Record<string, Record<string, string>> = {};
    for (const e of entries) {
      const slot = hourToSlot(e.hour);
      if (!slot) continue;
      if (!byDate[e.date]) byDate[e.date] = {};
      if (!byDate[e.date][slot]) byDate[e.date][slot] = e.angka;
    }

    return Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([dateKey, slots]) => {
        const d = new Date(dateKey + "T00:00:00+07:00");
        const hari = HARI_ID[d.getDay()];
        const [, mo, dy] = dateKey.split("-");
        const tanggal = `${parseInt(dy)} ${BULAN_ID[parseInt(mo) - 1]} ${d.getFullYear()}`;
        return {
          hari, tanggal,
          "00:01": slots["00:01"] || "-",
          "13:00": slots["13:00"] || "-",
          "16:00": slots["16:00"] || "-",
          "19:00": slots["19:00"] || "-",
          "22:00": slots["22:00"] || "-",
          "23:00": slots["23:00"] || "-",
        };
      });
  } catch { return null; }
}

async function fetchSohokartuResults(): Promise<ResultRow[] | null> {
  try {
    const res = await fetch("/api/results/toto-macau", {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.results && Array.isArray(json.results) && json.results.length > 0) {
      return json.results as ResultRow[];
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Next slot countdown helper ───────────────────────────────────────────────
function getNextSlotDate(): Date {
  const now = new Date();
  const d = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  const slots = [d(0,1), d(13,0), d(16,0), d(19,0), d(22,0), d(23,0)];
  const next = slots.find(s => s > now);
  if (next) return next;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1);
}

function getNextSlotLabel(): string {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  if (h < 0 || (h === 0 && m < 1)) return "00:01";
  if (h < 13) return "13:00";
  if (h < 16) return "16:00";
  if (h < 19) return "19:00";
  if (h < 22) return "22:00";
  if (h < 23) return "23:00";
  return "00:01 (besok)";
}

// ─── Check if angka matches nomor taruhan ─────────────────────────────────────
function isNomorMenang(angka: string, nomorList: string): boolean {
  if (!angka || angka === "-" || angka.length !== 4) return false;
  const firstTwo = angka.slice(0, 2); // 2D depan
  return nomorList.split(/[* ,]+/).some(n => n.trim() === firstTwo);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MenuItem = "kalkulator" | "laporan" | "result" | "statistik" | "saldo";
interface PutaranData { putaran:number; taruhan:number; modal:number; akumulasi:number; hadiah:number; profit:number; }
type SyncStatus = "idle" | "loading" | "saving" | "synced" | "error" | "offline";
type ResultSource = "live" | "lokal" | "loading";

interface Histori {
  id: string; tanggal: string; hasil: "MENANG" | "KALAH";
  putaran: number; profit: number; rugi: number;
  taruhanAwal: number; pengali: number;
}
interface LaporanRow {
  tanggal: string; keterangan: string; total: number;
  [key: string]: string | number;
}
interface Profile { nama: string; email: string; }
interface Notif  { id: string; pesan: string; waktu: string; terbaca: boolean; }
interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}
interface AppData {
  histori: Histori[];
  laporan: LaporanRow[];
  saldo: number;
  taruhanAwal: number;
  jumlahPutaran: number;
  targetProfit: number;
  pengaliMenang: number;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRupiah(v: number) { return new Intl.NumberFormat("id-ID").format(v || 0); }

function getCurrentSlot() {
  const h = new Date().getHours();
  if (h >= 23) return "23:00";
  if (h >= 22) return "22:00";
  if (h >= 19) return "19:00";
  if (h >= 16) return "16:00";
  if (h >= 13) return "13:00";
  return "00:01";
}

function copyText(text: string) {
  try {
    if (navigator.clipboard) { navigator.clipboard.writeText(text); return true; }
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.left = "-9999px";
    document.body.appendChild(el); el.focus(); el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el); return ok;
  } catch { return false; }
}

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── GitHub Database Engine ───────────────────────────────────────────────────
class GithubDB {
  private cfg: GithubConfig;
  private apiBase: string;
  private headers: Record<string, string>;

  constructor(cfg: GithubConfig) {
    this.cfg = cfg;
    this.apiBase = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
    this.headers = {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "strategi-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  isConfigured() {
    return !!(this.cfg.token && this.cfg.owner && this.cfg.repo && this.cfg.filePath);
  }

  async load(): Promise<{ data: AppData | null; sha: string }> {
    const url = `${this.apiBase}/contents/${this.cfg.filePath}?ref=${this.cfg.branch}`;
    const res = await fetch(url, { headers: this.headers });
    if (res.status === 404) return { data: null, sha: "" };
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const sha: string = json.sha || "";
    const content = JSON.parse(atob(json.content.replace(/\n/g, "")));
    return { data: content as AppData, sha };
  }

  async save(data: AppData, sha: string): Promise<string> {
    const url = `${this.apiBase}/contents/${this.cfg.filePath}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body: Record<string, unknown> = {
      message: `📊 Sync data ${new Date().toLocaleString("id-ID")}`,
      content,
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT", headers: this.headers, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub save error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.content?.sha || json.commit?.sha || "";
  }

  async testConnection(): Promise<boolean> {
    const url = `${this.apiBase}`;
    const res = await fetch(url, { headers: this.headers });
    return res.ok;
  }
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
function playTone(freq: number, duration: number, vol = 0.35, type: OscillatorType = "sine") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch { /* unsupported */ }
}

function playArpeggio(freqs: number[], step: number, vol = 0.35) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, step * 0.9, vol), i * step * 1000));
}

function playAlarm15() {
  // Friendly 3-note ascending arpeggio
  playArpeggio([523, 659, 784], 0.22, 0.35);
}

function playAlarm5() {
  // Urgent 3x double-beep
  [0, 350, 700].forEach(offset =>
    setTimeout(() => {
      playTone(880, 0.12, 0.5, "square");
      setTimeout(() => playTone(1046, 0.12, 0.5, "square"), 150);
    }, offset)
  );
}

function playTickSound() {
  playTone(800, 0.03, 0.18, "sine");
}

// ─── CountdownWidget ──────────────────────────────────────────────────────────
function CountdownWidget({ isDark, soundEnabled = false }: { isDark: boolean; soundEnabled?: boolean }) {
  const [remaining, setRemaining] = useState("");
  const [nextLabel, setNextLabel] = useState("");
  const [diffMs, setDiffMs] = useState(Infinity);
  const lastTickSecRef = useRef(-1);

  useEffect(() => {
    const update = () => {
      const next = getNextSlotDate();
      const label = getNextSlotLabel();
      const diff = next.getTime() - Date.now();
      setDiffMs(diff);
      setNextLabel(label);
      if (diff <= 0) { setRemaining("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);

      // Tick sounds when countdown is close
      if (soundEnabled && diff <= 60000) {
        const secLeft = Math.ceil(diff / 1000);
        if (secLeft !== lastTickSecRef.current) {
          lastTickSecRef.current = secLeft;
          if (secLeft <= 10) {
            // Every second — distinct rising pitch
            playTone(400 + secLeft * 60, 0.08, 0.25, "sine");
          } else if (secLeft % 5 === 0) {
            // Every 5 seconds — soft tick
            playTickSound();
          }
        }
      }
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [soundEnabled]);

  const isUrgent = diffMs <= 60000;
  const isVeryUrgent = diffMs <= 10000;

  return (
    <div className={`hidden md:flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-bold cursor-default transition-all ${
      isVeryUrgent ? "bg-red-500/30 border border-red-500/50 text-red-300 animate-pulse" :
      isUrgent ? "bg-orange-500/20 border border-orange-500/40 text-orange-300" :
      isDark ? "bg-blue-500/15 border border-blue-500/30 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-600"
    }`} title={`Next slot: ${nextLabel}`}>
      <div className="text-[8px] opacity-60 leading-none">NEXT {nextLabel}</div>
      <div className={`tabular-nums tracking-wider leading-tight ${isUrgent ? "scale-110" : ""}`}>{remaining || "..."}</div>
    </div>
  );
}

// ─── DrawSchedulePanel ────────────────────────────────────────────────────────
const DRAW_SLOTS_WIB = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const DRAW_SLOT_MINUTES: Record<string, number> = {
  "00:01": 1, "13:00": 780, "16:00": 960, "19:00": 1140, "22:00": 1320, "23:00": 1380,
};

function getWibMinutes(): number {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 420) % 1440;
}

function DrawSchedulePanel({ isDark }: { isDark: boolean }) {
  const [remaining, setRemaining] = useState("");
  const [nextSlot, setNextSlot]   = useState("");
  const [diffMs, setDiffMs]       = useState(Infinity);
  const [wibNow, setWibNow]       = useState(0);

  useEffect(() => {
    const update = () => {
      const wib = getWibMinutes();
      setWibNow(wib);
      const next = getNextSlotDate();
      const label = getNextSlotLabel().replace(" (besok)", "");
      setNextSlot(label);
      const diff = next.getTime() - Date.now();
      setDiffMs(diff);
      if (diff <= 0) { setRemaining("00:00:00"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  const isUrgent     = diffMs <= 5 * 60_000;
  const isVeryUrgent = diffMs <= 60_000;

  const countdownColor = isVeryUrgent
    ? "text-red-400" : isUrgent
    ? "text-orange-400" : isDark ? "text-blue-300" : "text-blue-600";

  const countdownBg = isVeryUrgent
    ? "bg-red-500/20 border-red-500/40" : isUrgent
    ? "bg-orange-500/15 border-orange-400/30" : isDark
    ? "bg-blue-500/15 border-blue-500/30" : "bg-blue-50 border-blue-200";

  return (
    <div className={`rounded-2xl p-4 ${isDark ? "bg-white/5 border border-white/10" : "bg-white border border-slate-200"} shadow-sm`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Countdown block */}
        <div className={`flex flex-col items-center justify-center px-5 py-3 rounded-xl border min-w-[140px] ${countdownBg} ${isVeryUrgent ? "animate-pulse" : ""}`}>
          <div className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-white/50" : "text-slate-500"}`}>Draw berikutnya</div>
          <div className={`text-2xl font-black tabular-nums tracking-wider mt-1 ${countdownColor}`}>{remaining || "…"}</div>
          <div className={`text-[11px] font-bold mt-0.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>{nextSlot} WIB</div>
        </div>

        {/* Slot pills */}
        <div className="flex flex-wrap gap-2">
          {DRAW_SLOTS_WIB.map(slot => {
            const slotMin   = DRAW_SLOT_MINUTES[slot];
            const isPast    = wibNow > slotMin;
            const isNext    = slot === nextSlot;
            return (
              <div key={slot} className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                isNext
                  ? isVeryUrgent
                    ? "bg-red-500/25 border-red-400/50 text-red-300 scale-110 animate-pulse"
                    : isUrgent
                      ? "bg-orange-500/20 border-orange-400/40 text-orange-300 scale-105"
                      : "bg-green-500/20 border-green-400/40 text-green-300 scale-105"
                  : isPast
                    ? isDark ? "bg-white/5 border-white/10 text-white/30" : "bg-slate-100 border-slate-200 text-slate-400"
                    : isDark ? "bg-white/8 border-white/15 text-white/50" : "bg-slate-50 border-slate-200 text-slate-500"
              }`}>
                <span className="tracking-wider">{slot}</span>
                <span className="text-[9px] font-normal mt-0.5 opacity-75 leading-none">
                  {isNext ? "⟳ berikutnya" : isPast ? "✓ selesai" : "· menunggu"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Calculator({ theme, toggleTheme }: { theme: "dark"|"light"; toggleTheme: () => void }) {
  const isDark = theme === "dark";

  // ── Main state ──────────────────────────────────────────────────────────────
  const [menu, setMenu]                     = useState<MenuItem>("kalkulator");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [taruhanAwal, setTaruhanAwal]       = useState(500);
  const [jumlahPutaran, setJumlahPutaran]   = useState(6);
  const [targetProfit, setTargetProfit]     = useState(20000);
  const [pengaliMenang, setPengaliMenang]   = useState(95);
  const [saldo, setSaldo]                   = useState(2000000);
  const [histori, setHistori]               = useState<Histori[]>([]);
  const [laporan, setLaporan]               = useState<LaporanRow[]>([]);
  const [sesiSelesai, setSesiSelesai]       = useState<boolean>(() => ls("resumeSesiSelesai", false));
  const [putaranAktif, setPutaranAktif]     = useState<number>(() => ls("resumePutaranAktif", 1));
  const [processing, setProcessing]         = useState(false);
  const [putaranMenang, setPutaranMenang]   = useState<number | null>(() => ls("resumePutaranMenang", null));
  const [searchResult, setSearchResult]     = useState("");
  const [selectedMonth, setSelectedMonth]   = useState<string>("");
  const [autoRefresh, setAutoRefresh]       = useState(true);
  const [lastRefresh, setLastRefresh]       = useState(new Date());
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [resultData, setResultData]         = useState(FALLBACK_RESULTS);
  const [errors, setErrors]                 = useState<Record<string, string>>({});

  // ── GitHub sync state ────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus]         = useState<SyncStatus>("idle");
  const [lastSynced, setLastSynced]         = useState<Date | null>(null);
  const [fileSha, setFileSha]               = useState("");
  const [githubCfg, setGithubCfg]          = useState<GithubConfig>(() =>
    ls("gh_cfg", { token: "", owner: "yansihaloho", repo: "betting_calculator", branch: "main", filePath: "data/strategi_db.json" })
  );
  const [cfgEdit, setCfgEdit]              = useState<GithubConfig>(githubCfg);
  const [testingConn, setTestingConn]      = useState(false);
  const [connOk, setConnOk]               = useState<boolean | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showGuide, setShowGuide]           = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [showNotif, setShowNotif]           = useState(false);
  const [showGithub, setShowGithub]         = useState(false);
  const [showEditNumbers, setShowEditNumbers] = useState(false);
  const [showManualResult, setShowManualResult] = useState(false);
  const [showStopLoss, setShowStopLoss]     = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [guideStep, setGuideStep]           = useState(0);

  // ── Undo & Confirm ────────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm]       = useState<null | { item: PutaranData; type: "menang" | "kalah" }>(null);
  const [undoStack, setUndoStack]           = useState<Array<{ histori:Histori[]; laporan:LaporanRow[]; saldo:number; putaranAktif:number; sesiSelesai:boolean; putaranMenang:number|null }>>([]);
  const [historiFilter, setHistoriFilter]   = useState<"all" | "MENANG" | "KALAH">("all");

  // ── Target harian & slot notifikasi ──────────────────────────────────────────
  const [targetHarian, setTargetHarian]       = useState<number>(() => ls("targetHarian", 100000));
  const [slotNotifEnabled, setSlotNotifEnabled] = useState<boolean>(() => ls("slotNotifEnabled", false));
  const slotNotifFiredRef = useRef<Record<string, boolean>>({});
  const lastResultFpRef   = useRef<string>("");
  const [swStatus, setSwStatus]               = useState<"unsupported"|"registering"|"active"|"error">("registering");
  const [swTimers, setSwTimers]               = useState(0);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  // ── Custom nomor & stop loss ──────────────────────────────────────────────────
  const [customNumbers, setCustomNumbers]     = useState<string>(() => ls("customNumbers", DEFAULT_NUMBERS));
  const [editNumbersText, setEditNumbersText] = useState("");
  const [stopLossEnabled, setStopLossEnabled] = useState<boolean>(() => ls("stopLossEnabled", false));
  const [stopLossAmount, setStopLossAmount]   = useState<number>(() => ls("stopLoss", 500000));
  const [stopLossEdit, setStopLossEdit]       = useState(500000);

  // ── Result source & manual input ──────────────────────────────────────────────
  const [resultSource, setResultSource]   = useState<ResultSource>("loading");
  const [manualDate, setManualDate]       = useState(() => new Date().toISOString().split("T")[0]);
  const [manualSlot, setManualSlot]       = useState("13:00");
  const [manualAngka, setManualAngka]     = useState("");

  // ── Profile ──────────────────────────────────────────────────────────────────
  const [profile, setProfile]       = useState<Profile>(() =>
    ls("profile", { nama: "Pengguna", email: "" })
  );
  const [profileEdit, setProfileEdit] = useState<Profile>(profile);

  // ── Notifikasi ────────────────────────────────────────────────────────────────
  const [notifs, setNotifs] = useState<Notif[]>(() =>
    ls("notifs", [
      { id:"1", pesan:"Selamat datang! Setup GitHub Database di ikon ☁️", waktu:"Baru saja", terbaca:false },
      { id:"2", pesan:"Data akan auto-sync ke GitHub setiap ada perubahan", waktu:"1 menit lalu", terbaca:false },
    ])
  );

  // ── Computed ──────────────────────────────────────────────────────────────────
  const totalNomor = useMemo(() => customNumbers.split(/[* ,]+/).filter(Boolean).length, [customNumbers]);
  const unreadCount = notifs.filter(n => !n.terbaca).length;

  const data = useMemo(() => {
    // netPerNomor = keuntungan bersih per nomor jika menang (setelah dikurangi modal nomor itu sendiri)
    // Rumus: taruhan × (pengali − totalNomor) ≥ akumulasi_lama + targetProfit
    // Sehingga: taruhan = ⌈(akumulasi_lama + targetProfit) / (pengali − totalNomor)⌉
    const netPerNomor = pengaliMenang - totalNomor; // mis. 95 − 55 = 40
    let akumulasi = 0;
    return Array.from({ length: jumlahPutaran }, (_, i) => {
      const taruhan = netPerNomor > 0
        ? Math.ceil((akumulasi + targetProfit) / netPerNomor)
        : taruhanAwal; // fallback jika pengali ≤ totalNomor (tidak mungkin untung)
      const modal = taruhan * totalNomor;
      akumulasi += modal;
      return { putaran: i + 1, taruhan, modal, akumulasi, hadiah: taruhan * pengaliMenang, profit: taruhan * pengaliMenang - akumulasi };
    });
  }, [jumlahPutaran, taruhanAwal, targetProfit, pengaliMenang, totalNomor]);

  const totalProfit = histori.reduce((s, x) => s + (x.profit || 0), 0);
  const totalRugi   = histori.reduce((s, x) => s + (x.rugi || 0), 0);

  // ── Profit hari ini (untuk target harian) ────────────────────────────────────
  const todayStr = new Date().toLocaleDateString("id-ID");
  const todayProfit = useMemo(() =>
    histori.filter(h => h.tanggal.includes(todayStr)).reduce((s, h) => s + (h.hasil === "MENANG" ? h.profit : -(h.rugi || 0)), 0)
  , [histori, todayStr]);
  const winrate     = histori.length > 0
    ? Math.round(histori.filter(x => x.hasil === "MENANG").length / histori.length * 100)
    : 0;

  // ── Statistik: slot stats & hot/cold numbers ─────────────────────────────────
  const slotStats = useMemo(() =>
    TIME_SLOTS.map(slot => {
      const entries = laporan.filter(l => l[slot] && String(l[slot]) !== "-");
      const menang = entries.filter(l => String(l[slot]).includes("MENANG")).length;
      const kalah  = entries.filter(l => String(l[slot]).includes("KALAH")).length;
      const total  = menang + kalah;
      return { slot, menang, kalah, total, winrate: total > 0 ? Math.round((menang / total) * 100) : null };
    })
  , [laporan]);

  const streak = useMemo(() => {
    if (!histori.length) return { type: null as null | "MENANG" | "KALAH", count: 0 };
    const latest = histori[0].hasil;
    let count = 0;
    for (const h of histori) { if (h.hasil === latest) count++; else break; }
    return { type: latest as "MENANG" | "KALAH", count };
  }, [histori]);

  const { hotNums, coldNums } = useMemo(() => {
    const numFreq: Record<string, number> = {};
    resultData.slice(0, 30).forEach(row => {
      TIME_SLOTS.forEach(s => {
        const v = String(row[s as keyof typeof row] || "");
        if (v.length === 4 && /^\d{4}$/.test(v)) {
          const last2 = v.slice(-2);
          numFreq[last2] = (numFreq[last2] || 0) + 1;
        }
      });
    });
    const sorted = Object.entries(numFreq).sort((a, b) => b[1] - a[1]);
    return { hotNums: sorted.slice(0, 10), coldNums: sorted.slice(-10).reverse() };
  }, [resultData]);

  // ── GitHub DB helpers ─────────────────────────────────────────────────────────
  function getDB() { return new GithubDB(githubCfg); }

  function buildAppData(): AppData {
    return { histori, laporan, saldo, taruhanAwal, jumlahPutaran, targetProfit, pengaliMenang, updatedAt: new Date().toISOString() };
  }

  function applyAppData(d: AppData) {
    if (Array.isArray(d.histori))    setHistori(d.histori);
    if (Array.isArray(d.laporan))    setLaporan(d.laporan);
    if (typeof d.saldo === "number") setSaldo(d.saldo);
    if (typeof d.taruhanAwal === "number")   setTaruhanAwal(d.taruhanAwal);
    if (typeof d.jumlahPutaran === "number") setJumlahPutaran(d.jumlahPutaran);
    if (typeof d.targetProfit === "number")  setTargetProfit(d.targetProfit);
    if (typeof d.pengaliMenang === "number") setPengaliMenang(d.pengaliMenang);
  }

  // ── Load from GitHub (on mount / manual) ─────────────────────────────────────
  const loadFromGithub = useCallback(async (silent = false) => {
    const db = getDB();
    if (!db.isConfigured()) return;
    setSyncStatus("loading");
    try {
      const { data: d, sha } = await db.load();
      if (d) {
        applyAppData(d);
        lsSet(`strategi_data_${DB_VERSION}`, d);
        setFileSha(sha);
        setLastSynced(new Date());
        setSyncStatus("synced");
        if (!silent) {
          toast.success("✅ Data berhasil dimuat dari GitHub!");
          addNotif("Data dimuat dari GitHub — " + new Date().toLocaleTimeString("id-ID"));
        }
      } else {
        // File belum ada, buat baru
        setSyncStatus("idle");
        if (!silent) toast.info("File database belum ada di GitHub, akan dibuat otomatis saat pertama kali save.");
      }
    } catch (e: unknown) {
      setSyncStatus("error");
      if (!silent) toast.error("Gagal load dari GitHub: " + String(e));
    }
  }, [githubCfg]);

  // ── Save to GitHub (debounced 3s) ─────────────────────────────────────────────
  const saveToGithub = useCallback(async (dataOverride?: AppData) => {
    const db = getDB();
    if (!db.isConfigured()) return;
    setSyncStatus("saving");
    try {
      const appData = dataOverride || buildAppData();
      const newSha = await db.save(appData, fileSha);
      setFileSha(newSha);
      setLastSynced(new Date());
      setSyncStatus("synced");
      lsSet(`strategi_data_${DB_VERSION}`, appData);
    } catch (e: unknown) {
      setSyncStatus("error");
      console.error("GitHub save error:", e);
    }
  }, [githubCfg, fileSha, histori, laporan, saldo, taruhanAwal, jumlahPutaran, targetProfit, pengaliMenang]);

  // ── Schedule debounced save ───────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!new GithubDB(githubCfg).isConfigured()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToGithub();
    }, 3000);
  }, [githubCfg, saveToGithub]);

  // ── On mount: load local first, then sync GitHub ──────────────────────────────
  useEffect(() => {
    const local = ls<Partial<AppData>>(`strategi_data_${DB_VERSION}`, {});
    if (local.histori)      setHistori(local.histori);
    if (local.laporan)      setLaporan(local.laporan);
    if (typeof local.saldo === "number")          setSaldo(local.saldo);
    if (typeof local.taruhanAwal === "number")    setTaruhanAwal(local.taruhanAwal);
    if (typeof local.jumlahPutaran === "number")  setJumlahPutaran(local.jumlahPutaran);
    if (typeof local.targetProfit === "number")   setTargetProfit(local.targetProfit);
    if (typeof local.pengaliMenang === "number")  setPengaliMenang(local.pengaliMenang);
    setTimeout(() => {
      if (new GithubDB(githubCfg).isConfigured()) {
        loadFromGithub(true);
      }
      initialLoadDone.current = true;
    }, 500);
  }, []);

  // ── Auto-save when data changes (after initial load) ──────────────────────────
  useEffect(() => {
    if (!initialLoadDone.current) return;
    scheduleSave();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [histori, laporan, saldo, taruhanAwal, jumlahPutaran, targetProfit, pengaliMenang]);

  // ── Persist profile, notifs, github config ────────────────────────────────────
  useEffect(() => { lsSet("profile", profile); }, [profile]);
  useEffect(() => { lsSet("notifs", notifs); }, [notifs]);
  useEffect(() => { lsSet("gh_cfg", { ...githubCfg, token: githubCfg.token }); }, [githubCfg]);

  // ── Persist resume state ──────────────────────────────────────────────────────
  useEffect(() => { lsSet("resumePutaranAktif", putaranAktif); }, [putaranAktif]);
  useEffect(() => { lsSet("resumeSesiSelesai", sesiSelesai); }, [sesiSelesai]);
  useEffect(() => { lsSet("resumePutaranMenang", putaranMenang); }, [putaranMenang]);
  useEffect(() => { lsSet("targetHarian", targetHarian); }, [targetHarian]);

  // ── Register Service Worker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) { setSwStatus("unsupported"); return; }
    navigator.serviceWorker.register("/sw.js")
      .then(reg => { swRegRef.current = reg; setSwStatus("active"); })
      .catch(() => setSwStatus("error"));
  }, []);

  // ── Schedule / cancel SW background notifications ─────────────────────────────
  useEffect(() => {
    const sw = navigator.serviceWorker?.controller ?? swRegRef.current?.active;
    if (!sw) return;
    sw.postMessage({ type: "SCHEDULE", enabled: slotNotifEnabled });

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SCHEDULED") setSwTimers(e.data.count ?? 0);
      if (e.data?.type === "CANCELLED")  setSwTimers(0);
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [slotNotifEnabled, swStatus]);

  // ── Keepalive ping (every 45 s) to prevent SW from being killed ───────────────
  useEffect(() => {
    if (!slotNotifEnabled) return;
    const ping = () => {
      const sw = navigator.serviceWorker?.controller ?? swRegRef.current?.active;
      sw?.postMessage({ type: "PING" });
    };
    const t = setInterval(ping, 45000);
    return () => clearInterval(t);
  }, [slotNotifEnabled]);

  // ── In-page slot notifications with rich audio (fallback when tab is visible) ──
  useEffect(() => {
    if (!slotNotifEnabled) return;

    const check = () => {
      const now = new Date();
      TIME_SLOTS.forEach(slot => {
        const [h, m] = slot.split(":").map(Number);
        const slotDate = new Date(now);
        slotDate.setHours(h, m, 0, 0);
        const diff = slotDate.getTime() - now.getTime();
        const dateKey = now.toDateString();

        // 15-minute early warning
        const key15 = `${slot}-15min-${dateKey}`;
        if (diff > 0 && diff <= 15 * 60 * 1000 && diff > 5 * 60 * 1000 && !slotNotifFiredRef.current[key15]) {
          slotNotifFiredRef.current[key15] = true;
          toast.info(`🔔 Slot ${slot} dalam ${Math.ceil(diff / 60000)} menit — siap-siap!`, { duration: 7000 });
          playAlarm15();
          addNotif(`⏰ Siap-siap slot ${slot} — ${Math.ceil(diff / 60000)} menit lagi`);
        }

        // 5-minute final warning
        const key5 = `${slot}-5min-${dateKey}`;
        if (diff > 0 && diff <= 5 * 60 * 1000 && !slotNotifFiredRef.current[key5]) {
          slotNotifFiredRef.current[key5] = true;
          toast.warning(`⚡ SEGERA! Slot ${slot} dalam ${Math.ceil(diff / 60000)} menit!`, { duration: 10000 });
          playAlarm5();
          addNotif(`⚡ SEGERA pasang taruhan — slot ${slot} tinggal ${Math.ceil(diff / 60000)} menit!`);
        }
      });
    };

    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, [slotNotifEnabled]);

  // ── Auto-refresh hasil ────────────────────────────────────────────────────────
  useEffect(() => {
    handleRefreshResults(true);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    // Poll every 2 minutes to pick up backend updates quickly
    const t = setInterval(() => handleRefreshResults(true), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // Slot-aware auto-refresh: trigger 5 min after each WIB draw time
  useEffect(() => {
    if (!autoRefresh) return;
    const DRAW_MINUTES_WIB = [1, 13 * 60, 16 * 60, 19 * 60, 22 * 60, 23 * 60];
    const DELAY_MIN = 5;
    const WIB_OFFSET = 7 * 60;

    function msUntilNextTrigger(): number {
      const now = new Date();
      const nowWib = (now.getUTCHours() * 60 + now.getUTCMinutes() + WIB_OFFSET) % (24 * 60);
      const targets = DRAW_MINUTES_WIB.map(d => d + DELAY_MIN);
      const diffs = targets.map(t => (t > nowWib ? t - nowWib : t + 24 * 60 - nowWib));
      return Math.min(...diffs) * 60 * 1000;
    }

    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const ms = msUntilNextTrigger();
      timer = setTimeout(() => {
        handleRefreshResults(true);
        scheduleNext();
      }, ms);
    }
    scheduleNext();
    return () => clearTimeout(timer);
  }, [autoRefresh]);

  function buildResultFp(rows: typeof FALLBACK_RESULTS): string {
    if (!rows.length) return "";
    return `${rows[0].tanggal}|${TIME_SLOTS.map(s => rows[0][s as keyof typeof rows[0]] ?? "-").join(",")}`;
  }

  function tryShowResultNotif(rows: typeof FALLBACK_RESULTS) {
    if (Notification.permission !== "granted") return;
    const fp = buildResultFp(rows);
    if (!fp || fp === lastResultFpRef.current) return;
    const prev = lastResultFpRef.current;
    lastResultFpRef.current = fp;
    if (!prev) return; // first load, skip
    const prevVals = prev.split("|")[1]?.split(",") ?? [];
    const row = rows[0];
    TIME_SLOTS.forEach((slot, i) => {
      const val = String((row as Record<string, string>)[slot] ?? "-");
      const wasEmpty = !prevVals[i] || prevVals[i] === "-";
      if (val !== "-" && val.length === 4 && wasEmpty) {
        const isWin = isNomorMenang(val, customNumbers);
        new Notification(`🎰 Hasil Toto Macau ${slot} WIB`, {
          body: isWin
            ? `⭐ MENANG! Angka: ${val} — ${row.tanggal}`
            : `Angka: ${val} — ${row.tanggal} (tidak ada di list taruhan)`,
          icon: "/favicon.ico",
          tag: `toto-${slot}-${row.tanggal}`,
          silent: false,
        });
        if (isWin) addNotif(`⭐ MENANG! Slot ${slot}: ${val} — ${row.tanggal}`);
        else addNotif(`Hasil ${slot}: ${val} — ${row.tanggal}`);
      }
    });
  }

  function requestResultNotifPermission() {
    if (!("Notification" in window)) { toast.error("Browser ini tidak mendukung notifikasi"); return; }
    Notification.requestPermission().then(p => {
      if (p === "granted") { toast.success("🔔 Notifikasi hasil aktif! Kamu akan dapat notif tiap hasil baru keluar."); }
      else { toast.error("Notifikasi ditolak — aktifkan di pengaturan browser kamu"); }
    });
  }

  function handleRefreshResults(silent = false) {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setResultSource("loading");
    fetchSohokartuResults()
      .then(rows => {
        if (rows && rows.length > 0) {
          tryShowResultNotif(rows as typeof FALLBACK_RESULTS);
          setResultData(rows as typeof FALLBACK_RESULTS);
          setLastRefresh(new Date());
          setResultSource("live");
          if (!silent) { toast.success(`Data LIVE — ${rows.length} hari dari masterlive.net`); addNotif("Data Toto Macau diperbarui dari masterlive.net"); }
        } else {
          setResultData([...FALLBACK_RESULTS]);
          setLastRefresh(new Date());
          setResultSource("lokal");
          if (!silent) { toast.warning("Data lokal ditampilkan — masterlive.net tidak terjangkau"); }
        }
      })
      .catch(() => {
        setResultData([...FALLBACK_RESULTS]);
        setResultSource("lokal");
        if (!silent) { toast.error("Koneksi ke masterlive.net gagal"); }
      })
      .finally(() => setIsRefreshing(false));
  }

  function saveManualResult() {
    if (!manualAngka || manualAngka.length !== 4 || !/^\d{4}$/.test(manualAngka)) {
      toast.error("Angka harus 4 digit (contoh: 1234)"); return;
    }
    const d = new Date(manualDate + "T00:00:00+07:00");
    const HARI_ID_LOCAL = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const BULAN_ID_LOCAL = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    const hari = HARI_ID_LOCAL[d.getDay()];
    const tanggal = `${d.getDate()} ${BULAN_ID_LOCAL[d.getMonth()]} ${d.getFullYear()}`;
    setResultData(prev => {
      const existing = prev.find(r => r.tanggal === tanggal && r.hari === hari);
      if (existing) {
        return prev.map(r => r.tanggal === tanggal && r.hari === hari ? { ...r, [manualSlot]: manualAngka } : r);
      }
      const newRow: typeof FALLBACK_RESULTS[0] = { hari, tanggal, "00:01":"-","13:00":"-","16:00":"-","19:00":"-","22:00":"-","23:00":"-", [manualSlot]: manualAngka };
      return [newRow, ...prev].sort((ra, rb) => {
        const pa = BULAN_ID_LOCAL.findIndex(m => ra.tanggal.includes(m));
        const pb = BULAN_ID_LOCAL.findIndex(m => rb.tanggal.includes(m));
        return pb - pa;
      });
    });
    toast.success(`Nomor ${manualAngka} disimpan untuk ${hari} ${tanggal} slot ${manualSlot}`);
    addNotif(`Manual input: ${manualAngka} → ${hari} ${manualSlot}`);
    setManualAngka("");
    setShowManualResult(false);
  }

  function saveEditNumbers() {
    const cleaned = editNumbersText.trim().split(/[\s,*]+/).filter(n => /^\d{2}$/.test(n.trim())).join("*");
    if (!cleaned) { toast.error("Format salah — masukkan nomor 2 digit dipisah spasi/koma/bintang"); return; }
    setCustomNumbers(cleaned);
    lsSet("customNumbers", cleaned);
    setShowEditNumbers(false);
    toast.success(`${cleaned.split("*").length} nomor taruhan disimpan`);
  }

  function saveStopLoss() {
    setStopLossAmount(stopLossEdit);
    lsSet("stopLoss", stopLossEdit);
    lsSet("stopLossEnabled", stopLossEnabled);
    setShowStopLoss(false);
    toast.success(`Stop loss ${stopLossEnabled ? `aktif — Rp ${formatRupiah(stopLossEdit)}` : "dinonaktifkan"}`);
  }

  function pushUndo() {
    setUndoStack(s => [...s.slice(-4), { histori, laporan, saldo, putaranAktif, sesiSelesai, putaranMenang }]);
  }

  function undoLast() {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) { toast.error("Tidak ada aksi yang bisa di-undo"); return; }
    setHistori(prev.histori); setLaporan(prev.laporan); setSaldo(prev.saldo);
    setPutaranAktif(prev.putaranAktif); setSesiSelesai(prev.sesiSelesai); setPutaranMenang(prev.putaranMenang);
    lsSet("resumePutaranAktif", prev.putaranAktif); lsSet("resumeSesiSelesai", prev.sesiSelesai); lsSet("resumePutaranMenang", prev.putaranMenang);
    setUndoStack(s => s.slice(0, -1));
    toast.success("↩ Aksi terakhir berhasil di-undo");
  }

  function handleConfirm() {
    if (!showConfirm) return;
    if (showConfirm.type === "menang") simpanMenang(showConfirm.item);
    else simpanKalah(showConfirm.item);
    setShowConfirm(null);
  }

  function addNotif(pesan: string) {
    const n: Notif = { id: Date.now().toString(), pesan, waktu: new Date().toLocaleTimeString("id-ID"), terbaca: false };
    setNotifs(prev => [n, ...prev.slice(0, 19)]);
  }

  // ── Test GitHub connection ────────────────────────────────────────────────────
  async function testConnection() {
    setTestingConn(true); setConnOk(null);
    try {
      const db = new GithubDB(cfgEdit);
      const ok = await db.testConnection();
      setConnOk(ok);
      if (ok) toast.success("✅ Koneksi GitHub berhasil!");
      else toast.error("❌ Koneksi gagal. Periksa token dan nama repo.");
    } catch { setConnOk(false); toast.error("❌ Gagal terhubung ke GitHub."); }
    finally { setTestingConn(false); }
  }

  function saveGithubConfig() {
    setGithubCfg(cfgEdit);
    setShowGithub(false);
    setFileSha("");
    toast.success("Konfigurasi GitHub disimpan!");
    addNotif("Konfigurasi GitHub diperbarui");
    setTimeout(() => loadFromGithub(false), 500);
  }

  // ── Validasi input ────────────────────────────────────────────────────────────
  function validateInput(field: string, value: number): string {
    if (field === "taruhanAwal") {
      if (isNaN(value) || value <= 0) return "Taruhan awal harus lebih dari 0";
      if (value < 100) return "Minimal Rp 100";
      if (value * totalNomor > saldo) return `Modal melebihi saldo (Rp ${formatRupiah(saldo)})`;
    }
    if (field === "jumlahPutaran") {
      if (!Number.isInteger(value) || value < 1) return "Harus bilangan bulat ≥ 1";
      if (value > 20) return "Maksimal 20 putaran";
    }
    if (field === "targetProfit") { if (isNaN(value) || value < 0) return "Tidak boleh negatif"; }
    if (field === "pengaliMenang") {
      if (isNaN(value) || value < 1) return "Minimal 1";
      if (value > 9999) return "Maksimal 9999";
    }
    return "";
  }

  function setField<T extends number>(field: string, setter: React.Dispatch<React.SetStateAction<T>>, v: T) {
    const err = validateInput(field, v);
    setErrors(e => ({ ...e, [field]: err }));
    setter(v);
  }

  // ── Game logic ────────────────────────────────────────────────────────────────
  function tambahLaporan(item: typeof data[0], hasil: string) {
    const slot = getCurrentSlot();
    const tanggalKey = new Date().toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    const resultHariIni = resultData.find(x => `${x.hari} ${x.tanggal}`.toLowerCase().includes(tanggalKey.split(",")[0].toLowerCase()));
    const nomorResult = resultHariIni ? String(resultHariIni[slot as keyof typeof resultHariIni] || "-") : "-";
    const text = `${hasil} P${item.putaran}`;
    setLaporan(prev => {
      const existing = prev.find(x => x.tanggal === tanggalKey);
      if (existing) {
        return prev.map(row => row.tanggal !== tanggalKey ? row : {
          ...row,
          [slot]: row[slot] ? `${row[slot]} | ${text} | RESULT ${nomorResult}` : `${text} | RESULT ${nomorResult}`,
          total: hasil === "MENANG" ? (Number(row.total) || 0) + item.profit : (Number(row.total) || 0),
          keterangan: hasil === "MENANG" ? `MENANG PUTARAN ${item.putaran}` : `KALAH PUTARAN ${item.putaran}`,
        });
      }
      return [{ tanggal: tanggalKey, keterangan: hasil === "MENANG" ? `MENANG PUTARAN ${item.putaran}` : `KALAH PUTARAN ${item.putaran}`, total: hasil === "MENANG" ? item.profit : 0, [slot]: `${text} | RESULT ${nomorResult}` }, ...prev];
    });
  }

  function simpanMenang(item: typeof data[0]) {
    if (processing || sesiSelesai) return;
    if (errors.taruhanAwal) { toast.error("Perbaiki error input terlebih dahulu"); return; }
    pushUndo();
    setProcessing(true); setSesiSelesai(true); setPutaranMenang(item.putaran);
    lsSet("resumeSesiSelesai", true); lsSet("resumePutaranMenang", item.putaran);
    setSaldo(p => p + item.profit);
    setHistori(p => [{ id:`S-${Date.now()}`, tanggal:new Date().toLocaleString("id-ID"), hasil:"MENANG", putaran:item.putaran, profit:item.profit, rugi:0, taruhanAwal, pengali:pengaliMenang }, ...p]);
    tambahLaporan(item, "MENANG");
    toast.success(`Menang P${item.putaran} — +Rp ${formatRupiah(item.profit)}`);
    addNotif(`MENANG P${item.putaran} — +Rp ${formatRupiah(item.profit)}`);
    setTimeout(() => setProcessing(false), 300);
  }

  function simpanKalah(item: typeof data[0]) {
    if (processing || sesiSelesai) return;
    pushUndo();
    setProcessing(true);
    setSaldo(p => Math.max(0, p - item.modal));
    tambahLaporan(item, "KALAH");
    const newSaldo = Math.max(0, saldo - item.modal);
    if (stopLossEnabled && newSaldo <= stopLossAmount) {
      setSesiSelesai(true);
      toast.error(`⚠️ Stop Loss! Saldo Rp ${formatRupiah(newSaldo)} ≤ batas Rp ${formatRupiah(stopLossAmount)}`);
      addNotif(`Stop Loss aktif — saldo Rp ${formatRupiah(newSaldo)}`);
      setTimeout(() => setProcessing(false), 300);
      return;
    }
    if (item.putaran >= jumlahPutaran) {
      setSesiSelesai(true);
      lsSet("resumeSesiSelesai", true);
      setHistori(p => [{ id:`S-${Date.now()}`, tanggal:new Date().toLocaleString("id-ID"), hasil:"KALAH", putaran:item.putaran, profit:0, rugi:item.akumulasi, taruhanAwal, pengali:pengaliMenang }, ...p]);
      toast.error(`Semua ${jumlahPutaran} putaran habis.`);
    } else {
      setPutaranAktif(item.putaran + 1);
      lsSet("resumePutaranAktif", item.putaran + 1);
      toast.warning(`P${item.putaran} kalah → P${item.putaran + 1}`);
    }
    setTimeout(() => setProcessing(false), 300);
  }

  function resetSesi() {
    setSesiSelesai(false); setPutaranAktif(1); setPutaranMenang(null); setProcessing(false);
    lsSet("resumeSesiSelesai", false); lsSet("resumePutaranAktif", 1); lsSet("resumePutaranMenang", null);
    toast.info("Sesi baru dimulai");
  }

  function hapusHistori() {
    if (!confirm("Hapus semua data histori dan laporan? Saldo tidak akan direset.")) return;
    setHistori([]); setLaporan([]);
    toast.success("Histori dihapus — saldo tetap");
  }

  function exportCSV() {
    const rows = [["ID","Tanggal","Hasil","Putaran","Profit","Rugi","Taruhan Awal","Pengali"], ...histori.map(h => [h.id,h.tanggal,h.hasil,h.putaran,h.profit,h.rugi,h.taruhanAwal,h.pengali])];
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type:"text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "laporan-strategi.csv"; a.click();
    toast.success("CSV diunduh!");
  }

  function exportJSON() {
    const d = buildAppData();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type:"application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `strategi-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    toast.success("Backup JSON diunduh!");
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target?.result as string) as AppData;
          applyAppData(d);
          lsSet(`strategi_data_${DB_VERSION}`, d);
          toast.success("Data berhasil diimport dari file JSON!");
          addNotif("Import data dari backup JSON berhasil");
        } catch {
          toast.error("File tidak valid — pastikan format JSON backup yang benar");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function copyStrategi() {
    const text = data.map(d => `P${d.putaran} | Bet Rp ${formatRupiah(d.taruhan)} | Modal Rp ${formatRupiah(d.modal)} | Profit Rp ${formatRupiah(d.profit)}`).join("\n");
    if (copyText(text)) toast.success("Strategi dicopy!"); else toast.error("Gagal copy.");
  }

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => histori.slice().reverse().slice(-14).map((h, i) => ({ name:`S${i+1}`, profit: h.hasil==="MENANG" ? h.profit : -h.rugi, kumulatif:0 })).map((d, i, arr) => ({ ...d, kumulatif: arr.slice(0,i+1).reduce((s,x) => s+x.profit, 0) })), [histori]);
  const pieData   = [{ name:"Menang", value:histori.filter(h=>h.hasil==="MENANG").length, color:"#22c55e" }, { name:"Kalah", value:histori.filter(h=>h.hasil==="KALAH").length, color:"#ef4444" }].filter(d=>d.value>0);
  const uniqueMonths = useMemo(() => {
    const months: string[] = [];
    const seen = new Set<string>();
    resultData.forEach(r => {
      const parts = r.tanggal.split(" ");
      const m = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : "";
      if (m && !seen.has(m)) { seen.add(m); months.push(m); }
    });
    return months;
  }, [resultData]);
  const activeMonth = selectedMonth || uniqueMonths[0] || "";
  const filteredResultData = useMemo(() => {
    if (!activeMonth) return resultData;
    return resultData.filter(r => {
      const parts = r.tanggal.split(" ");
      const m = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : "";
      return m === activeMonth;
    });
  }, [resultData, activeMonth]);

  // ── Style helpers ─────────────────────────────────────────────────────────────
  const cardCls = isDark ? "rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl" : "rounded-[24px] border border-slate-200 bg-white shadow-xl";
  const inputCls = `w-full rounded-xl px-4 py-3 font-bold text-sm transition-all outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-white/10 border border-white/20 text-white placeholder-white/40" : "bg-white border border-slate-300 text-slate-900"}`;
  const tabBtn = (active: boolean) => `px-3 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"}`;

  // ── Sync status UI ────────────────────────────────────────────────────────────
  const syncUi = {
    idle:    { icon: <Cloud className="w-4 h-4" />,               color: isDark ? "text-white/40" : "text-slate-400",        label: "Belum sync" },
    loading: { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "text-blue-400",    label: "Memuat..." },
    saving:  { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "text-yellow-400",  label: "Menyimpan..." },
    synced:  { icon: <CheckCircle className="w-4 h-4" />,          color: "text-green-400",   label: `Tersync ${lastSynced ? lastSynced.toLocaleTimeString("id-ID") : ""}` },
    error:   { icon: <CloudOff className="w-4 h-4" />,             color: "text-red-400",     label: "Error sync" },
    offline: { icon: <WifiOff className="w-4 h-4" />,             color: "text-orange-400",  label: "Offline" },
  }[syncStatus];

  const isGithubSetup = new GithubDB(githubCfg).isConfigured();

  // ── Guide steps ───────────────────────────────────────────────────────────────
  const guideSteps = [
    { title:"Apa itu Folding Strategy?", icon:<Info className="w-8 h-8 text-blue-400"/>, content:"Strategi Folding (Lipat) adalah metode taruhan di mana modal bertambah secara progresif setiap putaran jika kalah, sehingga ketika menang, keuntungan menutupi semua kerugian sebelumnya plus profit target." },
    { title:"Setting Kalkulator", icon:<Target className="w-8 h-8 text-cyan-400"/>, content:"Isi 4 parameter: (1) Taruhan Awal — jumlah bet di putaran pertama. (2) Jumlah Putaran — maksimum putaran. (3) Target Profit — keuntungan yang diinginkan per sesi. (4) Pengali Menang — multiplier hadiah dari situs (biasanya 95x)." },
    { title:"Cara Bermain", icon:<BarChart2 className="w-8 h-8 text-green-400"/>, content:"Mulai dari Putaran 1. Jika menang → klik MENANG (sesi selesai, profit dicatat). Jika kalah → klik KALAH (otomatis lanjut ke putaran berikutnya dengan modal lebih besar)." },
    { title:"GitHub Database", icon:<Github className="w-8 h-8 text-purple-400"/>, content:"Klik ikon ☁️ di header untuk setup GitHub Database. Masukkan token GitHub dan nama repo kamu. Data akan otomatis tersimpan ke GitHub setiap ada perubahan — aman, persisten, dan bisa diakses dari perangkat manapun!" },
    { title:"Laporan & Statistik", icon:<FileText className="w-8 h-8 text-yellow-400"/>, content:"Tab 'Laporan' mencatat setiap sesi per hari. Tab 'Statistik' menampilkan grafik performa kumulatif dan distribusi menang/kalah. Export CSV kapan saja." },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={`${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"} min-h-screen transition-all duration-500`}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[140px] opacity-10" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500 rounded-full blur-[120px] opacity-10" />
      </div>

      {/* ── Header ── */}
      <div className={`sticky top-0 z-40 backdrop-blur-2xl border-b ${isDark ? "border-white/10 bg-black/40" : "border-slate-200 bg-white/80"}`}>
        <div className="max-w-7xl mx-auto px-3 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-black tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent leading-tight">
              STRATEGI DASHBOARD
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className={`text-xs hidden sm:block ${isDark ? "text-white/40" : "text-slate-400"}`}>TTM4D · Live</p>
              {/* Sync status indicator */}
              <button onClick={() => setShowGithub(true)}
                className={`flex items-center gap-1 text-xs font-bold transition-colors ${syncUi.color} hover:opacity-80`}
                title={syncUi.label}>
                {syncUi.icon}
                <span className="hidden sm:inline">{syncUi.label}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Countdown to next slot */}
            <CountdownWidget isDark={isDark} soundEnabled={slotNotifEnabled} />

            {/* Live clock */}
            <ClockWidget isDark={isDark} />

            {/* Saldo */}
            <div
              onClick={() => { setStopLossEdit(stopLossAmount); setShowStopLoss(true); }}
              className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all hover:scale-105 ${
                stopLossEnabled && saldo <= stopLossAmount
                  ? "bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse"
                  : isDark ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-green-50 border border-green-200 text-green-700"
              }`}
              title="Klik untuk atur Stop Loss"
            >
              <Wallet className="w-3.5 h-3.5" />
              {formatRupiah(saldo)}
              {stopLossEnabled && <Shield className="w-3 h-3 opacity-60"/>}
            </div>

            {/* GitHub Sync Button — hidden on mobile */}
            <button onClick={() => { setShowGithub(true); setShowNotif(false); setShowProfile(false); setShowGuide(false); }}
              title="GitHub Database"
              className={`hidden sm:inline-flex relative p-2 rounded-xl transition-all ${
                isGithubSetup
                  ? syncStatus === "synced" ? "bg-green-500/20 text-green-400 border border-green-500/30" : syncStatus === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" : isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-600 border border-blue-200"
                  : isDark ? "bg-white/10 text-white/60 border border-white/10" : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}>
              <Github className="w-4 h-4" />
              {syncStatus === "saving" && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />}
              {syncStatus === "error"  && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />}
              {syncStatus === "synced" && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full" />}
            </button>

            {/* Manual sync — hidden on mobile */}
            {isGithubSetup && (
              <button onClick={() => { saveToGithub(); toast.info("Menyimpan ke GitHub..."); }}
                disabled={syncStatus === "saving"}
                title="Simpan ke GitHub sekarang"
                className={`hidden sm:flex p-2 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"} disabled:opacity-50`}>
                <CloudUpload className="w-4 h-4" />
              </button>
            )}

            {/* Slot notif toggle — hidden on mobile */}
            <button
              onClick={() => setShowNotifSettings(true)}
              title={`Pengaturan notifikasi slot — ${slotNotifEnabled ? "Aktif" : "Nonaktif"}`}
              className={`hidden sm:flex relative p-2 rounded-xl transition-all ${slotNotifEnabled ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse" : isDark ? "bg-white/10 hover:bg-white/15 text-white/60" : "bg-slate-100 hover:bg-slate-200 text-slate-500"}`}>
              <BellRing className="w-4 h-4" />
              {slotNotifEnabled && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full"/>}
            </button>

            {/* Notif */}
            <button onClick={() => { setShowNotif(true); setShowProfile(false); setShowGuide(false); setShowGithub(false); }}
              className={`relative p-2 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>

            {/* Profile — hidden on mobile */}
            <button onClick={() => { setShowProfile(true); setShowNotif(false); setShowGuide(false); setShowGithub(false); }}
              className={`hidden sm:flex p-2 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
              <User className="w-4 h-4" />
            </button>

            {/* Guide — hidden on mobile */}
            <button onClick={() => { setShowGuide(true); setShowNotif(false); setShowProfile(false); setShowGithub(false); }}
              className={`hidden sm:flex p-2 rounded-xl transition-all ${isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Theme */}
            <button onClick={toggleTheme} className="p-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:scale-105 active:scale-95 transition-all">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile menu */}
            <button onClick={() => setMobileMenuOpen(v => !v)} className={`md:hidden p-2 rounded-xl ${isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Not configured banner ── */}
      {!isGithubSetup && (
        <div className="max-w-7xl mx-auto px-3 pt-2 relative z-10">
          <button onClick={() => setShowGithub(true)}
            className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600/80 to-blue-600/80 border border-purple-500/40 text-white font-bold flex items-center gap-2 hover:scale-[1.01] transition-all">
            <Github className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs truncate">Setup GitHub Database — simpan data permanen →</span>
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 md:px-5 py-4 relative z-10 space-y-4">
        {/* ── Nav tabs ── */}
        {/* ── Nav: menu tabs (scrollable) + action buttons ── */}
        <div className={`${mobileMenuOpen ? "flex" : "hidden"} md:flex flex-col gap-1.5`}>
          {/* Row 1: Menu tabs — horizontal scroll on mobile */}
          <div className="flex overflow-x-auto gap-1 pb-0.5 scrollbar-none">
            {([
              { id:"kalkulator", icon:<Target className="w-3 h-3"/>, label:"Kalkulator" },
              { id:"laporan",    icon:<FileText className="w-3 h-3"/>, label:"Laporan" },
              { id:"result",     icon:<Award className="w-3 h-3"/>, label:"Result" },
              { id:"statistik",  icon:<BarChart2 className="w-3 h-3"/>, label:"Statistik" },

              { id:"saldo",      icon:<Banknote className="w-3 h-3"/>, label:"Saldo" },
            ] as { id:MenuItem; icon:React.ReactNode; label:string }[]).map(m => (
              <button key={m.id} onClick={() => { setMenu(m.id); setMobileMenuOpen(false); }}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  menu === m.id
                    ? "bg-blue-600 text-white shadow-md"
                    : isDark ? "bg-white/8 text-white/70 hover:bg-white/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>
          {/* Row 2: Action buttons — icon+label on md+, icon-only on mobile */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {([
              { fn: undoLast,     icon:<Undo2 className="w-3 h-3"/>,     label:"Undo",     cls: undoStack.length > 0 ? "bg-indigo-600 text-white" : "bg-indigo-600/25 text-indigo-400 opacity-50 cursor-not-allowed", disabled: undoStack.length === 0 },
              { fn: copyStrategi, icon:<Copy className="w-3 h-3"/>,       label:"Copy",     cls:"bg-green-600 text-white" },
              { fn: exportCSV,    icon:<Download className="w-3 h-3"/>,   label:"CSV",      cls:"bg-purple-600 text-white" },
              { fn: exportJSON,   icon:<Download className="w-3 h-3"/>,   label:"Backup",   cls:"bg-cyan-700 text-white" },
              { fn: importJSON,   icon:<Upload className="w-3 h-3"/>,     label:"Import",   cls:"bg-cyan-600 text-white" },
              { fn: resetSesi,    icon:<RotateCcw className="w-3 h-3"/>,  label:"Sesi Baru",cls:"bg-orange-600 text-white" },
              { fn: hapusHistori, icon:<Trash2 className="w-3 h-3"/>,     label:"Hapus",    cls:"bg-red-600 text-white" },
            ] as { fn:()=>void; icon:React.ReactNode; label:string; cls:string; disabled?:boolean }[]).map(b => (
              <button key={b.label} onClick={b.fn} disabled={b.disabled} title={b.label}
                className={`flex-shrink-0 flex items-center gap-1 px-2 md:px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:scale-105 active:scale-95 ${b.cls}`}>
                {b.icon}<span className="hidden sm:inline">{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ══ Resume sesi banner ══ */}
        {putaranAktif > 1 && !sesiSelesai && menu === "kalkulator" && (
          <div className={`${cardCls} p-3 flex items-center gap-3 border-l-4 border-orange-500`}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-white"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm">Sesi Lanjutan — Putaran {putaranAktif}</div>
              <div className={`text-xs ${isDark ? "text-white/60" : "text-slate-500"}`}>Sesi sebelumnya belum selesai, lanjutkan dari P{putaranAktif}</div>
            </div>
            <button onClick={resetSesi} className={`text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0 ${isDark ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>Reset Sesi</button>
          </div>
        )}

        {/* ══ KALKULATOR ══ */}
        {menu === "kalkulator" && (
          <div className="animate-slide-up grid grid-cols-1 xl:grid-cols-4 gap-4">
            {/* Settings */}
            <div className={`xl:col-span-1 ${cardCls} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Kalkulator</h2>
                <button onClick={() => setShowGuide(true)} className="text-blue-400"><HelpCircle className="w-5 h-5"/></button>
              </div>
              <div className={`xl:hidden flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm ${isDark ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-green-50 border border-green-200 text-green-700"}`}>
                <Wallet className="w-4 h-4"/>Saldo: Rp {formatRupiah(saldo)}
              </div>
              <InputField label="Taruhan Awal" value={taruhanAwal} onChange={v => setField("taruhanAwal", setTaruhanAwal as any, Math.max(100, v))} error={errors.taruhanAwal} prefix="Rp" min={100} step={500} hint="Bet per nomor di putaran pertama" isDark={isDark} inputCls={inputCls}/>
              <InputField label="Jumlah Putaran" value={jumlahPutaran} onChange={v => setField("jumlahPutaran", setJumlahPutaran as any, Math.max(1, v))} error={errors.jumlahPutaran} min={1} max={20} step={1} hint="Maks 20" isDark={isDark} inputCls={inputCls}/>
              <InputField label="Target Profit / Sesi" value={targetProfit} onChange={v => setField("targetProfit", setTargetProfit as any, Math.max(0, v))} error={errors.targetProfit} prefix="Rp" min={0} step={1000} hint="Profit minimum jika menang" isDark={isDark} inputCls={inputCls}/>
              <InputField label="Pengali Menang" value={pengaliMenang} onChange={v => setField("pengaliMenang", setPengaliMenang as any, Math.max(1, v))} error={errors.pengaliMenang} suffix="x" min={1} max={9999} step={1} hint="Biasanya 95x" isDark={isDark} inputCls={inputCls}/>
              {/* Info Sesi — auto-calculated */}
              <div className={`p-3 rounded-xl text-xs space-y-1.5 ${isDark ? "bg-blue-500/10 border border-blue-500/20 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-700"}`}>
                <div className="font-bold mb-2 flex items-center gap-1"><Zap className="w-3 h-3"/>Auto-Kalkulasi</div>
                <div className="flex justify-between"><span className="opacity-70">Nomor Taruhan</span><span className="font-black">{totalNomor} nomor</span></div>
                <div className="flex justify-between"><span className="opacity-70">Bet P1 / nomor</span><span className="font-black">Rp {formatRupiah(data[0]?.taruhan || 0)}</span></div>
                <div className="flex justify-between"><span className="opacity-70">Modal P1 (total)</span><span className="font-black">Rp {formatRupiah(data[0]?.modal || 0)}</span></div>
                <div className="flex justify-between border-t border-current/20 pt-1.5"><span className="opacity-70">Modal Max (P{jumlahPutaran})</span><span className="font-black">Rp {formatRupiah(data[data.length-1]?.akumulasi || 0)}</span></div>
                {(pengaliMenang - totalNomor) <= 0 && (
                  <div className="text-red-400 font-bold text-[10px] pt-1">⚠️ Pengali ≤ jumlah nomor — tidak bisa untung!</div>
                )}
                {saldo < (data[data.length-1]?.akumulasi || 0) && (pengaliMenang - totalNomor) > 0 && (
                  <div className="text-orange-400 font-bold text-[10px] pt-1 border-t border-orange-500/20 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0"/>
                    Saldo kurang Rp {formatRupiah((data[data.length-1]?.akumulasi || 0) - saldo)} untuk cover P{jumlahPutaran}
                  </div>
                )}
              </div>
              {/* Nomor grid */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`font-bold text-xs ${isDark ? "text-white/60" : "text-slate-500"}`}>Nomor ({totalNomor})</label>
                  <button onClick={() => { setEditNumbersText(customNumbers.split("*").join(" ")); setShowEditNumbers(true); }} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${isDark ? "bg-white/10 hover:bg-white/20 text-white/70" : "bg-slate-200 hover:bg-slate-300 text-slate-600"}`}>
                    <PenLine className="w-3 h-3"/>Edit
                  </button>
                </div>
                <div className={`rounded-xl p-2.5 flex flex-wrap gap-1 max-h-32 overflow-y-auto ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
                  {customNumbers.split("*").map((n, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>{n}</span>
                  ))}
                </div>
              </div>
              {/* Stop loss indicator */}
              <button onClick={() => { setStopLossEdit(stopLossAmount); setShowStopLoss(true); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                stopLossEnabled
                  ? "bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25"
                  : isDark ? "bg-white/5 border border-white/10 hover:bg-white/10" : "bg-slate-50 border border-slate-200 hover:bg-slate-100"
              }`}>
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5"/>Stop Loss</span>
                <span>{stopLossEnabled ? `Aktif — Rp ${formatRupiah(stopLossAmount)}` : "Nonaktif — klik untuk atur"}</span>
              </button>

              {/* Target harian */}
              <div className={`p-3 rounded-xl text-xs space-y-2 ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
                <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 text-cyan-400"/>Target Harian</span>
                  <span className={`font-black ${todayProfit >= targetHarian ? "text-green-400" : todayProfit < 0 ? "text-red-400" : isDark ? "text-white/70" : "text-slate-600"}`}>
                    {todayProfit >= 0 ? "+" : ""}Rp {formatRupiah(todayProfit)}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                  <div className={`h-full rounded-full transition-all duration-500 ${todayProfit >= targetHarian ? "bg-green-500" : todayProfit < 0 ? "bg-red-500" : "bg-cyan-500"}`}
                    style={{ width: `${Math.min(100, Math.max(0, targetHarian > 0 ? (todayProfit / targetHarian) * 100 : 0))}%` }}/>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`opacity-60 flex-shrink-0 ${isDark ? "" : "text-slate-500"}`}>Target:</span>
                  <input type="number" value={targetHarian}
                    onChange={e => setTargetHarian(Math.max(0, Number(e.target.value)))}
                    className={`flex-1 rounded-lg px-2 py-1 text-xs font-bold text-right outline-none focus:ring-1 focus:ring-cyan-500 ${isDark ? "bg-white/10 border border-white/20 text-white" : "bg-white border border-slate-300 text-slate-900"}`}/>
                </div>
              </div>
            </div>

            {/* Putaran area */}
            <div className="xl:col-span-3 space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label:"Saldo", val:`Rp ${formatRupiah(saldo)}`, cls:"bg-gradient-to-br from-green-600 to-emerald-700 text-white" },
                  { label:"Total Profit", val:`Rp ${formatRupiah(totalProfit)}`, cls: cardCls, valCls:"text-green-400" },
                  { label:"Winrate", val:`${winrate}%`, cls: cardCls, valCls:"text-yellow-400" },
                  { label:"Total Sesi", val:`${histori.length}`, cls: cardCls, valCls:"text-blue-400" },
                ].map((s, i) => (
                  <div key={i} className={`p-4 ${i===0 ? "rounded-[20px] " + s.cls : s.cls}`}>
                    <div className={`text-xs font-bold ${i===0 ? "text-white/70" : isDark ? "opacity-60" : "text-slate-500"}`}>{s.label}</div>
                    <div className={`text-xl font-black mt-1 ${s.valCls || ""}`}>{s.val}</div>
                  </div>
                ))}
              </div>
              {/* Active banner */}
              <div className="rounded-[20px] bg-gradient-to-r from-slate-900 via-blue-950 to-cyan-900 text-white p-4 shadow-xl">
                <div className="flex flex-wrap items-center gap-4 justify-between">
                  <div><div className="text-xs opacity-60">Putaran Aktif</div><div className="text-3xl font-black">{putaranAktif}</div></div>
                  <div><div className="text-xs opacity-60">Target Profit</div><div className="text-2xl font-black">Rp {formatRupiah(targetProfit)}</div></div>
                  <div><div className="text-xs opacity-60">Status</div><div className={`text-lg font-black ${sesiSelesai ? "text-green-400" : "text-yellow-400"}`}>{sesiSelesai ? "SELESAI" : "AKTIF"}</div></div>
                </div>
              </div>
              {/* Putaran cards */}
              {data.map(item => {
                const disabled = sesiSelesai || putaranAktif !== item.putaran;
                const isActive = !sesiSelesai && putaranAktif === item.putaran;
                return (
                  <div key={item.putaran} className={`rounded-[20px] border p-4 transition-all duration-300 ${isActive ? "border-blue-500/50 bg-gradient-to-r from-blue-600/15 to-cyan-600/10 shadow-[0_0_25px_rgba(59,130,246,0.18)]" : disabled ? `${isDark ? "border-white/5 bg-white/3 opacity-25" : "border-slate-100 bg-slate-50 opacity-30"}` : cardCls}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <h2 className="text-lg font-black">Putaran {item.putaran}</h2>
                          {isActive && <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/30">AKTIF</span>}
                        </div>
                        <div className={`space-y-0.5 text-sm ${isDark ? "text-white/70" : "text-slate-600"}`}>
                          <div>Bet/No: <span className={`font-bold ${isActive ? (isDark ? "text-white" : "text-slate-900") : ""}`}>Rp {formatRupiah(item.taruhan)}</span></div>
                          <div>Modal: <b>Rp {formatRupiah(item.modal)}</b> | Akum: <b>Rp {formatRupiah(item.akumulasi)}</b></div>
                          <div className="text-green-400 font-black">Profit: Rp {formatRupiah(item.profit)}</div>
                        </div>
                      </div>
                      {!disabled && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => setShowConfirm({ item, type:"menang" })} className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black shadow-lg hover:scale-105 active:scale-95 transition-all text-sm">✓ MENANG</button>
                          <button onClick={() => setShowConfirm({ item, type:"kalah" })} className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-black shadow-lg hover:scale-105 active:scale-95 transition-all text-sm">✗ KALAH</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {sesiSelesai && (
                <div className="rounded-[20px] border border-green-500/40 bg-green-500/10 p-6 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2"/>
                  <h2 className="text-2xl font-black text-green-400">SESI SELESAI</h2>
                  {putaranMenang && <p className="mt-1 text-sm opacity-70">Menang P{putaranMenang} — Profit Rp {formatRupiah(data[putaranMenang-1]?.profit||0)}</p>}
                  <button onClick={resetSesi} className="mt-4 px-6 py-2.5 rounded-2xl bg-blue-600 text-white font-black hover:scale-105 transition-all">Sesi Baru</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ LAPORAN ══ */}
        {menu === "laporan" && (
          <div className="animate-slide-up space-y-4">
            <div className={`${cardCls} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black">Laporan Harian</h2>
                <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5 hover:scale-105 transition-all"><Download className="w-3.5 h-3.5"/>Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-xs">
                  <thead>
                    <tr className={`${isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>
                      <th className="p-3 text-left">Tanggal</th>
                      {TIME_SLOTS.map(s => <th key={s} className="p-3 text-center">{s}</th>)}
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.length === 0 && <tr><td colSpan={9} className="p-10 text-center opacity-50">Belum ada laporan</td></tr>}
                    {laporan.map((item, i) => (
                      <tr key={i} className={`border-t ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"} transition-colors`}>
                        <td className="p-3 font-bold">{item.tanggal}</td>
                        {TIME_SLOTS.map(s => <td key={s} className="p-3 text-center">{String(item[s]||"-")}</td>)}
                        <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${String(item.keterangan).includes("MENANG") ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{item.keterangan}</span></td>
                        <td className={`p-3 text-right font-black ${Number(item.total)>0 ? "text-green-400" : "text-red-400"}`}>Rp {formatRupiah(Number(item.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={`${cardCls} p-5`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-lg font-black">Histori Sesi</h2>
                <div className="flex gap-1">
                  {(["all","MENANG","KALAH"] as const).map(f => (
                    <button key={f} onClick={() => setHistoriFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${historiFilter===f ? (f==="MENANG" ? "bg-green-600 text-white" : f==="KALAH" ? "bg-red-600 text-white" : "bg-blue-600 text-white") : isDark ? "bg-white/10 text-white/60 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {f==="all" ? "Semua" : f}
                    </button>
                  ))}
                </div>
              </div>
              {streak.type && (
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-xs font-black ${streak.type==="MENANG" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {streak.type==="MENANG" ? <Flame className="w-3.5 h-3.5"/> : <Snowflake className="w-3.5 h-3.5"/>}
                  Streak {streak.type} {streak.count}x berturut-turut
                </div>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {histori.filter(h => historiFilter==="all" || h.hasil===historiFilter).length === 0 && <div className="text-center p-8 opacity-50">Belum ada histori</div>}
                {histori.filter(h => historiFilter==="all" || h.hasil===historiFilter).map((h, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                    <div>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black mr-2 ${h.hasil==="MENANG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{h.hasil}</span>
                      <span className="text-xs opacity-60">{h.tanggal}</span>
                    </div>
                    <div className={`font-black text-sm ${h.hasil==="MENANG" ? "text-green-400" : "text-red-400"}`}>{h.hasil==="MENANG" ? `+Rp ${formatRupiah(h.profit)}` : `-Rp ${formatRupiah(h.rugi)}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ RESULT ══ */}
        {menu === "result" && (
          <div className="animate-slide-up space-y-4">
            {/* Header */}
            <div className="rounded-[22px] bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-600 text-white p-4 md:p-5 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl md:text-3xl font-black">Toto Macau Result</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="opacity-80 text-xs">Update: {lastRefresh.toLocaleTimeString("id-ID")} {isRefreshing && <span className="animate-pulse">⟳</span>}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                      resultSource === "live" ? "bg-green-500/30 border-green-400/50 text-green-200" :
                      resultSource === "lokal" ? "bg-yellow-500/30 border-yellow-400/50 text-yellow-200" :
                      "bg-white/10 border-white/20 text-white/60"
                    }`}>
                      {resultSource === "live" ? <><Zap className="w-2.5 h-2.5"/>LIVE</> : resultSource === "lokal" ? <><CloudOff className="w-2.5 h-2.5"/>LOKAL</> : <><Loader2 className="w-2.5 h-2.5 animate-spin"/>Loading</>}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input type="text" placeholder="Cari..." value={searchResult} onChange={e => setSearchResult(e.target.value)} className="px-2.5 py-1.5 rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/60 text-xs w-28 focus:outline-none"/>
                  <button onClick={() => handleRefreshResults(false)} disabled={isRefreshing} className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white font-bold text-xs flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}/>Refresh</button>
                  <button onClick={() => setAutoRefresh(v => !v)} className={`px-2.5 py-1.5 rounded-xl font-bold text-xs border transition-all ${autoRefresh ? "bg-green-500/30 border-green-400/50" : "bg-white/10 border-white/30"}`}>Auto {autoRefresh ? "✓" : "✗"}</button>
                  <button onClick={() => { setManualDate(new Date().toISOString().split("T")[0]); setShowManualResult(true); }} className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white font-bold text-xs flex items-center gap-1"><PlusCircle className="w-3 h-3"/>Input</button>
                </div>
              </div>
            </div>

            {/* Month selector */}
            {uniqueMonths.length > 1 && (
              <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
                {uniqueMonths.map(month => (
                  <button key={month} onClick={() => setSelectedMonth(month === activeMonth ? "" : month)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                      month === activeMonth
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                        : isDark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {month}
                  </button>
                ))}
              </div>
            )}

            {/* Draw schedule */}
            <DrawSchedulePanel isDark={isDark} />

            {/* Legend */}
            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
              <span className="font-bold opacity-60">Keterangan:</span>
              <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-gradient-to-r from-yellow-500 to-orange-500 inline-block"/><Star className="w-3 h-3 text-yellow-400"/>= Taruhan kamu</span>
              <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 inline-block"/>= Nomor lain</span>
            </div>

            {/* Desktop: Table */}
            <div className={`hidden md:block ${cardCls} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className={`${isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>
                      <th className="p-4 text-left font-black text-sm">Hari & Tanggal</th>
                      {TIME_SLOTS.map(s => <th key={s} className="p-4 text-center font-black text-sm">{s} WIB</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResultData.filter(item => JSON.stringify(item).toLowerCase().includes(searchResult.toLowerCase())).map((item, i) => (
                      <tr key={i} className={`border-t ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"} transition-colors`}>
                        <td className="p-4"><div className="font-black">{item.hari}</div><div className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>{item.tanggal}</div></td>
                        {TIME_SLOTS.map(s => {
                          const val = String(item[s as keyof typeof item] || "-");
                          const isWin = isNomorMenang(val, customNumbers);
                          return (
                            <td key={s} className="p-4 text-center">
                              <div className={`inline-flex items-center justify-center gap-1 min-w-[72px] px-3 py-2 rounded-2xl text-lg font-black tracking-[0.25em] font-mono shadow-lg ${
                                isWin ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white ring-2 ring-yellow-400/50" :
                                val !== "-" ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white" :
                                isDark ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400"
                              }`}>
                                {isWin && <Star className="w-3 h-3 flex-shrink-0"/>}
                                {val}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-3">
              {filteredResultData.filter(item => JSON.stringify(item).toLowerCase().includes(searchResult.toLowerCase())).map((item, i) => (
                <div key={i} className={`${cardCls} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-black text-sm">{item.hari}</div>
                      <div className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>{item.tanggal}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_SLOTS.map(s => {
                      const val = String(item[s as keyof typeof item] || "-");
                      const isWin = isNomorMenang(val, customNumbers);
                      return (
                        <div key={s} className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>{s}</span>
                          <div className={`w-full flex items-center justify-center gap-0.5 px-1 py-2 rounded-xl text-sm font-black tracking-wider font-mono ${
                            isWin ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white ring-2 ring-yellow-400/50" :
                            val !== "-" ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white" :
                            isDark ? "bg-white/5 text-white/20" : "bg-slate-100 text-slate-300"
                          }`}>
                            {isWin && <Star className="w-2.5 h-2.5 flex-shrink-0"/>}
                            {val}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredResultData.length === 0 && (
                <div className={`${cardCls} p-12 text-center`}>
                  <p className="opacity-40 text-sm">Belum ada data result untuk bulan ini</p>
                </div>
              )}
            </div>
          </div>
        )}

                {/* ══ STATISTIK ══ */}
        {menu === "statistik" && (
          <div className="animate-slide-up space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label:"Total Sesi", val:histori.length, color:"text-blue-400" },
                { label:"Winrate", val:`${winrate}%`, color:"text-yellow-400" },
                { label:"Total Profit", val:`Rp ${formatRupiah(totalProfit)}`, color:"text-green-400" },
                { label:"Total Rugi", val:`Rp ${formatRupiah(totalRugi)}`, color:"text-red-400" },
              ].map((k, i) => <div key={i} className={`${cardCls} p-4`}><div className={`text-xs font-bold ${isDark ? "opacity-60" : "text-slate-500"}`}>{k.label}</div><div className={`text-2xl font-black mt-1 ${k.color}`}>{k.val}</div></div>)}
            </div>
            {histori.length === 0 ? (
              <div className={`${cardCls} p-16 text-center`}><BarChart2 className="w-14 h-14 mx-auto opacity-20 mb-4"/><p className="opacity-50">Belum ada data histori. Main dulu!</p></div>
            ) : (
              <>
                <div className={`${cardCls} p-5`}>
                  <h3 className="font-black mb-4">Profit Kumulatif (14 Sesi Terakhir)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}/>
                      <XAxis dataKey="name" stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} fontSize={11}/>
                      <YAxis stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} fontSize={10} tickFormatter={v => formatRupiah(v)} width={80}/>
                      <Tooltip contentStyle={{ background:isDark?"#1e293b":"#fff", border:"1px solid rgba(99,102,241,0.3)", borderRadius:10, fontSize:11 }} formatter={(v:number) => [`Rp ${formatRupiah(v)}`, "Kumulatif"]}/>
                      <Line type="monotone" dataKey="kumulatif" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill:"#3b82f6", r:3 }}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`${cardCls} p-5`}>
                    <h3 className="font-black mb-4">Profit per Sesi</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}/>
                        <XAxis dataKey="name" stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} fontSize={11}/>
                        <YAxis stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} fontSize={10}/>
                        <Tooltip contentStyle={{ background:isDark?"#1e293b":"#fff", border:"1px solid rgba(99,102,241,0.3)", borderRadius:10 }} formatter={(v:number) => [`Rp ${formatRupiah(Math.abs(v))}`, v>=0?"Profit":"Rugi"]}/>
                        <Bar dataKey="profit" radius={[5,5,0,0]}>{chartData.map((d,i) => <Cell key={i} fill={d.profit>=0?"#22c55e":"#ef4444"}/>)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className={`${cardCls} p-5`}>
                    <h3 className="font-black mb-4">Menang vs Kalah</h3>
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={d=>`${d.name}: ${d.value}`}>{pieData.map((d,i) => <Cell key={i} fill={d.color}/>)}</Pie><Legend/><Tooltip/></PieChart>
                      </ResponsiveContainer>
                    ) : <div className="h-[180px] flex items-center justify-center opacity-40">Belum ada data</div>}
                  </div>
                </div>
                <div className={`${cardCls} p-5`}>
                  <h3 className="font-black mb-3">Ringkasan P&L</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div><div className={`opacity-60 ${isDark ? "" : "text-slate-500"}`}>Saldo Saat Ini</div><div className={`text-xl font-black ${saldo>=2000000?"text-green-400":"text-red-400"}`}>Rp {formatRupiah(saldo)}</div></div>
                    <div><div className={`opacity-60 ${isDark ? "" : "text-slate-500"}`}>Total Menang</div><div className="text-xl font-black text-green-400">{histori.filter(h=>h.hasil==="MENANG").length}x</div></div>
                    <div><div className={`opacity-60 ${isDark ? "" : "text-slate-500"}`}>Total Kalah</div><div className="text-xl font-black text-red-400">{histori.filter(h=>h.hasil==="KALAH").length}x</div></div>
                  </div>
                </div>
              </>
            )}

            {/* ── Statistik per Slot Waktu ── */}
            <div className={`${cardCls} p-5`}>
              <h3 className="font-black mb-4 flex items-center gap-2"><Timer className="w-4 h-4 text-blue-400"/>Winrate per Slot Waktu</h3>
              {slotStats.every(s => s.total === 0) ? (
                <p className={`text-sm opacity-50 text-center py-6`}>Belum ada data laporan per slot</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className={`${isDark ? "text-white/50" : "text-slate-500"} text-xs`}>
                      <th className="pb-2 text-left">Slot</th>
                      <th className="pb-2 text-center">Menang</th>
                      <th className="pb-2 text-center">Kalah</th>
                      <th className="pb-2 text-center">Total</th>
                      <th className="pb-2 text-right">Winrate</th>
                    </tr></thead>
                    <tbody>{slotStats.map(s => (
                      <tr key={s.slot} className={`border-t ${isDark ? "border-white/10" : "border-slate-100"}`}>
                        <td className="py-2.5 font-bold">{s.slot} WIB</td>
                        <td className="py-2.5 text-center text-green-400 font-bold">{s.menang}</td>
                        <td className="py-2.5 text-center text-red-400 font-bold">{s.kalah}</td>
                        <td className="py-2.5 text-center opacity-60">{s.total}</td>
                        <td className="py-2.5 text-right">
                          {s.winrate !== null ? (
                            <span className={`font-black ${s.winrate >= 60 ? "text-green-400" : s.winrate >= 40 ? "text-yellow-400" : "text-red-400"}`}>{s.winrate}%</span>
                          ) : <span className="opacity-30">-</span>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Hot & Cold Numbers ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${cardCls} p-5`}>
                <h3 className="font-black mb-4 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400"/>Nomor Panas (30 hari)</h3>
                {hotNums.length === 0 ? <p className="opacity-40 text-sm text-center py-4">Data result tidak tersedia</p> : (
                  <div className="space-y-2">
                    {hotNums.map(([num, freq], i) => {
                      const isTaruhan = customNumbers.split("*").includes(num);
                      return (
                        <div key={num} className="flex items-center gap-2">
                          <span className="w-5 text-xs opacity-40 text-right">{i+1}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-sm font-black min-w-[40px] text-center ${isTaruhan ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" : isDark ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}>{num}</span>
                          {isTaruhan && <Star className="w-3 h-3 text-yellow-400"/>}
                          <div className="flex-1 bg-orange-500/10 rounded-full h-2">
                            <div className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full" style={{ width: `${Math.min(100, (freq / (hotNums[0]?.[1] || 1)) * 100)}%` }}/>
                          </div>
                          <span className="text-xs font-bold text-orange-400">{freq}x</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={`${cardCls} p-5`}>
                <h3 className="font-black mb-4 flex items-center gap-2"><Snowflake className="w-4 h-4 text-cyan-400"/>Nomor Dingin (30 hari)</h3>
                {coldNums.length === 0 ? <p className="opacity-40 text-sm text-center py-4">Data result tidak tersedia</p> : (
                  <div className="space-y-2">
                    {coldNums.map(([num, freq], i) => {
                      const isTaruhan = customNumbers.split("*").includes(num);
                      return (
                        <div key={num} className="flex items-center gap-2">
                          <span className="w-5 text-xs opacity-40 text-right">{i+1}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-sm font-black min-w-[40px] text-center ${isTaruhan ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" : isDark ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}>{num}</span>
                          {isTaruhan && <Star className="w-3 h-3 text-yellow-400"/>}
                          <div className="flex-1 bg-cyan-500/10 rounded-full h-2">
                            <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (freq / (hotNums[0]?.[1] || 1)) * 100)}%` }}/>
                          </div>
                          <span className="text-xs font-bold text-cyan-400">{freq}x</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ ANALISIS NOMOR ══ */}
        {/* ══ SALDO ══ */}
        {menu === "saldo" && (
          <div className="animate-slide-up">
            <SaldoPage saldo={saldo} onSaldoChange={(v) => setSaldo(v)} histori={histori} isDark={isDark}/>
          </div>
        )}
      </div>

      {/* ══ Bottom Navigation (Mobile) ══ */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 md:hidden border-t ${isDark ? "bg-black/95 border-white/10" : "bg-white/98 border-slate-200"} backdrop-blur-2xl`}>
        <div className="flex overflow-x-auto scrollbar-none">
          {([
            { id:"kalkulator", label:"Kalkulator", icon:<Target className="w-4 h-4"/> },
            { id:"laporan",    label:"Laporan",    icon:<FileText className="w-4 h-4"/> },
            { id:"result",     label:"Result",     icon:<Award className="w-4 h-4"/> },
            { id:"statistik",  label:"Statistik",  icon:<BarChart2 className="w-4 h-4"/> },

            { id:"saldo",      label:"Saldo",      icon:<Banknote className="w-4 h-4"/> },
          ] as { id: MenuItem; label: string; icon: React.ReactNode }[]).map(item => (
            <button key={item.id} onClick={() => setMenu(item.id)}
              className={`flex-shrink-0 w-14 flex flex-col items-center justify-center py-2 gap-0.5 text-[9px] font-bold transition-all relative ${
                menu === item.id
                  ? "text-blue-400"
                  : isDark ? "text-white/40 active:text-white/70" : "text-slate-400 active:text-slate-600"
              }`}>
              {item.icon}
              {item.label}
              {menu === item.id && <div className="absolute bottom-0 h-0.5 w-6 bg-blue-400 rounded-full"/>}
            </button>
          ))}
        </div>
      </div>
      {/* Bottom nav spacer on mobile */}
      <div className="h-16 md:hidden"/>

      {/* ══ MODAL: Konfirmasi MENANG/KALAH ══ */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowConfirm(null)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-sm p-6`} onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center mb-4 ${showConfirm.type==="menang" ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-red-500 to-rose-600"}`}>
                {showConfirm.type==="menang" ? <CheckCircle2 className="w-8 h-8 text-white"/> : <XCircle className="w-8 h-8 text-white"/>}
              </div>
              <h2 className="text-2xl font-black mb-1">
                {showConfirm.type==="menang" ? "✓ MENANG?" : "✗ KALAH?"}
              </h2>
              <p className={`text-sm ${isDark ? "text-white/60" : "text-slate-500"}`}>
                Putaran {showConfirm.item.putaran} — taruhan Rp {formatRupiah(showConfirm.item.taruhan)}
              </p>
            </div>
            <div className={`rounded-2xl p-4 mb-5 space-y-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
              <div className="flex justify-between text-sm">
                <span className="opacity-60">Modal dipakai</span>
                <span className="font-bold">Rp {formatRupiah(showConfirm.item.modal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="opacity-60">Akumulasi taruhan</span>
                <span className="font-bold">Rp {formatRupiah(showConfirm.item.akumulasi)}</span>
              </div>
              {showConfirm.type==="menang" && (
                <div className="flex justify-between text-sm font-black text-green-400">
                  <span>Profit</span>
                  <span>+Rp {formatRupiah(showConfirm.item.profit)}</span>
                </div>
              )}
              {showConfirm.type==="kalah" && (
                <div className="flex justify-between text-sm font-black text-red-400">
                  <span>Rugi</span>
                  <span>-Rp {formatRupiah(showConfirm.item.modal)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(null)} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"} transition-all`}>Batal</button>
              <button onClick={handleConfirm} className={`flex-1 py-3 rounded-2xl font-black text-sm text-white transition-all hover:scale-105 active:scale-95 ${showConfirm.type==="menang" ? "bg-gradient-to-r from-green-500 to-emerald-600" : "bg-gradient-to-r from-red-500 to-rose-600"}`}>
                {showConfirm.type==="menang" ? "✓ Ya, MENANG!" : "✗ Ya, KALAH"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Edit Nomor Taruhan ══ */}
      {showEditNumbers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowEditNumbers(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-lg p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-white"/>
                </div>
                <div>
                  <h2 className="text-xl font-black">Edit Nomor Taruhan</h2>
                  <p className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>Masukkan nomor 2 digit yang kamu pasang</p>
                </div>
              </div>
              <button onClick={() => setShowEditNumbers(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>
            <div className={`p-3 rounded-xl text-xs mb-3 ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
              <p className={`${isDark ? "text-white/60" : "text-slate-500"}`}>Format: nomor 2 digit dipisah spasi, koma, atau bintang (*). Contoh: <code>05 06 07 08 09</code></p>
            </div>
            <textarea
              value={editNumbersText}
              onChange={e => setEditNumbersText(e.target.value)}
              rows={5}
              className={`w-full rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${isDark ? "bg-white/10 border border-white/20 text-white" : "bg-slate-50 border border-slate-300 text-slate-900"}`}
              placeholder="05 06 07 08 09 10 11 12..."
            />
            <div className="flex gap-2 mt-3 mb-1">
              <button
                onClick={() => {
                  const formatted = editNumbersText.trim().split(/[\s,*]+/).filter(n => /^\d{2}$/.test(n)).join("*");
                  navigator.clipboard.writeText(formatted).then(() => toast.success("Nomor berhasil di-copy!"));
                }}
                className={`flex-1 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}
              ><Copy className="w-4 h-4"/>Copy Nomor</button>
              <button
                onClick={() => setEditNumbersText(DEFAULT_NUMBERS)}
                className={`flex-1 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${isDark ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"}`}
              ><RotateCcw className="w-4 h-4"/>Reset Default</button>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowEditNumbers(false)} className={`flex-1 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>Batal</button>
              <button onClick={saveEditNumbers} className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90">
                <Save className="w-4 h-4"/>Simpan Nomor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Input Manual Result ══ */}
      {showManualResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowManualResult(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-md p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5 text-white"/>
                </div>
                <div>
                  <h2 className="text-xl font-black">Input Manual Result</h2>
                  <p className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>Masukkan nomor result jika auto-fetch gagal</p>
                </div>
              </div>
              <button onClick={() => setShowManualResult(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Tanggal</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className={inputCls}/>
              </div>
              <div>
                <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Slot Waktu</label>
                <select value={manualSlot} onChange={e => setManualSlot(e.target.value)} className={inputCls}>
                  {TIME_SLOTS.map(s => <option key={s} value={s}>{s} WIB</option>)}
                </select>
              </div>
              <div>
                <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Nomor Result (4 digit)</label>
                <input
                  type="text" value={manualAngka} onChange={e => setManualAngka(e.target.value.replace(/\D/g,"").slice(0,4))}
                  maxLength={4} className={`${inputCls} text-center text-2xl tracking-[0.5em] font-black font-mono`}
                  placeholder="0000"
                />
                {manualAngka.length === 4 && (
                  <p className={`text-xs mt-1 ${isNomorMenang(manualAngka, customNumbers) ? "text-yellow-400 font-bold" : isDark ? "text-white/40" : "text-slate-400"}`}>
                    {isNomorMenang(manualAngka, customNumbers) ? "★ Nomor ini ADA dalam daftar taruhan kamu!" : `2 digit depan: ${manualAngka.slice(0, 2)} — tidak ada di daftar taruhan`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowManualResult(false)} className={`flex-1 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>Batal</button>
              <button onClick={saveManualResult} disabled={manualAngka.length !== 4} className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40">
                <Save className="w-4 h-4"/>Simpan Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Stop Loss Settings ══ */}
      {showStopLoss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowStopLoss(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-md p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white"/>
                </div>
                <div>
                  <h2 className="text-xl font-black">Stop Loss</h2>
                  <p className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>Otomatis berhenti jika saldo di bawah batas</p>
                </div>
              </div>
              <button onClick={() => setShowStopLoss(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">Aktifkan Stop Loss</span>
                <button onClick={() => setStopLossEnabled(v => !v)} className={`w-12 h-6 rounded-full relative transition-all ${stopLossEnabled ? "bg-orange-500" : isDark ? "bg-white/20" : "bg-slate-200"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${stopLossEnabled ? "left-6.5" : "left-0.5"}`} style={{ left: stopLossEnabled ? "26px" : "2px" }}/>
                </button>
              </div>
              {stopLossEnabled && (
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Batas Saldo Minimum</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>Rp</span>
                    <input type="number" value={stopLossEdit} onChange={e => setStopLossEdit(Math.max(0, Number(e.target.value)))} className={`${inputCls} pl-9`} min={0} step={100000}/>
                  </div>
                  <p className={`text-xs mt-1 ${isDark ? "text-white/40" : "text-slate-400"}`}>Sesi akan otomatis berhenti jika saldo ≤ Rp {formatRupiah(stopLossEdit)}</p>
                </div>
              )}
              <div className={`p-3 rounded-xl text-xs ${isDark ? "bg-orange-500/10 border border-orange-500/20 text-orange-300" : "bg-orange-50 border border-orange-200 text-orange-700"}`}>
                <div className="font-bold mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/>Cara kerja</div>
                <p>Jika setelah kalah saldo turun ke bawah batas stop loss, sesi akan otomatis selesai dan kamu tidak bisa lanjut ke putaran berikutnya.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowStopLoss(false)} className={`flex-1 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>Batal</button>
              <button onClick={saveStopLoss} className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90">
                <Save className="w-4 h-4"/>Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: GitHub Database Setup ══ */}
      {showGithub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowGithub(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-lg p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                  <Github className="w-5 h-5 text-white"/>
                </div>
                <div>
                  <h2 className="text-xl font-black">GitHub Database</h2>
                  <p className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>Data tersimpan permanen di repo GitHub kamu</p>
                </div>
              </div>
              <button onClick={() => setShowGithub(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>

            {/* Status indicator */}
            {isGithubSetup && (
              <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 text-sm font-bold ${
                syncStatus==="synced" ? "bg-green-500/15 border border-green-500/30 text-green-400" :
                syncStatus==="error" ? "bg-red-500/15 border border-red-500/30 text-red-400" :
                "bg-blue-500/15 border border-blue-500/30 text-blue-400"
              }`}>
                {syncUi.icon}{syncUi.label}
                {lastSynced && <span className="ml-auto text-xs opacity-70">SHA: {fileSha.slice(0,8)}</span>}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>
                  <KeyRound className="inline w-3.5 h-3.5 mr-1"/>GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={cfgEdit.token}
                  onChange={e => { setCfgEdit(c => ({ ...c, token: e.target.value })); setConnOk(null); }}
                  className={inputCls}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                />
                <div className="flex items-start justify-between gap-2 mt-1">
                  <p className={`text-xs ${isDark ? "opacity-40" : "text-slate-400"}`}>
                    Settings → Developer Settings → Personal Access Tokens → Fine-grained (beri akses Contents: Read &amp; Write)
                  </p>
                  <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs font-bold text-blue-400 hover:text-blue-300 underline whitespace-nowrap">
                    Buat Token →
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Username GitHub</label>
                  <input value={cfgEdit.owner} onChange={e => setCfgEdit(c => ({ ...c, owner: e.target.value }))} className={inputCls} placeholder="yansihaloho"/>
                </div>
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Nama Repository</label>
                  <input value={cfgEdit.repo} onChange={e => setCfgEdit(c => ({ ...c, repo: e.target.value }))} className={inputCls} placeholder="betting_calculator"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Branch</label>
                  <input value={cfgEdit.branch} onChange={e => setCfgEdit(c => ({ ...c, branch: e.target.value }))} className={inputCls} placeholder="main"/>
                </div>
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Path File Database</label>
                  <input value={cfgEdit.filePath} onChange={e => setCfgEdit(c => ({ ...c, filePath: e.target.value }))} className={inputCls} placeholder="data/strategi_db.json"/>
                </div>
              </div>

              {/* Cara kerja */}
              <div className={`p-3 rounded-xl text-xs space-y-1 ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
                <div className="font-bold mb-2 flex items-center gap-1"><Database className="w-3.5 h-3.5 text-purple-400"/>Cara Kerja</div>
                <div className="flex items-start gap-2"><CloudDownload className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5"/><span>Saat buka app → data dimuat dari GitHub</span></div>
                <div className="flex items-start gap-2"><CloudUpload className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5"/><span>Setiap ada perubahan → auto-save ke GitHub (3 detik setelah perubahan)</span></div>
                <div className="flex items-start gap-2"><Github className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5"/><span>File JSON tersimpan di: <code className="opacity-70">{cfgEdit.owner}/{cfgEdit.repo}/{cfgEdit.filePath}</code></span></div>
              </div>

              {connOk !== null && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-bold ${connOk ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-red-500/15 border border-red-500/30 text-red-400"}`}>
                  {connOk ? <CheckCircle className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                  {connOk ? "Koneksi berhasil! Repository ditemukan." : "Koneksi gagal. Periksa token dan nama repo."}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={testConnection} disabled={testingConn || !cfgEdit.token || !cfgEdit.owner || !cfgEdit.repo}
                className={`flex-1 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>
                {testingConn ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wifi className="w-4 h-4"/>}
                Test Koneksi
              </button>
              <button onClick={() => { setShowGithub(false); }}
                className={`px-4 py-2.5 rounded-2xl font-bold text-sm transition-all ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>
                Batal
              </button>
              <button onClick={saveGithubConfig} disabled={!cfgEdit.token || !cfgEdit.owner || !cfgEdit.repo}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40">
                <Save className="w-4 h-4"/>Simpan & Sync
              </button>
            </div>

            {isGithubSetup && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => { loadFromGithub(false); setShowGithub(false); }}
                  className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}>
                  <CloudDownload className="w-3.5 h-3.5 text-blue-400"/>Muat Ulang dari GitHub
                </button>
                <button onClick={() => { saveToGithub(); setShowGithub(false); toast.info("Menyimpan ke GitHub..."); }}
                  className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}>
                  <CloudUpload className="w-3.5 h-3.5 text-green-400"/>Paksa Simpan Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL: Guide ══ */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black">Panduan Penggunaan</h2>
              <button onClick={() => setShowGuide(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>
            <div className="mb-5">
              <div className="flex justify-center mb-4">{guideSteps[guideStep].icon}</div>
              <h3 className="text-lg font-black text-center mb-2">{guideSteps[guideStep].title}</h3>
              <p className={`text-center text-sm leading-relaxed ${isDark ? "text-white/70" : "text-slate-600"}`}>{guideSteps[guideStep].content}</p>
            </div>
            <div className="flex justify-center gap-1.5 mb-5">
              {guideSteps.map((_, i) => <button key={i} onClick={() => setGuideStep(i)} className={`h-2 rounded-full transition-all ${i===guideStep ? "w-6 bg-blue-500" : "w-2 " + (isDark ? "bg-white/20" : "bg-slate-300")}`}/>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setGuideStep(s => Math.max(0,s-1))} disabled={guideStep===0} className={`flex-1 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 disabled:opacity-30" : "bg-slate-100 disabled:opacity-30"}`}>← Sebelumnya</button>
              {guideStep < guideSteps.length-1
                ? <button onClick={() => setGuideStep(s => s+1)} className="flex-1 py-2.5 rounded-2xl bg-blue-600 text-white font-bold text-sm">Selanjutnya →</button>
                : <button onClick={() => setShowGuide(false)} className="flex-1 py-2.5 rounded-2xl bg-green-600 text-white font-bold text-sm">Mulai Bermain!</button>}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Profile ══ */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowProfile(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-sm p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black">Profil</h2>
              <button onClick={() => setShowProfile(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>
            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-black mb-2">{profile.nama.charAt(0).toUpperCase()}</div>
              <div className="font-bold">{profile.nama}</div>
              {isGithubSetup && <div className={`text-xs mt-1 flex items-center gap-1 ${syncStatus==="synced" ? "text-green-400" : "opacity-50"}`}><Github className="w-3 h-3"/>{githubCfg.owner}/{githubCfg.repo}</div>}
            </div>
            <div className="space-y-3">
              <div>
                <label className={`font-bold text-xs block mb-1 ${isDark ? "text-white/60" : "text-slate-500"}`}>Nama Tampilan</label>
                <input value={profileEdit.nama} onChange={e => setProfileEdit(p => ({ ...p, nama: e.target.value }))} className={inputCls} placeholder="Nama Anda"/>
              </div>
              <div>
                <label className={`font-bold text-xs block mb-1 ${isDark ? "text-white/60" : "text-slate-500"}`}>Email</label>
                <input value={profileEdit.email} onChange={e => setProfileEdit(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="email@contoh.com" type="email"/>
              </div>
              <div>
                <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Tema</label>
                <div className="flex gap-2">
                  {(["dark","light"] as const).map(t => (
                    <button key={t} onClick={toggleTheme} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all ${theme===t ? "bg-blue-600 text-white" : isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                      {t==="dark" ? "🌙 Gelap" : "☀️ Terang"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={`font-bold text-xs block mb-1 ${isDark ? "text-white/60" : "text-slate-500"}`}>Atur Ulang Saldo</label>
                <input type="number" value={saldo} onChange={e => setSaldo(Math.max(0, Number(e.target.value)))} className={inputCls}/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowProfile(false)} className={`flex-1 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10" : "bg-slate-100"}`}>Batal</button>
              <button onClick={() => { setProfile(profileEdit); setShowProfile(false); toast.success("Profil disimpan!"); }} className="flex-1 py-2.5 rounded-2xl bg-blue-600 text-white font-bold text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Notifikasi Slot ══ */}
      {showNotifSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowNotifSettings(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[28px] shadow-2xl w-full max-w-sm p-6`} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <BellRing className="w-4 h-4 text-white"/>
                </div>
                <div>
                  <h2 className="text-lg font-black leading-none">Notifikasi Slot</h2>
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-white/50" : "text-slate-400"}`}>Pengingat waktu buka pasaran</p>
                </div>
              </div>
              <button onClick={() => setShowNotifSettings(false)} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}><X className="w-5 h-5"/></button>
            </div>

            {/* Countdown to next slot */}
            <div className={`p-4 rounded-2xl mb-4 text-center ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
              <div className={`text-xs font-bold mb-1 ${isDark ? "text-blue-300/70" : "text-blue-500"}`}>Slot Berikutnya — {getNextSlotLabel()} WIB</div>
              <CountdownWidget isDark={isDark} soundEnabled={slotNotifEnabled} />
            </div>

            {/* Jadwal slot */}
            <div className={`p-3 rounded-xl mb-4 ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
              <div className={`text-xs font-bold mb-2 ${isDark ? "text-white/50" : "text-slate-500"}`}>Jadwal Slot Hari Ini</div>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map(slot => {
                  const [h, m] = slot.split(":").map(Number);
                  const slotDate = new Date(); slotDate.setHours(h, m, 0, 0);
                  const passed = slotDate < new Date();
                  return (
                    <span key={slot} className={`px-2.5 py-1 rounded-lg text-xs font-black ${passed ? isDark ? "bg-white/5 text-white/30 line-through" : "bg-slate-100 text-slate-300 line-through" : slot === getNextSlotLabel() ? "bg-blue-500 text-white ring-2 ring-blue-400/40" : isDark ? "bg-white/10 text-white/70" : "bg-slate-200 text-slate-600"}`}>
                      {slot}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Permission status */}
            {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
              <div className={`p-3 rounded-xl mb-4 flex items-start gap-2.5 ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5"/>
                <div>
                  <div className="text-xs font-black text-orange-400">Izin Notifikasi Browser Belum Diberikan</div>
                  <div className={`text-[11px] mt-0.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                    {Notification.permission === "denied"
                      ? "Notifikasi diblokir browser. Buka Settings browser → izinkan notifikasi untuk situs ini."
                      : "Klik tombol di bawah untuk mengaktifkan notifikasi browser."}
                  </div>
                  {Notification.permission === "default" && (
                    <button onClick={() => Notification.requestPermission().then(p => { if (p === "granted") toast.success("✅ Izin notifikasi diberikan!"); })}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-black hover:bg-orange-600 transition-all">
                      Izinkan Notifikasi
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Toggle */}
            <div className={`flex items-center justify-between p-4 rounded-2xl mb-3 ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
              <div>
                <div className="font-black text-sm">Aktifkan Pengingat</div>
                <div className={`text-xs mt-0.5 ${isDark ? "text-white/50" : "text-slate-400"}`}>Suara + notifikasi 15 & 5 menit sebelum slot</div>
              </div>
              <button onClick={() => {
                  const next = !slotNotifEnabled;
                  setSlotNotifEnabled(next);
                  lsSet("slotNotifEnabled", next);
                  if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
                    Notification.requestPermission().then(p => { if (p === "granted") toast.success("✅ Izin notifikasi diberikan!"); });
                  }
                  toast.success(next ? "⏰ Notifikasi slot aktif!" : "Notifikasi slot dimatikan");
                }}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${slotNotifEnabled ? "bg-blue-500" : isDark ? "bg-white/20" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${slotNotifEnabled ? "left-6" : "left-0.5"}`}/>
              </button>
            </div>

            {/* SW Status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs font-bold ${
              swStatus === "active"       ? isDark ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-green-50 border border-green-200 text-green-600" :
              swStatus === "unsupported"  ? isDark ? "bg-slate-500/10 border border-slate-500/20 text-slate-400" : "bg-slate-100 border border-slate-200 text-slate-400" :
              swStatus === "error"        ? isDark ? "bg-red-500/10 border border-red-500/20 text-red-400"       : "bg-red-50 border border-red-200 text-red-500" :
              isDark ? "bg-white/5 border border-white/10 text-white/40" : "bg-slate-50 border border-slate-200 text-slate-400"
            }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${swStatus === "active" ? "bg-green-400 animate-pulse" : swStatus === "error" ? "bg-red-400" : "bg-slate-400"}`}/>
              {swStatus === "active"      && `Background Worker aktif${swTimers > 0 ? ` — ${swTimers} alarm terjadwal` : ""}`}
              {swStatus === "unsupported" && "Browser tidak mendukung background notifications"}
              {swStatus === "error"       && "Background Worker gagal — notifikasi hanya aktif saat tab terbuka"}
              {swStatus === "registering" && "Memuat background worker..."}
            </div>

            {/* Info */}
            <div className={`space-y-2 text-xs ${isDark ? "text-white/50" : "text-slate-400"}`}>
              <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">🔔</span><span>15 menit sebelum — arpeggio lembut, siapkan nomor</span></div>
              <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center flex-shrink-0">⚡</span><span>5 menit sebelum — alarm mendesak 3x double-beep</span></div>
              <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">🎵</span><span>60 detik terakhir — tick countdown tiap detik</span></div>
              <div className={`pt-1 border-t ${isDark ? "border-white/10 text-white/30" : "border-slate-200 text-slate-300"}`}>
                ⚠️ Suara hanya berbunyi saat tab aktif. Browser notification berbunyi juga saat tab diminimize.
              </div>
            </div>

            <button onClick={() => setShowNotifSettings(false)} className={`w-full mt-4 py-2.5 rounded-2xl font-bold text-sm ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}>
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* ══ PANEL: Notifikasi ══ */}
      {showNotif && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16" onClick={() => setShowNotif(false)}>
          <div className={`${isDark ? "bg-slate-900 border border-white/10" : "bg-white border border-slate-200"} rounded-[20px] shadow-2xl w-full max-w-xs p-4 animate-slide-up`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black">Notifikasi</h3>
              <button onClick={() => setNotifs(n => n.map(x => ({ ...x, terbaca: true })))} className="text-xs text-blue-400 font-bold">Baca semua</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {notifs.length === 0 && <div className="text-center py-8 opacity-50 text-sm">Kosong</div>}
              {notifs.map(n => (
                <div key={n.id} className={`p-2.5 rounded-xl flex gap-2 cursor-pointer ${n.terbaca ? "opacity-50" : ""} ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}
                  onClick={() => setNotifs(prev => prev.map(x => x.id===n.id ? { ...x, terbaca:true } : x))}>
                  <Bell className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${n.terbaca ? "opacity-40" : "text-blue-400"}`}/>
                  <div><div className="text-xs">{n.pesan}</div><div className="text-[10px] opacity-50 mt-0.5">{n.waktu}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InputField({ label, value, onChange, error, prefix, suffix, min, max, step, hint, isDark, inputCls }: {
  label: string; value: number; onChange: (v: number) => void;
  error?: string; prefix?: string; suffix?: string; min?: number; max?: number; step?: number; hint?: string;
  isDark: boolean; inputCls: string;
}) {
  return (
    <div>
      <label className={`font-bold text-xs block mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>{label}</label>
      <div className="relative flex items-center">
        {prefix && <span className={`absolute left-3 font-bold text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>{prefix}</span>}
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max} step={step}
          className={`${inputCls} ${prefix ? "pl-10" : ""} ${suffix ? "pr-10" : ""} ${error ? "border-red-500 focus:ring-red-500" : ""}`}/>
        {suffix && <span className={`absolute right-3 font-bold text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>{suffix}</span>}
      </div>
      {error && <div className="flex items-center gap-1 mt-1 text-red-400 text-xs font-bold"><AlertCircle className="w-3 h-3 flex-shrink-0"/>{error}</div>}
      {!error && hint && <div className={`text-[11px] mt-0.5 ${isDark ? "opacity-40" : "text-slate-400"}`}>{hint}</div>}
    </div>
  );
}

function ClockWidget({ isDark }: { isDark: boolean }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className={`hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-bold tabular-nums ${isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
      WIB {time.toLocaleTimeString("id-ID")}
    </div>
  );
}
