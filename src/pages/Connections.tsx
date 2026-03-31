import { useState } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DBConnection = {
  id: string;
  name: string;
  type: string;
  host: string;
  port: string;
  database: string;
  username: string;
  status: "connected" | "disconnected" | "error";
};

const DB_TYPES = ["PostgreSQL", "MySQL", "SQL Server", "Oracle", "SQLite", "MariaDB"];

export default function Connections() {
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "PostgreSQL", host: "", port: "5432", database: "", username: "", password: "",
  });

  const handleAdd = () => {
    const conn: DBConnection = {
      id: crypto.randomUUID(),
      name: form.name || `${form.type} - ${form.host}`,
      type: form.type,
      host: form.host,
      port: form.port,
      database: form.database,
      username: form.username,
      status: "disconnected",
    };
    setConnections((prev) => [...prev, conn]);
    setForm({ name: "", type: "PostgreSQL", host: "", port: "5432", database: "", username: "", password: "" });
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  const defaultPort: Record<string, string> = {
    PostgreSQL: "5432", MySQL: "3306", "SQL Server": "1433", Oracle: "1521", SQLite: "", MariaDB: "3306",
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Database Connections</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your data source and destination connections</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add Connection</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">New Database Connection</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input placeholder="e.g. Production DB" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Database Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, port: defaultPort[v] || "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DB_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label>Host</Label>
                    <Input placeholder="localhost" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Database Name</Label>
                  <Input placeholder="mydb" value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} />
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
                <Button onClick={handleAdd} className="w-full">Add Connection</Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {connections.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading font-semibold">No Connections Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Add a database connection to get started</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn, i) => (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-4 flex items-center gap-4"
              >
                <Database className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{conn.name}</p>
                  <p className="text-xs text-muted-foreground">{conn.host}:{conn.port} / {conn.database}</p>
                </div>
                <Badge variant="secondary" className="text-xs">{conn.type}</Badge>
                <Badge variant={conn.status === "connected" ? "default" : "outline"} className="text-xs capitalize">
                  {conn.status}
                </Badge>
                <button onClick={() => handleDelete(conn.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
