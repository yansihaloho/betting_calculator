import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrency } from "@/contexts/CurrencyContext";

export function SingleBet() {
  const { currency } = useCurrency();
  const [stake, setStake] = useState<string>("");
  const [odds, setOdds] = useState<string>("");
  const [betType, setBetType] = useState<"win" | "each-way">("win");
  const [placeTerms, setPlaceTerms] = useState<string>("0.25");

  const results = useMemo(() => {
    const s = parseFloat(stake);
    const o = parseFloat(odds);
    
    if (isNaN(s) || isNaN(o) || s <= 0 || o < 1.01) {
      return null;
    }

    if (betType === "win") {
      const ret = s * o;
      const profit = ret - s;
      const roi = (profit / s) * 100;
      return {
        totalStake: s,
        winReturn: ret,
        placeReturn: 0,
        totalReturn: ret,
        profit,
        roi
      };
    } else {
      const pt = parseFloat(placeTerms);
      if (isNaN(pt)) return null;

      const totalStake = s * 2;
      const winReturn = s * o;
      const placeOdds = ((o - 1) * pt) + 1;
      const placeReturn = s * placeOdds;
      const totalReturn = winReturn + placeReturn;
      const profit = totalReturn - totalStake;
      const roi = (profit / totalStake) * 100;

      return {
        totalStake,
        winReturn,
        placeReturn,
        totalReturn,
        profit,
        roi
      };
    }
  }, [stake, odds, betType, placeTerms]);

  return (
    <div className="container max-w-3xl mx-auto px-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Single Bet</h1>
          <p className="text-muted-foreground mt-2">Calculate returns and profit for single and each-way bets.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Bet Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="stake">Stake ({currency})</Label>
                <Input 
                  id="stake" 
                  type="number" 
                  step="1" 
                  min="0" 
                  value={stake} 
                  onChange={(e) => setStake(e.target.value)} 
                  placeholder="10"
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
                  placeholder="2.50"
                  className="font-mono h-12 bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Bet Type</Label>
                <Select value={betType} onValueChange={(v: "win" | "each-way") => setBetType(v)}>
                  <SelectTrigger className="h-12 bg-background/50">
                    <SelectValue placeholder="Select bet type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win">To Win</SelectItem>
                    <SelectItem value="each-way">Each Way</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {betType === "each-way" && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <Label>Place Terms</Label>
                  <Select value={placeTerms} onValueChange={setPlaceTerms}>
                    <SelectTrigger className="h-12 bg-background/50">
                      <SelectValue placeholder="Select place terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.25">1/4 Odds</SelectItem>
                      <SelectItem value="0.2">1/5 Odds</SelectItem>
                      <SelectItem value="0.16666666666666666">1/6 Odds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-muted-foreground">Total Stake</span>
                  <span className="font-mono font-medium">{currency}{results ? results.totalStake.toFixed(2) : "0.00"}</span>
                </div>
                
                {betType === "each-way" && (
                  <>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted-foreground text-sm">Win Return</span>
                      <span className="font-mono text-sm">{currency}{results ? results.winReturn.toFixed(2) : "0.00"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/40">
                      <span className="text-muted-foreground text-sm">Place Return</span>
                      <span className="font-mono text-sm">{currency}{results ? results.placeReturn.toFixed(2) : "0.00"}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-muted-foreground">Total Return</span>
                  <span className="font-mono font-bold text-lg">{currency}{results ? results.totalReturn.toFixed(2) : "0.00"}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={`font-mono font-bold text-xl ${results && results.profit > 0 ? "text-primary" : ""}`}>
                    {currency}{results ? results.profit.toFixed(2) : "0.00"}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3">
                  <span className="text-muted-foreground">ROI</span>
                  <span className={`font-mono font-bold ${results && results.roi > 0 ? "text-primary" : ""}`}>
                    {results ? results.roi.toFixed(2) : "0.00"}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
