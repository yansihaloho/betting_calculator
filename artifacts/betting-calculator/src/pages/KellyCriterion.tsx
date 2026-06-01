/**
 * KellyCriterion — Kalkulator Ukuran Taruhan Optimal
 * Menghitung rekomendasi taruhan berbasis edge (keunggulan) dan bankroll.
 * Full Kelly · Half Kelly · Quarter Kelly · ¾ Kelly
 */
import React, { useState, useMemo } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Shield, Calculator, Info, ChevronDown, ChevronUp
} from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("id-ID").format(Math.round(v));
}

interface Props { isDark: boolean; saldo: number; }

export default function KellyCriterion({ isDark, saldo }: Props) {
  const [bankroll, setBankroll]   = useState(saldo > 0 ? String(saldo) : "");
  const [winProb,  setWinProb]    = useState("");
  const [odds,     setOdds]       = useState("");
  const [showInfo, setShowInfo]   = useState(false);

  const card = isDark
    ? "rounded-[22px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl"
    : "rounded-[22px] border border-slate-200 bg-white shadow-xl";

  const inputCls = isDark
    ? "w-full rounded-xl px-4 py-3 text-base font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-white/10 border border-white/20 text-white placeholder-white/30"
    : "w-full rounded-xl px-4 py-3 text-base font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-300";

  const results = useMemo(() => {
    const b = parseFloat(bankroll.replace(/\D/g, "") || "0");
    const p = parseFloat(winProb);
    const o = parseFloat(odds);

    if (!b || !p || !o || b <= 0 || p <= 0 || p > 100 || o <= 1) return null;

    const prob   = p / 100;
    const bOdds  = o - 1;
    const q      = 1 - prob;
    const kellyPct = ((prob * bOdds) - q) / bOdds;

    if (kellyPct <= 0) return { negative: true, kellyPct: 0, bankroll: b };

    const edge = (prob * bOdds) - q;
    const riskLevel =
      kellyPct > 0.4 ? "extreme" :
      kellyPct > 0.2 ? "high" :
      kellyPct > 0.1 ? "medium" : "low";

    return {
      negative:     false,
      kellyPct,
      bankroll:     b,
      edge,
      riskLevel,
      full:         b * kellyPct,
      threeQuarter: b * kellyPct * 0.75,
      half:         b * kellyPct * 0.5,
      quarter:      b * kellyPct * 0.25,
    };
  }, [bankroll, winProb, odds]);

  const riskMeta: Record<string, { label: string; color: string; bg: string }> = {
    extreme: { label: "Risiko Sangat Tinggi",  color: "text-red-400",    bg: "bg-red-500/15 border-red-500/30" },
    high:    { label: "Risiko Tinggi",          color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
    medium:  { label: "Risiko Sedang",          color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
    low:     { label: "Risiko Rendah",          color: "text-green-400",  bg: "bg-green-500/15 border-green-500/30" },
  };

  return (
    <div className="animate-slide-up space-y-4">
      {/* Header */}
      <div className="rounded-[22px] bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 text-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-4 h-4 opacity-80"/>
              <span className="text-xs font-black opacity-70 tracking-widest">KELLY CRITERION</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Ukuran Taruhan Optimal</h1>
            <p className="text-xs opacity-70 mt-1">
              Hitung taruhan ideal berdasarkan edge dan bankroll kamu
            </p>
          </div>
          <button
            onClick={() => setShowInfo(v => !v)}
            className="flex-shrink-0 p-2 rounded-xl bg-white/15 hover:bg-white/25 transition-all"
            title="Tentang Kelly Criterion"
          >
            {showInfo ? <ChevronUp className="w-4 h-4"/> : <Info className="w-4 h-4"/>}
          </button>
        </div>
      </div>

      {/* Info box */}
      {showInfo && (
        <div className={`${card} p-4 text-xs leading-relaxed ${isDark ? "text-white/70" : "text-slate-600"}`}>
          <p className="font-black mb-2 text-sm flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400"/>
            Apa itu Kelly Criterion?
          </p>
          <p className="mb-2">
            Rumus matematis yang menentukan ukuran taruhan optimal untuk memaksimalkan pertumbuhan jangka panjang.
            Formula: <code className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${isDark ? "bg-white/10" : "bg-slate-100"}`}>f* = (p × b - q) / b</code>
          </p>
          <p className="mb-1.5">
            <span className="font-bold">f*</span> = Fraksi bankroll yang disarankan,&nbsp;
            <span className="font-bold">p</span> = Probabilitas menang,&nbsp;
            <span className="font-bold">q</span> = Probabilitas kalah (1 - p),&nbsp;
            <span className="font-bold">b</span> = Net odds (odds - 1)
          </p>
          <p className={`${isDark ? "text-white/40" : "text-slate-400"} text-[11px]`}>
            💡 Disarankan menggunakan ½ Kelly atau ¼ Kelly untuk mengurangi volatilitas.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input form */}
        <div className={`${card} p-5 space-y-4`}>
          <h2 className="font-black text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Calculator className="w-3.5 h-3.5 text-violet-400"/>
            </div>
            Parameter Taruhan
          </h2>

          {/* Bankroll */}
          <div>
            <label className={`text-xs font-black block mb-1.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>
              BANKROLL / SALDO (Rp)
            </label>
            <input
              type="text" inputMode="numeric"
              value={bankroll}
              placeholder={saldo > 0 ? fmt(saldo) : "1.000.000"}
              onChange={e => setBankroll(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
            {bankroll && (
              <div className={`text-xs mt-1 font-bold px-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>
                Rp {fmt(parseFloat(bankroll.replace(/\D/g,"")) || 0)}
              </div>
            )}
            {saldo > 0 && !bankroll && (
              <button
                onClick={() => setBankroll(String(saldo))}
                className={`mt-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${isDark ? "bg-white/10 hover:bg-white/20 text-white/60" : "bg-slate-100 hover:bg-slate-200 text-slate-500"}`}
              >
                Gunakan saldo (Rp {fmt(saldo)})
              </button>
            )}
          </div>

          {/* Win Probability */}
          <div>
            <label className={`text-xs font-black block mb-1.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>
              PROBABILITAS MENANG (%)
            </label>
            <input
              type="number" inputMode="decimal"
              value={winProb}
              placeholder="55"
              min="0.1" max="99.9" step="0.1"
              onChange={e => setWinProb(e.target.value)}
              className={inputCls}
            />
            <div className={`text-[11px] mt-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>
              Estimasi peluang kamu menang dalam 1 putaran (0–100%)
            </div>
          </div>

          {/* Odds */}
          <div>
            <label className={`text-xs font-black block mb-1.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>
              ODDS (DESIMAL)
            </label>
            <input
              type="number" inputMode="decimal"
              value={odds}
              placeholder="2.00"
              min="1.01" step="0.01"
              onChange={e => setOdds(e.target.value)}
              className={inputCls}
            />
            <div className={`text-[11px] mt-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>
              Pengali kemenangan (mis: 95 nomor → odds ≈ 1.05)
            </div>
          </div>

          {/* Quick odds reference */}
          <div className={`p-3 rounded-xl text-xs ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"}`}>
            <div className={`font-black mb-2 ${isDark ? "text-white/50" : "text-slate-400"}`}>Referensi Odds Toto Macau</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                ["4D (1 nomor)", "3500×"],
                ["3D", "350×"],
                ["2D Depan", "95×"],
                ["2D Belakang", "65×"],
                ["Colok Naga", "150×"],
                ["Colok Bebas", "9×"],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className={isDark ? "text-white/40" : "text-slate-400"}>{label}</span>
                  <span className="font-black">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {!results ? (
            <div className={`${card} p-8 text-center`}>
              <Calculator className="w-10 h-10 mx-auto opacity-20 mb-3"/>
              <p className={`text-sm ${isDark ? "text-white/30" : "text-slate-400"}`}>
                Isi parameter di sebelah kiri untuk menghitung rekomendasi taruhan
              </p>
            </div>
          ) : results.negative ? (
            <div className={`${card} p-5`}>
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <TrendingDown className="w-7 h-7 text-red-400"/>
                </div>
                <h3 className="font-black text-lg text-red-400 mb-2">Negatif Edge</h3>
                <p className={`text-sm ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  Kelly Criterion menyarankan untuk <strong>tidak memasang taruhan</strong> karena odds tidak mencerminkan nilai berdasarkan probabilitas yang kamu estimasi.
                </p>
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-bold">
                  📌 Ubah estimasi probabilitas atau cari taruhan dengan odds lebih baik
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Risk level */}
              {results.riskLevel && (
                <div className={`${card} p-4`}>
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${riskMeta[results.riskLevel].bg}`}>
                    <Shield className={`w-5 h-5 flex-shrink-0 ${riskMeta[results.riskLevel].color}`}/>
                    <div>
                      <div className={`font-black text-sm ${riskMeta[results.riskLevel].color}`}>
                        {riskMeta[results.riskLevel].label}
                      </div>
                      <div className={`text-xs mt-0.5 ${isDark ? "text-white/40" : "text-slate-500"}`}>
                        Full Kelly = {(results.kellyPct * 100).toFixed(1)}% bankroll · Edge = {(results.edge * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Kelly stakes */}
              <div className={`${card} p-5`}>
                <h3 className="font-black mb-4 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400"/>
                  </div>
                  Rekomendasi Taruhan
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Full Kelly",     val: results.full,         pct: results.kellyPct,        highlight: false, caution: true },
                    { label: "¾ Kelly",        val: results.threeQuarter, pct: results.kellyPct * 0.75, highlight: false, caution: false },
                    { label: "½ Kelly",        val: results.half,         pct: results.kellyPct * 0.5,  highlight: true,  caution: false },
                    { label: "¼ Kelly",        val: results.quarter,      pct: results.kellyPct * 0.25, highlight: false, caution: false },
                  ].map((r) => (
                    <div key={r.label} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                      r.highlight
                        ? isDark
                          ? "bg-green-500/15 border border-green-500/30"
                          : "bg-green-50 border border-green-200"
                        : isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-200"
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black ${r.highlight ? isDark ? "text-green-300" : "text-green-700" : ""}`}>
                            {r.label}
                          </span>
                          {r.highlight && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"}`}>
                              DISARANKAN
                            </span>
                          )}
                          {r.caution && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}`}>
                              VOLATIL
                            </span>
                          )}
                        </div>
                        <div className={`text-xs mt-0.5 ${isDark ? "text-white/30" : "text-slate-400"}`}>
                          {(r.pct * 100).toFixed(1)}% bankroll
                        </div>
                      </div>
                      <span className={`text-lg font-black tabular-nums ${r.highlight ? isDark ? "text-green-300" : "text-green-700" : isDark ? "text-white" : "text-slate-800"}`}>
                        Rp {fmt(r.val ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Summary note */}
                <div className={`mt-4 p-3 rounded-xl text-xs ${isDark ? "bg-blue-500/10 border border-blue-500/20 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-700"}`}>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
                    <span>
                      Bankroll <strong>Rp {fmt(results.bankroll)}</strong> · Win Rate <strong>{winProb}%</strong> · Odds <strong>{odds}×</strong>
                      <br/>Gunakan <strong>½ Kelly</strong> untuk keseimbangan risiko & pertumbuhan optimal.
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual bar */}
              <div className={`${card} p-4`}>
                <div className={`text-xs font-black mb-3 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                  PROPORSI TARUHAN VS BANKROLL
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: "Full Kelly",  pct: results.kellyPct,        color: "from-orange-500 to-red-500" },
                    { label: "½ Kelly",     pct: results.kellyPct * 0.5,  color: "from-green-500 to-emerald-500" },
                    { label: "¼ Kelly",     pct: results.kellyPct * 0.25, color: "from-blue-500 to-cyan-500" },
                  ].map(r => (
                    <div key={r.label}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className={isDark ? "text-white/60" : "text-slate-500"}>{r.label}</span>
                        <span className={isDark ? "text-white/80" : "text-slate-700"}>{(r.pct * 100).toFixed(1)}%</span>
                      </div>
                      <div className={`h-2.5 rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${r.color} transition-all duration-500`}
                          style={{ width: `${Math.min(r.pct * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
