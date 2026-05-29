import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { Layout } from "@/components/Layout";
import { OddsConverter } from "@/pages/OddsConverter";
import { SingleBet } from "@/pages/SingleBet";
import { Accumulator } from "@/pages/Accumulator";
import { KellyCriterion } from "@/pages/KellyCriterion";
import { useEffect } from "react";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={OddsConverter} />
        <Route path="/single" component={SingleBet} />
        <Route path="/accumulator" component={Accumulator} />
        <Route path="/kelly" component={KellyCriterion} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

export default App;
