import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, Plus, Trash2, Loader2, Server, PlugZap, ShieldCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DbConnection, dbHub, fetchConnections } from "@/lib/dbHub";

const DB_TYPES = ["PostgreSQL", "MySQL", "MariaDB", "SQL Server", "Oracle"];
const defaultPort: Record<string, string> = { PostgreSQL: "5432", MySQL: "3306", MariaDB: "3306", "SQL Server": "1433", Oracle: "1521" };
const emptyForm = { name: "", db_type: "PostgreSQL", host: "", port: "5432", database_name: "", username: "", password: "", use_ssl: true };

export default function Connections() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try { setConnections(await fetchConnections()); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const { connection } = await dbHub("save_connection", form);
      toast.success("Connection saved — testing…");
      setForm(emptyForm);
      setDialogOpen(false);
      await load();
      handleTest(connection.id);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await dbHub("test", { connection_id: id });
      r.status === "connected" ? toast.success("Connected successfully") : toast.error(r.message);
    } catch (e: any) { toast.error(e.message); }
    setTesting(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("db_connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Connection removed");
    load();
  };

  const isInternalNet = form.db_type === "SQL Server" || form.db_type === "Oracle";

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Database Connections</h1>
            <p className="text-muted-foreground text-sm mt-1">Shared with the whole team. Passwords are stored securely and never shown again.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add Connection</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle className="font-heading">New Database Connection</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input placeholder="e.g. Risk Warehouse" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Database Type</Label>
                  <Select value={form.db_type} onValueChange={(v) => setForm({ ...form, db_type: v, port: defaultPort[v] || "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {isInternalNet && (
                    <p className="text-xs text-warning">Servers inside the bank network need a secure gateway (VPN/tunnel) before they can be reached. You can save it now; tests will fail until then.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label>Host</Label>
                    <Input placeholder="db.example.com" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Database Name</Label>
                  <Input value={form.database_name} onChange={(e) => setForm({ ...form, database_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Use SSL</Label>
                  <Switch checked={form.use_ssl} onCheckedChange={(v) => setForm({ ...form, use_ssl: v })} />
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Test"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : connections.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading font-semibold">No Connections Yet</h3>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn, i) => (
              <motion.div key={conn.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="glass-card p-4 flex flex-wrap items-center gap-3">
                {conn.is_internal ? <ShieldCheck className="h-8 w-8 text-primary shrink-0" /> : <Database className="h-8 w-8 text-primary shrink-0" />}
                <div className="flex-1 min-w-[160px]">
                  <p className="font-medium text-sm">{conn.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {conn.is_internal ? "Built-in staging area for uploaded files and results" : `${conn.host}:${conn.port ?? ""} / ${conn.database_name}`}
                  </p>
                  {conn.status === "error" && conn.status_message && (
                    <p className="text-xs text-destructive mt-1 line-clamp-2">{conn.status_message}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">{conn.is_internal ? "Built-in" : conn.db_type}</Badge>
                <Badge variant={conn.status === "connected" ? "default" : conn.status === "error" ? "destructive" : "outline"} className="text-xs capitalize">
                  {conn.status}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => handleTest(conn.id)} disabled={testing === conn.id}>
                  {testing === conn.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><PlugZap className="h-3 w-3 mr-1" /> Test</>}
                </Button>
                {!conn.is_internal && (
                  <button onClick={() => handleDelete(conn.id)} aria-label="Delete connection" className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
