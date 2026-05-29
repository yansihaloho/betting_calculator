import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OddsConverter() {
  const [decimal, setDecimal] = useState<string>("");
  const [fractional, setFractional] = useState<string>("");
  const [american, setAmerican] = useState<string>("");
  const [trueProb, setTrueProb] = useState<string>("");

  const updateFromDecimal = (decStr: string) => {
    setDecimal(decStr);
    const d = parseFloat(decStr);
    
    if (isNaN(d) || d < 1.01) {
      setFractional("");
      setAmerican("");
      return;
    }

    // Decimal to American
    let am = 0;
    if (d >= 2.0) {
      am = (d - 1) * 100;
      setAmerican("+" + Math.round(am).toString());
    } else {
      am = -100 / (d - 1);
      setAmerican(Math.round(am).toString());
    }

    // Decimal to Fractional
    const num = Math.round((d - 1) * 10000);
    const den = 10000;
    
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(num, den);
    setFractional(`${num / divisor}/${den / divisor}`);
  };

  const handleDecimalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFromDecimal(e.target.value);
  };

  const handleFractionalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFractional(val);
    
    const parts = val.split("/");
    if (parts.length === 2) {
      const n = parseFloat(parts[0]);
      const d = parseFloat(parts[1]);
      if (!isNaN(n) && !isNaN(d) && d !== 0) {
        const dec = (n / d) + 1;
        updateFromDecimal(dec.toFixed(2));
      }
    }
  };

  const handleAmericanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmerican(val);
    
    const am = parseFloat(val.replace("+", ""));
    if (!isNaN(am)) {
      let dec = 0;
      if (am > 0) {
        dec = (am / 100) + 1;
      } else if (am < 0) {
        dec = (100 / Math.abs(am)) + 1;
      } else {
        return;
      }
      updateFromDecimal(dec.toFixed(2));
    }
  };

  const impliedProb = useMemo(() => {
    const d = parseFloat(decimal);
    if (isNaN(d) || d < 1.01) return "--";
    return ((100 / d)).toFixed(1) + "%";
  }, [decimal]);

  const edge = useMemo(() => {
    const d = parseFloat(decimal);
    const tp = parseFloat(trueProb);
    if (isNaN(d) || isNaN(tp) || d < 1.01 || tp <= 0 || tp > 100) return "--";
    
    const impProb = 100 / d;
    const edgeVal = tp - impProb;
    return edgeVal.toFixed(1) + "%";
  }, [decimal, trueProb]);

  return (
    <div className="container max-w-3xl mx-auto px-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Odds Converter</h1>
          <p className="text-muted-foreground mt-2">Convert between decimal, fractional, and american odds in real time.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Formats</CardTitle>
              <CardDescription>Edit any field to update the others</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="decimal">Decimal</Label>
                <Input 
                  id="decimal" 
                  type="number" 
                  step="0.01" 
                  min="1.01" 
                  value={decimal} 
                  onChange={handleDecimalChange} 
                  placeholder="2.50"
                  className="font-mono text-lg bg-background/50 h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fractional">Fractional</Label>
                <Input 
                  id="fractional" 
                  type="text" 
                  value={fractional} 
                  onChange={handleFractionalChange} 
                  placeholder="3/2"
                  className="font-mono text-lg bg-background/50 h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="american">American / Moneyline</Label>
                <Input 
                  id="american" 
                  type="text" 
                  value={american} 
                  onChange={handleAmericanChange} 
                  placeholder="+150"
                  className="font-mono text-lg bg-background/50 h-12"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border/50">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center p-6 bg-muted/20 rounded-lg border border-border/40">
                  <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-2">Implied Probability</span>
                  <span className="text-4xl font-bold text-primary tracking-tight">{impliedProb}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Edge Calculator</CardTitle>
                <CardDescription>Calculate your edge against the bookmaker</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="trueProb">Estimated True Probability (%)</Label>
                  <Input 
                    id="trueProb" 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="100"
                    value={trueProb} 
                    onChange={(e) => setTrueProb(e.target.value)} 
                    placeholder="50"
                    className="font-mono h-10 bg-background/50"
                  />
                </div>
                
                <div className="flex justify-between items-center p-4 rounded-md border border-border/50 bg-background">
                  <span className="font-medium">Your Edge</span>
                  <span className={`text-xl font-bold font-mono ${edge !== "--" && parseFloat(edge) > 0 ? "text-primary" : edge !== "--" && parseFloat(edge) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {edge !== "--" && parseFloat(edge) > 0 ? "+" : ""}{edge}
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
