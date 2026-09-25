import { useState } from "react";
import { ShieldCheck, ShieldAlert, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColType, QualityReport, QualityRules } from "@/lib/dataQuality";

const TYPES: ColType[] = ["integer", "number", "date", "boolean", "email", "text"];
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function RulesEditor({ value, onChange, columns = [] }: { value: QualityRules; onChange: (r: QualityRules) => void; columns?: string[] }) {
  const [typeCol, setTypeCol] = useState("");
  const [typeVal, setTypeVal] = useState<ColType>("integer");
  const listId = `cols-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="space-y-3 text-xs">
      {columns.length > 0 && <datalist id={listId}>{columns.map((c) => <option key={c} value={c} />)}</datalist>}
      <div className="space-y-1">
        <Label className="text-xs">Required fields (comma-separated)</Label>
        <Input className="h-8 text-xs" placeholder="e.g. account_no, customer_id" defaultValue={(value.required ?? []).join(", ")}
          onBlur={(e) => onChange({ ...value, required: split(e.target.value) })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">No duplicates on (comma-separated key columns)</Label>
        <Input className="h-8 text-xs" placeholder="e.g. transaction_id" defaultValue={(value.unique ?? []).join(", ")}
          onBlur={(e) => onChange({ ...value, unique: split(e.target.value) })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Column types</Label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(value.types ?? {}).map(([c, t]) => (
            <span key={c} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5">
              {c}: <b>{t}</b>
              <button aria-label={`Remove ${c} type rule`} onClick={() => { const n = { ...(value.types ?? {}) }; delete n[c]; onChange({ ...value, types: n }); }}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input list={listId} className="h-8 text-xs" placeholder="column" value={typeCol} onChange={(e) => setTypeCol(e.target.value)} />
          <Select value={typeVal} onValueChange={(v) => setTypeVal(v as ColType)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" disabled={!typeCol.trim()}
            onClick={() => { onChange({ ...value, types: { ...(value.types ?? {}), [typeCol.trim()]: typeVal } }); setTypeCol(""); }}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2">
        <Switch checked={!!value.block_on_fail} onCheckedChange={(v) => onChange({ ...value, block_on_fail: v })} />
        Stop the load if any rule fails
      </label>
    </div>
  );
}

export function QualityReportView({ report }: { report: QualityReport }) {
  return (
    <div className={`rounded-md border p-3 text-xs space-y-2 ${report.passed ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
      <p className="flex items-center gap-2 font-medium">
        {report.passed ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
        {report.passed ? `All ${report.checked} rule(s) passed on ${report.rows.toLocaleString()} rows` : `${report.issues.length} rule(s) failed on ${report.rows.toLocaleString()} rows`}
      </p>
      {report.issues.length > 0 && (
        <table className="w-full">
          <thead><tr className="text-muted-foreground text-left"><th className="py-1">Column</th><th>Problem</th><th>Rows</th><th>Examples</th></tr></thead>
          <tbody>
            {report.issues.map((i, n) => (
              <tr key={n} className="border-t border-border/50">
                <td className="py-1 font-medium">{i.column}</td><td>{i.rule}</td><td>{i.count.toLocaleString()}</td>
                <td className="text-muted-foreground">{i.examples.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
