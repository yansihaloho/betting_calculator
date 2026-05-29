import { Link, useLocation } from "wouter";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, LayoutDashboard, ListPlus, Percent } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { currency, setCurrency } = useCurrency();

  const navItems = [
    { path: "/", label: "Odds Converter", icon: Calculator },
    { path: "/single", label: "Single Bet", icon: LayoutDashboard },
    { path: "/accumulator", label: "Accumulator", icon: ListPlus },
    { path: "/kelly", label: "Kelly Criterion", icon: Percent },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block tracking-tight text-primary">BETCALC</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-2 transition-colors hover:text-foreground/80 ${isActive ? "text-foreground" : "text-foreground/60"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Mobile nav placeholder - mostly hidden for brevity, focusing on desktop first but flex-wrap handles small screens */}
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
              {/* Optional search or title */}
            </div>
            <nav className="flex items-center gap-2">
              <Select value={currency} onValueChange={(v: "£" | "$" | "€") => setCurrency(v)}>
                <SelectTrigger className="w-[80px] h-8 text-xs bg-muted/50 border-muted">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="£">GBP (£)</SelectItem>
                  <SelectItem value="$">USD ($)</SelectItem>
                  <SelectItem value="€">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile navigation row */}
      <div className="md:hidden border-b border-border/40 overflow-x-auto no-scrollbar">
        <div className="flex px-4 py-2 gap-4">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 py-8">
        {children}
      </main>
    </div>
  );
}
