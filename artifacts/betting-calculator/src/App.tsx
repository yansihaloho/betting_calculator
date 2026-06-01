import { useEffect, useState } from "react";
import { ClerkProvider, Show, useClerk, useUser } from "@clerk/react";
import { dark } from "@clerk/themes";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { Toaster } from "sonner";
import Calculator from "@/pages/Calculator";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import DataSync from "@/components/DataSync";
import Logo from "@/components/Logo";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600 rounded-full blur-[120px] opacity-10" />
      </div>
      <div className="relative max-w-sm w-full text-center space-y-7">
        {/* Logo + title */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <Logo size={88} className="drop-shadow-2xl" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-950 flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              </span>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">4D Macau</h1>
            <p className="text-blue-400 font-bold text-sm mt-0.5 tracking-widest uppercase">Strategi Dashboard</p>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            Kalkulator strategi Toto Macau dengan histori, analitik, dan sinkronisasi data antar perangkat.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {["Smart AI Prediksi", "Live Result", "Multi-Perangkat"].map(f => (
            <span key={f} className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">{f}</span>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="space-y-3">
          <a
            href={`${basePath}/sign-in`}
            className="flex items-center justify-center w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-base transition-all shadow-lg shadow-blue-500/25 active:scale-95"
          >
            Masuk dengan Akun
          </a>
          <a
            href={`${basePath}/sign-up`}
            className="flex items-center justify-center w-full py-4 rounded-2xl bg-white/8 hover:bg-white/12 text-white font-bold text-base border border-white/10 transition-all active:scale-95"
          >
            Buat Akun Baru
          </a>
        </div>

        <p className="text-slate-600 text-xs">🔒 Data tersimpan aman per akun • Sinkron lintas perangkat</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const userProfile = user ? {
    name: user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "User",
    imageUrl: user.imageUrl || "",
    email: user.emailAddresses[0]?.emailAddress || "",
  } : undefined;
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

  function handleSignOut() {
    signOut({ redirectUrl: basePath || "/" });
  }

  return (
    <DataSync>
      <div className={theme === "dark" ? "dark" : ""}>
        <Calculator
          theme={theme}
          toggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
          onSignOut={handleSignOut}
          userProfile={userProfile}
        />
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
