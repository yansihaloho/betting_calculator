import React, { useState, useMemo, useEffect } from "react";
import { PlusCircle, MinusCircle, Wallet, TrendingUp, TrendingDown, Trash2, ArrowUpRight, ArrowDownLeft, Banknote } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

interface Histori {
  id: string; tanggal: string; hasil: "MENANG" | "KALAH";
  putaran: number; profit: number; rugi: number;
}

interface Transaction {
  id: string; type: "deposit" | "withdraw"; amount: number;
  note: string; tanggal: string;
}

function fmt(v: number) { return new Intl.NumberFormat("id-ID").format(v || 0); }
function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export default function SaldoPage({
  saldo, onSaldoChange, histori, isDark,
}: {
  saldo: number;
  onSaldoChange: (v: number) => void;
  histori: Histori[];
  isDark: boolean;
}) {
  const [txList, setTxList]         = useState<Transaction[]>(() => ls("saldo_tx", []));
  const [txType, setTxType]         = useState<"deposit" | "withdraw">("deposit");
  const [txAmount, setTxAmount]     = useState("");
  const [txNote, setTxNote]         = useState("");
  const [filterType, setFilterType] = useState<"all" | "deposit" | "withdraw">("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => { lsSet("saldo_tx", txList); }, [txList]);

  const totalDeposit  = txList.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalWithdraw = txList.filter(t => t.type === "withdraw").reduce((s, t) => s + t.amount, 0);
  const totalProfit   = histori.reduce((s, h) => s + (h.hasil === "MENANG" ? h.profit : -h.rugi), 0);
  const netModal      = totalDeposit - totalWithdraw;
  const roiNum        = netModal > 0 ? (totalProfit / netModal) * 100 : null;
  const roiLabel      = roiNum !== null ? `${roiNum >= 0 ? "+" : ""}${roiNum.toFixed(1)}%` : "—";

  const card = isDark
    ? "rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl"
    : "rounded-[24px] border border-slate-200 bg-white shadow-xl";

  const chartData = useMemo(() => {
    const events: { date: string; balance: number }[] = [];
    let bal = 0;
    [...txList].reverse().forEach(t => {
      bal += t.type === "deposit" ? t.amount : -t.amount;
      events.push({ date: t.tanggal.split(",")[0] || t.tanggal, balance: bal });
    });
    return events.slice(-20);
  }, [txList]);

  function addTx() {
    const amount = parseInt(txAmount.replace(/\D/g, ""));
    if (!amount || amount <= 0) { toast.error("Masukkan nominal yang valid"); return; }
    if (txType === "withdraw" && amount > saldo) { toast.error("Nominal melebihi saldo"); return; }
    const tx: Transaction = {
      id: Date.now().toString(), type: txType, amount,
      note: txNote || (txType === "deposit" ? "Deposit" : "Withdraw"),
      tanggal: new Date().toLocaleString("id-ID"),
    };
    setTxList(prev => [tx, ...prev]);
    onSaldoChange(txType === "deposit" ? saldo + amount : saldo - amount);
    toast.success(`${txType === "deposit" ? "Deposit" : "Withdraw"} Rp ${fmt(amount)} berhasil`);
    setTxAmount(""); setTxNote("");
  }

  function confirmDelete(id: string) {
    setPendingDelete(id);
    toast(`Hapus transaksi ini?`, {
      action: { label: "Hapus", onClick: () => doDelete(id) },
      cancel: { label: "Batal", onClick: () => setPendingDelete(null) },
      duration: 5000,
    });
  }

  function doDelete(id: string) {
    setTxList(prev => prev.filter(t => t.id !== id));
    setPendingDelete(null);
    toast.success("Transaksi dihapus");
  }

  const filtered = txList.filter(t => filterType === "all" || t.type === filterType);

  return (
    <div className="animate-slide-up space-y-4">
      {/* Hero header */}
      <div className="rounded-[24px] bg-gradient-to-r from-green-700 via-emerald-700 to-teal-700 text-white p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 opacity-80"/>
              <span className="text-xs font-bold opacity-70">MANAJEMEN SALDO</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Rp {fmt(saldo)}</h1>
            <p className="text-xs opacity-70 mt-1">
              {txList.length} transaksi · ROI {roiLabel}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-60 mb-0.5">Profit Taruhan</div>
            <div className={`text-xl font-black ${totalProfit >= 0 ? "text-green-300" : "text-red-300"}`}>
              {totalProfit >= 0 ? "+" : ""}Rp {fmt(Math.abs(totalProfit))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Saldo",          val:`Rp ${fmt(saldo)}`,         color:"bg-gradient-to-br from-green-600 to-emerald-700 text-white", textColor:"", i:0 },
          { label:"Total Deposit",  val:`Rp ${fmt(totalDeposit)}`,  color:card, textColor:"text-blue-400",   i:1 },
          { label:"Total Withdraw", val:`Rp ${fmt(totalWithdraw)}`, color:card, textColor:"text-orange-400", i:2 },
          { label:"ROI",            val:roiLabel, color:card, textColor: roiNum !== null && roiNum >= 0 ? "text-green-400" : "text-red-400", i:3 },
        ].map((s) => (
          <div key={s.i} className={`p-4 ${s.color}`}>
            <div className={`text-xs font-bold ${s.i === 0 ? "text-white/70" : isDark ? "opacity-50" : "text-slate-500"}`}>{s.label}</div>
            <div className={`text-xl font-black mt-1 ${s.textColor}`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input form */}
        <div className={`${card} p-5`}>
          <h3 className="font-black mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-400"/>
            </div>
            Deposit / Withdraw
          </h3>
          <div className={`flex gap-0 rounded-2xl overflow-hidden border mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
            {(["deposit","withdraw"] as const).map(t => (
              <button key={t} onClick={() => setTxType(t)}
                className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-1.5 transition-all
                  ${txType === t ? t === "deposit" ? "bg-blue-600 text-white" : "bg-red-600 text-white" : isDark ? "bg-white/5 text-white/50 hover:bg-white/10" : "text-slate-400 hover:bg-slate-50"}`}>
                {t === "deposit" ? <ArrowDownLeft className="w-4 h-4"/> : <ArrowUpRight className="w-4 h-4"/>}
                {t === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>Nominal (Rp)</label>
              <input type="text" inputMode="numeric" value={txAmount} placeholder="0"
                onChange={e => setTxAmount(e.target.value.replace(/\D/g, ""))}
                className={`w-full rounded-2xl px-4 py-3 text-lg font-black outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-white/10 border border-white/20 text-white" : "bg-slate-50 border border-slate-300 text-slate-900"}`}/>
              {txAmount && (
                <div className={`text-xs mt-1.5 font-bold px-1 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                  Rp {fmt(parseInt(txAmount || "0"))}
                </div>
              )}
            </div>
            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>Keterangan (opsional)</label>
              <input type="text" value={txNote} placeholder={txType === "deposit" ? "Isi saldo, top up..." : "Tarik saldo, withdraw..."}
                onChange={e => setTxNote(e.target.value)}
                className={`w-full rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-white/10 border border-white/20 text-white" : "bg-slate-50 border border-slate-300 text-slate-900"}`}/>
            </div>
            <button onClick={addTx}
              className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg
                ${txType === "deposit" ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-blue-500/30" : "bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-red-500/30"}`}>
              {txType === "deposit" ? <><PlusCircle className="w-4 h-4"/>Tambah Deposit</> : <><MinusCircle className="w-4 h-4"/>Withdraw</>}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className={`${card} p-5`}>
          <h3 className="font-black mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-green-400"/>
            </div>
            Ringkasan Keuangan
          </h3>
          <div className="space-y-2">
            {[
              { label:"Modal Masuk",      val:`Rp ${fmt(totalDeposit)}`,  color:"text-blue-400",   icon:<ArrowDownLeft className="w-3.5 h-3.5 text-blue-400"/> },
              { label:"Modal Keluar",     val:`Rp ${fmt(totalWithdraw)}`, color:"text-orange-400", icon:<ArrowUpRight className="w-3.5 h-3.5 text-orange-400"/> },
              { label:"Modal Bersih",     val:`Rp ${fmt(netModal)}`,      color:netModal >= 0 ? "text-green-400" : "text-red-400", icon:<Wallet className="w-3.5 h-3.5 text-white/40"/> },
              { label:"Profit Taruhan",   val:`${totalProfit >= 0 ? "+" : ""}Rp ${fmt(Math.abs(totalProfit))}`, color:totalProfit >= 0 ? "text-green-400" : "text-red-400", icon:totalProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-400"/> : <TrendingDown className="w-3.5 h-3.5 text-red-400"/> },
              { label:"Saldo Saat Ini",   val:`Rp ${fmt(saldo)}`,         color:"font-black", icon:<Banknote className="w-3.5 h-3.5 text-emerald-400"/> },
            ].map((s, i) => (
              <div key={i} className={`flex justify-between items-center py-2.5 px-3 rounded-xl ${i === 4 ? isDark ? "bg-white/10 border border-white/10" : "bg-slate-50 border border-slate-200" : ""}`}>
                <div className="flex items-center gap-2">
                  {s.icon}
                  <span className={`text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>{s.label}</span>
                </div>
                <span className={`text-sm font-bold ${s.color}`}>{s.val}</span>
              </div>
            ))}
          </div>
          {chartData.length > 0 && (
            <div className="mt-4 pt-4 border-t border-current/10">
              <div className={`text-xs font-bold mb-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>Riwayat Saldo</div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}/>
                  <XAxis dataKey="date" hide/>
                  <YAxis hide/>
                  <Tooltip contentStyle={{ background:isDark?"#1e293b":"#fff", border:"1px solid rgba(99,102,241,0.3)", borderRadius:8, fontSize:11 }} formatter={(v:number) => [`Rp ${fmt(v)}`, "Saldo"]}/>
                  <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2.5} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Transaction history */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-black flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-purple-400"/>
            </div>
            Riwayat Transaksi
            <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500"}`}>{txList.length}</span>
          </h3>
          <div className={`flex rounded-xl overflow-hidden border ${isDark ? "border-white/10" : "border-slate-200"}`}>
            {(["all","deposit","withdraw"] as const).map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`px-3 py-1.5 text-xs font-bold transition-all ${filterType === f ? "bg-blue-600 text-white" : isDark ? "bg-white/5 text-white/50 hover:bg-white/10" : "text-slate-400 hover:bg-slate-50"}`}>
                {f === "all" ? "Semua" : f === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <div className="text-center py-12 opacity-40">
              <Banknote className="w-10 h-10 mx-auto mb-2 opacity-50"/>
              <p className="text-sm">Belum ada transaksi</p>
            </div>
          )}
          {filtered.map(tx => (
            <div key={tx.id} className={`flex items-center justify-between p-3 rounded-2xl group transition-all ${
              pendingDelete === tx.id
                ? isDark ? "bg-red-500/15 border border-red-500/30" : "bg-red-50 border border-red-200"
                : isDark ? "bg-white/5 hover:bg-white/8" : "bg-slate-50 hover:bg-slate-100"
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${tx.type === "deposit" ? "bg-blue-500/20" : "bg-red-500/20"}`}>
                  {tx.type === "deposit" ? <ArrowDownLeft className="w-4 h-4 text-blue-400"/> : <ArrowUpRight className="w-4 h-4 text-red-400"/>}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{tx.note}</div>
                  <div className={`text-[10px] ${isDark ? "text-white/30" : "text-slate-400"}`}>{tx.tanggal}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-black ${tx.type === "deposit" ? "text-blue-400" : "text-red-400"}`}>
                  {tx.type === "deposit" ? "+" : "-"}Rp {fmt(tx.amount)}
                </span>
                <button onClick={() => confirmDelete(tx.id)}
                  className={`p-1.5 rounded-xl transition-all ${isDark ? "text-white/20 hover:text-red-400 hover:bg-red-500/15" : "text-slate-300 hover:text-red-500 hover:bg-red-50"}`}>
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
