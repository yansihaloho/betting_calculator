import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Leg {
  id: string;
  name: string;
  odds: string;
}

export function Accumulator() {
  const { currency } = useCurrency();
  const [stake, setStake] = useState<string>("");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [newName, setNewName] = useState<string>("");
  const [newOdds, setNewOdds] = useState<string>("");

  const addLeg = () => {
    if (legs.length >= 20) return;
    const o = parseFloat(newOdds);
    if (isNaN(o) || o < 1.01) return;
    
    setLegs([
      ...legs,
      { id: Date.now().toString(), name: newName || `Selection ${legs.length + 1}`, odds: o.toFixed(2) }
    ]);
    setNewName("");
    setNewOdds("");
  };

  const removeLeg = (id: string) => {
    setLegs(legs.filter(l => l.id !== id));
  };

  const combinedOdds = useMemo(() => {
    if (legs.length === 0) return 0;
    return legs.reduce((acc, leg) => acc * parseFloat(leg.odds), 1);
  }, [legs]);

  const results = useMemo(() => {
    const s = parseFloat(stake);
    if (isNaN(s) || s <= 0 || legs.length === 0) return null;

    const totalReturn = s * combinedOdds;
    const profit = totalReturn - s;

    return { totalReturn, profit };
  }, [stake, combinedOdds, legs.length]);

  return (
    <div className="container max-w-4xl mx-auto px-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accumulator</h1>
          <p className="text-muted-foreground mt-2">Calculate returns for parlays and multiples up to 20 legs.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Selections ({legs.length}/20)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {legs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border/50 rounded-lg">
                    No selections added yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {legs.map((leg, index) => (
                      <div key={leg.id} className="flex items-center justify-between p-3 bg-muted/20 border border-border/40 rounded-md">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono w-4">{index + 1}.</span>
                          <span className="font-medium">{leg.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-primary font-bold">{leg.odds}</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => removeLeg(leg.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-border/40 mt-4 flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="newName" className="text-xs text-muted-foreground">Selection Name (Optional)</Label>
                    <Input 
                      id="newName" 
                      value={newName} 
                      onChange={(e) => setNewName(e.target.value)} 
                      placeholder="e.g. Man Utd to Win"
                      className="bg-background/50 h-10"
                      disabled={legs.length >= 20}
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label htmlFor="newOdds" className="text-xs text-muted-foreground">Odds</Label>
                    <Input 
                      id="newOdds" 
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={newOdds} 
                      onChange={(e) => setNewOdds(e.target.value)} 
                      placeholder="2.00"
                      className="font-mono bg-background/50 h-10"
                      disabled={legs.length >= 20}
                      onKeyDown={(e) => e.key === "Enter" && addLeg()}
                    />
                  </div>
                  <Button onClick={addLeg} disabled={!newOdds || legs.length >= 20} className="h-10 px-4">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Accumulator Details</CardTitle>
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

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-muted-foreground">Combined Odds</span>
                  <span className="font-mono font-bold text-lg text-primary">{combinedOdds > 0 ? combinedOdds.toFixed(2) : "0.00"}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-muted-foreground">Total Return</span>
                  <span className="font-mono font-bold text-lg">{currency}{results ? results.totalReturn.toFixed(2) : "0.00"}</span>
                </div>

                <div className="flex justify-between items-center py-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={`font-mono font-bold text-xl ${results && results.profit > 0 ? "text-primary" : ""}`}>
                    {currency}{results ? results.profit.toFixed(2) : "0.00"}
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
