import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import Logo from "./Logo";

// NOTE: saldo/histori/laporan/taruhanAwal/jumlahPutaran/targetProfit/pengaliMenang
// are stored inside "strategi_data_v6" as a single JSON blob — NOT as individual keys.
// Using individual keys here would always read null and break cross-device sync.
const SYNC_KEYS = [
  "resumeSesiSelesai", "resumePutaranAktif", "resumePutaranMenang",
  "gh_cfg", "targetHarian", "slotNotifEnabled", "customNumbers",
  "nomorKecil",        // nomor kecil betting list
  "isDark",            // theme preference
  "stopLossEnabled", "stopLoss", "profile", "notifs",
  "manualOverrides",
  "strategi_data_v6",  // contains saldo, histori, laporan, taruhanAwal, etc.
  "saldo_tx",          // SaldoPage transaction history
  "smartai_evals",     // SmartPredictionV2 evaluation history (predicted vs actual)
];

function readAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNC_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

async function saveToServer(retries = 2) {
  const payload = JSON.stringify({ data: readAll() });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/user/data", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (res.ok) return;
    } catch {}
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  }
}

export default function DataSync({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [ready, setReady] = useState(false);
  const prevUserIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setReady(true);
      return;
    }

    if (prevUserIdRef.current === user.id) return;
    prevUserIdRef.current = user.id;

    // Load data from server into localStorage on login
    fetch("/api/user/data", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data: Record<string, string> } | null) => {
        if (json?.data && typeof json.data === "object") {
          for (const [k, v] of Object.entries(json.data)) {
            if (typeof v === "string") localStorage.setItem(k, v);
          }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));

    // Save every 30 seconds
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(saveToServer, 30_000);

    // Save on page close / refresh (may not fire on mobile)
    const handleBeforeUnload = () => { saveToServer(); };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Save when user switches app or tab (important for mobile browsers)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveToServer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Save when app loses focus (extra safety net)
    const handleBlur = () => { saveToServer(); };
    window.addEventListener("blur", handleBlur);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isLoaded, user]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4 px-8">
          {/* Branded logo */}
          <div className="flex justify-center mb-2">
            <div className="relative">
              <Logo size={72} />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-slate-950 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </span>
            </div>
          </div>
          <div>
            <p className="text-white font-black text-lg tracking-tight">4D Macau</p>
            <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase mt-0.5">Strategi Dashboard</p>
          </div>
          {/* Spinner */}
          <div className="flex justify-center pt-1">
            <div className="w-8 h-8 rounded-full border-3 border-blue-600/30 border-t-blue-500 animate-spin" style={{ borderWidth: 3 }} />
          </div>
          <p className="text-slate-500 text-xs">Menyinkronkan data akun...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
