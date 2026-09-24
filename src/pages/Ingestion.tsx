import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FolderOutput, Play, CheckCircle2, Loader2, FileUp, AlertTriangle, XCircle } from "lucide-react";
import * as XLSX from "xlsx";
import AppLayout from "@/components/AppLayout";
import ConnectionSelect from "@/components/ConnectionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dbHub } from "@/lib/dbHub";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Job = {
  id: string; file: File; fileName: string; table: string;
  status: "queued" | "running" | "success" | "mismatch" | "error";
  sourceCount?: number; destCount?: number; progress?: number; message?: string;
};

const CHUNK = 1000;
const toTable = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1").toLowerCase();

async function parseFile(file: File): Promise<{ columns: string[]; rows: unknown[][] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  let wb: XLSX.WorkBook;
  if (ext === "json") {
    const data = JSON.parse(await file.text());
    const arr = Array.isArray(data) ? data : [data];
    wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(arr), "data");
  } else if (ext === "tsv" || ext === "txt") {
    wb = XLSX.read(await file.text(), { type: "string", FS: "\t" } as any);
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  const header = (aoa[0] ?? []).map((h, i) => String(h ?? `column_${i + 1}`));
  const rows = aoa.slice(1).filter((r) => r.some((v) => v !== null && v !== ""));
  return { columns: header, rows };
}

export default function Ingestion() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = () =>
    supabase.from("etl_jobs").select("*").eq("job_type", "ingestion").order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setHistory(data ?? []));
  useEffect(() => { loadHistory(); }, []);

  const update = (id: string, patch: Partial<Job>) => setJobs((p) => p.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv,.json,.tsv,.txt";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      setJobs((prev) => [...prev, ...Array.from(files).map((f) => ({
        id: crypto.randomUUID(), file: f, fileName: f.name, table: toTable(f.name), status: "queued" as const,
      }))]);
    };
    input.click();
  };

  const runJob = async (job: Job) => {
    update(job.id, { status: "running", progress: 0, message: undefined });
    try {
      const { columns, rows } = await parseFile(job.file);
      if (!columns.length) throw new Error("File has no header row");
      update(job.id, { sourceCount: rows.length });
      let pre = 0;
      if (mode === "append") pre = (await dbHub("count", { connection_id: connectionId, table: job.table })).count;
      if (rows.length === 0) {
        await dbHub("ingest_chunk", { connection_id: connectionId, table: job.table, columns, rows: [], first: true, mode });
      }
      for (let i = 0; i < rows.length; i += CHUNK) {
        await dbHub("ingest_chunk", {
          connection_id: connectionId, table: job.table, columns, rows: rows.slice(i, i + CHUNK), first: i === 0, mode,
        });
        update(job.id, { progress: Math.round(((i + CHUNK) / rows.length) * 100) });
      }
      const r = await dbHub("ingest_finalize", {
        connection_id: connectionId, table: job.table, source_count: rows.length, pre_count: pre, file_name: job.fileName,
      });
      update(job.id, {
        status: r.ok ? "success" : "mismatch", destCount: r.dest_count - pre,
        message: r.ok ? "Row counts match" : "Row counts do not match",
      });
    } catch (e: any) {
      update(job.id, { status: "error", message: e.message });
    }
  };

  const handleRunAll = async () => {
    if (!connectionId) return toast.error("Choose a target connection");
    for (const j of jobs.filter((j) => j.status === "queued" || j.status === "error")) await runJob(j);
    loadHistory();
  };

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "error").length;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">Data Ingestion</h1>
          <p className="text-muted-foreground text-sm mt-1">Load files into database tables. Row counts are checked automatically.</p>
        </motion.div>

        <div className="glass-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Connection</Label>
              <ConnectionSelect value={connectionId} onChange={setConnectionId} />
            </div>
            <div className="space-y-2">
              <Label>If the table exists</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace it</SelectItem>
                  <SelectItem value="append">Add rows to it</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleFileUpload} variant="outline" className="gap-2"><FileUp className="h-4 w-4" /> Select Files</Button>
            {pending > 0 && <Button onClick={handleRunAll} className="gap-2"><Play className="h-4 w-4" /> Ingest {pending} File(s)</Button>}
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-sm">Ingestion Queue</h2>
            {jobs.map((job) => (
              <div key={job.id} className="glass-card p-4 flex flex-wrap items-center gap-3">
                <FolderOutput className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-[180px] space-y-1">
                  <p className="text-sm font-medium truncate">{job.fileName}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    →
                    <Input value={job.table} disabled={job.status === "running"} onChange={(e) => update(job.id, { table: e.target.value })}
                      className="h-7 text-xs max-w-[220px]" />
                  </div>
                  {job.message && <p className={`text-xs ${job.status === "success" ? "text-primary" : "text-destructive"}`}>{job.message}</p>}
                </div>
                {job.sourceCount !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    File: {job.sourceCount.toLocaleString()}{job.destCount !== undefined && ` · Table: ${job.destCount.toLocaleString()}`}
                  </span>
                )}
                <Badge variant={job.status === "success" ? "default" : job.status === "error" || job.status === "mismatch" ? "destructive" : "secondary"} className="text-xs capitalize">
                  {job.status === "running" && <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{Math.min(job.progress ?? 0, 100)}%</>}
                  {job.status === "success" && <><CheckCircle2 className="h-3 w-3 mr-1" />validated</>}
                  {job.status === "mismatch" && <><AlertTriangle className="h-3 w-3 mr-1" />mismatch</>}
                  {job.status === "error" && <><XCircle className="h-3 w-3 mr-1" />failed</>}
                  {job.status === "queued" && "queued"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-12 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading font-semibold">No Files Queued</h3>
            <p className="text-sm text-muted-foreground mt-1">Select Excel, CSV, JSON or TSV files to load</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="glass-card p-4">
            <h2 className="font-heading font-semibold text-sm mb-3">Recent ingestions (team)</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap justify-between gap-2 text-xs border-b border-border/50 pb-2">
                  <span className="font-medium">{h.title} → {h.target}</span>
                  <span className="text-muted-foreground">{h.source_count} / {h.dest_count} rows · {new Date(h.created_at).toLocaleString()}</span>
                  <Badge variant={h.status === "success" ? "default" : "destructive"} className="text-[10px]">{h.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
