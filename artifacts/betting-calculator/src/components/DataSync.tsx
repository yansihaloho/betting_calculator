import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";

const SYNC_KEYS = [
  "resumeSesiSelesai", "resumePutaranAktif", "resumePutaranMenang",
  "gh_cfg", "targetHarian", "slotNotifEnabled", "customNumbers",
  "stopLossEnabled", "stopLoss", "profile", "notifs",
  "saldo", "histori", "laporan", "taruhanAwal", "jumlahPutaran",
  "targetProfit", "pengaliMenang",
];

function readAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNC_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

async function saveToServer() {
  try {
    await fetch("/api/user/data", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: readAll() }),
    });
  } catch {}
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

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(saveToServer, 30_000);
    window.addEventListener("beforeunload", saveToServer);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", saveToServer);
    };
  }, [isLoaded, user]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Memuat data...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
