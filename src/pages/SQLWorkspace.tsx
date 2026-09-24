import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Download, Copy, Loader2, Terminal, TableIcon } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { saveAs } from "file-saver";
import AppLayout from "@/components/AppLayout";
import ConnectionSelect from "@/components/ConnectionSelect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dbHub } from "@/lib/dbHub";
import { toast } from "sonner";

type Row = Record<string, unknown>;

export default function SQLWorkspace() {
  const [connectionId, setConnectionId] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [query, setQuery] = useState("SELECT * FROM your_table LIMIT 100;");
  const [results, setResults] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; truncated: boolean; ms: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [exportFormat, setExportFormat] = useState("xlsx");

  useEffect(() => {
    if (!connectionId) return;
    setTables([]);
    dbHub("list_tables", { connection_id: connectionId }).then((r) => setTables(r.tables)).catch(() => {});
  }, [connectionId]);

  const handleRun = async () => {
    setRunning(true); setError(""); setResults(null); setMeta(null);
    try {
      const r = await dbHub("query", { connection_id: connectionId, sql: query });
      setResults(r.rows); setMeta({ total: r.total, truncated: r.truncated, ms: r.ms });
    } catch (e: any) { setError(e.message); }
    setRunning(false);
  };

  const handleExport = () => {
    if (!results?.length) return;
    const name = `query_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    if (exportFormat === "json") return saveAs(new Blob([JSON.stringify(results, null, 2)], { type: "application/json" }), `${name}.json`);
    if (exportFormat === "csv" || exportFormat === "tsv") {
      const out = Papa.unparse(results, { delimiter: exportFormat === "tsv" ? "\t" : "," });
      return saveAs(new Blob([out], { type: "text/plain" }), `${name}.${exportFormat}`);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results), "Results");
    XLSX.writeFile(wb, `${name}.xlsx`);
    toast.success("Exported");
  };

  const cols = results?.[0] ? Object.keys(results[0]) : [];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">SQL Workspace</h1>
          <p className="text-muted-foreground text-sm mt-1">Run queries (including multi-table joins) and export results.</p>
        </motion.div>

        <div className="grid lg:grid-cols-[240px_1fr] gap-4">
          <div className="glass-card p-4 space-y-3 h-fit">
            <Label className="text-xs">Connection</Label>
            <ConnectionSelect value={connectionId} onChange={setConnectionId} />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Tables</p>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {tables.length === 0 && <p className="text-xs text-muted-foreground">No tables found.</p>}
              {tables.map((t) => (
                <button key={t} onClick={() => setQuery(`SELECT * FROM ${t} LIMIT 100;`)}
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary flex items-center gap-2 truncate">
                  <TableIcon className="h-3 w-3 text-primary shrink-0" /> {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="glass-card p-4 space-y-3">
              <h2 className="text-sm font-heading font-semibold flex items-center gap-2"><Terminal className="h-4 w-4 text-primary" /> Query Editor</h2>
              <Textarea value={query} onChange={(e) => setQuery(e.target.value)}
                className="font-mono text-sm min-h-[180px] bg-secondary/50 border-border/50" />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleRun} disabled={running || !query.trim() || !connectionId} className="gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? "Running..." : "Execute Query"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(query)}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
            </div>

            {error && <div className="glass-card p-4 border-destructive/40"><p className="text-sm text-destructive whitespace-pre-wrap">{error}</p></div>}

            {results && (
              <div className="glass-card p-4">
                <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
                  <div className="flex gap-2 items-center">
                    <Badge variant="secondary">{meta?.total.toLocaleString()} rows</Badge>
                    <span className="text-xs text-muted-foreground">{meta?.ms} ms{meta?.truncated ? " · showing first 5,000" : ""}</span>
                  </div>
                  <div className="flex gap-2">
                    <Select value={exportFormat} onValueChange={setExportFormat}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xlsx">Excel</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="tsv">TSV</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={!results.length}>
                      <Download className="h-3 w-3" /> Export
                    </Button>
                  </div>
                </div>
                {results.length === 0 ? <p className="text-sm text-muted-foreground">Query ran — no rows returned.</p> : (
                  <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border">{cols.map((k) => <th key={k} className="text-left p-2 text-muted-foreground font-medium whitespace-nowrap">{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {results.slice(0, 1000).map((row, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {cols.map((c) => <td key={c} className="p-2 whitespace-nowrap">{row[c] === null ? <span className="text-muted-foreground">null</span> : typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
