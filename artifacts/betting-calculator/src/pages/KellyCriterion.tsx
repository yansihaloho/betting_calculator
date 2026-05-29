import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrency } from "@/contexts/CurrencyContext";

export function KellyCriterion() {
  const { currency } = useCurrency();
  const [bankroll, setBankroll] = useState<string>("");
  const [winProb, setWinProb] = useState<string>("");
  const [odds, setOdds] = useState<string>("");

  const results = useMemo(() => {
    const b = parseFloat(bankroll);
    const p = parseFloat(winProb);
    const o = parseFloat(odds);

    if (isNaN(b) || isNaN(p) || isNaN(o) || b <= 0 || p <= 0 || p > 100 || o <= 1) {
      return null;
    }

    const prob = p / 100;
    const b_odds = o - 1;
    const q = 1 - prob;
    const kellyPct = ((prob * b_odds) - q) / b_odds;

    if (kellyPct <= 0) {
      return { kellyPct: 0, negative: true };
    }

    return {
      kellyPct,
      negative: false,
      full: b * kellyPct,
      half: b * (kellyPct / 2),
      quarter: b * (kellyPct / 4),
      threeQuarter: b * (kellyPct * 0.75)
    };
  }, [bankroll, winProb, odds]);

  return (
    <div className="container max-w-3xl mx-auto px-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kelly Criterion</h1>
          <p className="text-muted-foreground mt-2">Optimize your bet sizing based on your perceived edge.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="bankroll">Total Bankroll ({currency})</Label>
                <Input 
                  id="bankroll" 
                  type="number" 
                  step="1" 
                  min="0" 
                  value={bankroll} 
                  onChange={(e) => setBankroll(e.target.value)} 
                  placeholder="1000"
                  className="font-mono h-12 bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="winProb">Win Probability (%)</Label>
                <Input 
                  id="winProb" 
                  type="number" 
                  step="0.1" 
                  min="0"
                  max="100"
                  value={winProb} 
                  onChange={(e) => setWinProb(e.target.value)} 
                  placeholder="55"
                  className="font-mono h-12 bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="odds">Odds (Decimal)</Label>
                <Input 
                  id="odds" 
                  type="number" 
                  step="0.01" 
                  min="1.01" 
                  value={odds} 
                  onChange={(e) => setOdds(e.target.value)} 
                  placeholder="2.00"
                  className="font-mono h-12 bg-background/50"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Recommended Stake</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {results?.negative ? (
                  <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md text-destructive">
                    <h4 className="font-semibold mb-1">Negative Edge</h4>
                    <p className="text-sm">The Kelly Criterion recommends not betting on this selection as the odds do not reflect value based on your estimated probability.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center p-6 bg-primary/10 rounded-lg border border-primary/20">
                      <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-2">Full Kelly Stake</span>
                      <span className="text-4xl font-bold text-primary tracking-tight font-mono">
                        {results ? `${currency}${results.full.toFixed(2)}` : "--"}
                      </span>
                      <span className="text-sm text-primary/80 mt-2 font-mono">
                        {results ? `${(results.kellyPct * 100).toFixed(2)}% of bankroll` : ""}
                      </span>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-border/40">
                      <h4 className="text-sm font-medium text-muted-foreground">Fractional Kelly Strategies</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-muted/30 p-3 rounded-md border border-border/40 text-center">
                          <div className="text-xs text-muted-foreground mb-1">1/4 Kelly</div>
                          <div className="font-mono font-medium text-sm">{results ? `${currency}${results.quarter.toFixed(2)}` : "--"}</div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-md border border-border/40 text-center">
                          <div className="text-xs text-muted-foreground mb-1">1/2 Kelly</div>
                          <div className="font-mono font-medium text-sm">{results ? `${currency}${results.half.toFixed(2)}` : "--"}</div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-md border border-border/40 text-center">
                          <div className="text-xs text-muted-foreground mb-1">3/4 Kelly</div>
                          <div className="font-mono font-medium text-sm">{results ? `${currency}${results.threeQuarter.toFixed(2)}` : "--"}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>What is the Kelly Criterion?</strong><br/>
                  A mathematical formula used to determine the optimal size of a series of bets to maximize the logarithm of wealth. It assumes you know the true probability of winning. Fractional Kelly (e.g. 1/2 Kelly) is often preferred to reduce volatility while still capturing most of the growth potential.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
