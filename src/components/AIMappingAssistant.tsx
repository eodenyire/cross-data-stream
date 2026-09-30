import { useState } from "react";
import { Sparkles, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { dbHub } from "@/lib/dbHub";
import { toast } from "sonner";

type Mapping = { dest_column: string; source_columns: string; transformation: string; sql_expression: string; confidence: string; explanation: string };
type Result = { summary: string; mappings: Mapping[]; rules: string[]; unused_source_columns: string[]; risks: string[] };

export default function AIMappingAssistant() {
  const [src, setSrc] = useState("");
  const [dst, setDst] = useState("");
  const [samples, setSamples] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await dbHub<Result>("ai_mapping", { source_schema: src, dest_schema: dst, samples, outcome })); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const sql = res ? `SELECT\n${res.mappings.map((m) => `  ${m.sql_expression || "NULL"} AS ${m.dest_column}`).join(",\n")}\nFROM source_table;` : "";

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <h2 className="font-heading font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Mapping Assistant</h2>
        <p className="text-xs text-muted-foreground mt-1">Paste both table layouts, a few sample rows and what you want. The assistant suggests column mappings and cleaning rules.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1"><Label className="text-xs">Source table layout</Label>
          <Textarea className="font-mono text-xs min-h-[110px]" placeholder={"cust_no text\nacct_open_dt text\nbal_kes text"} value={src} onChange={(e) => setSrc(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Destination table layout</Label>
          <Textarea className="font-mono text-xs min-h-[110px]" placeholder={"customer_id integer\nopened_on date\nbalance numeric(18,2)"} value={dst} onChange={(e) => setDst(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Sample source rows (CSV is fine)</Label>
          <Textarea className="font-mono text-xs min-h-[90px]" placeholder={"cust_no,acct_open_dt,bal_kes\n00123,03/02/2024,\"1,200.50\""} value={samples} onChange={(e) => setSamples(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Desired outcome</Label>
          <Textarea className="text-xs min-h-[90px]" placeholder="e.g. Clean daily balances for the credit risk dashboard, one row per customer" value={outcome} onChange={(e) => setOutcome(e.target.value)} /></div>
      </div>
      <Button onClick={run} disabled={busy || !src.trim() || !dst.trim()} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Thinking..." : "Suggest mappings"}
      </Button>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {res && (
        <div className="space-y-4">
          <p className="text-sm">{res.summary}</p>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-muted-foreground text-left">
                <th className="p-2">Destination</th><th className="p-2">From</th><th className="p-2">Rule</th><th className="p-2">SQL</th><th className="p-2">Confidence</th><th className="p-2">Why</th>
              </tr></thead>
              <tbody>{res.mappings.map((m, i) => (
                <tr key={i} className="border-b border-border/50 align-top">
                  <td className="p-2 font-medium">{m.dest_column}</td>
                  <td className="p-2">{m.source_columns || <span className="text-muted-foreground">none</span>}</td>
                  <td className="p-2">{m.transformation}</td>
                  <td className="p-2 font-mono">{m.sql_expression}</td>
                  <td className="p-2"><Badge variant={m.confidence === "high" ? "default" : m.confidence === "low" ? "destructive" : "secondary"}>{m.confidence}</Badge></td>
                  <td className="p-2 text-muted-foreground">{m.explanation}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-xs">
            {[["Cleaning rules", res.rules], ["Unused source columns", res.unused_source_columns], ["Risks & questions", res.risks]].map(([t, list]) => (
              <div key={t as string} className="space-y-1"><p className="font-semibold text-muted-foreground uppercase tracking-wider">{t as string}</p>
                {(list as string[]).length ? <ul className="list-disc pl-4 space-y-1">{(list as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-muted-foreground">None</p>}
              </div>))}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between"><Label className="text-xs">Suggested SELECT</Label>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(sql); toast.success("Copied"); }}><Copy className="h-3 w-3 mr-1" /> Copy</Button></div>
            <pre className="bg-secondary/50 rounded p-3 text-xs font-mono overflow-auto">{sql}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
