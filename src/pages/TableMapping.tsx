import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, Plus, Play, Loader2, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ConnectionSelect from "@/components/ConnectionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DbConnection, dbHub, fetchConnections } from "@/lib/dbHub";
import { toast } from "sonner";

type Mapping = {
  id: string; source_connection_id: string; source_table: string; source_columns: string; where_clause: string | null;
  dest_connection_id: string; dest_table: string; status: string; last_source_count: number | null;
  last_dest_count: number | null; last_message: string | null; last_run_at: string | null;
};

const empty = { sourceConn: "", sourceTable: "", sourceColumns: "*", where: "", destConn: "", destTable: "" };

export default function TableMapping() {
  const { user } = useAuth();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [conns, setConns] = useState<DbConnection[]>([]);
  const [form, setForm] = useState(empty);
  const [running, setRunning] = useState<string | null>(null);
  const [srcTables, setSrcTables] = useState<string[]>([]);

  const load = async () => {
    const { data } = await supabase.from("table_mappings").select("*").order("created_at", { ascending: false });
    setMappings((data ?? []) as Mapping[]);
  };
  useEffect(() => { load(); fetchConnections().then(setConns); }, []);
  useEffect(() => {
    if (!form.sourceConn) return;
    dbHub("list_tables", { connection_id: form.sourceConn }).then((r) => setSrcTables(r.tables)).catch(() => setSrcTables([]));
  }, [form.sourceConn]);

  const connName = (id: string) => conns.find((c) => c.id === id)?.name ?? "—";

  const handleAdd = async () => {
    const { error } = await supabase.from("table_mappings").insert({
      source_connection_id: form.sourceConn, source_table: form.sourceTable.trim(), source_columns: form.sourceColumns.trim() || "*",
      where_clause: form.where.trim() || null, dest_connection_id: form.destConn, dest_table: form.destTable.trim(), created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    setForm({ ...empty, sourceConn: form.sourceConn, destConn: form.destConn });
    load();
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      const r = await dbHub("run_mapping", { mapping_id: id });
      r.ok ? toast.success(r.message) : toast.warning(r.message);
    } catch (e: any) { toast.error(e.message); }
    setRunning(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("table_mappings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">Table Mapping</h1>
          <p className="text-muted-foreground text-sm mt-1">Copy data from a source table into a destination table and check the row counts tally.</p>
        </motion.div>

        <div className="glass-card p-5 space-y-4">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New Mapping</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</h3>
              <div className="space-y-2"><Label className="text-xs">Connection</Label>
                <ConnectionSelect value={form.sourceConn} onChange={(v) => setForm((f) => ({ ...f, sourceConn: v }))} /></div>
              <div className="space-y-2"><Label className="text-xs">Table</Label>
                <Input list="src-tables" placeholder="e.g. transactions" value={form.sourceTable} onChange={(e) => setForm({ ...form, sourceTable: e.target.value })} />
                <datalist id="src-tables">{srcTables.map((t) => <option key={t} value={t} />)}</datalist></div>
              <div className="space-y-2"><Label className="text-xs">Columns (comma-separated or *)</Label>
                <Input value={form.sourceColumns} onChange={(e) => setForm({ ...form, sourceColumns: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Filter (optional)</Label>
                <Input placeholder="e.g. created_at >= '2026-01-01'" value={form.where} onChange={(e) => setForm({ ...form, where: e.target.value })} /></div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destination</h3>
              <div className="space-y-2"><Label className="text-xs">Connection</Label>
                <ConnectionSelect value={form.destConn} onChange={(v) => setForm((f) => ({ ...f, destConn: v }))} /></div>
              <div className="space-y-2"><Label className="text-xs">Table (created if missing)</Label>
                <Input placeholder="e.g. stg_transactions" value={form.destTable} onChange={(e) => setForm({ ...form, destTable: e.target.value })} /></div>
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!form.sourceTable || !form.destTable || !form.sourceConn || !form.destConn} className="gap-2">
            <Plus className="h-4 w-4" /> Add Mapping
          </Button>
        </div>

        {mappings.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-sm">Configured Mappings (team)</h2>
            {mappings.map((m) => (
              <div key={m.id} className="glass-card p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0 text-sm">
                    <span><span className="text-muted-foreground">{connName(m.source_connection_id)}.</span><span className="font-medium">{m.source_table}</span>
                      <span className="text-xs text-muted-foreground ml-1">({m.source_columns})</span></span>
                    <ArrowRightLeft className="h-4 w-4 text-primary shrink-0" />
                    <span><span className="text-muted-foreground">{connName(m.dest_connection_id)}.</span><span className="font-medium">{m.dest_table}</span></span>
                  </div>
                  <Badge variant={m.status === "success" ? "default" : m.status === "error" || m.status === "mismatch" ? "destructive" : "secondary"} className="text-xs capitalize">{m.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => handleRun(m.id)} disabled={running === m.id}>
                    {running === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3 mr-1" /> Run</>}
                  </Button>
                  <button onClick={() => handleDelete(m.id)} aria-label="Delete mapping" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                {m.where_clause && <p className="text-xs text-muted-foreground">Filter: {m.where_clause}</p>}
                {m.last_run_at && (
                  <p className={`text-xs ${m.status === "success" ? "text-primary" : "text-destructive"}`}>
                    {m.last_message} · {new Date(m.last_run_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
