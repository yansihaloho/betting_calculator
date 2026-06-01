/**
 * RumusPage — Formula & Rumus Jitu Toto Macau
 * 8 metode formula berbasis data histori result:
 * Angka Mati · Angka Overdue · Berputar · Penjumlahan · BBFS ·
 * Formula Hari · Shio Hot/Cold · Colok Bebas Pintar
 */
import React, { useMemo, useState } from "react";
import {
  BookOpen, Flame, Snowflake, Zap, Star, Hash,
  TrendingUp, RotateCcw, Award, ChevronDown, ChevronUp,
  Calculator, CalendarDays, Layers
} from "lucide-react";

type ResultRow = { hari: string; tanggal: string; [slot: string]: string };

const TIME_SLOTS = ["00:01","13:00","16:00","19:00","22:00","23:00"];
const HARI_IDX: Record<string,number> = {
  "Minggu":0,"Senin":1,"Selasa":2,"Rabu":3,"Kamis":4,"Jumat":5,"Sabtu":6
};
const HARI_NAMES = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

const SHIO_TABLE = [
  { name:"Ular",    emoji:"🐍", nums:["01","13","25","37","49","61","73","85","97"] },
  { name:"Naga",    emoji:"🐉", nums:["02","14","26","38","50","62","74","86","98"] },
  { name:"Kelinci", emoji:"🐰", nums:["03","15","27","39","51","63","75","87","99"] },
  { name:"Harimau", emoji:"🐯", nums:["04","16","28","40","52","64","76","88","00"] },
  { name:"Kerbau",  emoji:"🐃", nums:["05","17","29","41","53","65","77","89"] },
  { name:"Tikus",   emoji:"🐭", nums:["06","18","30","42","54","66","78","90"] },
  { name:"Babi",    emoji:"🐷", nums:["07","19","31","43","55","67","79","91"] },
  { name:"Anjing",  emoji:"🐶", nums:["08","20","32","44","56","68","80","92"] },
  { name:"Ayam",    emoji:"🐔", nums:["09","21","33","45","57","69","81","93"] },
  { name:"Monyet",  emoji:"🐵", nums:["10","22","34","46","58","70","82","94"] },
  { name:"Kambing", emoji:"🐑", nums:["11","23","35","47","59","71","83","95"] },
  { name:"Kuda",    emoji:"🐴", nums:["12","24","36","48","60","72","84","96"] },
];

function shioOf(d2: string) {
  return SHIO_TABLE.find(s => s.nums.includes(d2)) ?? SHIO_TABLE[0];
}

interface Props { resultData: ResultRow[]; isDark: boolean; }

export default function RumusPage({ resultData, isDark }: Props) {
  const [openSection, setOpenSection] = useState<string>("mati");

  const draws = useMemo(() => {
    const out: string[] = [];
    for (const row of resultData) {
      for (const s of TIME_SLOTS) {
        const v = String(row[s] || "");
        if (v.length === 4 && /^\d{4}$/.test(v)) out.push(v);
      }
    }
    return out;
  }, [resultData]);

  const lastDraw   = draws[0] ?? "";
  const lastRow    = resultData[0];
  const todayHari  = lastRow?.hari ?? HARI_NAMES[new Date().getDay()];
  const todayIdx   = HARI_IDX[todayHari] ?? new Date().getDay();
  const tomorrowIdx = (todayIdx + 1) % 7;

  /* ── 1. Angka Mati (2D depan not seen in last 30 draws) ── */
  const angkaMatiData = useMemo(() => {
    const seen30 = new Set<string>();
    draws.slice(0, 30).forEach(d => seen30.add(d.slice(0,2)));
    const seen15 = new Set<string>();
    draws.slice(0, 15).forEach(d => seen15.add(d.slice(0,2)));
    const mati: { num: string; lastSeen: number }[] = [];
    for (let i = 0; i < 100; i++) {
      const k = String(i).padStart(2,"0");
      if (!seen30.has(k)) {
        const idx = draws.findIndex(d => d.slice(0,2) === k);
        mati.push({ num: k, lastSeen: idx === -1 ? draws.length : idx });
      }
    }
    mati.sort((a,b) => b.lastSeen - a.lastSeen);
    const overdue: { num: string; gap: number }[] = [];
    for (let i = 0; i < 100; i++) {
      const k = String(i).padStart(2,"0");
      if (!seen15.has(k)) {
        const idx = draws.findIndex(d => d.slice(0,2) === k);
        overdue.push({ num: k, gap: idx === -1 ? draws.length : idx });
      }
    }
    overdue.sort((a,b) => b.gap - a.gap);
    return { mati: mati.slice(0,20), overdue: overdue.slice(0,12) };
  }, [draws]);

  /* ── 2. Formula Berputar (rotate & mirror last draw) ── */
  const formulaBerputar = useMemo(() => {
    if (!lastDraw || lastDraw.length < 4) return [];
    const [a,b,c,d] = lastDraw.split("");
    return [
      { label:"Rotasi 1 (BCDA)",  d4:`${b}${c}${d}${a}`, d2dep:`${b}${c}`, reason:`Geser digit kiri 1 posisi` },
      { label:"Rotasi 2 (CDAB)",  d4:`${c}${d}${a}${b}`, d2dep:`${c}${d}`, reason:`Geser digit kiri 2 posisi` },
      { label:"Rotasi 3 (DABC)",  d4:`${d}${a}${b}${c}`, d2dep:`${d}${a}`, reason:`Geser digit kiri 3 posisi` },
      { label:"Cermin (DCBA)",    d4:`${d}${c}${b}${a}`, d2dep:`${d}${c}`, reason:`Balik semua digit` },
      { label:"Silang (BADC)",    d4:`${b}${a}${d}${c}`, d2dep:`${b}${a}`, reason:`Tukar AS↔KOP dan KEP↔EKR` },
      { label:"Kepala Ekor Swap", d4:`${c}${d}${a}${b}`, d2dep:`${c}${d}`, reason:`Tukar 2D depan dengan belakang` },
    ];
  }, [lastDraw]);

  /* ── 3. Formula Penjumlahan ── */
  const formulaSum = useMemo(() => {
    if (!lastDraw || lastDraw.length < 4) return null;
    const [A,B,C,D] = lastDraw.split("").map(Number);
    const sumAll  = A+B+C+D;
    const kunciU  = sumAll % 10;
    const depan   = (A+B) % 10;
    const belakang = (C+D) % 10;
    const tengah  = (B+C) % 10;
    const silang  = (A+D) % 10;

    const kunciSet = new Set([kunciU, depan, belakang, tengah, silang]);
    const kunciArr = [...kunciSet].slice(0,5);

    const d2s: string[] = [];
    const seen = new Set<string>();
    kunciArr.forEach(k1 => {
      kunciArr.forEach(k2 => {
        const n = `${k1}${k2}`;
        if (!seen.has(n)) { seen.add(n); d2s.push(n); }
      });
    });

    return {
      sumAll, kunciU,
      depan, belakang, tengah, silang,
      kunciArr,
      d2s: d2s.slice(0,12),
    };
  }, [lastDraw]);

  /* ── 4. BBFS Builder (from 2D depan freq last 40 draws) ── */
  const bbfsData = useMemo(() => {
    if (draws.length < 5) return null;
    const posFreq = [new Array(10).fill(0), new Array(10).fill(0)];
    draws.slice(0, Math.min(40, draws.length)).forEach((d, i) => {
      const w = Math.pow(0.95, i);
      posFreq[0][+d[0]] += w;
      posFreq[1][+d[1]] += w;
    });
    const sortedAS  = [0,1,2,3,4,5,6,7,8,9].sort((a,b) => posFreq[0][b]-posFreq[0][a]);
    const sortedKOP = [0,1,2,3,4,5,6,7,8,9].sort((a,b) => posFreq[1][b]-posFreq[1][a]);

    const combined = new Array(10).fill(0).map((_,d) => posFreq[0][d]+posFreq[1][d]);
    const sortedAll = [0,1,2,3,4,5,6,7,8,9].sort((a,b) => combined[b]-combined[a]);

    const bbfs8 = sortedAll.slice(0,8).join("");
    const bbfs6 = sortedAll.slice(0,6).join("");
    const bbfs4 = sortedAll.slice(0,4).join("");

    const top4AS  = sortedAS.slice(0,4).map(String).join("");
    const top4KOP = sortedKOP.slice(0,4).map(String).join("");

    return { bbfs8, bbfs6, bbfs4, top4AS, top4KOP, posFreq, sortedAll };
  }, [draws]);

  /* ── 5. Formula Hari (historical best 2D depan for today) ── */
  const formulaHari = useMemo(() => {
    const hariFreq: Record<string, Record<string,number>> = {};
    resultData.forEach(row => {
      const di = HARI_IDX[row.hari] ?? -1;
      if (di < 0) return;
      if (!hariFreq[row.hari]) hariFreq[row.hari] = {};
      TIME_SLOTS.forEach(s => {
        const v = String(row[s]||"");
        if (!/^\d{4}$/.test(v)) return;
        const k = v.slice(0,2);
        hariFreq[row.hari][k] = (hariFreq[row.hari][k]||0)+1;
      });
    });

    const todayFreq  = hariFreq[todayHari] ?? {};
    const tomorrowFreq = hariFreq[HARI_NAMES[tomorrowIdx]] ?? {};

    const topToday    = Object.entries(todayFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topTomorrow = Object.entries(tomorrowFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

    return {
      todayHari, tomorrowHari: HARI_NAMES[tomorrowIdx],
      topToday, topTomorrow
    };
  }, [resultData, todayHari, tomorrowIdx]);

  /* ── 6. Shio Hot/Cold ── */
  const shioAnalysis = useMemo(() => {
    const freq30: Record<string,number> = {};
    const freq10: Record<string,number> = {};
    SHIO_TABLE.forEach(s => { freq30[s.name]=0; freq10[s.name]=0; });
    draws.slice(0,30).forEach((d,i) => {
      const sh = shioOf(d.slice(0,2));
      freq30[sh.name]++;
      if (i < 10) freq10[sh.name]++;
    });
    const sorted = SHIO_TABLE.map(s => ({
      ...s,
      cnt30: freq30[s.name],
      cnt10: freq10[s.name],
      trend: freq10[s.name] > freq30[s.name]/3 ? "hot" : freq10[s.name] === 0 ? "cold" : "normal",
    })).sort((a,b) => b.cnt30-a.cnt30);
    return sorted;
  }, [draws]);

  /* ── 7. Colok Bebas Pintar (top single digits for any-position bet) ── */
  const colokData = useMemo(() => {
    const posFreq = Array.from({length:4}, () => new Array(10).fill(0));
    const overall = new Array(10).fill(0);
    draws.slice(0, Math.min(30, draws.length)).forEach((d, i) => {
      const w = Math.pow(0.93, i);
      for (let p=0;p<4;p++) {
        posFreq[p][+d[p]] += w;
        overall[+d[p]] += w;
      }
    });
    const sortedOverall = [0,1,2,3,4,5,6,7,8,9].sort((a,b) => overall[b]-overall[a]);
    const topPerPos = posFreq.map((pf,pi) => ({
      pos: ["AS","KOP","KEPALA","EKOR"][pi],
      top3: [0,1,2,3,4,5,6,7,8,9].sort((a,b) => pf[b]-pf[a]).slice(0,3).map(String).join(" · ")
    }));
    return { top5: sortedOverall.slice(0,5).map(String).join(""), topPerPos };
  }, [draws]);

  /* ── 8. Angka Jitu Hari Ini (synthesized from multiple formulas) ── */
  const angkaJitu = useMemo(() => {
    const score: Record<string,number> = {};
    for (let i=0;i<100;i++) score[String(i).padStart(2,"0")] = 0;

    // Overdue bonus
    for (let i=0;i<100;i++) {
      const k = String(i).padStart(2,"0");
      const idx = draws.findIndex(d => d.slice(0,2) === k);
      const gap = idx === -1 ? draws.length : idx;
      score[k] += Math.min(30, gap * 0.5);
    }
    // BBFS bonus
    if (bbfsData) {
      const bbfs6arr = bbfsData.bbfs6.split("").map(Number);
      for (let i=0;i<100;i++) {
        const k = String(i).padStart(2,"0");
        if (bbfs6arr.includes(+k[0])) score[k] += 20;
        if (bbfs6arr.includes(+k[1])) score[k] += 20;
      }
    }
    // Hari bonus
    formulaHari.topToday.forEach(([k,c],rank) => {
      score[k] = (score[k]||0) + (10 - rank) * 3;
    });
    // Shio bonus (top 3 shio)
    const hotShio = shioAnalysis.slice(0,3);
    hotShio.forEach((sh,rank) => {
      sh.nums.forEach(n => {
        score[n] = (score[n]||0) + (15 - rank*4);
      });
    });
    // Sum formula bonus
    if (formulaSum) {
      formulaSum.d2s.forEach((k,rank) => {
        score[k] = (score[k]||0) + Math.max(0, 15 - rank * 1.5);
      });
    }

    return Object.entries(score).sort((a,b) => b[1]-a[1]).slice(0,15).map(([k,s]) => ({ num:k, score: Math.round(s) }));
  }, [draws, bbfsData, formulaHari, shioAnalysis, formulaSum]);

  /* ─── Styling helpers ─── */
  const card   = isDark ? "rounded-2xl border border-white/10 bg-white/5 shadow-2xl" : "rounded-2xl border border-slate-200 bg-white shadow-xl";
  const muted  = isDark ? "text-white/50" : "text-slate-400";
  const main   = isDark ? "text-white" : "text-slate-800";
  const sub    = isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-100";

  function toggle(id: string) {
    setOpenSection(s => s === id ? "" : id);
  }

  function SectionHdr({ id, icon, title, sub: subtitle, color }: {
    id: string; icon: React.ReactNode; title: string; sub: string; color: string;
  }) {
    const open = openSection === id;
    return (
      <button onClick={() => toggle(id)}
        className={`w-full flex items-center gap-3 p-4 text-left rounded-2xl transition-all ${
          open
            ? isDark ? "bg-white/10" : "bg-slate-50"
            : isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
        }`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-black text-sm ${main}`}>{title}</div>
          <div className={`text-xs ${muted} truncate`}>{subtitle}</div>
        </div>
        {open ? <ChevronUp className={`w-4 h-4 ${muted}`}/> : <ChevronDown className={`w-4 h-4 ${muted}`}/>}
      </button>
    );
  }

  function NumBadge({ n, col }: { n: string; col?: string }) {
    return (
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black ${
        col ?? (isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700")
      }`}>{n}</span>
    );
  }

  if (draws.length < 5) {
    return (
      <div className={`${card} p-12 text-center animate-slide-up`}>
        <BookOpen className="w-14 h-14 mx-auto mb-4 opacity-20" />
        <h3 className="font-black text-lg mb-1">Data belum tersedia</h3>
        <p className={`text-sm ${muted}`}>Diperlukan minimal 5 draw histori</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-3">

      {/* ── Header ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-xl font-black ${main}`}>Rumus & Formula Jitu</h2>
            <p className={`text-sm ${muted} mt-0.5`}>8 metode analisis berdasarkan {draws.length} histori draw</p>
          </div>
          <div className={`text-right flex-shrink-0`}>
            <div className={`text-xs ${muted}`}>Draw terakhir</div>
            <div className="text-2xl font-black tracking-widest text-blue-400">{lastDraw || "—"}</div>
            <div className={`text-xs ${muted}`}>{todayHari}</div>
          </div>
        </div>
      </div>

      {/* ══ ANGKA JITU HARI INI (always visible) ══ */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
            <Star className="w-4 h-4 text-white"/>
          </div>
          <div>
            <div className={`font-black text-sm ${main}`}>Angka Jitu Hari Ini</div>
            <div className={`text-xs ${muted}`}>Sintesis dari 8 formula — skor tertinggi</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {angkaJitu.slice(0,10).map((x, i) => (
            <div key={x.num} className="flex flex-col items-center gap-0.5">
              <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-base font-black ${
                i === 0 ? "bg-yellow-500 text-black" :
                i < 3 ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" :
                i < 6 ? isDark ? "bg-white/15 text-white" : "bg-slate-200 text-slate-700" :
                isDark ? "bg-white/8 text-white/70" : "bg-slate-100 text-slate-500"
              }`}>{x.num}</span>
              <span className={`text-[9px] font-bold ${muted}`}>{x.score}</span>
            </div>
          ))}
        </div>
        <div className={`mt-3 text-xs ${muted} flex items-center gap-1.5`}>
          <Zap className="w-3 h-3 text-yellow-400"/>
          Skor = kombinasi overdue gap + BBFS + histori hari + shio + penjumlahan
        </div>
      </div>

      {/* ── Sections ── */}
      <div className={`${card} overflow-hidden divide-y ${isDark ? "divide-white/8" : "divide-slate-100"}`}>

        {/* 1. Angka Mati */}
        <div>
          <SectionHdr id="mati" icon={<Snowflake className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-blue-600 to-cyan-700"
            title="Angka Mati & Overdue"
            sub={`${angkaMatiData.mati.length} nomor belum keluar dalam 30 draw`}/>
          {openSection === "mati" && (
            <div className="px-4 pb-4 space-y-4">
              <div>
                <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>
                  Angka Mati — tidak keluar dalam 30 draw terakhir
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {angkaMatiData.mati.length === 0
                    ? <span className={`text-sm ${muted}`}>Semua nomor sudah pernah keluar dalam 30 draw</span>
                    : angkaMatiData.mati.map(x => (
                      <NumBadge key={x.num} n={x.num} col="bg-blue-500/20 text-blue-400"/>
                    ))
                  }
                </div>
              </div>
              <div>
                <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>
                  Angka Paling Overdue — gap terpanjang sejak terakhir keluar
                </div>
                <div className="flex flex-wrap gap-2">
                  {angkaMatiData.overdue.map((x, i) => (
                    <div key={x.num} className="flex flex-col items-center gap-0.5">
                      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-sm font-black ${
                        i < 3 ? "bg-orange-500/25 text-orange-400" : isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"
                      }`}>{x.num}</span>
                      <span className={`text-[9px] font-bold ${muted}`}>+{x.gap}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 Nomor mati bisa jadi peluang (sudah sangat lama tidak keluar) atau dihindari (sedang "mati").
                Gabungkan dengan analisis shio dan BBFS untuk keputusan terbaik.
              </div>
            </div>
          )}
        </div>

        {/* 2. Formula Berputar */}
        <div>
          <SectionHdr id="berputar" icon={<RotateCcw className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-purple-600 to-indigo-700"
            title="Formula Berputar"
            sub={`6 variasi rotasi dari draw terakhir: ${lastDraw}`}/>
          {openSection === "berputar" && (
            <div className="px-4 pb-4 space-y-3">
              <div className={`text-xs ${muted} mb-1`}>
                Draw terakhir: <span className="text-lg font-black text-purple-400 tracking-widest">{lastDraw}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {formulaBerputar.map(r => (
                  <div key={r.label} className={`rounded-xl p-3 ${sub} flex items-center gap-3`}>
                    <div className="font-black text-lg tracking-widest text-purple-400">{r.d2dep}</div>
                    <div className="flex-1">
                      <div className={`text-xs font-bold ${main}`}>{r.label}</div>
                      <div className={`text-[10px] ${muted}`}>{r.d4} · {r.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 Ambil 2D DEPAN dari setiap variasi. Kombinasikan 2-3 variasi untuk taruhan lebih luas.
              </div>
            </div>
          )}
        </div>

        {/* 3. Formula Penjumlahan */}
        <div>
          <SectionHdr id="sum" icon={<Calculator className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-green-600 to-emerald-700"
            title="Formula Penjumlahan"
            sub={`Kunci dari jumlah digit ${lastDraw}`}/>
          {openSection === "sum" && formulaSum && (
            <div className="px-4 pb-4 space-y-3">
              <div className={`rounded-xl p-4 ${sub}`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label:"Jumlah Semua", val:`${lastDraw.split("").join("+")}=${formulaSum.sumAll}`, kunci:formulaSum.kunciU },
                    { label:"Depan (A+B)", val:`${lastDraw[0]}+${lastDraw[1]}=${formulaSum.depan+parseInt(lastDraw[0])+parseInt(lastDraw[1])-formulaSum.depan}`, kunci:formulaSum.depan },
                    { label:"Belakang (C+D)", val:`${lastDraw[2]}+${lastDraw[3]}`, kunci:formulaSum.belakang },
                    { label:"Tengah (B+C)", val:`${lastDraw[1]}+${lastDraw[2]}`, kunci:formulaSum.tengah },
                    { label:"Silang (A+D)", val:`${lastDraw[0]}+${lastDraw[3]}`, kunci:formulaSum.silang },
                  ].map(x => (
                    <div key={x.label} className={`rounded-lg p-2.5 ${isDark ? "bg-white/5" : "bg-white"} border ${isDark ? "border-white/10" : "border-slate-200"}`}>
                      <div className={`text-[10px] ${muted}`}>{x.label}</div>
                      <div className="text-lg font-black text-green-400">{x.kunci}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>2D Depan hasil kombinasi kunci</div>
                <div className="flex flex-wrap gap-2">
                  {formulaSum.d2s.map((n,i) => (
                    <NumBadge key={n} n={n}
                      col={i<4 ? "bg-green-500/25 text-green-400" : isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}/>
                  ))}
                </div>
              </div>
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 Digit kunci mod 10 merepresentasikan "energi" dari draw sebelumnya. Pilih 2D depan yang mengandung digit kunci utama.
              </div>
            </div>
          )}
        </div>

        {/* 4. BBFS Builder */}
        <div>
          <SectionHdr id="bbfs" icon={<Layers className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-orange-600 to-red-700"
            title="BBFS Builder"
            sub="Kumpulan digit terkuat untuk taruhan BBFS 6/8 digit"/>
          {openSection === "bbfs" && bbfsData && (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label:"BBFS 8 Digit", val:bbfsData.bbfs8, col:"text-orange-400", sub2:`${bbfsData.bbfs8.split("").join("·")}` },
                  { label:"BBFS 6 Digit", val:bbfsData.bbfs6, col:"text-yellow-400", sub2:`${bbfsData.bbfs6.split("").join("·")}` },
                  { label:"BBFS 4 Digit", val:bbfsData.bbfs4, col:"text-green-400", sub2:`${bbfsData.bbfs4.split("").join("·")}` },
                ].map(x => (
                  <div key={x.label} className={`rounded-xl p-4 ${sub} text-center`}>
                    <div className={`text-xs ${muted} mb-1`}>{x.label}</div>
                    <div className={`text-2xl font-black tracking-[0.25em] ${x.col}`}>{x.val}</div>
                    <div className={`text-xs ${muted} mt-1`}>{x.sub2}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 ${sub}`}>
                  <div className={`text-xs font-bold ${muted} mb-1`}>Top 4 Digit AS Terkuat</div>
                  <div className="text-xl font-black tracking-widest text-blue-400">{bbfsData.top4AS}</div>
                </div>
                <div className={`rounded-xl p-3 ${sub}`}>
                  <div className={`text-xs font-bold ${muted} mb-1`}>Top 4 Digit KOP Terkuat</div>
                  <div className="text-xl font-black tracking-widest text-indigo-400">{bbfsData.top4KOP}</div>
                </div>
              </div>
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 BBFS 8 digit mencakup hampir semua kemungkinan kombinasi 2D. Gunakan BBFS 6 untuk efisiensi biaya lebih rendah.
              </div>
            </div>
          )}
        </div>

        {/* 5. Formula Hari */}
        <div>
          <SectionHdr id="hari" icon={<CalendarDays className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-teal-600 to-cyan-700"
            title="Formula Hari"
            sub={`Histori terbaik untuk ${todayHari} & ${HARI_NAMES[tomorrowIdx]}`}/>
          {openSection === "hari" && (
            <div className="px-4 pb-4 space-y-4">
              {[
                { label:`Hari ini — ${formulaHari.todayHari}`, data: formulaHari.topToday },
                { label:`Besok — ${formulaHari.tomorrowHari}`, data: formulaHari.topTomorrow },
              ].map(({ label, data }) => (
                <div key={label}>
                  <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>{label}</div>
                  {data.length === 0
                    ? <span className={`text-sm ${muted}`}>Belum ada data histori cukup untuk hari ini</span>
                    : <div className="flex flex-wrap gap-2">
                        {data.map(([k,c], i) => (
                          <div key={k} className="flex flex-col items-center gap-0.5">
                            <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-sm font-black ${
                              i < 3 ? "bg-teal-500/25 text-teal-400" : isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"
                            }`}>{k}</span>
                            <span className={`text-[9px] font-bold ${muted}`}>{c}×</span>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              ))}
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 Nomor yang sering keluar di hari yang sama bisa mengindikasikan pola mingguan. Histori lebih banyak = hasil lebih akurat.
              </div>
            </div>
          )}
        </div>

        {/* 6. Shio Hot/Cold */}
        <div>
          <SectionHdr id="shio" icon={<Flame className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-pink-600 to-rose-700"
            title="Shio Hot & Cold"
            sub="12 shio diurutkan berdasarkan frekuensi 30 draw terakhir"/>
          {openSection === "shio" && (
            <div className="px-4 pb-4 space-y-2">
              {shioAnalysis.map((sh, i) => (
                <div key={sh.name} className={`rounded-xl px-3 py-2.5 ${sub} flex items-center gap-3`}>
                  <span className="text-xl w-8 text-center">{sh.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${main}`}>{sh.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                        sh.trend === "hot" ? "bg-red-500/25 text-red-400" :
                        sh.trend === "cold" ? "bg-blue-500/25 text-blue-400" :
                        isDark ? "bg-white/10 text-white/50" : "bg-slate-200 text-slate-500"
                      }`}>{sh.trend === "hot" ? "🔥 HOT" : sh.trend === "cold" ? "❄️ COLD" : "NORMAL"}</span>
                    </div>
                    <div className={`text-[10px] ${muted} truncate`}>{sh.nums.join(" · ")}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-black ${i<3 ? "text-orange-400" : muted}`}>{sh.cnt30}×</div>
                    <div className={`text-[10px] ${muted}`}>/30 draw</div>
                  </div>
                </div>
              ))}
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub} mt-2`}>
                💡 Pilih nomor dari shio HOT untuk taruhan mengikuti tren, atau shio COLD untuk strategi "overdue".
              </div>
            </div>
          )}
        </div>

        {/* 7. Colok Bebas Pintar */}
        <div>
          <SectionHdr id="colok" icon={<Hash className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-violet-600 to-purple-700"
            title="Colok Bebas Pintar"
            sub="Digit terkuat per posisi dan overall untuk bet colok bebas"/>
          {openSection === "colok" && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>Top 5 Digit Overall</div>
                <div className="flex gap-2">
                  {colokData.top5.split("").map((d,i) => (
                    <span key={i} className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-xl font-black ${
                      i===0 ? "bg-violet-500 text-white" :
                      i===1 ? "bg-violet-500/60 text-white" :
                      isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"
                    }`}>{d}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className={`text-xs font-bold ${muted} mb-2 uppercase tracking-wide`}>Top Digit Per Posisi</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {colokData.topPerPos.map(pp => (
                    <div key={pp.pos} className={`rounded-xl p-3 ${sub} text-center`}>
                      <div className={`text-[10px] font-bold ${muted} mb-1`}>{pp.pos}</div>
                      <div className={`text-base font-black tracking-widest text-violet-400`}>{pp.top3}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub}`}>
                💡 Pasang digit #1 overall untuk colok bebas 1 digit. Kombinasikan Top AS + Top KOP = 2D depan kandidat terkuat.
              </div>
            </div>
          )}
        </div>

        {/* 8. Ringkasan Formula */}
        <div>
          <SectionHdr id="ringkasan" icon={<Award className="w-4 h-4 text-white"/>}
            color="bg-gradient-to-br from-amber-500 to-yellow-600"
            title="Ringkasan Rekomendasi"
            sub="Kesimpulan singkat dari semua 8 formula"/>
          {openSection === "ringkasan" && (
            <div className="px-4 pb-4 space-y-2">
              {[
                { label:"Angka Jitu #1", val: angkaJitu[0]?.num ?? "–", note:"Skor tertinggi gabungan formula", col:"text-yellow-400" },
                { label:"BBFS 6 Digit",  val: bbfsData?.bbfs6 ?? "–", note:"Taruhan BBFS paling efisien", col:"text-orange-400" },
                { label:"Shio Terpanas", val: `${shioAnalysis[0]?.emoji} ${shioAnalysis[0]?.name}`, note:`${shioAnalysis[0]?.cnt30}× dalam 30 draw`, col:"text-pink-400" },
                { label:"Digit Colok",  val: colokData.top5.slice(0,2), note:"2 digit terkuat untuk colok bebas", col:"text-violet-400" },
                { label:"Formula Sum Kunci", val: formulaSum ? String(formulaSum.kunciU) : "–", note:`Digit kunci dari jumlah ${lastDraw}`, col:"text-green-400" },
              ].map(x => (
                <div key={x.label} className={`rounded-xl p-3 ${sub} flex items-center justify-between gap-3`}>
                  <div>
                    <div className={`text-xs font-bold ${muted}`}>{x.label}</div>
                    <div className={`text-xs ${muted}`}>{x.note}</div>
                  </div>
                  <div className={`text-xl font-black tracking-widest ${x.col}`}>{x.val}</div>
                </div>
              ))}
              <div className={`text-xs ${muted} rounded-xl p-3 ${sub} mt-1`}>
                ⚠️ Semua formula bersifat analisis statistik — bukan jaminan kemenangan.
                Gunakan dengan bijak dan tetapkan batas taruhan.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
