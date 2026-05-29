import { useState, useEffect } from "react";
import Calculator from "@/pages/Calculator";
import { Toaster } from "sonner";

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.remove("light");
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <Calculator theme={theme} toggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")} />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
