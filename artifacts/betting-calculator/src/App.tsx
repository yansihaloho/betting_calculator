import { useEffect, useRef, useState } from "react";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
import { dark } from "@clerk/themes";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter, useRouter } from "wouter";
import { Toaster } from "sonner";
import Calculator from "@/pages/Calculator";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import DataSync from "@/components/DataSync";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk" as const,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#3b82f6",
    colorForeground: "#f1f5f9",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#ef4444",
    colorBackground: "#0f172a",
    colorInput: "#1e293b",
    colorInputForeground: "#f1f5f9",
    colorNeutral: "#334155",
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-slate-900 rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl border border-slate-700/50",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-black",
    headerSubtitle: "text-slate-400",
    socialButtonsBlockButtonText: "text-slate-200",
    formFieldLabel: "text-slate-300",
    footerActionLink: "text-blue-400",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-blue-400",
    formFieldSuccessText: "text-green-400",
    alertText: "text-slate-200",
    logoBox: "py-1",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-slate-600 bg-slate-800/50",
    formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-white",
    formFieldInput: "bg-slate-800 border-slate-600 text-slate-100",
    footerAction: "bg-slate-800/30",
    dividerLine: "bg-slate-700",
    alert: "bg-red-950/50 border-red-800/50",
    otpCodeFieldInput: "bg-slate-800 border-slate-600 text-white",
    formFieldRow: "",
    main: "",
  },
};

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="w-20 h-20 rounded-3xl mx-auto bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-blue-500/30">
            <span className="text-white font-black text-2xl">SD</span>
          </div>
          <h1 className="text-3xl font-black text-white">Strategi Dashboard</h1>
          <p className="text-slate-400">Kalkulator strategi Toto Macau dengan histori, analitik, dan sinkronisasi data antar perangkat.</p>
        </div>
        <div className="space-y-3">
          <a
            href={`${basePath}/sign-in`}
            className="block w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base transition-all shadow-lg shadow-blue-500/30"
          >
            Masuk dengan Akun
          </a>
          <a
            href={`${basePath}/sign-up`}
            className="block w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-base border border-white/10 transition-all"
          >
            Buat Akun Baru
          </a>
        </div>
        <p className="text-slate-600 text-xs">Data tersimpan aman per akun • Sinkron lintas perangkat</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("theme") as "dark" | "light") || "dark"; }
    catch { return "dark"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") { root.classList.remove("light"); root.classList.add("dark"); }
    else { root.classList.remove("dark"); root.classList.add("light"); }
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  return (
    <DataSync>
      <div className={theme === "dark" ? "dark" : ""}>
        <Calculator theme={theme} toggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")} />
        <Toaster richColors position="bottom-right" />
      </div>
    </DataSync>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <AppContent />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function UserBar() {
  const { signOut } = useClerk();
  return (
    <button
      onClick={() => signOut({ redirectUrl: basePath || "/" })}
      className="hidden"
    />
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Selamat datang kembali", subtitle: "Masuk untuk melanjutkan" } },
        signUp: { start: { title: "Buat akun baru", subtitle: "Daftar untuk mulai menggunakan Strategi Dashboard" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <UserBar />
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
      </Switch>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
