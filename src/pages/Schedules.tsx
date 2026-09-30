import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Plus, Play, Pause, Pencil, Trash2, Loader2, History } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ConnectionSelect from "@/components/ConnectionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { dbHub } from "@/lib/dbHub";
import { toast } from "sonner";

type Schedule = {
  id: string; name: string; job_type: string; cron: string; timezone: string; enabled: boolean; config: any; recurrence: any;
  notify_emails: string[]; last_run_at: string | null; last_status: string | null; last_message: string | null; next_run_at: string | null;
};
type Job = { id: string; status: string; title: string; message: string | null; source_count: number | null; dest_count: number | null; duration_ms: number | null; created_at: string };

const FREQ = { hourly: "Every hour", daily: "Every day", weekly: "Every week", monthly: "Every month", custom: "Custom pattern" } as const;
type Freq = keyof typeof FREQ;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPES: Record<string, string> = { ingestion: "File load", mapping: "Table mapping", conversion: "File conversion" };

const toCron = (r: any) => {
  const [h, m] = String(r.time || "06:00").split(":").map(Number);
  switch (r.freq as Freq) {
    case "hourly": return `${m || 0} * * * *`;
    case "daily": return `${m} ${h} * * *`;
    case "weekly": return `${m} ${h} * * ${r.day ?? 1}`;
    case "monthly": return `${m} ${h} ${r.dom ?? 1} * *`;
    default: return r.cron || "0 6 * * *";
  }
};
const describe = (s: Schedule) => {
  const r = s.recurrence ?? {};
  if (r.freq === "hourly") return "Every hour";
  if (r.freq === "daily") return `Daily at ${r.time}`;
  if (r.freq === "weekly") return `Every ${DAYS[r.day ?? 1]} at ${r.time}`;
  if (r.freq === "monthly") return `Monthly on day ${r.dom} at ${r.time}`;
  return `Pattern ${s.cron}`;
};

const blank = () => ({
  id: undefined as string | undefined, name: "", job_type: "ingestion", enabled: true, notify: "",
  recurrence: { freq: "daily", time: "06:00", day: 1, dom: 1, cron: "0 6 * * *" } as any,
  config: { source: "folder", folder: "incoming", match: "", url: "", connection_id: "", table: "", mode: "replace", mapping_id: "", format: "csv", output_folder: "converted", sheet: "", columns: "" } as any,
});

const statusVariant = (s: string | null) => (s === "success" ? "default" : s === "error" || s === "mismatch" || s === "blocked" ? "destructive" : "secondary");

export default function Schedules() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [mappings, setMappings] = useState<{ id: string; source_table: string; dest_table: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Schedule | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [preview, setPreview] = useState<string[]>([]);

  const load = async () => {
    const { data } = await supabase.from("schedules").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Schedule[]);
  };
  useEffect(() => {
    load();
    supabase.from("table_mappings").select("id,source_table,dest_table").then(({ data }) => setMappings(data ?? []));
  }, []);

  const cron = toCron(form.recurrence);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => dbHub("preview_cron", { cron, timezone: "Africa/Nairobi" }).then((r) => setPreview(r.next ?? [])).catch(() => setPreview([])), 300);
    return () => clearTimeout(t);
  }, [cron, open]);

  const setCfg = (k: string, v: unknown) => setForm((f) => ({ ...f, config: { ...f.config, [k]: v } }));
  const setRec = (k: string, v: unknown) => setForm((f) => ({ ...f, recurrence: { ...f.recurrence, [k]: v } }));

  const edit = (s: Schedule) => {
    const b = blank();
    setForm({
      id: s.id, name: s.name, job_type: s.job_type, enabled: s.enabled, notify: (s.notify_emails ?? []).join(", "),
      recurrence: { ...b.recurrence, ...(s.recurrence ?? {}), cron: s.cron, freq: s.recurrence?.freq ?? "custom" },
      config: { ...b.config, ...s.config, columns: Array.isArray(s.config?.columns) ? s.config.columns.join(", ") : "" },
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const c = form.config;
      const config: any = form.job_type === "mapping" ? { mapping_id: c.mapping_id }
        : { source: c.source, folder: c.folder, match: c.match, url: c.url, sheet: c.sheet,
            ...(form.job_type === "ingestion" ? { connection_id: c.connection_id, table: c.table, mode: c.mode }
              : { format: c.format, output_folder: c.output_folder, columns: String(c.columns).split(",").map((x: string) => x.trim()).filter(Boolean) }) };
      await dbHub("save_schedule", { schedule: {
        id: form.id, name: form.name, job_type: form.job_type, enabled: form.enabled, cron, timezone: "Africa/Nairobi",
        recurrence: form.recurrence, config, notify_emails: form.notify.split(",").map((x) => x.trim()).filter(Boolean),
      } });
      toast.success(form.id ? "Schedule updated" : "Schedule created");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const act = async (s: Schedule, action: "run" | "toggle" | "delete") => {
    if (action === "delete" && !confirm(`Delete schedule "${s.name}"? Run history is kept.`)) return;
    setBusy(s.id + action);
    try {
      if (action === "run") { const r = await dbHub("run_schedule", { schedule_id: s.id }); r.status === "success" ? toast.success(r.message) : toast.warning(r.message); }
      if (action === "toggle") { await dbHub("set_schedule_enabled", { schedule_id: s.id, enabled: !s.enabled }); toast.success(s.enabled ? "Paused" : "Resumed"); }
      if (action === "delete") { await dbHub("delete_schedule", { schedule_id: s.id }); toast.success("Deleted"); }
    } catch (e: any) { toast.error(e.message); }
    setBusy(null); load();
    if (historyFor?.id === s.id) openHistory(s);
  };

  const openHistory = async (s: Schedule) => {
    setHistoryFor(s);
    const { data } = await supabase.from("etl_jobs").select("id,status,title,message,source_count,dest_count,duration_ms,created_at").eq("schedule_id", s.id).order("created_at", { ascending: false }).limit(50);
    setJobs((data ?? []) as Job[]);
  };

  const c = form.config;
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold">Schedules</h1>
            <p className="text-muted-foreground text-sm mt-1">Repeat file loads, table mappings and file conversions automatically (Nairobi time).</p>
          </div>
          <Button className="gap-2" onClick={() => { setForm(blank()); setOpen(true); }}><Plus className="h-4 w-4" /> New schedule</Button>
        </motion.div>

        {items.length === 0 ? (
          <div className="glass-card p-10 text-center text-sm text-muted-foreground">No schedules yet. Create one to run a job automatically.</div>
        ) : (
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.id} className="glass-card p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <CalendarClock className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{TYPES[s.job_type]} · {describe(s)}
                      {s.enabled && s.next_run_at ? ` · next ${new Date(s.next_run_at).toLocaleString()}` : ""}</p>
                  </div>
                  {!s.enabled && <Badge variant="secondary">Paused</Badge>}
                  {s.last_status && <Badge variant={statusVariant(s.last_status)} className="capitalize">{s.last_status}</Badge>}
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => act(s, "run")} disabled={!!busy} title="Run now">
                      {busy === s.id + "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}</Button>
                    <Button size="sm" variant="outline" onClick={() => act(s, "toggle")} disabled={!!busy} title={s.enabled ? "Pause" : "Resume"}>
                      {s.enabled ? <Pause className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}</Button>
                    <Button size="sm" variant="outline" onClick={() => edit(s)} title="Edit"><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => openHistory(s)} title="Run history"><History className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => act(s, "delete")} disabled={!!busy} title="Delete" className="hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                {s.last_run_at && <p className={`text-xs ${s.last_status === "success" ? "text-primary" : "text-destructive"}`}>{s.last_message} · {new Date(s.last_run_at).toLocaleString()}</p>}
              </div>
            ))}
          </div>
        )}

        {historyFor && (
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Run history · {historyFor.name}</h2>
              <Button size="sm" variant="ghost" onClick={() => setHistoryFor(null)}>Close</Button>
            </div>
            {jobs.length === 0 ? <p className="text-xs text-muted-foreground">No runs yet.</p> : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground text-left">
                    <th className="p-2">When</th><th className="p-2">Status</th><th className="p-2">Rows in</th><th className="p-2">Rows out</th><th className="p-2">Duration</th><th className="p-2">Message</th>
                  </tr></thead>
                  <tbody>{jobs.map((j) => (
                    <tr key={j.id} className="border-b border-border/50">
                      <td className="p-2 whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</td>
                      <td className="p-2"><Badge variant={statusVariant(j.status)} className="capitalize">{j.status}</Badge></td>
                      <td className="p-2">{j.source_count ?? "—"}</td><td className="p-2">{j.dest_count ?? "—"}</td>
                      <td className="p-2">{j.duration_ms != null ? `${(j.duration_ms / 1000).toFixed(1)} s` : "—"}</td>
                      <td className="p-2">{j.message}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit schedule" : "New schedule"}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Daily loan book load" /></div>
              <div className="space-y-1"><Label className="text-xs">Job type</Label>
                <Select value={form.job_type} onValueChange={(v) => setForm({ ...form, job_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Repeat</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Select value={form.recurrence.freq} onValueChange={(v) => setRec("freq", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQ).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                {form.recurrence.freq === "weekly" && (
                  <Select value={String(form.recurrence.day)} onValueChange={(v) => setRec("day", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                  </Select>)}
                {form.recurrence.freq === "monthly" && <Input type="number" min={1} max={28} value={form.recurrence.dom} onChange={(e) => setRec("dom", Number(e.target.value))} aria-label="Day of month" />}
                {["daily", "weekly", "monthly"].includes(form.recurrence.freq) && <Input type="time" value={form.recurrence.time} onChange={(e) => setRec("time", e.target.value)} />}
                {form.recurrence.freq === "hourly" && <Input type="number" min={0} max={59} value={Number(String(form.recurrence.time).split(":")[1] ?? 0)} onChange={(e) => setRec("time", `00:${String(e.target.value).padStart(2, "0")}`)} aria-label="Minute past the hour" />}
                {form.recurrence.freq === "custom" && <Input className="font-mono sm:col-span-2" value={form.recurrence.cron} onChange={(e) => setRec("cron", e.target.value)} placeholder="min hour day month weekday" />}
              </div>
              <p className="text-xs text-muted-foreground">{preview.length ? `Next runs: ${preview.map((p) => new Date(p).toLocaleString()).join(" · ")}` : "Invalid pattern"}</p>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What to run</p>
              {form.job_type === "mapping" ? (
                <Select value={c.mapping_id} onValueChange={(v) => setCfg("mapping_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Choose a table mapping" /></SelectTrigger>
                  <SelectContent>{mappings.map((m) => <SelectItem key={m.id} value={m.id}>{m.source_table} → {m.dest_table}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Select value={c.source} onValueChange={(v) => setCfg("source", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="folder">Shared folder</SelectItem><SelectItem value="url">Web link</SelectItem></SelectContent>
                    </Select>
                    {c.source === "url" ? <Input className="sm:col-span-2" placeholder="https://…/report.csv" value={c.url} onChange={(e) => setCfg("url", e.target.value)} />
                      : <>
                        <Input placeholder="Folder, e.g. incoming" value={c.folder} onChange={(e) => setCfg("folder", e.target.value)} />
                        <Input placeholder="Name contains (optional)" value={c.match} onChange={(e) => setCfg("match", e.target.value)} />
                      </>}
                  </div>
                  <p className="text-xs text-muted-foreground">From a folder, the newest matching file is used each run.</p>
                  <Input placeholder="Excel sheet name (optional, first sheet by default)" value={c.sheet} onChange={(e) => setCfg("sheet", e.target.value)} />
                  {form.job_type === "ingestion" ? (
                    <div className="grid sm:grid-cols-3 gap-3">
                      <ConnectionSelect value={c.connection_id} onChange={(v) => setCfg("connection_id", v)} />
                      <Input placeholder="Target table" value={c.table} onChange={(e) => setCfg("table", e.target.value)} />
                      <Select value={c.mode} onValueChange={(v) => setCfg("mode", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="replace">Replace table</SelectItem><SelectItem value="append">Add to table</SelectItem></SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Select value={c.format} onValueChange={(v) => setCfg("format", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["csv", "xlsx", "json", "parquet", "tsv", "txt", "xml"].map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input placeholder="Output folder" value={c.output_folder} onChange={(e) => setCfg("output_folder", e.target.value)} />
                      <Input placeholder="Columns (blank = all)" value={c.columns} onChange={(e) => setCfg("columns", e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1"><Label className="text-xs">Alert emails on failure (comma-separated, optional)</Label>
              <Input value={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.value })} placeholder="risk-data@wekezabank.co.ke" />
              <p className="text-xs text-muted-foreground">Failures always appear as in-app alerts. Email delivery needs an email domain to be set up.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
