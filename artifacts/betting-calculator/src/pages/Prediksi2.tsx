import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Brain, RefreshCw, Clock, Activity, Zap, AlertTriangle,
  TrendingUp, Star, CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronRight
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];
const SLOT_DISPLAY: Record<string, string> = {
  "00:01": "00:00", "13:00": "13:00", "16:00": "16:00",
  "19:00": "19:00", "22:00": "22:00", "23:00": "23:00",
};
const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

const SHIO_TABLE: { name: string; nums: string[] }[] = [
  { name: "Ular",    nums: ["01","13","25","37","49","61","73","85","97"] },
  { name: "Naga",    nums: ["02","14","26","38","50","62","74","86","98"] },
  { name: "Kelinci", nums: ["03","15","27","39","51","63","75","87","99"] },
  { name: "Harimau", nums: ["04","16","28","40","52","64","76","88","00"] },
  { name: "Kerbau",  nums: ["05","17","29","41","53","65","77","89"] },
  { name: "Tikus",   nums: ["06","18","30","42","54","66","78","90"] },
  { name: "Babi",    nums: ["07","19","31","43","55","67","79","91"] },
  { name: "Anjing",  nums: ["08","20","32","44","56","68","80","92"] },
  { name: "Ayam",    nums: ["09","21","33","45","57","69","81","93"] },
  { name: "Monyet",  nums: ["10","22","34","46","58","70","82","94"] },
  { name: "Kambing", nums: ["11","23","35","47","59","71","83","95"] },
  { name: "Kuda",    nums: ["12","24","36","48","60","72","84","96"] },
];

function shioOf(d2: string) {
  return SHIO_TABLE.find(s => s.nums.includes(d2)) ?? SHIO_TABLE[0];
}

// ─── Core Analysis Engine ────────────────────────────────────────────────────
interface DigitScores { overall: number[]; byPos: number[][] }

function computeDigitScores(nums: string[]): DigitScores {
  const n = nums.length;
  const overall = new Array(10).fill(0);
  // 4 positions: 0=AS(ribuan), 1=KOP(ratusan), 2=KEPALA(puluhan), 3=EKOR(satuan)
  const byPos: number[][] = [
    new Array(10).fill(0), new Array(10).fill(0),
    new Array(10).fill(0), new Array(10).fill(0),
  ];
  // Position weights: ekor & kepala are most predictable
  const posWeight = [0.80, 0.90, 1.10, 1.30];

  nums.forEach((num, idx) => {
    // Exponential recency decay — recent draws get much higher weight
    const recency = Math.exp(-idx * 0.06);
    for (let p = 0; p < 4; p++) {
      const d = parseInt(num[p], 10);
      if (isNaN(d)) continue;
      const w = recency * posWeight[p];
      overall[d] += w;
      byPos[p][d] += recency;
    }
  });
  return { overall, byPos };
}

function computeGapBonus(nums: string[]): number[] {
  // For each digit 0–9, measure how many draws ago it last appeared (any position)
  const lastSeen = new Array(10).fill(nums.length); // default = never
  for (let idx = 0; idx < nums.length; idx++) {
    for (const ch of nums[idx]) {
      const d = parseInt(ch, 10);
      if (!isNaN(d) && lastSeen[d] === nums.length) lastSeen[d] = idx;
    }
  }
  // bonus = log(1 + gap) — diminishing returns, overdue digits score higher
  return lastSeen.map(gap => Math.log1p(Math.min(gap, 30)) * 0.8);
}

function computeMarkovBonus(nums: string[], prevNum: string | null): number[] {
  if (!prevNum || nums.length < 5) return new Array(10).fill(0);
  // Count transitions: given a digit appeared in prev result, how often does each digit appear next?
  const bonus = new Array(10).fill(0);
  const prevDigits = new Set(prevNum.split("").map(Number));
  for (let idx = 1; idx < nums.length; idx++) {
    const cur = nums[idx - 1]; // "previous" in our reversed array = more recent
    const nxt = nums[idx];      // "next" in time = earlier
    const curDigits = new Set(cur.split("").map(Number));
    // If any digit from prevNum also appeared in cur, count nxt's digits
    const shared = [...prevDigits].some(d => curDigits.has(d));
    if (shared) {
      for (const ch of nxt) {
        const d = parseInt(ch, 10);
        if (!isNaN(d)) bonus[d] += 0.4;
      }
    }
  }
  return bonus;
}

interface SlotAnalysis {
  slot: string;
  sampleSize: number;
  confidence: number;
  // 5-digit BBFS (concatenated): "12345"
  bbfs5: string;
  // Positional top digit
  topAS: string; topKOP: string; topKEPALA: string; topEKOR: string;
  // Derived predictions
  pred4D: string;
  pred3D: string;
  pred2DEkor: string;
  pred2DDepan: string;
  pred2DTengah: string;
  colokBebas: string;
  colokBebas2D: string;
  colokJitu: string;   // "digit@posisi" e.g. "7@ekor"
  colokNaga: string;   // 3 digits e.g. "713"
  dasar: string;       // "Besar & Genap"
  tengahTepi: string;  // "Tengah" or "Tepi"
  silangHomo: string;  // "Silang" or "Homo"
  kembang: string;     // "Naik" or "Turun"
  shioName: string;
  shioNums: string;
  jagaTwin: string;
  // Raw scores for recommendation engine
  besarRatio: number;
  genapRatio: number;
  domDigitStrength: number; // 0–1, how dominant is top digit
  shioStrength: number;     // 0–1
  silangRatio: number;
  kembangRatio: number;
  tengahRatio: number;
  colokJituPos: number;
  colokJituDigit: number;
}

function analyzeSlot(slot: string, rows: ResultRow[]): SlotAnalysis {
  const valid = rows
    .map(r => r[slot])
    .filter(v => v && v !== "-" && /^\d{4}$/.test(v));
  // valid[0] = most recent
  const recent = valid.slice(0, 90);
  const n = recent.length;

  // ── Empty fallback ──────────────────────────────────────────────────────────
  if (n === 0) {
    return {
      slot, sampleSize: 0, confidence: 0,
      bbfs5: "13579", topAS:"1", topKOP:"3", topKEPALA:"5", topEKOR:"7",
      pred4D:"1357", pred3D:"357", pred2DEkor:"57", pred2DDepan:"13", pred2DTengah:"35",
      colokBebas:"7", colokBebas2D:"7&1", colokJitu:"7@ekor", colokNaga:"357",
      dasar:"Besar & Ganjil", tengahTepi:"Tengah", silangHomo:"Silang", kembang:"Naik",
      shioName:"Kuda", shioNums:"11*23*35*47*59*71*83*95",
      jagaTwin:"11*33*55*77",
      besarRatio:0.5, genapRatio:0.5, domDigitStrength:0.3,
      shioStrength:0.3, silangRatio:0.7, kembangRatio:0.5, tengahRatio:0.5,
      colokJituPos:3, colokJituDigit:7,
    };
  }

  const prevNum = recent[1] ?? null;
  const ds = computeDigitScores(recent);
  const gap = computeGapBonus(recent);
  const markov = computeMarkovBonus(recent, prevNum);

  // Combined score: frequency + gap bonus + markov
  const combined = ds.overall.map((v, d) => v + gap[d] + markov[d]);

  const sortedDigits = Array.from({ length: 10 }, (_, i) => i)
    .sort((a, b) => combined[b] - combined[a]);

  // BBFS 5 = top 5 digits by combined score, sorted ascending for readability
  const top5 = sortedDigits.slice(0, 5).sort((a, b) => a - b);
  const bbfs5 = top5.join("");

  // Per-position top digit
  const topPerPos = ds.byPos.map((posArr, p) => {
    const posGap = computeGapBonus(recent.map(n => n[p] ?? "0"));
    const posScore = posArr.map((v, d) => v + posGap[d] * 0.5);
    return posScore.indexOf(Math.max(...posScore));
  });

  const topAS     = String(topPerPos[0]);
  const topKOP    = String(topPerPos[1]);
  const topKEPALA = String(topPerPos[2]);
  const topEKOR   = String(topPerPos[3]);

  const pred4D     = `${topAS}${topKOP}${topKEPALA}${topEKOR}`;
  const pred3D     = `${topKOP}${topKEPALA}${topEKOR}`;
  const pred2DEkor = `${topKEPALA}${topEKOR}`;
  const pred2DDepan   = `${topAS}${topKOP}`;
  const pred2DTengah  = `${topKOP}${topKEPALA}`;

  const colokBebas   = String(sortedDigits[0]);
  const colokBebas2D = `${sortedDigits[0]}&${sortedDigits[1]}`;

  // Colok Jitu: position with highest single-digit dominance
  const posStrengths = topPerPos.map((topD, p) => {
    const total = ds.byPos[p].reduce((a, b) => a + b, 0);
    return total > 0 ? ds.byPos[p][topD] / total : 0;
  });
  const bestPos = posStrengths.indexOf(Math.max(...posStrengths));
  const posLabel = ["as","kop","kepala","ekor"][bestPos];
  const colokJitu = `${topPerPos[bestPos]}@${posLabel}`;
  const colokJituPos = bestPos;
  const colokJituDigit = topPerPos[bestPos];

  // Colok Naga: top digit from each of positions 1,2,3
  const colokNaga = `${topKOP}${topKEPALA}${topEKOR}`;

  // ── 2D ekor frequency ──────────────────────────────────────────────────────
  const d2Freq: Record<string, number> = {};
  recent.forEach((num, idx) => {
    const d2 = num.slice(-2);
    const w = Math.exp(-idx * 0.06);
    d2Freq[d2] = (d2Freq[d2] ?? 0) + w;
  });
  const sortedD2 = Object.entries(d2Freq).sort((a, b) => b[1] - a[1]);

  // Dasar
  const ekorVals = recent.map(n => parseInt(n.slice(-2), 10));
  const besarCount = ekorVals.filter(v => v >= 50).length;
  const genapCount = ekorVals.filter(v => v % 2 === 0).length;
  const besarRatio = besarCount / n;
  const genapRatio = genapCount / n;
  const dasar = `${besarRatio >= 0.5 ? "Besar" : "Kecil"} & ${genapRatio >= 0.5 ? "Genap" : "Ganjil"}`;

  // Tengah Tepi (2D ekor 25–74 = Tengah, else Tepi)
  const tengahCount = ekorVals.filter(v => v >= 25 && v <= 74).length;
  const tengahRatio = tengahCount / n;
  const tengahTepi = tengahRatio >= 0.5 ? "Tengah" : "Tepi";

  // Silang Homo — Silang = kepala & ekor have DIFFERENT parity (one odd, one even)
  //               Homo   = kepala & ekor have SAME parity (both odd or both even)
  const silangCount = recent.filter(num =>
    (parseInt(num[2], 10) % 2) !== (parseInt(num[3], 10) % 2)
  ).length;
  const silangRatio = silangCount / n;
  const silangHomo = silangRatio >= 0.5 ? "Silang" : "Homo";

  // Kembang — compare consecutive draws' 2D ekor values (current vs previous draw)
  //           Naik (Kembang) = ekor this draw > ekor previous draw
  let naik = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    if (parseInt(recent[i].slice(-2), 10) > parseInt(recent[i + 1].slice(-2), 10)) naik++;
  }
  const kembangRatio = recent.length > 1 ? naik / (recent.length - 1) : 0.5;
  const kembang = kembangRatio >= 0.5 ? "Naik" : "Turun";

  // ── Shio ──────────────────────────────────────────────────────────────────
  const shioFreq: Record<string, number> = {};
  SHIO_TABLE.forEach(s => {
    shioFreq[s.name] = s.nums.reduce((acc, n2) => acc + (d2Freq[n2] ?? 0), 0);
  });
  const topShioName = Object.entries(shioFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Kuda";
  const topShioEntry = SHIO_TABLE.find(s => s.name === topShioName) ?? SHIO_TABLE[0];
  const totalShioFreq = Object.values(shioFreq).reduce((a, b) => a + b, 0);
  const shioStrength = totalShioFreq > 0 ? (shioFreq[topShioName] ?? 0) / totalShioFreq : 0;
  const shioNums = topShioEntry.nums.join("*");

  // Shio nums for display (at least 8)
  let shioDisplay = topShioEntry.nums.join("*");

  // ── Jaga Twin ────────────────────────────────────────────────────────────
  const twinList = ["00","11","22","33","44","55","66","77","88","99"];
  const twinScores = twinList.map(t => ({
    t,
    score: (d2Freq[t] ?? 0) + Math.log1p(recent.findIndex(n => n.slice(-2) === t) + 1) * 0.5,
  })).sort((a, b) => b.score - a.score);
  const jagaTwin = twinScores.slice(0, 4).map(x => x.t).join("*");

  // ── Dominant digit strength ───────────────────────────────────────────────
  const totalCombined = combined.reduce((a, b) => a + b, 0);
  const domDigitStrength = totalCombined > 0 ? combined[sortedDigits[0]] / totalCombined : 0;

  // ── Confidence score ─────────────────────────────────────────────────────
  const confidence = Math.min(95, Math.round(40 + (n / 90) * 55));

  return {
    slot, sampleSize: n, confidence,
    bbfs5, topAS, topKOP, topKEPALA, topEKOR,
    pred4D, pred3D, pred2DEkor, pred2DDepan, pred2DTengah,
    colokBebas, colokBebas2D, colokJitu, colokNaga,
    dasar, tengahTepi, silangHomo, kembang,
    shioName: topShioName, shioNums: shioDisplay,
    jagaTwin,
    besarRatio, genapRatio, domDigitStrength,
    shioStrength, silangRatio, kembangRatio, tengahRatio,
    colokJituPos, colokJituDigit,
  };
}

// ─── Game Recommendation Engine ──────────────────────────────────────────────
type RecoLevel = "UTAMA" | "COCOK" | "CUKUP" | "SKIP";
interface GameReco {
  game: string;
  prediction: string;
  level: RecoLevel;
  reason: string;
}

function buildRecos(a: SlotAnalysis): GameReco[] {
  const r = a.sampleSize > 0;

  // helper: dominant skew strength (how far from 50/50)
  const skew = (ratio: number) => Math.abs(ratio - 0.5) * 2; // 0–1

  const dasarSkew  = Math.max(skew(a.besarRatio), skew(a.genapRatio));
  const tengahSkew = skew(a.tengahRatio);
  const silangSkew = skew(a.silangRatio);
  const kembangSkew = skew(a.kembangRatio);

  const level = (score: number): RecoLevel =>
    score >= 0.65 ? "UTAMA" : score >= 0.45 ? "COCOK" : score >= 0.25 ? "CUKUP" : "SKIP";

  return [
    {
      game: "4D 3D 2D",
      prediction: `4D: ${a.pred4D}  3D: ${a.pred3D}  2D: ${a.pred2DEkor}`,
      level: level(a.confidence / 100 * 0.7),
      reason: `Prediksi posisi dari ${a.sampleSize} data`,
    },
    {
      game: "2D Depan",
      prediction: a.pred2DDepan,
      level: level(a.domDigitStrength * 1.2),
      reason: `AS=${a.topAS}, KOP=${a.topKOP} paling dominan`,
    },
    {
      game: "2D Tengah",
      prediction: a.pred2DTengah,
      level: level(a.domDigitStrength * 1.1),
      reason: `KOP=${a.topKOP}, KEPALA=${a.topKEPALA}`,
    },
    {
      game: "Colok Bebas",
      prediction: a.colokBebas,
      level: r ? "UTAMA" : "CUKUP",
      reason: `Digit ${a.colokBebas} paling sering muncul`,
    },
    {
      game: "Colok Bebas 2D",
      prediction: a.colokBebas2D,
      level: r ? "UTAMA" : "CUKUP",
      reason: "2 digit hot terkuat",
    },
    {
      game: "Colok Naga",
      prediction: a.colokNaga,
      level: level(a.domDigitStrength * 0.9),
      reason: `KOP-KEPALA-EKOR terkuat: ${a.colokNaga}`,
    },
    {
      game: "Colok Jitu",
      prediction: a.colokJitu.replace("@", " di "),
      level: level(a.domDigitStrength * 1.3),
      reason: `Posisi paling akurat`,
    },
    {
      game: "Tengah Tepi",
      prediction: a.tengahTepi,
      level: level(tengahSkew + 0.3),
      reason: `${Math.round(a.tengahRatio * 100)}% hasil masuk Tengah (25–74)`,
    },
    {
      game: "Dasar",
      prediction: a.dasar,
      level: level(dasarSkew + 0.35),
      reason: `${Math.round(a.besarRatio * 100)}% Besar, ${Math.round(a.genapRatio * 100)}% Genap`,
    },
    {
      game: "50 - 50",
      prediction: a.besarRatio >= 0.5 ? "Besar (50–99)" : "Kecil (00–49)",
      level: level(skew(a.besarRatio) + 0.4),
      reason: `${Math.round(Math.max(a.besarRatio, 1 - a.besarRatio) * 100)}% dominan`,
    },
    {
      game: "Shio",
      prediction: a.shioName,
      level: level(a.shioStrength * 3.5),
      reason: `Shio ${a.shioName} paling banyak keluar`,
    },
    {
      game: "Silang Homo",
      prediction: a.silangHomo,
      level: level(silangSkew + 0.3),
      reason: `${Math.round(a.silangRatio * 100)}% Silang (kepala≠ekor)`,
    },
    {
      game: "Kembang",
      prediction: a.kembang,
      level: level(kembangSkew + 0.25),
      reason: `${Math.round(a.kembangRatio * 100)}% pola Naik`,
    },
    {
      game: "Kombinasi",
      prediction: a.bbfs5,
      level: r ? "COCOK" : "CUKUP",
      reason: "Gunakan BBFS 5D sebagai kombinasi",
    },
    {
      game: "Macau Shio",
      prediction: a.shioName,
      level: level(a.shioStrength * 3.0),
      reason: `Shio ${a.shioName} (Macau cycle)`,
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayLabel() {
  const d = new Date();
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function nowWIB() {
  const d = new Date();
  const u = new Date(d.getTime() + 7 * 3600000);
  return `${String(u.getUTCHours()).padStart(2,"0")}:${String(u.getUTCMinutes()).padStart(2,"0")}`;
}
function nextDrawTime(wib: string) {
  const [h, m] = wib.split(":").map(Number);
  const cur = h * 60 + m;
  const draws = [0, 13*60, 16*60, 19*60, 22*60, 23*60];
  const nxt = draws.find(s => s > cur) ?? draws[0];
  return `${String(Math.floor(nxt/60)).padStart(2,"0")}:${String(nxt%60).padStart(2,"0")}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const RECO_CONFIG: Record<RecoLevel, { bg: string; text: string; icon: React.ReactNode; stars: number }> = {
  UTAMA: { bg: "bg-green-500", text: "text-white", icon: <Star className="w-3 h-3 fill-current"/>, stars: 3 },
  COCOK: { bg: "bg-blue-500",  text: "text-white", icon: <CheckCircle className="w-3 h-3"/>, stars: 2 },
  CUKUP: { bg: "bg-amber-500", text: "text-white", icon: <MinusCircle className="w-3 h-3"/>, stars: 1 },
  SKIP:  { bg: "bg-slate-500", text: "text-white", icon: <XCircle className="w-3 h-3"/>, stars: 0 },
};
const RECO_LABEL: Record<RecoLevel, string> = {
  UTAMA: "UTAMA", COCOK: "COCOK", CUKUP: "CUKUP", SKIP: "SKIP",
};

function RecoBadge({ level }: { level: RecoLevel }) {
  const cfg = RECO_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}{RECO_LABEL[level]}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { resultData: ResultRow[]; isDark: boolean }

export default function Prediksi2({ resultData, isDark }: Props) {
  const [tick, setTick]           = useState(0);
  const [isAnalyzing, setAnalyzing] = useState(false);
  const [lastUpdated, setUpdated]   = useState(new Date());
  const [expandedSlot, setExpanded] = useState<string | null>(null);

  const analyses = useMemo(
    () => TIME_SLOTS.map(s => analyzeSlot(s, resultData)),
    [resultData, tick],
  );

  // Retrospective: simulate what Prediksi2 would have said yesterday, compare to actual today
  const retroEval = useMemo(() => {
    if (resultData.length < 3) return [];
    const todayRow = resultData[0];
    const histRows = resultData.slice(1);
    return TIME_SLOTS.flatMap(slot => {
      const actual = String(todayRow[slot] || "");
      if (!/^\d{4}$/.test(actual)) return [];
      const retro = analyzeSlot(slot, histRows);
      const actual2D   = actual.slice(-2);
      const actualEkor = parseInt(actual2D, 10);
      const bbfsHit    = retro.bbfs5.split("").some(d => actual.includes(d));
      const bbfs2DHit  = retro.bbfs5.includes(actual2D[0]) && retro.bbfs5.includes(actual2D[1]);
      const dasarActual = `${actualEkor >= 50 ? "Besar" : "Kecil"} & ${actualEkor % 2 === 0 ? "Genap" : "Ganjil"}`;
      const tengahActual = actualEkor >= 25 && actualEkor <= 74 ? "Tengah" : "Tepi";
      // Silang/Homo — parity of kepala vs ekor digit (not value equality)
      const silangActual = (parseInt(actual[2], 10) % 2) !== (parseInt(actual[3], 10) % 2) ? "Silang" : "Homo";
      // Kembang — compare today's ekor to PREVIOUS draw's ekor (not digits within same number)
      const prevDraw = String(histRows[0]?.[slot as keyof typeof histRows[0]] ?? "");
      const prevEkor2D = /^\d{4}$/.test(prevDraw) ? parseInt(prevDraw.slice(-2), 10) : actualEkor;
      const kembangActual = actualEkor > prevEkor2D ? "Naik" : "Turun";
      const actualShio = SHIO_TABLE.find(s => s.nums.includes(actual2D));
      return [{
        slot, actual, actual2D,
        retro,
        bbfsHit, bbfs2DHit,
        dasarOk:   retro.dasar === dasarActual,       dasarPred: retro.dasar,      dasarAct: dasarActual,
        tengahOk:  retro.tengahTepi === tengahActual, tengahPred: retro.tengahTepi, tengahAct: tengahActual,
        silangOk:  retro.silangHomo === silangActual, silangPred: retro.silangHomo, silangAct: silangActual,
        kembangOk: retro.kembang === kembangActual,   kembangPred: retro.kembang,   kembangAct: kembangActual,
        shioOk:    retro.shioName === (actualShio?.name ?? ""),
        shioPred: retro.shioName, shioAct: actualShio?.name ?? "?",
        ekorInBbfs: retro.bbfs5.includes(actual2D[1]),
        kepalaInBbfs: retro.bbfs5.includes(actual2D[0]),
      }];
    });
  }, [resultData]);

  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    setTimeout(() => {
      setTick(t => t + 1);
      setUpdated(new Date());
      setAnalyzing(false);
    }, 900);
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(runAnalysis, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [runAnalysis]);

  const wib     = nowWIB();
  const nxtDraw = nextDrawTime(wib);
  const hasData = resultData.length > 0;
  const samples = analyses[0]?.sampleSize ?? 0;

  const card     = isDark ? "bg-[#0f172a]" : "bg-white";
  const border   = isDark ? "border-slate-700/50" : "border-slate-200";
  const muted    = isDark ? "text-slate-400" : "text-slate-500";
  const rowA     = isDark ? "bg-transparent" : "bg-white";
  const rowB     = isDark ? "bg-slate-800/30" : "bg-slate-50";

  return (
    <div className="animate-slide-up space-y-4">

      {/* ── Header Card ────────────────────────────────────────────────────── */}
      <div className={`${card} border ${border} rounded-2xl p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Brain className="w-4.5 h-4.5 text-white"/>
            </div>
            <div>
              <div className="font-black text-base leading-tight">Prediksi 2 — Auto Analisa</div>
              <div className={`text-[11px] ${muted}`}>
                Analisa pola otomatis setiap 5 menit &bull; {hasData ? `${resultData.length} data historis` : "Menunggu data..."}
              </div>
            </div>
          </div>
          <button
            onClick={runAnalysis} disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-bold text-xs transition-all disabled:opacity-60 shadow-lg shadow-amber-500/25"
          >
            <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`}/>
            {isAnalyzing ? "Menganalisa..." : "Perbarui"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: <Activity className="w-3 h-3"/>, label: `LIVE • ${wib} WIB`,            clr: isDark ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-green-50 text-green-700 border border-green-200" },
            { icon: <Clock className="w-3 h-3"/>,    label: `Undian: ${nxtDraw} WIB`,        clr: isDark ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"   : "bg-blue-50 text-blue-700 border border-blue-200" },
            { icon: <TrendingUp className="w-3 h-3"/>,label: `Sampel: ${samples} hasil`,     clr: isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-700 border border-amber-200" },
            { icon: <Zap className="w-3 h-3"/>,      label: `Update: ${lastUpdated.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}`, clr: isDark ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-700 border border-purple-200" },
          ].map(x => (
            <div key={x.label} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${x.clr}`}>
              {x.icon}<span className="truncate">{x.label}</span>
            </div>
          ))}
        </div>

        {!hasData && (
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold ${isDark ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
            Data belum tersedia — prediksi menggunakan pola default. Tunggu fetch otomatis.
          </div>
        )}
      </div>

      {/* ── Prediction Table (yellow format like image) ─────────────────────── */}
      <div className={`${card} border ${border} rounded-2xl overflow-hidden`}>
        <div className="bg-[#f5c800] py-3 text-center">
          <div className="text-[#111] font-black text-xl tracking-widest uppercase">PREDIKSI MACAU</div>
          <div className="text-[#333] font-bold text-base mt-0.5">{todayLabel()}</div>
        </div>

        {analyses.map((a, idx) => (
          <div key={a.slot} className={idx < analyses.length - 1 ? `border-b ${border}` : ""}>
            {/* Slot header */}
            <div className="bg-[#f5c800] py-2.5 text-center">
              <div className="text-[#111] font-black text-sm tracking-wider uppercase">
                PREDIKSI JAM {SLOT_DISPLAY[a.slot]}
              </div>
              {a.sampleSize > 0 && (
                <div className="text-[#555] text-[10px] font-semibold mt-0.5">
                  {a.sampleSize} data &bull; Kepercayaan ~{a.confidence}%
                </div>
              )}
            </div>

            <table className="w-full text-sm">
              <tbody>
                {[
                  {
                    label: "BBFS 5D",
                    value: (
                      <span className="font-black text-2xl tracking-[0.3em] text-amber-500">
                        {isAnalyzing
                          ? <span className={`inline-block animate-pulse ${isDark?"bg-slate-700":"bg-slate-200"} rounded w-24 h-6`}/>
                          : a.bbfs5}
                      </span>
                    ),
                    bold: true,
                  },
                  { label: "Prediksi 4D",      value: a.pred4D },
                  { label: "Prediksi 3D",      value: a.pred3D },
                  { label: "2D Ekor",          value: a.pred2DEkor },
                  { label: "2D Depan",         value: a.pred2DDepan },
                  { label: "2D Tengah",        value: a.pred2DTengah },
                  { label: "Colok Bebas",      value: a.colokBebas },
                  { label: "Colok Bebas 2D",   value: a.colokBebas2D },
                  { label: "Colok Jitu",       value: a.colokJitu.replace("@"," di ") },
                  { label: "Dasar",            value: a.dasar },
                  { label: "Tengah / Tepi",    value: a.tengahTepi },
                  { label: "Silang / Homo",    value: a.silangHomo },
                  { label: "Kembang",          value: a.kembang },
                  { label: "Shio",             value: `${a.shioName} (${a.shioNums})` },
                  { label: "2D BOM",           value: a.shioName },
                  { label: "Jaga Twin",        value: a.jagaTwin },
                ].map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? rowA : rowB}>
                    <td className={`px-4 py-2.5 font-bold w-36 sm:w-44 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      {row.label}
                    </td>
                    <td className={`px-4 py-2.5 ${isDark ? "text-slate-100" : "text-slate-900"} ${row.bold ? "" : "font-black tracking-wide text-sm"}`}>
                      {typeof row.value === "string"
                        ? isAnalyzing
                          ? <span className={`inline-block animate-pulse ${isDark?"bg-slate-700":"bg-slate-200"} rounded w-24 h-4`}/>
                          : row.value
                        : row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className={`px-4 py-2.5 text-center text-[10px] ${muted} border-t ${border}`}>
          ⚡ Diperbarui otomatis setiap 5 menit &bull; Terakhir: {lastUpdated.toLocaleTimeString("id-ID")}
        </div>
      </div>

      {/* ── EVALUASI HASIL vs PREDIKSI KEMARIN ─────────────────────────────── */}
      {retroEval.length > 0 && (
        <div className={`${card} border ${border} rounded-2xl overflow-hidden`}>
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 py-3 px-4 flex items-center justify-between">
            <div>
              <div className="text-white font-black text-base tracking-wide">📊 Evaluasi Prediksi vs Aktual</div>
              <div className="text-slate-300 text-[11px] mt-0.5">
                Simulasi engine kemarin · {retroEval.filter(r => r.bbfs2DHit).length}/{retroEval.length} BBFS-2D hit · {retroEval.filter(r => r.dasarOk && r.tengahOk && r.silangOk).length}/{retroEval.length} tripel akurat
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-xl text-xs font-black ${
              retroEval.filter(r => r.bbfs2DHit).length >= retroEval.length * 0.6
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
            }`}>
              BBFS {Math.round(retroEval.filter(r => r.bbfs2DHit).length / retroEval.length * 100)}% hit
            </div>
          </div>

          <div className="divide-y divide-slate-700/30">
            {retroEval.map(ev => {
              const checks = [
                { label: "BBFS digit ekor", ok: ev.ekorInBbfs, pred: ev.retro.bbfs5, act: ev.actual2D[1] },
                { label: "BBFS digit kepala", ok: ev.kepalaInBbfs, pred: ev.retro.bbfs5, act: ev.actual2D[0] },
                { label: "Dasar", ok: ev.dasarOk, pred: ev.dasarPred, act: ev.dasarAct },
                { label: "Tengah/Tepi", ok: ev.tengahOk, pred: ev.tengahPred, act: ev.tengahAct },
                { label: "Silang/Homo", ok: ev.silangOk, pred: ev.silangPred, act: ev.silangAct },
                { label: "Kembang", ok: ev.kembangOk, pred: ev.kembangPred, act: ev.kembangAct },
                { label: "Shio", ok: ev.shioOk, pred: ev.shioPred, act: ev.shioAct },
              ];
              const correctCount = checks.filter(c => c.ok).length;

              return (
                <div key={ev.slot} className="p-4 space-y-3">
                  {/* Slot header */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="bg-[#f5c800] text-[#111] text-xs font-black px-2.5 py-1 rounded-lg">
                      JAM {SLOT_DISPLAY[ev.slot]}
                    </div>
                    <div>
                      <span className="font-mono font-black text-lg">{ev.actual}</span>
                      <span className={`ml-2 text-xs font-bold ${muted}`}>2D: {ev.actual2D}</span>
                    </div>
                    <div className={`ml-auto px-3 py-1 rounded-xl text-xs font-black ${
                      correctCount >= 5 ? isDark ? "bg-green-500/15 text-green-400" : "bg-green-50 text-green-700"
                      : correctCount >= 3 ? isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700"
                      : isDark ? "bg-red-500/15 text-red-400" : "bg-red-50 text-red-700"
                    }`}>
                      {correctCount}/{checks.length} benar
                    </div>
                  </div>

                  {/* BBFS comparison */}
                  <div className={`rounded-xl p-3 ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                    <div className={`text-[10px] font-black uppercase tracking-wide mb-2 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      BBFS 5D kemarin: {ev.retro.bbfs5} → Aktual 2D: {ev.actual2D}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {ev.retro.bbfs5.split("").map(d => {
                        const inActual = ev.actual.includes(d);
                        return (
                          <div key={d} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                            inActual
                              ? "bg-green-500 text-white ring-2 ring-green-400"
                              : isDark ? "bg-white/10 text-white/50" : "bg-slate-200 text-slate-500"
                          }`}>{d}</div>
                        );
                      })}
                      <div className={`flex items-center gap-1 text-xs font-bold ml-2 ${ev.bbfs2DHit ? "text-green-400" : muted}`}>
                        {ev.bbfs2DHit ? "✅ Kedua digit 2D ada di BBFS!" : ev.ekorInBbfs ? "⚠️ Digit ekor ada, kepala tidak" : ev.kepalaInBbfs ? "⚠️ Digit kepala ada, ekor tidak" : "❌ Tidak ada digit 2D di BBFS"}
                      </div>
                    </div>
                  </div>

                  {/* Per-game accuracy */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
                    {checks.slice(2).map(c => (
                      <div key={c.label} className={`rounded-xl p-2 border text-xs ${
                        c.ok
                          ? isDark ? "border-green-500/30 bg-green-500/5" : "border-green-200 bg-green-50"
                          : isDark ? "border-red-500/20 bg-red-500/5" : "border-red-100 bg-red-50"
                      }`}>
                        <div className={`font-black text-[10px] ${muted}`}>{c.label}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={c.ok ? "text-green-400" : "text-red-400"}>{c.ok ? "✅" : "❌"}</span>
                          <span className={`font-bold ${c.ok ? "" : "line-through opacity-50"}`}>{c.pred}</span>
                          {!c.ok && <span className={`font-black ${isDark ? "text-amber-400" : "text-amber-600"}`}>→ {c.act}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Learning signal */}
                  <div className={`rounded-xl p-2.5 text-[10px] leading-relaxed ${isDark ? "bg-white/5 text-white/60" : "bg-slate-50 text-slate-600"}`}>
                    <span className="font-black">📚 Pelajaran: </span>
                    {(() => {
                      const wrongs = checks.filter(c => !c.ok).map(c => c.label);
                      const rights = checks.filter(c => c.ok).map(c => c.label);
                      if (correctCount >= 5) return `Engine sangat akurat untuk slot ini. Faktor yang tepat: ${rights.slice(0,3).join(", ")}.`;
                      if (wrongs.length > 0) return `Prediksi meleset di: ${wrongs.join(", ")}. Pola yang perlu diperhatikan: ${wrongs.includes("Dasar") ? "besar/kecil berubah arah" : ""} ${wrongs.includes("Kembang") ? "arah naik/turun tidak konsisten" : ""} ${wrongs.includes("Shio") ? "siklus shio bergeser" : ""}. Pertimbangkan mengurangi taruhan saat prediksi multi-faktor meleset.`;
                      return "Semua indikator selaras dengan hasil aktual.";
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Aggregate learning */}
            <div className={`p-4 ${isDark ? "bg-violet-500/10" : "bg-violet-50"}`}>
              <div className={`font-black text-xs mb-2 ${isDark ? "text-violet-300" : "text-violet-800"}`}>🧠 Insight Agregat Hari Ini</div>
              <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]`}>
                {[
                  { label: "BBFS Any Digit Hit", val: `${retroEval.filter(r => r.bbfsHit).length}/${retroEval.length}` },
                  { label: "BBFS 2D Full Hit", val: `${retroEval.filter(r => r.bbfs2DHit).length}/${retroEval.length}` },
                  { label: "Dasar Akurat", val: `${retroEval.filter(r => r.dasarOk).length}/${retroEval.length}` },
                  { label: "Tengah/Tepi Akurat", val: `${retroEval.filter(r => r.tengahOk).length}/${retroEval.length}` },
                  { label: "Silang/Homo Akurat", val: `${retroEval.filter(r => r.silangOk).length}/${retroEval.length}` },
                  { label: "Kembang Akurat", val: `${retroEval.filter(r => r.kembangOk).length}/${retroEval.length}` },
                ].map(x => (
                  <div key={x.label} className={`rounded-xl p-2 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-violet-200"}`}>
                    <div className={muted}>{x.label}</div>
                    <div className="font-black text-sm">{x.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Game Recommendation per slot ────────────────────────────────────── */}
      <div className={`${card} border ${border} rounded-2xl overflow-hidden`}>
        <div className="bg-[#1a5c1a] py-3 text-center">
          <div className="text-white font-black text-base tracking-wider uppercase">Rekomendasi Permainan</div>
          <div className="text-green-300 text-[11px] font-semibold mt-0.5">Analisa kecocokan permainan per jam</div>
        </div>

        {analyses.map((a, idx) => {
          const recos = buildRecos(a);
          const isOpen = expandedSlot === a.slot;
          const utamaRecos = recos.filter(r => r.level === "UTAMA");

          return (
            <div key={a.slot} className={idx < analyses.length - 1 ? `border-b ${border}` : ""}>
              <button
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors`}
                onClick={() => setExpanded(isOpen ? null : a.slot)}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-[#2d8c2d] text-white text-xs font-black px-2.5 py-1 rounded-lg">
                    JAM {SLOT_DISPLAY[a.slot]}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {utamaRecos.slice(0, 3).map(r => (
                      <span key={r.game} className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                        ⭐ {r.game}
                      </span>
                    ))}
                  </div>
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {recos.map(r => (
                      <div key={r.game}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
                          r.level === "UTAMA"
                            ? isDark ? "border-green-500/30 bg-green-500/5" : "border-green-200 bg-green-50"
                            : r.level === "COCOK"
                            ? isDark ? "border-blue-500/30 bg-blue-500/5" : "border-blue-200 bg-blue-50"
                            : isDark ? "border-slate-700/40 bg-transparent" : "border-slate-200 bg-white"
                        }`}
                      >
                        <RecoBadge level={r.level}/>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-xs">{r.game}</div>
                          <div className={`font-bold text-[11px] ${
                            r.level === "UTAMA" ? "text-amber-400" : r.level === "COCOK" ? "text-blue-400" : muted
                          }`}>{r.prediction}</div>
                          <div className={`text-[10px] ${muted} mt-0.5`}>{r.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Quick summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {analyses.map(a => (
          <div key={a.slot} className={`${card} border ${border} rounded-2xl p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black text-sm">JAM {SLOT_DISPLAY[a.slot]}</div>
                <div className={`text-[10px] ${muted}`}>{a.sampleSize} data</div>
              </div>
              <div className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                a.confidence >= 75 ? isDark ? "bg-green-500/15 text-green-400" : "bg-green-50 text-green-700"
                : a.confidence >= 50 ? isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700"
                : isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"
              }`}>
                ~{a.confidence}%
              </div>
            </div>

            <div className={`h-1.5 rounded-full ${isDark?"bg-slate-700":"bg-slate-200"} overflow-hidden`}>
              <div className={`h-full rounded-full transition-all duration-700 ${
                a.confidence >= 75 ? "bg-green-500" : a.confidence >= 50 ? "bg-amber-500" : "bg-slate-500"
              }`} style={{ width: `${a.confidence}%` }}/>
            </div>

            {/* BBFS 5D highlight */}
            <div className={`text-center py-2 rounded-xl ${isDark?"bg-amber-500/10 border border-amber-500/20":"bg-amber-50 border border-amber-200"}`}>
              <div className={`text-[10px] font-bold ${isDark?"text-amber-400/60":"text-amber-600"} mb-0.5`}>BBFS 5 DIGIT</div>
              <div className="font-black text-2xl tracking-[0.25em] text-amber-500">{a.bbfs5}</div>
            </div>

            <div className="space-y-1.5 text-xs">
              {[
                ["4D", a.pred4D], ["3D", a.pred3D], ["2D Ekor", a.pred2DEkor],
                ["Colok Bebas", a.colokBebas], ["Dasar", a.dasar],
                ["Shio", a.shioName], ["Silang/Homo", a.silangHomo],
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex justify-between items-center">
                  <span className={muted}>{lbl}</span>
                  <span className="font-black">{val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────────── */}
      <div className={`${card} border ${border} rounded-2xl p-4 space-y-2`}>
        <div className="font-black text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-400"/>Cara Baca & Metode Analisa
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {[
            ["BBFS 5D", "5 digit paling berpeluang keluar (tanpa pemisah, e.g. 13579)"],
            ["Prediksi 4D/3D/2D", "Digit terkuat per posisi AS-KOP-KEPALA-EKOR"],
            ["Colok Bebas", "1 digit dominan di semua posisi"],
            ["Colok Jitu", "1 digit + 1 posisi dengan kepercayaan tertinggi"],
            ["Dasar", "Besar(≥50)/Kecil(<50) & Genap/Ganjil dari ekor"],
            ["Tengah/Tepi", "Tengah = ekor 25–74, Tepi = ekor 00–24 atau 75–99"],
            ["Silang/Homo", "Silang = kepala≠ekor, Homo = kepala=ekor"],
            ["Kembang", "Naik = ekor>kepala, Turun = ekor<kepala"],
            ["Shio / 2D BOM", "Shio dengan frekuensi 2D ekor tertinggi"],
            ["Jaga Twin", "4 angka kembar paling overdue"],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-2">
              <span className="font-black text-amber-400 flex-shrink-0 w-32">{t}</span>
              <span className={muted}>{d}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-current/10">
          {(["UTAMA","COCOK","CUKUP","SKIP"] as RecoLevel[]).map(lvl => (
            <div key={lvl} className="flex items-center gap-1 text-[10px]">
              <RecoBadge level={lvl}/>
              <span className={muted}>
                {lvl==="UTAMA"?"Sangat disarankan":lvl==="COCOK"?"Disarankan":lvl==="CUKUP"?"Bisa dicoba":"Kurang cocok"}
              </span>
            </div>
          ))}
        </div>
        <div className={`text-[10px] ${muted} pt-1`}>
          * Algoritma: frekuensi berbobot eksponensial + analisa gap/overdue + Markov chain + pola posisi.
          Tidak menjamin hasil — gunakan sebagai panduan strategi.
        </div>
      </div>
    </div>
  );
}
