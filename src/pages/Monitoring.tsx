import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Download, RefreshCw, Loader2 } from "lucide-react";
import { saveAs } from "file-saver";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Job = {
  id: string; job_type: string; title: string; status: string; source_count: number | null; dest_count: number | null;
  message: string | null; created_at: string; duration_ms: number | null; details: unknown; target: string | null; schedule_id: string | null;
};

const statusVariant = (s: string) => (s === "success" ? "default" : s === "running" ? "secondary" : "destructive") as any;
const dur = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export default function Monitoring() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [days, setDays] = useState("7");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let qb = supabase.from("etl_jobs").select("*").order("created_at", { ascending: false }).limit(500);
    if (days !== "all") qb = qb.gte("created_at", new Date(Date.now() - Number(days) * 864e5).toISOString());
    if (type !== "all") qb = qb.eq("job_type", type);
    if (status !== "all") qb = qb.eq("status", status);
    const { data } = await qb;
    setJobs((data ?? []) as Job[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [type, status, days]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? jobs.filter((j) => `${j.title} ${j.message ?? ""} ${j.target ?? ""}`.toLowerCase().includes(s)) : jobs;
  }, [jobs, q]);

  const stats = useMemo(() => ({
    total: shown.length,
    ok: shown.filter((j) => j.status === "success").length,
    failed: shown.filter((j) => j.status !== "success" && j.status !== "running").length,
    rows: shown.reduce((a, j) => a + (j.dest_count ?? 0), 0),
  }), [shown]);

  const download = (j: Job) => saveAs(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }), `run_${j.job_type}_${j.created_at.slice(0, 19).replace(/[:T]/g, "-")}.json`);
  const downloadAll = () => saveAs(new Blob([JSON.stringify(shown, null, 2)], { type: "application/json" }), `runs_${new Date().toISOString().slice(0, 10)}.json`);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Monitoring</h1>
            <p className="text-muted-foreground text-sm mt-1">Every file load, query, table mapping and scheduled run, with counts, timings and errors.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" /> Refresh</Button>
            <Button variant="outline" size="sm" onClick={downloadAll} disabled={!shown.length}><Download className="h-3 w-3 mr-1" /> Download all</Button>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["Runs", stats.total], ["Succeeded", stats.ok], ["Failed", stats.failed], ["Rows written", stats.rows.toLocaleString()]].map(([l, v]) => (
            <div key={l as string} className="glass-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-heading font-bold">{v}</p></div>
          ))}
        </div>

        <div className="glass-card p-4 grid sm:grid-cols-4 gap-3">
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All run types</SelectItem><SelectItem value="ingestion">File loads</SelectItem><SelectItem value="query">Queries</SelectItem><SelectItem value="mapping">Table mappings</SelectItem><SelectItem value="conversion">Conversions</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="success">Succeeded</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="mismatch">Count mismatch</SelectItem><SelectItem value="blocked">Blocked by checks</SelectItem><SelectItem value="running">Running</SelectItem></SelectContent></Select>
          <Select value={days} onValueChange={setDays}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="1">Last 24 hours</SelectItem><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="all">All time</SelectItem></SelectContent></Select>
          <Input placeholder="Search title, table or error…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="glass-card p-2 overflow-x-auto">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary m-6" /> : shown.length === 0 ? <p className="text-sm text-muted-foreground p-6">No runs match these filters.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-muted-foreground">{["When", "Type", "Run", "Status", "Source", "Dest", "Time", ""].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{shown.map((j) => (<>
                <tr key={j.id} className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer" onClick={() => setOpen(open === j.id ? null : j.id)}>
                  <td className="p-2 whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="p-2 capitalize">{j.job_type}{j.schedule_id && <Badge variant="outline" className="ml-1 text-[10px]">scheduled</Badge>}</td>
                  <td className="p-2 max-w-[280px] truncate">{j.title}</td>
                  <td className="p-2"><Badge variant={statusVariant(j.status)}>{j.status}</Badge></td>
                  <td className="p-2">{j.source_count?.toLocaleString() ?? "—"}</td>
                  <td className="p-2">{j.dest_count?.toLocaleString() ?? "—"}</td>
                  <td className="p-2">{dur(j.duration_ms)}</td>
                  <td className="p-2"><Button variant="ghost" size="sm" className="h-7" aria-label="Download run details" onClick={(e) => { e.stopPropagation(); download(j); }}><Download className="h-3 w-3" /></Button></td>
                </tr>
                {open === j.id && <tr key={j.id + "d"}><td colSpan={8} className="p-3 bg-secondary/20">
                  {j.message && <p className={`text-sm mb-2 ${j.status === "success" ? "" : "text-destructive"}`}>{j.message}</p>}
                  <pre className="text-[11px] whitespace-pre-wrap max-h-64 overflow-auto font-mono text-muted-foreground">{JSON.stringify(j.details ?? {}, null, 2)}</pre>
                </td></tr>}
              </>))}</tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
