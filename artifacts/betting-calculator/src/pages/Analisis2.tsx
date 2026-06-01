/**
 * Analisis 2 — Master Consensus Dashboard
 * Menjalankan 5 engine analisis independen secara paralel pada data histori yang sama,
 * kemudian mensintesis hasil menjadi rekomendasi berbasis konsensus tertinggi.
 *
 * Engine 1: Statistical Freq + Gap (frekuensi digit + overdue bonus)
 * Engine 2: Position Weighted Build (AS/KOP/KEPALA/EKOR gabungan 2D)
 * Engine 3: Transition Matrix (pola transisi antar 2D)
 * Engine 4: Weighted Recency (bobot eksponensial, draw terbaru lebih berat)
 * Engine 5: Shio + Pattern (shio hot/cold + pola kembar/lompat)
 */

import React, { useMemo, useState } from "react";
import {
  Brain, Zap, BarChart2, Flame, Snowflake,
  CheckCircle2, Star, TrendingUp, TrendingDown,
  Award, Hash, ChevronDown, ChevronUp, Target, Layers
} from "lucide-react";

/* ─────────────────────────────────── TYPES ─── */
interface ResultRow { hari: string; tanggal: string; [slot: string]: string; }
const TIME_SLOTS = ["00:01","13:00","16:00","19:00","22:00","23:00"];
const ALL_NUMS = Array.from({length:100}, (_,i) => String(i).padStart(2,"0"));
const DIGITS   = ["0","1","2","3","4","5","6","7","8","9"];

const SHIO_TABLE = [
  { name:"Ular",    nums:["01","13","25","37","49","61","73","85","97"] },
  { name:"Naga",    nums:["02","14","26","38","50","62","74","86","98"] },
  { name:"Kelinci", nums:["03","15","27","39","51","63","75","87","99"] },
  { name:"Harimau", nums:["04","16","28","40","52","64","76","88","00"] },
  { name:"Kerbau",  nums:["05","17","29","41","53","65","77","89"] },
  { name:"Tikus",   nums:["06","18","30","42","54","66","78","90"] },
  { name:"Babi",    nums:["07","19","31","43","55","67","79","91"] },
  { name:"Anjing",  nums:["08","20","32","44","56","68","80","92"] },
  { name:"Ayam",    nums:["09","21","33","45","57","69","81","93"] },
  { name:"Monyet",  nums:["10","22","34","46","58","70","82","94"] },
  { name:"Kambing", nums:["11","23","35","47","59","71","83","95"] },
  { name:"Kuda",    nums:["12","24","36","48","60","72","84","96"] },
];
function shioOf(d2:string) { return SHIO_TABLE.find(s=>s.nums.includes(d2)) ?? SHIO_TABLE[0]; }

/* ─────────────────────────────────── DATA EXTRACT ─── */
function extractDraws(rows: ResultRow[]): string[] {
  const out: string[] = [];
  for (const row of rows)
    for (const s of TIME_SLOTS) {
      const v = String(row[s]||"");
      if (v.length===4 && /^\d{4}$/.test(v)) out.push(v);
    }
  return out;
}
// 2D ekor = last 2 digits
function ekor2D(d4:string) { return d4.slice(2); }
// 2D depan = first 2 digits
function depan2D(d4:string) { return d4.slice(0,2); }

/* ══════════════════════════════════════════════════════════════════
   ENGINE 1 — Statistical Frequency + Gap
   Score each 2D by: (a) overall frequency, (b) recent 30 frequency,
   (c) gap bonus if overdue.
════════════════════════════════════════════════════════════════════ */
function engine1(draws: string[]): Record<string,number> {
  const total = draws.length;
  if (total < 5) return {};
  const n30   = Math.min(30, total);
  const n100  = Math.min(100, total);

  const freq100: Record<string,number> = {};
  const freq30:  Record<string,number> = {};
  const gap:     Record<string,number> = {};

  ALL_NUMS.forEach(k => { freq100[k]=0; freq30[k]=0; gap[k]=total; });

  draws.slice(0, n100).forEach((d,i) => {
    const k = ekor2D(d);
    freq100[k]++;
    if (i < n30) freq30[k]++;
    if (gap[k]===total) gap[k]=i;
  });

  const maxF100 = Math.max(...Object.values(freq100), 1);
  const maxF30  = Math.max(...Object.values(freq30),  1);
  const maxGap  = Math.max(...Object.values(gap),     1);
  const avgGap  = Object.values(gap).reduce((a,b)=>a+b,0) / 100;

  const out: Record<string,number> = {};
  ALL_NUMS.forEach(k => {
    const f100s = (freq100[k]/maxF100) * 40;
    const f30s  = (freq30[k]/maxF30)  * 35;
    const gs    = gap[k] > avgGap ? Math.min(25, (gap[k]/maxGap)*25) : 0;
    out[k] = f100s + f30s + gs;
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ENGINE 2 — Position-Weighted 2D Build
   Score each digit (0-9) per position independently,
   then build 2D scores by combining KEPALA+EKOR position strength.
════════════════════════════════════════════════════════════════════ */
function engine2(draws: string[]): Record<string,number> {
  if (draws.length < 5) return {};
  const n = Math.min(100, draws.length);
  // posFreq[pos][digit]
  const posFreq = Array.from({length:4}, () => Array(10).fill(0) as number[]);
  draws.slice(0,n).forEach(d => {
    for (let p=0;p<4;p++) posFreq[p][+d[p]]++;
  });
  // normalize each position
  const posMax = posFreq.map(pf => Math.max(...pf, 1));
  const posNorm = posFreq.map((pf,pi) => pf.map(v => v/posMax[pi]));

  // 2D ekor = pos[2] (kepala) + pos[3] (ekor)
  const out: Record<string,number> = {};
  ALL_NUMS.forEach(k => {
    const d1 = +k[0], d2 = +k[1];
    // Weight: kepala(pos2) + ekor(pos3), also consider pos1(kop) for depan
    const kepala = posNorm[2][d1];
    const ekor   = posNorm[3][d2];
    const kop    = posNorm[1][d1];  // bonus if digit also strong at kop
    out[k] = (kepala*0.45 + ekor*0.45 + kop*0.1) * 100;
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ENGINE 3 — Transition Matrix
   After each draw, what 2D tends to follow?
   Score = probability of k appearing after last known 2D.
════════════════════════════════════════════════════════════════════ */
function engine3(draws: string[]): Record<string,number> {
  if (draws.length < 10) return {};
  const mat: Record<string, Record<string,number>> = {};
  for (let i=0; i<draws.length-1; i++) {
    const from = ekor2D(draws[i+1]); // previous
    const to   = ekor2D(draws[i]);   // next
    if (!mat[from]) mat[from]={};
    mat[from][to] = (mat[from][to]||0)+1;
  }
  // Last known 2D
  const last = ekor2D(draws[0]);
  const row  = mat[last] ?? {};
  const total = Math.max(1, Object.values(row).reduce((a,b)=>a+b,0));
  const maxTrans = Math.max(1, ...Object.values(row));

  // Also second-order: what follows the most likely next?
  const out: Record<string,number> = {};
  ALL_NUMS.forEach(k => {
    const direct = ((row[k]||0) / total) * 70;
    // second-order: if k is likely to follow top transition candidates
    const topFollower = Object.entries(row).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? last;
    const secondRow = mat[topFollower] ?? {};
    const secTotal  = Math.max(1, Object.values(secondRow).reduce((a,b)=>a+b,0));
    const indirect  = ((secondRow[k]||0) / secTotal) * 30;
    out[k] = direct + indirect;
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ENGINE 4 — Weighted Recency (exponential decay)
   Draws closer to present have exponentially more weight.
   Decay factor = 0.93 per draw.
════════════════════════════════════════════════════════════════════ */
function engine4(draws: string[]): Record<string,number> {
  if (draws.length < 5) return {};
  const wFreq: Record<string,number> = {};
  ALL_NUMS.forEach(k => wFreq[k]=0);
  draws.forEach((d,i) => {
    const k  = ekor2D(d);
    const w  = Math.pow(0.93, i);
    wFreq[k] += w;
  });
  const maxW = Math.max(...Object.values(wFreq), 1);
  const out: Record<string,number> = {};
  ALL_NUMS.forEach(k => { out[k] = (wFreq[k]/maxW)*100; });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ENGINE 5 — Shio + Pattern
   Hot shio = appears frequently in recent 30 draws → bonus to its nums.
   Pattern kembar/lompat appeared recently → bonus.
════════════════════════════════════════════════════════════════════ */
function engine5(draws: string[]): Record<string,number> {
  if (draws.length < 5) return {};
  const n30 = Math.min(30, draws.length);
  const shioFreq: Record<string,number> = {};
  SHIO_TABLE.forEach(s => shioFreq[s.name]=0);
  draws.slice(0,n30).forEach(d => {
    const sh = shioOf(ekor2D(d));
    shioFreq[sh.name]++;
  });
  const maxSh = Math.max(...Object.values(shioFreq), 1);

  // Pattern bonuses in recent 20 draws
  const recent20 = draws.slice(0,20);
  const kembarSet = new Set<string>();
  const lompatSet = new Set<string>();
  recent20.forEach(d => {
    for (let i=0;i<3;i++) if (d[i]===d[i+1]) kembarSet.add(ekor2D(d));
    const digits = d.split("").map(Number);
    const diffs  = [digits[1]-digits[0], digits[2]-digits[1], digits[3]-digits[2]];
    if (diffs[0]!==0 && diffs.every(x=>x===diffs[0])) lompatSet.add(ekor2D(d));
  });

  const out: Record<string,number> = {};
  ALL_NUMS.forEach(k => {
    const sh = shioOf(k);
    const shScore  = (shioFreq[sh.name]/maxSh)*60;
    const kemBonus = kembarSet.has(k) ? 25 : 0;
    const lomBonus = lompatSet.has(k) ? 15 : 0;
    out[k] = shScore + kemBonus + lomBonus;
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   MASTER CONSENSUS ENGINE
   Runs all 5 engines, normalizes, computes weighted consensus.
   Agreement bonus: if 3+ engines rank a number in their top 25%, +20 bonus.
════════════════════════════════════════════════════════════════════ */
const ENGINE_LABELS = ["Freq+Gap","Posisi","Transisi","Recency","Shio+Pola"];
const ENGINE_WEIGHTS = [0.28, 0.22, 0.20, 0.18, 0.12];
const ENGINE_COLORS  = ["text-orange-400","text-blue-400","text-purple-400","text-green-400","text-pink-400"];
const ENGINE_BG      = ["bg-orange-500/15","bg-blue-500/15","bg-purple-500/15","bg-green-500/15","bg-pink-500/15"];
const ENGINE_ICONS   = [Flame, Target, Layers, TrendingUp, Star];

interface Candidate2D {
  num: string;
  consensus: number;
  engines: number[];   // raw score per engine (0-100)
  agree: number;        // how many engines rank it top-25%
  shio: string;
  rank: number;
}

function runConsensus(draws: string[]) {
  if (draws.length < 10) return null;

  const rawEngines = [
    engine1(draws),
    engine2(draws),
    engine3(draws),
    engine4(draws),
    engine5(draws),
  ];

  // Normalize each engine to 0-100
  const engines = rawEngines.map(e => {
    const max = Math.max(...Object.values(e), 1);
    const norm: Record<string,number> = {};
    ALL_NUMS.forEach(k => norm[k] = (e[k]||0)/max*100);
    return norm;
  });

  // Per-engine top-25 threshold
  const thresholds = engines.map(e => {
    const vals = Object.values(e).sort((a,b)=>b-a);
    return vals[Math.floor(vals.length*0.25)] ?? 0;
  });

  // Compute consensus per 2D
  const candidates: Candidate2D[] = ALL_NUMS.map(k => {
    const scores = engines.map(e => e[k]||0);
    const weighted = scores.reduce((acc,s,i) => acc + s*ENGINE_WEIGHTS[i], 0);
    const agree    = scores.filter((s,i) => s >= thresholds[i]).length;
    const bonus    = agree >= 4 ? 20 : agree >= 3 ? 10 : 0;
    const consensus = Math.min(100, weighted + bonus);
    return {
      num: k,
      consensus: Math.round(consensus),
      engines: scores.map(s => Math.round(s)),
      agree,
      shio: shioOf(k).name,
      rank: 0,
    };
  });
  candidates.sort((a,b) => b.consensus - a.consensus);
  candidates.forEach((c,i) => c.rank = i+1);

  const top20_2D = candidates.slice(0,20);

  // BBFS: top digits by consensus 2D coverage
  const digitScore: Record<string,number> = {};
  DIGITS.forEach(d => { digitScore[d]=0; });
  candidates.forEach((c,rank) => {
    const boost = 1 / (rank+1);
    digitScore[c.num[0]] += boost;
    digitScore[c.num[1]] += boost;
  });
  const sortedDigits = DIGITS.slice().sort((a,b) => digitScore[b]-digitScore[a]);
  const bbfs8 = sortedDigits.slice(0,8).join("");
  const bbfs6 = sortedDigits.slice(0,6).join("");

  // 3D candidates: combine top 2D ekor with top KEPALA
  const top3D: {num:string; score:number}[] = [];
  const seen3D = new Set<string>();
  // Get top kepala digits from engine2
  const kepalaScores: Record<string,number> = {};
  const ekorScores:   Record<string,number> = {};
  DIGITS.forEach(d => { kepalaScores[d]=0; ekorScores[d]=0; });
  top20_2D.slice(0,10).forEach(c => {
    kepalaScores[c.num[0]] += c.consensus;
    ekorScores[c.num[1]]   += c.consensus;
  });
  const topKepala = DIGITS.slice().sort((a,b)=>kepalaScores[b]-kepalaScores[a]).slice(0,5);
  const topEkor   = DIGITS.slice().sort((a,b)=>ekorScores[b]-ekorScores[a]).slice(0,5);
  const topKop    = sortedDigits.slice(0,5);

  for (const kop of topKop) for (const kpl of topKepala) for (const ekr of topEkor) {
    const k = `${kop}${kpl}${ekr}`;
    if (seen3D.has(k)) continue;
    seen3D.add(k);
    const d2match = candidates.find(c=>c.num===`${kpl}${ekr}`);
    const score   = Math.round((digitScore[kop]||0)*20 + (d2match?.consensus||0)*0.8);
    top3D.push({ num:k, score });
    if (top3D.length >= 25) break;
  }
  top3D.sort((a,b)=>b.score-a.score);

  // 4D candidates
  const top4D: {num:string; score:number; reason:string}[] = [];
  const seen4D = new Set<string>();
  const topAS = sortedDigits.slice(0,4);
  for (const as of topAS) for (const d3 of top3D.slice(0,8)) {
    const k = `${as}${d3.num}`;
    if (seen4D.has(k)) continue;
    seen4D.add(k);
    const d2part = k.slice(2);
    const d2c    = candidates.find(c=>c.num===d2part);
    const score  = Math.round((digitScore[as]||0)*15 + (d2c?.consensus||0)*0.85);
    const reason = `AS:${as} kuat, 2D ${d2part} rank #${d2c?.rank||"?"}`;
    top4D.push({num:k, score, reason});
    if (top4D.length>=15) break;
  }
  top4D.sort((a,b)=>b.score-a.score);

  // Shio ranking (consensus)
  const shioRank = SHIO_TABLE.map(sh => {
    const avg = sh.nums.reduce((acc,n) => {
      const c = candidates.find(x=>x.num===n);
      return acc + (c?.consensus||0);
    }, 0) / sh.nums.length;
    return { name: sh.name, score: Math.round(avg), count: sh.nums.length };
  }).sort((a,b)=>b.score-a.score);

  // Today's slot prediction (next unknown slot → top 5 per slot)
  const lastD2 = ekor2D(draws[0]);

  // Engine agreement matrix: for each top-10 candidate, which engines agree?
  const agreementMatrix = top20_2D.slice(0,10).map(c => ({
    num:    c.num,
    agree:  c.agree,
    engines: c.engines,
  }));

  return {
    draws,
    candidates, top20_2D,
    top3D: top3D.slice(0,20),
    top4D: top4D.slice(0,10),
    bbfs8, bbfs6, sortedDigits, digitScore,
    engines, thresholds,
    shioRank, lastD2,
    agreementMatrix,
  };
}

/* ─────────────────────────────────── MAIN COMPONENT ─── */
type Tab2 = "konsensus" | "kandidat" | "engine" | "shio";

interface Props {
  resultData: ResultRow[];
  isDark: boolean;
}

export default function Analisis2({ resultData, isDark }: Props) {
  const [tab, setTab]   = useState<Tab2>("konsensus");
  const [d2d3, setD2d3] = useState<"2D"|"3D"|"4D">("2D");
  const [expand, setExpand] = useState<string|null>(null);

  const draws = useMemo(()=>extractDraws(resultData),[resultData]);
  const sc    = useMemo(()=>runConsensus(draws),[draws]);

  const card  = isDark ? "rounded-2xl border border-white/10 bg-white/5 shadow-2xl" : "rounded-2xl border border-slate-200 bg-white shadow-xl";
  const muted = isDark ? "text-white/40" : "text-slate-400";
  const main  = isDark ? "text-white"    : "text-slate-800";

  const TABS = [
    { id:"konsensus" as Tab2, label:"Konsensus" },
    { id:"kandidat"  as Tab2, label:"Kandidat"  },
    { id:"engine"    as Tab2, label:"5 Engine"  },
    { id:"shio"      as Tab2, label:"Shio"      },
  ];

  if (draws.length < 10) {
    return (
      <div className={`${card} p-12 text-center animate-slide-up`}>
        <Brain className="w-14 h-14 mx-auto mb-4 opacity-20"/>
        <h3 className="font-black text-lg mb-1">Data belum cukup</h3>
        <p className={`text-sm ${muted}`}>Diperlukan minimal 10 draw. Buka tab Result untuk memuat data.</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-4 pb-4">
      {/* ─── Header ─── */}
      <div className="rounded-2xl bg-gradient-to-r from-rose-700 via-red-700 to-orange-700 text-white p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 opacity-80"/>
              <span className="text-xs font-bold opacity-70 uppercase tracking-widest">Master Consensus Engine</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Analisis 2 · Sinkron</h1>
            <p className="text-xs opacity-60 mt-1">
              {draws.length} draw · 5 engine independen · hasil terkonsolidasi
            </p>
          </div>
          {sc && (
            <div className="text-right">
              <div className="text-xs opacity-60 mb-0.5">BBFS Konsensus</div>
              <div className="font-black text-2xl tracking-widest text-yellow-300">{sc.bbfs8}</div>
              <div className="text-xs opacity-60 mt-1 mb-0.5">BBFS Cadangan</div>
              <div className="font-black text-lg tracking-widest text-yellow-200/70">{sc.bbfs6}</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Tab bar ─── */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              tab===t.id ? "bg-rose-600 text-white shadow-md"
                         : isDark?"bg-white/8 text-white/60 hover:bg-white/15":"bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {sc && tab==="konsensus" && (
        <KonsensusTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}/>
      )}
      {sc && tab==="kandidat" && (
        <KandidatTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}
          d2d3={d2d3} setD2d3={setD2d3}/>
      )}
      {sc && tab==="engine" && (
        <EngineTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}
          expand={expand} setExpand={setExpand}/>
      )}
      {sc && tab==="shio" && (
        <ShioTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}/>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: KONSENSUS
════════════════════════════════════════════════════════════════════ */
function KonsensusTab({ sc, isDark, card, muted, main }: { sc: NonNullable<ReturnType<typeof runConsensus>>; isDark:boolean; card:string; muted:string; main:string }) {
  const high  = sc.top20_2D.filter(c=>c.agree>=4);
  const med   = sc.top20_2D.filter(c=>c.agree===3);
  const low   = sc.top20_2D.filter(c=>c.agree<=2);

  return (
    <div className="space-y-4">
      {/* BBFS mega cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-yellow-400"/>
            <p className={`text-xs font-bold ${muted}`}>BBFS UTAMA (8 digit)</p>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {sc.bbfs8.split("").map((d,i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-black text-lg shadow-lg">{d}</div>
            ))}
          </div>
          <p className={`text-[10px] ${muted}`}>5 engine sinkron · skor tertimbang</p>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-blue-400"/>
            <p className={`text-xs font-bold ${muted}`}>BBFS CADANGAN (6 digit)</p>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {sc.bbfs6.split("").map((d,i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-lg">{d}</div>
            ))}
          </div>
          <p className={`text-[10px] ${muted}`}>Subset 6 digit terkuat</p>
        </div>
      </div>

      {/* Agreement bands */}
      {[
        { label:"🔥 Konsensus TINGGI (4-5 engine sepakat)", items:high, cls:"border-red-500/30 bg-red-500/5" },
        { label:"⚡ Konsensus SEDANG (3 engine sepakat)",   items:med,  cls:"border-yellow-500/30 bg-yellow-500/5" },
        { label:"🔵 Konsensus RENDAH (≤2 engine sepakat)",  items:low,  cls:isDark?"border-white/8 bg-white/3":"border-slate-200 bg-slate-50" },
      ].map(({ label, items, cls }) => items.length > 0 && (
        <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
          <p className={`text-xs font-bold mb-3 ${muted}`}>{label}</p>
          <div className="flex flex-wrap gap-2">
            {items.map((c,i) => (
              <div key={c.num} className="relative group">
                <div className={`font-black text-base px-2.5 py-1.5 rounded-xl tabular-nums tracking-widest cursor-default ${
                  c.agree>=4 ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : c.agree===3 ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                  : isDark?"bg-white/8 text-white/60 border border-white/10":"bg-white text-slate-600 border border-slate-200"
                }`} title={`Rank #${c.rank} · ${c.agree}/5 engine · Shio ${c.shio}`}>
                  {c.num}
                </div>
                {i<3 && c.agree>=4 && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center">
                    <Star className="w-2.5 h-2.5 text-yellow-900"/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Top-10 agreement matrix */}
      <div className={`${card} p-5`}>
        <p className={`text-xs font-bold mb-4 ${muted}`}>MATRIX KESEPAKATAN — TOP 10 KANDIDAT 2D</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={muted}>
                <th className="text-left pb-2 font-bold">2D</th>
                {ENGINE_LABELS.map((l,i) => (
                  <th key={i} className="text-center pb-2 font-bold px-1">{l.split("+")[0]}</th>
                ))}
                <th className="text-center pb-2 font-bold">Sepakat</th>
                <th className="text-center pb-2 font-bold">Skor</th>
              </tr>
            </thead>
            <tbody>
              {sc.top20_2D.slice(0,10).map((c,ri) => (
                <tr key={c.num} className={`border-t ${isDark?"border-white/5":"border-slate-50"}`}>
                  <td className="py-1.5 pr-2">
                    <span className={`font-black text-sm tabular-nums ${ri<3?"text-yellow-400":main}`}>{c.num}</span>
                  </td>
                  {c.engines.map((s,ei) => {
                    const isTop = s >= sc.thresholds[ei];
                    return (
                      <td key={ei} className="py-1.5 text-center px-1">
                        {isTop
                          ? <CheckCircle2 className={`w-4 h-4 mx-auto ${ENGINE_COLORS[ei]}`}/>
                          : <span className={`text-[9px] ${muted}`}>{Math.round(s)}</span>}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-center">
                    <span className={`font-black text-sm ${c.agree>=4?"text-red-400":c.agree>=3?"text-yellow-400":"text-blue-400"}`}>{c.agree}/5</span>
                  </td>
                  <td className="py-1.5 text-center">
                    <span className="font-black">{c.consensus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick 3D/4D picks */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${card} p-4`}>
          <p className={`text-xs font-bold mb-3 ${muted}`}>TOP 5 KANDIDAT 3D</p>
          <div className="space-y-1.5">
            {sc.top3D.slice(0,5).map((c,i) => (
              <div key={c.num} className="flex items-center gap-2">
                <span className={`text-[10px] font-bold w-4 text-right ${muted}`}>#{i+1}</span>
                <span className={`font-black tracking-widest text-sm px-2 py-0.5 rounded-lg ${isDark?"bg-emerald-500/15 text-emerald-300":"bg-emerald-50 text-emerald-700"}`}>{c.num}</span>
                <span className={`text-[10px] ml-auto ${muted}`}>{c.score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`${card} p-4`}>
          <p className={`text-xs font-bold mb-3 ${muted}`}>TOP 5 KANDIDAT 4D</p>
          <div className="space-y-1.5">
            {sc.top4D.slice(0,5).map((c,i) => (
              <div key={c.num} className="flex items-center gap-2">
                <span className={`text-[10px] font-bold w-4 text-right ${muted}`}>#{i+1}</span>
                <span className={`font-black tracking-widest text-sm px-2 py-0.5 rounded-lg ${isDark?"bg-rose-500/15 text-rose-300":"bg-rose-50 text-rose-700"}`}>{c.num}</span>
                <span className={`text-[10px] ml-auto ${muted}`}>{c.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: KANDIDAT
════════════════════════════════════════════════════════════════════ */
function KandidatTab({ sc, isDark, card, muted, main, d2d3, setD2d3 }: {
  sc: NonNullable<ReturnType<typeof runConsensus>>; isDark:boolean; card:string; muted:string; main:string;
  d2d3:"2D"|"3D"|"4D"; setD2d3:(v:"2D"|"3D"|"4D")=>void;
}) {
  const list = d2d3==="2D" ? sc.top20_2D.map(c=>({num:c.num, score:c.consensus, sub:`${c.agree}/5 engine · ${c.shio}`}))
    : d2d3==="3D" ? sc.top3D.map(c=>({num:c.num, score:c.score, sub:""}))
    : sc.top4D.map(c=>({num:c.num, score:c.score, sub:c.reason}));
  const maxScore = Math.max(...list.map(x=>x.score), 1);

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["2D","3D","4D"] as const).map(t => (
          <button key={t} onClick={()=>setD2d3(t)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
              d2d3===t ? "bg-rose-600 text-white shadow-md" : isDark?"bg-white/8 text-white/60":"bg-slate-100 text-slate-500"
            }`}>
            {t==="2D"?"20 Kandidat 2D":t==="3D"?"20 Kandidat 3D":"10 Kandidat 4D"}
          </button>
        ))}
      </div>

      <div className={`${card} p-5`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-[10px] font-bold ${muted} border-b ${isDark?"border-white/10":"border-slate-100"}`}>
                <th className="text-left pb-3">#</th>
                <th className="text-left pb-3">Nomor</th>
                <th className="text-center pb-3">Skor</th>
                <th className="text-left pb-3">Keyakinan</th>
                <th className="text-left pb-3 hidden md:table-cell">Detail</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item,i) => {
                const pct = Math.round(item.score/maxScore*100);
                const agreeNum = d2d3==="2D" ? sc.top20_2D[i]?.agree ?? 0 : 0;
                return (
                  <tr key={item.num} className={`border-t ${isDark?"border-white/5":"border-slate-50"}`}>
                    <td className={`py-2 text-xs font-bold ${i<3?"text-yellow-400":i<8?"text-orange-400":muted}`}>#{i+1}</td>
                    <td className="py-2">
                      <span className={`font-black text-base tabular-nums tracking-widest px-2 py-0.5 rounded-lg ${
                        i<3 ? "bg-yellow-500/15 text-yellow-400"
                        : isDark?"bg-white/8":"bg-slate-100 text-slate-700"
                      }`}>{item.num}</span>
                    </td>
                    <td className="py-2 text-center font-black">{item.score}</td>
                    <td className="py-2 w-32">
                      <div className="flex items-center gap-1.5">
                        <div className={`flex-1 h-2 rounded-full ${isDark?"bg-white/10":"bg-slate-100"}`}>
                          <div className={`h-2 rounded-full ${pct>=80?"bg-red-500":pct>=60?"bg-orange-500":pct>=40?"bg-yellow-500":"bg-blue-500"}`} style={{width:`${pct}%`}}/>
                        </div>
                        <span className={`text-[9px] font-bold w-8 ${muted}`}>{pct}%</span>
                      </div>
                    </td>
                    <td className={`py-2 text-[10px] hidden md:table-cell ${muted}`}>
                      {d2d3==="2D" && agreeNum > 0 && (
                        <span className={`mr-1 font-bold ${agreeNum>=4?"text-red-400":agreeNum>=3?"text-yellow-400":"text-blue-400"}`}>
                          {agreeNum}/5
                        </span>
                      )}
                      {item.sub}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* compact grid */}
      <div className={`${card} p-4`}>
        <p className={`text-xs font-bold mb-3 ${muted}`}>GRID CEPAT</p>
        <div className="flex flex-wrap gap-2">
          {list.map((item,i) => (
            <div key={item.num}
              className={`font-black text-sm px-2.5 py-1.5 rounded-xl tabular-nums tracking-wider border ${
                i<3  ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300"
                :i<8 ? isDark?"bg-orange-500/10 border-orange-500/20 text-orange-300":"bg-orange-50 border-orange-200 text-orange-600"
                :isDark?"bg-white/5 border-white/10":"bg-slate-50 border-slate-200 text-slate-700"
              }`}>
              {item.num}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: 5 ENGINE DETAIL
════════════════════════════════════════════════════════════════════ */
function EngineTab({ sc, isDark, card, muted, main, expand, setExpand }: {
  sc: NonNullable<ReturnType<typeof runConsensus>>; isDark:boolean; card:string; muted:string; main:string;
  expand:string|null; setExpand:(s:string|null)=>void;
}) {
  const engineDescs = [
    "Frekuensi histori 100 draw + bonus gap/overdue untuk nomor yang belum lama keluar.",
    "Analisis tiap posisi AS/KOP/KEPALA/EKOR secara terpisah, lalu gabungkan menjadi skor 2D.",
    "Pola transisi: 2D apa yang cenderung muncul setelah 2D terakhir? (orde-1 & orde-2)",
    "Bobot eksponensial (decay 0.93/draw): draw terbaru jauh lebih berpengaruh dari draw lama.",
    "Shio yang sedang hot dalam 30 draw terakhir + bonus pola kembar/lompat dalam 20 draw terakhir.",
  ];

  return (
    <div className="space-y-3">
      <div className={`${card} p-4`}>
        <p className={`text-xs font-bold mb-1 ${muted}`}>ARSITEKTUR ANALISIS</p>
        <p className={`text-[10px] leading-relaxed ${muted}`}>
          Setiap engine berjalan independen pada data histori yang sama. Hasilnya dinormalisasi ke 0–100,
          kemudian digabungkan dengan bobot tertimbang. Angka yang masuk top-25% di 3+ engine mendapat bonus +10 atau +20.
        </p>
      </div>

      {ENGINE_LABELS.map((label,ei) => {
        const EIcon = ENGINE_ICONS[ei];
        const top5 = ALL_NUMS.slice().sort((a,b)=>(sc.engines[ei][b]||0)-(sc.engines[ei][a]||0)).slice(0,5);
        const isOpen = expand===label;
        return (
          <div key={label} className={`${card} overflow-hidden`}>
            <button
              className="w-full flex items-center gap-3 px-5 py-4"
              onClick={()=>setExpand(isOpen?null:label)}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ENGINE_BG[ei]}`}>
                <EIcon className={`w-4 h-4 ${ENGINE_COLORS[ei]}`}/>
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className={`font-black text-sm ${main}`}>
                  Engine {ei+1}: {label}
                </div>
                <div className={`text-[10px] ${muted}`}>
                  Bobot: {Math.round(ENGINE_WEIGHTS[ei]*100)}% · Top-5: {top5.map(n=><span key={n} className={`${ENGINE_COLORS[ei]} font-bold mr-1`}>{n}</span>)}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 opacity-40 flex-shrink-0"/> : <ChevronDown className="w-4 h-4 opacity-40 flex-shrink-0"/>}
            </button>
            {isOpen && (
              <div className={`px-5 pb-5 border-t ${isDark?"border-white/5":"border-slate-100"}`}>
                <p className={`text-[10px] leading-relaxed mt-3 mb-4 ${muted}`}>{engineDescs[ei]}</p>
                <p className={`text-[10px] font-bold mb-2 ${muted}`}>RANKING TOP 20</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {ALL_NUMS.slice().sort((a,b)=>(sc.engines[ei][b]||0)-(sc.engines[ei][a]||0)).slice(0,20).map((n,ri) => {
                    const s = Math.round(sc.engines[ei][n]||0);
                    return (
                      <div key={n} className={`flex flex-col items-center py-1.5 px-2 rounded-xl ${ENGINE_BG[ei]} border ${isDark?"border-white/5":"border-transparent"}`}>
                        <span className={`font-black text-sm ${ENGINE_COLORS[ei]}`}>{n}</span>
                        <span className={`text-[8px] ${muted}`}>#{ri+1} · {s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: SHIO CONSENSUS
════════════════════════════════════════════════════════════════════ */
function ShioTab({ sc, isDark, card, muted, main }: {
  sc: NonNullable<ReturnType<typeof runConsensus>>; isDark:boolean; card:string; muted:string; main:string;
}) {
  const maxScore = Math.max(...sc.shioRank.map(s=>s.score), 1);
  const EMOJIS: Record<string,string> = {
    Ular:"🐍",Naga:"🐉",Kelinci:"🐰",Harimau:"🐯",Kerbau:"🐃",
    Tikus:"🐭",Babi:"🐷",Anjing:"🐶",Ayam:"🐔",Monyet:"🐵",Kambing:"🐑",Kuda:"🐴"
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className={`text-xs font-bold mb-4 ${muted}`}>RANKING SHIO BERDASARKAN KONSENSUS 5 ENGINE</p>
        <div className="space-y-2">
          {sc.shioRank.map((sh,i) => {
            const pct = Math.round(sh.score/maxScore*100);
            const nums = SHIO_TABLE.find(s=>s.name===sh.name)?.nums ?? [];
            return (
              <div key={sh.name} className={`rounded-xl p-3 ${isDark?"bg-white/5":"bg-slate-50"}`}>
                <div className="flex items-center gap-3 mb-1.5">
                  <span className={`text-[10px] font-bold w-4 ${muted}`}>#{i+1}</span>
                  <span className="text-xl">{EMOJIS[sh.name]}</span>
                  <span className={`font-black ${main}`}>{sh.name}</span>
                  <div className={`flex-1 h-3 rounded-full ml-2 ${isDark?"bg-white/10":"bg-slate-200"} overflow-hidden`}>
                    <div className={`h-3 rounded-full ${pct>=80?"bg-red-500":pct>=60?"bg-orange-500":pct>=40?"bg-yellow-500":pct>=20?"bg-green-500":"bg-blue-500"}`} style={{width:`${pct}%`}}/>
                  </div>
                  <span className={`text-xs font-black w-12 text-right ${pct>=80?"text-red-400":pct>=60?"text-orange-400":pct>=40?"text-yellow-400":"text-blue-400"}`}>{sh.score}pt</span>
                </div>
                <div className="flex flex-wrap gap-1 ml-8">
                  {nums.map(n => {
                    const c = sc.candidates.find(x=>x.num===n);
                    const isTop = (c?.rank??999) <= 10;
                    return (
                      <span key={n} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isTop
                          ? isDark?"bg-yellow-500/20 text-yellow-300":"bg-yellow-100 text-yellow-700"
                          : isDark?"bg-white/5 text-white/40":"bg-white text-slate-400"
                      }`}>
                        {n}{isTop && " ★"}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${card} p-4`}>
        <p className={`text-xs font-bold mb-2 ${muted}`}>SHIO HOT vs COLD</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5 text-orange-400"/>
              <span className={`text-xs font-bold ${muted}`}>Hot Shio</span>
            </div>
            {sc.shioRank.slice(0,4).map(sh => (
              <div key={sh.name} className="flex items-center gap-2 mb-1">
                <span>{EMOJIS[sh.name]}</span>
                <span className={`text-xs font-black ${main}`}>{sh.name}</span>
                <span className={`text-[10px] ml-auto ${muted}`}>{sh.score}pt</span>
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Snowflake className="w-3.5 h-3.5 text-cyan-400"/>
              <span className={`text-xs font-bold ${muted}`}>Cold Shio</span>
            </div>
            {sc.shioRank.slice(-4).reverse().map(sh => (
              <div key={sh.name} className="flex items-center gap-2 mb-1">
                <span>{EMOJIS[sh.name]}</span>
                <span className={`text-xs font-black ${main}`}>{sh.name}</span>
                <span className={`text-[10px] ml-auto ${muted}`}>{sh.score}pt</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
