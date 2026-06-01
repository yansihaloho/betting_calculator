import React, { useMemo, useState } from "react";
import {
  Flame, Snowflake, BarChart2, Hash, Star, Target,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Award
} from "lucide-react";

interface ResultRow { hari: string; tanggal: string; [slot: string]: string; }
const TIME_SLOTS = ["00:01","13:00","16:00","19:00","22:00","23:00"];
const DIGITS = ["0","1","2","3","4","5","6","7","8","9"];

/* ─── Engine: extract flat list of 4D draws (newest first) ─── */
function extractDraws(resultData: ResultRow[]): string[] {
  const out: string[] = [];
  for (const row of resultData) {
    for (const s of TIME_SLOTS) {
      const v = String(row[s] || "");
      if (v.length === 4 && /^\d{4}$/.test(v)) out.push(v);
    }
  }
  return out; // newest first (resultData[0] = most recent day)
}

/* ─── Per-digit frequency per window ─── */
function digitFreq(draws: string[], n: number): Record<string, number> {
  const f: Record<string, number> = {};
  DIGITS.forEach(d => f[d] = 0);
  draws.slice(0, n).forEach(draw => {
    draw.split("").forEach(d => f[d]++);
  });
  return f;
}

/* ─── Weighted frequency (exponential decay, recent = heavier) ─── */
function weightedDigitFreq(draws: string[]): Record<string, number> {
  const f: Record<string, number> = {};
  DIGITS.forEach(d => f[d] = 0);
  draws.forEach((draw, i) => {
    const w = Math.pow(0.96, i);
    draw.split("").forEach(d => f[d] += w);
  });
  return f;
}

/* ─── Position analysis: freq[pos][digit] ─── */
function positionFreq(draws: string[], n: number): number[][] {
  const pos = [[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],
               [0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]];
  draws.slice(0, n).forEach(draw => {
    for (let p = 0; p < 4; p++) pos[p][+draw[p]]++;
  });
  return pos;
}

/* ─── Gap analysis: how many draws since digit last appeared in each pos ─── */
function gapAnalysis(draws: string[]): { pos: number[][]; overall: number[] } {
  const posGap = Array.from({length:4}, () => Array(10).fill(-1));
  const overallGap = Array(10).fill(-1);
  draws.forEach((draw, i) => {
    for (let p = 0; p < 4; p++) {
      const d = +draw[p];
      if (posGap[p][d] === -1) posGap[p][d] = i;
    }
    draw.split("").forEach(ch => {
      const d = +ch;
      if (overallGap[d] === -1) overallGap[d] = i;
    });
  });
  // Single final pass — fill any digit never seen with draws.length
  for (let p = 0; p < 4; p++)
    for (let d = 0; d < 10; d++)
      if (posGap[p][d] === -1) posGap[p][d] = draws.length;
  for (let d = 0; d < 10; d++)
    if (overallGap[d] === -1) overallGap[d] = draws.length;
  return { pos: posGap, overall: overallGap };
}

/* ─── Transition matrix: 2D → next 2D ─── */
function buildTransitionMatrix(draws: string[]): Record<string, Record<string, number>> {
  const mat: Record<string, Record<string, number>> = {};
  const d2List = draws.map(d => d.slice(2)); // ekor 2D
  for (let i = 0; i < d2List.length - 1; i++) {
    const from = d2List[i+1]; // previous result
    const to   = d2List[i];   // next result
    if (!mat[from]) mat[from] = {};
    mat[from][to] = (mat[from][to] || 0) + 1;
  }
  return mat;
}

/* ─── Pattern detection ─── */
function detectPatterns(draws: string[]): {
  kembar: string[]; cermin: string[]; ulang: string[]; lompat: string[];
} {
  const kembarSet = new Set<string>();
  const cerminSet = new Set<string>();
  const ulangSet  = new Set<string>();
  const lompatSet = new Set<string>();

  draws.forEach(d => {
    // Kembar: any two same adjacent digits
    for (let i = 0; i < 3; i++) if (d[i] === d[i+1]) kembarSet.add(d);
    // Cermin: last 2 digits are reverse of first 2
    if (d[0]===d[3] && d[1]===d[2]) cerminSet.add(d);
    if (d.slice(0,2) === d.slice(2,4).split("").reverse().join("")) cerminSet.add(d);
    // Ulang: all 4 digits same
    if ([...d].every(c => c === d[0])) ulangSet.add(d);
  });

  // Lompat: digits increase/decrease by consistent step
  draws.forEach(d => {
    const digits = d.split("").map(Number);
    const diffs = [digits[1]-digits[0], digits[2]-digits[1], digits[3]-digits[2]];
    if (diffs[0] !== 0 && diffs.every(x => x === diffs[0])) lompatSet.add(d);
  });

  return {
    kembar: [...kembarSet].slice(0,10),
    cermin: [...cerminSet].slice(0,10),
    ulang:  [...ulangSet].slice(0,10),
    lompat: [...lompatSet].slice(0,10),
  };
}

/* ─── Master scoring engine ─── */
function computeScores(draws: string[]) {
  if (draws.length < 5) return null;

  const n10  = Math.min(10,  draws.length);
  const n30  = Math.min(30,  draws.length);
  const n50  = Math.min(50,  draws.length);
  const n100 = Math.min(100, draws.length);

  const f10   = digitFreq(draws, n10);
  const f30   = digitFreq(draws, n30);
  const f50   = digitFreq(draws, n50);
  const f100  = digitFreq(draws, n100);
  const fw    = weightedDigitFreq(draws);
  const posFq = positionFreq(draws, n100);
  const gaps  = gapAnalysis(draws);
  const trans = buildTransitionMatrix(draws);
  const pats  = detectPatterns(draws);

  // Besar/Kecil & Ganjil/Genap distribution per window
  const bkStats = (n: number) => {
    let b=0, k=0, g=0, p=0;
    draws.slice(0,n).forEach(d => {
      const v = parseInt(d);
      if (v >= 5000) b++; else k++;
      if (v % 2 === 1) g++; else p++;
    });
    return { besar:b, kecil:k, ganjil:g, genap:p, total:n };
  };

  // ─── Composite digit score (0-9) ───
  const digitScore: Record<string, number> = {};
  const digitReason: Record<string, string[]> = {};
  const maxW10  = Math.max(...Object.values(f10)  as number[]) || 1;
  const maxW30  = Math.max(...Object.values(f30)  as number[]) || 1;
  const maxW100 = Math.max(...Object.values(f100) as number[]) || 1;
  const maxWW   = Math.max(...Object.values(fw)   as number[]) || 1;

  DIGITS.forEach(d => {
    const reasons: string[] = [];
    // Weighted frequency (40%)
    const wScore = (fw[d] / maxWW) * 40;
    // Short window trend (20%)
    const tScore = (f10[d] / (maxW10||1)) * 20;
    // Gap bonus: overdue = boost (10%)
    const gap = gaps.overall[+d];
    const avgGap = gaps.overall.reduce((a,b)=>a+b,0) / 10;
    const gapScore = gap > avgGap ? Math.min(10, (gap / avgGap - 1) * 8) : 0;
    // Position consistency (30%)
    const posScores = posFq.map(pf => pf[+d] / (Math.max(...pf)||1));
    const posScore = (posScores.reduce((a,b)=>a+b,0) / 4) * 30;

    const total = wScore + tScore + gapScore + posScore;
    digitScore[d] = Math.round(total);

    if (f10[d] > f10[(+d+1)%10+""] && f10[d] > f10[(+d+9)%10+""])
      reasons.push(`Aktif dalam 10 result terakhir (${f10[d]}x)`);
    if (gap > avgGap * 1.5) reasons.push(`Tertunda ${gap} draw (overdue)`);
    if (fw[d] / maxWW > 0.7) reasons.push(`Frekuensi tertimbang tinggi`);
    const topPos = posScores.indexOf(Math.max(...posScores));
    const posNames = ["AS","KOP","KEPALA","EKOR"];
    reasons.push(`Posisi terkuat: ${posNames[topPos]}`);
    if (f100[d] > f30[d] * (100/30) * 1.2) reasons.push(`Tren menurun`);
    else if (f30[d] > f100[d] * (30/100) * 1.2) reasons.push(`Tren meningkat`);
    digitReason[d] = reasons;
  });

  const sortedDigits = DIGITS.slice().sort((a,b) => digitScore[b] - digitScore[a]);
  const bbfs8 = sortedDigits.slice(0, 8).join("");
  const bbfs6 = sortedDigits.slice(0, 6).join("");

  // ─── 2D scoring (ekor 2D = last 2 digits) ───
  const d2Freq: Record<string, number> = {};
  const d2Recent: Record<string, number> = {};
  draws.forEach((d,i) => {
    const d2 = d.slice(2);
    d2Freq[d2] = (d2Freq[d2]||0) + 1;
    if (i < 30) d2Recent[d2] = (d2Recent[d2]||0) + 1;
  });

  // Gap for 2D
  const d2Gap: Record<string, number> = {};
  for (let i=0; i<=99; i++) {
    const k = String(i).padStart(2,"0");
    const idx = draws.findIndex(d => d.slice(2) === k);
    d2Gap[k] = idx === -1 ? draws.length : idx;
  }
  const maxD2Gap = Math.max(...Object.values(d2Gap));

  // Transition: last 2D result → likely next
  const lastD2 = draws[0]?.slice(2) ?? "";
  const transNext = trans[lastD2] ?? {};
  const totalTransNext = Object.values(transNext).reduce((a,b)=>a+b,0) || 1;

  // Score each 2D
  const d2Scored: { num: string; score: number; reason: string[] }[] = [];
  for (let i=0; i<=99; i++) {
    const k = String(i).padStart(2,"0");
    const freqScore   = ((d2Freq[k]||0)   / (Math.max(...Object.values(d2Freq))||1)) * 35;
    const recentScore = ((d2Recent[k]||0) / (Math.max(...Object.values(d2Recent))||1)) * 25;
    const gapSc = d2Gap[k] > 20 ? Math.min(20, d2Gap[k] / maxD2Gap * 20) : 0;
    const transSc = ((transNext[k]||0) / totalTransNext) * 20;
    // Digit score component
    const d1s = digitScore[k[0]] / 100;
    const d2s = digitScore[k[1]] / 100;
    const digitComp = ((d1s + d2s) / 2) * 20;

    const total = freqScore + recentScore + gapSc + transSc + digitComp;
    const reason: string[] = [];
    if (d2Freq[k]||0 > 0) reason.push(`Muncul ${d2Freq[k]}x dalam histori`);
    if (d2Recent[k]||0 > 0) reason.push(`${d2Recent[k]}x dalam 30 draw terakhir`);
    if (d2Gap[k] > 30) reason.push(`Belum keluar ${d2Gap[k]} draw (overdue)`);
    if ((transNext[k]||0) > 0) reason.push(`Transisi dari ${lastD2} → ${k}: ${transNext[k]}x`);
    d2Scored.push({ num:k, score:Math.round(total), reason });
  }
  d2Scored.sort((a,b) => b.score - a.score);
  const top20_2D = d2Scored.slice(0, 20);

  // ─── 3D candidates (kepala-ekor) ───
  const d3Freq: Record<string, number> = {};
  draws.forEach(d => {
    const d3 = d.slice(1); // KOP+KEPALA+EKOR
    d3Freq[d3] = (d3Freq[d3]||0) + 1;
  });
  const top3DByFreq = Object.entries(d3Freq).sort((a,b)=>b[1]-a[1]).slice(0,10);

  // Generate top 3D from top digit combos
  const top3Digits = sortedDigits.slice(0,6);
  const gen3D: { num: string; score: number; reason: string[] }[] = [];
  const seen3D = new Set<string>();
  // From frequency
  top3DByFreq.forEach(([k,f]) => {
    if (seen3D.has(k)) return;
    seen3D.add(k);
    const ds = k.split("").map(c => digitScore[c]);
    const avgDs = ds.reduce((a,b)=>a+b,0)/3;
    gen3D.push({ num:k, score: Math.round(f*30 + avgDs*0.7), reason:[`Histori: ${f}x`, `Skor digit rata-rata: ${avgDs.toFixed(0)}`] });
  });
  // From top digits
  for (let a of top3Digits) for (let b of top3Digits) for (let c of top3Digits) {
    const k = `${a}${b}${c}`;
    if (seen3D.has(k)) continue;
    if (gen3D.length >= 30) break;
    seen3D.add(k);
    const ds = [digitScore[a], digitScore[b], digitScore[c]];
    const avgDs = ds.reduce((x,y)=>x+y,0)/3;
    gen3D.push({ num:k, score:Math.round(avgDs), reason:[`Gabungan digit kuat: ${a}+${b}+${c}`, `Skor digit rata: ${avgDs.toFixed(0)}`] });
  }
  gen3D.sort((a,b)=>b.score-a.score);
  const top20_3D = gen3D.slice(0,20);

  // ─── 4D candidates ───
  const d4Freq: Record<string, number> = {};
  draws.forEach(d => { d4Freq[d] = (d4Freq[d]||0) + 1; });
  const top4DByFreq = Object.entries(d4Freq).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const gen4D: { num: string; score: number; reason: string[] }[] = [];
  const seen4D = new Set<string>();
  top4DByFreq.forEach(([k,f]) => {
    if (seen4D.has(k)) return; seen4D.add(k);
    const ds = k.split("").map(c => digitScore[c]);
    const avgDs = ds.reduce((a,b)=>a+b,0)/4;
    gen4D.push({ num:k, score: Math.round(f*25 + avgDs*0.75), reason:[`Histori repeat: ${f}x`, `Avg digit score: ${avgDs.toFixed(0)}`] });
  });
  const top4Digits = sortedDigits.slice(0,5);
  for (let a of top4Digits) for (let b of top4Digits) for (let c of top4Digits) for (let dd of top4Digits) {
    const k = `${a}${b}${c}${dd}`;
    if (seen4D.has(k)) continue;
    if (gen4D.length >= 20) break;
    seen4D.add(k);
    const ds = [digitScore[a],digitScore[b],digitScore[c],digitScore[dd]];
    const avgDs = ds.reduce((x,y)=>x+y,0)/4;
    // Bonus for top 2D match
    const d2part = `${c}${dd}`;
    const d2Bonus = (top20_2D.findIndex(x=>x.num===d2part) < 5) ? 15 : 0;
    gen4D.push({ num:k, score:Math.round(avgDs+d2Bonus), reason:[`Digit kuat: ${a}+${b}+${c}+${dd}`, ...(d2Bonus>0?[`2D ${d2part} masuk top-5`]:[])] });
  }
  gen4D.sort((a,b)=>b.score-a.score);
  const top10_4D = gen4D.slice(0,10);

  return {
    draws, n10, n30, n50, n100,
    f10, f30, f50, f100, fw, posFq, gaps, trans, pats,
    bkStats,
    digitScore, digitReason, sortedDigits,
    bbfs8, bbfs6,
    top20_2D, top20_3D, top10_4D,
    lastD2, transNext,
  };
}

/* ─── MAIN COMPONENT ─── */
interface Props {
  resultData: ResultRow[];
  customNumbers: string;
  isDark: boolean;
}

type Tab = "ringkasan" | "digit" | "posisi" | "kandidat" | "pola";

export default function AnalisisNomor({ resultData, customNumbers, isDark }: Props) {
  const [tab, setTab]   = useState<Tab>("ringkasan");
  const [d2d3, setD2d3] = useState<"2D"|"3D"|"4D">("2D");
  const [expand, setExpand] = useState<string | null>(null);

  const draws = useMemo(() => extractDraws(resultData), [resultData]);
  const sc    = useMemo(() => computeScores(draws), [draws]);

  const card   = isDark ? "rounded-2xl border border-white/10 bg-white/5 shadow-2xl" : "rounded-2xl border border-slate-200 bg-white shadow-xl";
  const muted  = isDark ? "text-white/40" : "text-slate-400";
  const main   = isDark ? "text-white" : "text-slate-800";

  const TABS: { id: Tab; label: string }[] = [
    { id:"ringkasan", label:"Ringkasan" },
    { id:"digit",     label:"Digit 0–9" },
    { id:"posisi",    label:"Posisi" },
    { id:"kandidat",  label:"Kandidat" },
    { id:"pola",      label:"Pola" },
  ];

  if (draws.length < 5) {
    return (
      <div className={`${card} p-12 text-center animate-slide-up`}>
        <Hash className="w-14 h-14 mx-auto mb-4 opacity-20" />
        <h3 className="font-black text-lg mb-1">Data result belum tersedia</h3>
        <p className={`text-sm ${muted}`}>Buka tab Result untuk memuat data terlebih dahulu.</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-4 pb-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 opacity-80"/>
              <span className="text-xs font-bold opacity-70 uppercase tracking-widest">Analisis Statistik Pro</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">TTM4D Pattern Engine</h1>
            <p className="text-xs opacity-60 mt-1">
              {draws.length} draw dianalisis · 9 metode statistik
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-60 mb-1">BBFS Utama</div>
            <div className="font-black text-2xl tracking-widest text-yellow-300">{sc?.bbfs8}</div>
            <div className="font-black text-lg tracking-widest text-yellow-200/70">{sc?.bbfs6}</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
              tab === t.id
                ? "bg-purple-600 text-white shadow-md"
                : isDark ? "bg-white/8 text-white/60 hover:bg-white/15" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RINGKASAN ── */}
      {tab === "ringkasan" && sc && <RingkasanTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}/>}

      {/* ── DIGIT 0-9 ── */}
      {tab === "digit" && sc && <DigitTab sc={sc} isDark={isDark} card={card} muted={muted} main={main} expand={expand} setExpand={setExpand}/>}

      {/* ── POSISI ── */}
      {tab === "posisi" && sc && <PosisiTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}/>}

      {/* ── KANDIDAT ── */}
      {tab === "kandidat" && sc && (
        <KandidatTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}
          d2d3={d2d3} setD2d3={setD2d3}
          customNumbers={customNumbers} />
      )}

      {/* ── POLA ── */}
      {tab === "pola" && sc && <PolaTab sc={sc} isDark={isDark} card={card} muted={muted} main={main}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ RINGKASAN */
function RingkasanTab({ sc, isDark, card, muted, main }: {
  sc: NonNullable<ReturnType<typeof computeScores>>;
  isDark: boolean; card: string; muted: string; main: string;
}) {
  const bk10  = sc.bkStats(sc.n10);
  const bk30  = sc.bkStats(sc.n30);
  const bk100 = sc.bkStats(sc.n100);

  const methods = [
    "Frequency Analysis", "Weighted Frequency", "Moving Trend (10/30/50/100)",
    "Transition Matrix", "Hot & Cold Number", "Gap Analysis",
    "Position Analysis", "Pattern Repetition", "Cluster Digit"
  ];

  return (
    <div className="space-y-4">
      {/* BBFS cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <p className={`text-xs font-bold mb-2 ${muted}`}>BBFS 8 DIGIT TERKUAT</p>
          <div className="flex gap-1.5 flex-wrap">
            {sc.bbfs8.split("").map((d,i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-black text-lg shadow-lg">
                {d}
              </div>
            ))}
          </div>
          <p className={`text-[10px] mt-3 ${muted}`}>
            Skor: {sc.bbfs8.split("").map(d => `${d}(${sc.digitScore[d]})`).join(", ")}
          </p>
        </div>
        <div className={`${card} p-5`}>
          <p className={`text-xs font-bold mb-2 ${muted}`}>BBFS 6 DIGIT CADANGAN</p>
          <div className="flex gap-1.5 flex-wrap">
            {sc.bbfs6.split("").map((d,i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
                {d}
              </div>
            ))}
          </div>
          <p className={`text-[10px] mt-3 ${muted}`}>
            Skor: {sc.bbfs6.split("").map(d => `${d}(${sc.digitScore[d]})`).join(", ")}
          </p>
        </div>
      </div>

      {/* Quick top candidates */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { title:"Top 5 Kandidat 2D", items: sc.top20_2D.slice(0,5).map(x=>x.num), color:"bg-cyan-500" },
          { title:"Top 5 Kandidat 3D", items: sc.top20_3D.slice(0,5).map(x=>x.num), color:"bg-emerald-500" },
          { title:"Top 5 Kandidat 4D", items: sc.top10_4D.slice(0,5).map(x=>x.num), color:"bg-red-500" },
        ].map(sec => (
          <div key={sec.title} className={`${card} p-3`}>
            <p className={`text-[10px] font-bold mb-2 ${muted}`}>{sec.title}</p>
            <div className="space-y-1">
              {sec.items.map((n,i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold ${muted}`}>{i+1}</span>
                  <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${sec.color}/20 text-${sec.color.replace("bg-","").split("-")[0]}-400`}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Besar/Kecil & Ganjil/Genap */}
      <div className={`${card} p-5`}>
        <p className={`text-xs font-bold mb-4 ${muted}`}>ANALISIS BESAR / KECIL · GANJIL / GENAP</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-[10px] font-bold ${muted}`}>
                <th className="text-left pb-2">Window</th>
                <th className="text-center pb-2">Besar</th>
                <th className="text-center pb-2">Kecil</th>
                <th className="text-center pb-2">Ganjil</th>
                <th className="text-center pb-2">Genap</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: `10 draw`, s: bk10 },
                { label: `30 draw`, s: bk30 },
                { label: `100 draw`, s: bk100 },
              ].map(({ label, s }) => (
                <tr key={label} className={`border-t ${isDark ? "border-white/5" : "border-slate-50"}`}>
                  <td className={`py-2 font-bold text-xs ${muted}`}>{label}</td>
                  <td className="py-2 text-center">
                    <span className="font-black text-orange-400">{s.besar}</span>
                    <span className={`text-[9px] ml-1 ${muted}`}>{Math.round(s.besar/s.total*100)}%</span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="font-black text-blue-400">{s.kecil}</span>
                    <span className={`text-[9px] ml-1 ${muted}`}>{Math.round(s.kecil/s.total*100)}%</span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="font-black text-green-400">{s.ganjil}</span>
                    <span className={`text-[9px] ml-1 ${muted}`}>{Math.round(s.ganjil/s.total*100)}%</span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="font-black text-purple-400">{s.genap}</span>
                    <span className={`text-[9px] ml-1 ${muted}`}>{Math.round(s.genap/s.total*100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methods used */}
      <div className={`${card} p-4`}>
        <p className={`text-xs font-bold mb-3 ${muted}`}>METODE ANALISIS AKTIF</p>
        <div className="flex flex-wrap gap-2">
          {methods.map(m => (
            <span key={m} className={`text-[10px] font-bold px-2 py-1 rounded-full ${isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-50 text-purple-700"}`}>
              ✓ {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ DIGIT 0-9 */
function DigitTab({ sc, isDark, card, muted, main, expand, setExpand }: {
  sc: NonNullable<ReturnType<typeof computeScores>>;
  isDark: boolean; card: string; muted: string; main: string;
  expand: string | null; setExpand: (s: string | null) => void;
}) {
  const maxScore = Math.max(...Object.values(sc.digitScore));

  const trendIcon = (d: string) => {
    const r10 = sc.f10[d] / sc.n10;
    const r30 = sc.f30[d] / sc.n30;
    if (r10 > r30 * 1.2) return <TrendingUp className="w-3.5 h-3.5 text-green-400"/>;
    if (r10 < r30 * 0.8) return <TrendingDown className="w-3.5 h-3.5 text-red-400"/>;
    return <Minus className="w-3.5 h-3.5 text-yellow-400"/>;
  };

  const heatColor = (score: number) => {
    const pct = score / (maxScore || 1);
    if (pct >= 0.8) return "from-red-600 to-orange-500";
    if (pct >= 0.6) return "from-orange-500 to-yellow-500";
    if (pct >= 0.4) return "from-yellow-500 to-lime-500";
    if (pct >= 0.2) return "from-blue-500 to-cyan-500";
    return "from-slate-600 to-slate-500";
  };

  return (
    <div className={`${card} p-5`}>
      <p className={`text-xs font-bold mb-4 ${muted}`}>RANKING DIGIT · Composite Score</p>
      <div className="space-y-2">
        {sc.sortedDigits.map((d, rank) => {
          const score = sc.digitScore[d];
          const pct   = maxScore > 0 ? Math.round(score / maxScore * 100) : 0;
          const gap   = sc.gaps.overall[+d];
          const isHot  = rank < 3;
          const isCold = rank >= 7;
          const open   = expand === d;

          return (
            <div key={d} className={`rounded-xl border transition-all ${isDark ? "border-white/8 bg-white/5" : "border-slate-100 bg-slate-50"}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3"
                onClick={() => setExpand(open ? null : d)}>
                <span className={`w-5 text-[10px] font-bold text-right ${muted}`}>#{rank+1}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xl text-white bg-gradient-to-br ${heatColor(score)} shadow-md flex-shrink-0`}>
                  {d}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`h-3 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}>
                    <div className={`h-3 rounded-full bg-gradient-to-r ${heatColor(score)}`} style={{ width:`${pct}%` }}/>
                  </div>
                </div>
                <span className="text-sm font-black w-10 text-right" style={{color: pct>=80?"#f97316":pct>=60?"#eab308":pct>=40?"#22c55e":"#60a5fa"}}>{pct}%</span>
                <div className="flex items-center gap-1 flex-shrink-0">{trendIcon(d)}</div>
                {isHot  && <Flame    className="w-3.5 h-3.5 text-orange-400 flex-shrink-0"/>}
                {isCold && <Snowflake className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0"/>}
                {open   ? <ChevronUp className="w-3.5 h-3.5 opacity-40"/> : <ChevronDown className="w-3.5 h-3.5 opacity-40"/>}
              </button>
              {open && (
                <div className={`px-4 pb-4 border-t ${isDark?"border-white/5":"border-slate-100"}`}>
                  <div className="grid grid-cols-4 gap-2 mt-3 mb-3 text-center">
                    {[
                      { label:"10 draw", val: sc.f10[d] },
                      { label:"30 draw", val: sc.f30[d] },
                      { label:"50 draw", val: sc.f50[d] },
                      { label:"100 draw", val: sc.f100[d] },
                    ].map(({label,val}) => (
                      <div key={label} className={`p-2 rounded-xl ${isDark?"bg-white/5":"bg-white"}`}>
                        <div className={`text-[9px] ${muted}`}>{label}</div>
                        <div className="font-black text-base">{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`text-[10px] font-bold mb-1 ${muted}`}>Gap terakhir: <span className="text-white">{gap} draw</span></div>
                  <div className="space-y-0.5">
                    {sc.digitReason[d].map((r,i) => (
                      <div key={i} className={`text-[10px] ${muted}`}>• {r}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ POSISI */
function PosisiTab({ sc, isDark, card, muted, main }: {
  sc: NonNullable<ReturnType<typeof computeScores>>;
  isDark: boolean; card: string; muted: string; main: string;
}) {
  const posNames = ["AS (Ribuan)", "KOP (Ratusan)", "KEPALA (Puluhan)", "EKOR (Satuan)"];
  const posShort = ["AS","KOP","KPL","EKR"];
  const total100 = sc.n100;

  return (
    <div className="space-y-4">
      {sc.posFq.map((pf, pi) => {
        const maxPF = Math.max(...pf) || 1;
        const sorted = DIGITS.slice().sort((a,b) => pf[+b]-pf[+a]);
        return (
          <div key={pi} className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 font-black text-sm">{posShort[pi]}</div>
              <h3 className={`font-black ${main}`}>{posNames[pi]}</h3>
              <span className={`ml-auto text-[10px] ${muted}`}>100 draw terakhir</span>
            </div>
            <div className="space-y-1.5">
              {sorted.map(d => {
                const f = pf[+d];
                const pct = Math.round(f / maxPF * 100);
                const expPct = Math.round(f / total100 * 100);
                const bar = pct;
                const color = pct>=80?"bg-red-500":pct>=60?"bg-orange-500":pct>=40?"bg-yellow-500":pct>=20?"bg-green-500":"bg-blue-500";
                return (
                  <div key={d} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm ${isDark?"bg-white/10":"bg-slate-100"} ${main}`}>{d}</div>
                    <div className={`flex-1 h-3 rounded-full ${isDark?"bg-white/10":"bg-slate-100"} overflow-hidden`}>
                      <div className={`h-3 rounded-full ${color}`} style={{ width:`${bar}%` }}/>
                    </div>
                    <span className="font-black text-sm w-8 text-right">{f}</span>
                    <span className={`text-[9px] w-8 ${muted}`}>{expPct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Hot/Cold per position summary */}
      <div className={`${card} p-5`}>
        <p className={`text-xs font-bold mb-4 ${muted}`}>HOT / COLD DIGIT PER POSISI</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={`${muted}`}>
                <th className="text-left pb-2">Posisi</th>
                <th className="text-center pb-2">🔥 Hot</th>
                <th className="text-center pb-2">❄️ Cold</th>
                <th className="text-center pb-2">Gap Terlama</th>
              </tr>
            </thead>
            <tbody>
              {sc.posFq.map((pf, pi) => {
                const hotD = DIGITS.reduce((a,b) => pf[+a]>=pf[+b]?a:b);
                const coldD= DIGITS.reduce((a,b) => pf[+a]<=pf[+b]?a:b);
                const maxGap = sc.gaps.pos[pi].indexOf(Math.max(...sc.gaps.pos[pi]));
                return (
                  <tr key={pi} className={`border-t ${isDark?"border-white/5":"border-slate-50"}`}>
                    <td className={`py-2 font-bold ${muted}`}>{posShort[pi]}</td>
                    <td className="py-2 text-center">
                      <span className="font-black text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-lg">{hotD} ({pf[+hotD]}x)</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className="font-black text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-lg">{coldD} ({pf[+coldD]}x)</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className="font-black">{maxGap} ({sc.gaps.pos[pi][maxGap]} draw)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ KANDIDAT */
function KandidatTab({ sc, isDark, card, muted, main, d2d3, setD2d3, customNumbers }: {
  sc: NonNullable<ReturnType<typeof computeScores>>;
  isDark: boolean; card: string; muted: string; main: string;
  d2d3: "2D"|"3D"|"4D"; setD2d3: (v:"2D"|"3D"|"4D")=>void;
  customNumbers: string;
}) {
  const betNums = new Set(customNumbers.split("*").filter(Boolean));

  const list = d2d3 === "2D" ? sc.top20_2D
    : d2d3 === "3D" ? sc.top20_3D
    : sc.top10_4D;
  const maxScore = Math.max(...list.map(x=>x.score)) || 1;

  const colors = ["text-yellow-400","text-orange-400","text-red-400","text-pink-400","text-violet-400"];

  return (
    <div className="space-y-4">
      {/* 2D/3D/4D toggle */}
      <div className="flex gap-1">
        {(["2D","3D","4D"] as const).map(t => (
          <button key={t} onClick={() => setD2d3(t)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
              d2d3===t ? "bg-purple-600 text-white shadow-md" : isDark?"bg-white/8 text-white/60":"bg-slate-100 text-slate-500"
            }`}>
            {t === "2D" ? "20 Kandidat 2D" : t === "3D" ? "20 Kandidat 3D" : "10 Kandidat 4D"}
          </button>
        ))}
      </div>

      {/* Last draw context */}
      {d2d3 === "2D" && sc.lastD2 && (
        <div className={`${card} p-3 flex items-center gap-3`}>
          <div className={`text-xs ${muted}`}>2D terakhir:</div>
          <div className="font-black text-lg text-blue-400">{sc.lastD2}</div>
          <div className={`text-xs ${muted}`}>→ Kandidat transisi terkuat:</div>
          <div className="flex gap-1">
            {Object.entries(sc.transNext).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => (
              <span key={k} className="font-black text-sm text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg">{k}({v}x)</span>
            ))}
          </div>
        </div>
      )}

      {/* Candidates table */}
      <div className={`${card} p-5`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-[10px] font-bold ${muted} border-b ${isDark?"border-white/10":"border-slate-100"}`}>
                <th className="text-left pb-3">#</th>
                <th className="text-left pb-3">Nomor</th>
                <th className="text-center pb-3">Skor</th>
                <th className="text-left pb-3 hidden sm:table-cell">Keyakinan</th>
                <th className="text-left pb-3 hidden md:table-cell">Alasan Statistik</th>
                <th className="text-center pb-3">★</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item, i) => {
                const pct = Math.round(item.score / maxScore * 100);
                const isBet = betNums.has(item.num);
                return (
                  <tr key={item.num} className={`border-t ${isDark?"border-white/5":"border-slate-50"}`}>
                    <td className={`py-2 text-xs font-bold ${colors[Math.min(i,4)]}`}>#{i+1}</td>
                    <td className="py-2">
                      <span className={`font-black text-base tabular-nums tracking-widest px-2 py-0.5 rounded-lg ${
                        i<3 ? "bg-yellow-500/15 text-yellow-400" : isDark?"bg-white/8":"bg-slate-100 text-slate-700"
                      }`}>{item.num}</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={`text-xs font-black ${pct>=80?"text-red-400":pct>=60?"text-orange-400":pct>=40?"text-yellow-400":"text-blue-400"}`}>{item.score}</span>
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      <div className={`flex items-center gap-1.5 w-28`}>
                        <div className={`flex-1 h-2 rounded-full ${isDark?"bg-white/10":"bg-slate-100"}`}>
                          <div className={`h-2 rounded-full ${pct>=80?"bg-red-500":pct>=60?"bg-orange-500":pct>=40?"bg-yellow-500":"bg-blue-500"}`} style={{width:`${pct}%`}}/>
                        </div>
                        <span className={`text-[9px] font-bold w-8 ${muted}`}>{pct}%</span>
                      </div>
                    </td>
                    <td className={`py-2 text-[10px] hidden md:table-cell max-w-xs ${muted}`}>
                      {item.reason.slice(0,2).join(" · ")}
                    </td>
                    <td className="py-2 text-center">
                      {isBet ? <Star className="w-3.5 h-3.5 text-yellow-400 mx-auto"/> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact grid */}
      <div className={`${card} p-4`}>
        <p className={`text-xs font-bold mb-3 ${muted}`}>GRID CEPAT {d2d3}</p>
        <div className="flex flex-wrap gap-2">
          {list.map((item,i) => {
            const pct = Math.round(item.score/maxScore*100);
            const isBet = betNums.has(item.num);
            return (
              <div key={item.num}
                className={`relative font-black text-sm px-2.5 py-1.5 rounded-xl tabular-nums tracking-wider border ${
                  i<3 ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300"
                  : i<8 ? isDark?"bg-orange-500/10 border-orange-500/20 text-orange-300":"bg-orange-50 border-orange-200 text-orange-600"
                  : isDark?"bg-white/5 border-white/10":"bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                {item.num}
                {isBet && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400"/>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ POLA */
function PolaTab({ sc, isDark, card, muted, main }: {
  sc: NonNullable<ReturnType<typeof computeScores>>;
  isDark: boolean; card: string; muted: string; main: string;
}) {
  const polaSections = [
    { title:"Angka Kembar", desc:"Memiliki 2 digit berurutan sama (mis. 1122, 3344)", items: sc.pats.kembar, color:"text-orange-400", bg:"bg-orange-500/15" },
    { title:"Angka Cermin", desc:"Digit terbalik simetris (mis. 1221, 1234→4321)", items: sc.pats.cermin, color:"text-blue-400",   bg:"bg-blue-500/15" },
    { title:"Angka Ulang",  desc:"Semua digit sama (mis. 1111, 9999)",               items: sc.pats.ulang,  color:"text-purple-400", bg:"bg-purple-500/15" },
    { title:"Angka Lompat", desc:"Digit naik/turun konsisten (mis. 1234, 9753)",     items: sc.pats.lompat, color:"text-green-400",  bg:"bg-green-500/15" },
  ];

  // Transition matrix heatmap (top digits only)
  const topD2s = Object.keys(sc.trans).slice(0,8);

  return (
    <div className="space-y-4">
      {polaSections.map(s => (
        <div key={s.title} className={`${card} p-5`}>
          <div className="flex items-start gap-3 mb-3">
            <div>
              <h3 className={`font-black ${main}`}>{s.title}</h3>
              <p className={`text-[10px] ${muted}`}>{s.desc}</p>
            </div>
            <span className={`ml-auto text-xs font-bold ${muted}`}>{s.items.length} pola</span>
          </div>
          {s.items.length === 0 ? (
            <p className={`text-sm ${muted}`}>Tidak ditemukan dalam data</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s.items.map(n => (
                <span key={n} className={`font-black text-sm px-3 py-1.5 rounded-xl tabular-nums tracking-widest ${s.bg} ${s.color}`}>{n}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Transition matrix (mini) */}
      <div className={`${card} p-5`}>
        <p className={`text-xs font-bold mb-1 ${muted}`}>TRANSITION MATRIX (Ekor 2D)</p>
        <p className={`text-[10px] mb-4 ${muted}`}>Berapa kali angka di kolom muncul SETELAH angka di baris</p>
        {topD2s.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-[10px]">
              <thead>
                <tr>
                  <th className={`text-left pr-3 pb-2 ${muted}`}>dari\ke</th>
                  {topD2s.map(k => <th key={k} className={`px-2 pb-2 font-black ${muted}`}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {topD2s.map(from => {
                  const row = sc.trans[from] || {};
                  const maxInRow = Math.max(0, ...Object.values(row));
                  return (
                    <tr key={from}>
                      <td className={`font-black pr-3 py-1 ${main}`}>{from}</td>
                      {topD2s.map(to => {
                        const v = row[to] || 0;
                        const pct = maxInRow > 0 ? v/maxInRow : 0;
                        return (
                          <td key={to} className="px-2 py-1 text-center">
                            <div className={`w-8 h-6 rounded flex items-center justify-center font-bold ${
                              pct>0.7?"bg-red-500 text-white":pct>0.4?"bg-orange-500/50 text-orange-200":pct>0?"bg-blue-500/20 text-blue-300":isDark?"text-white/10":"text-slate-200"
                            }`}>
                              {v||"—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`text-sm ${muted}`}>Memerlukan lebih banyak data</p>
        )}
      </div>
    </div>
  );
}
