import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, Plus, Play, CheckCircle2, AlertCircle } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mapping = {
  id: string;
  sourceDb: string;
  sourceTable: string;
  sourceColumns: string;
  destDb: string;
  destTable: string;
  status: "pending" | "running" | "success" | "error";
};

export default function TableMapping() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [form, setForm] = useState({
    sourceDb: "", sourceTable: "", sourceColumns: "*",
    destDb: "", destTable: "",
  });

  const handleAdd = () => {
    setMappings((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...form, status: "pending" },
    ]);
    setForm({ sourceDb: "", sourceTable: "", sourceColumns: "*", destDb: "", destTable: "" });
  };

  const handleRun = (id: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "running" as const } : m))
    );
    setTimeout(() => {
      setMappings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "success" as const } : m))
      );
    }, 2000);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">Table Mapping</h1>
          <p className="text-muted-foreground text-sm mt-1">Map source tables to destination tables across databases</p>
        </motion.div>

        {/* Add Mapping Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 space-y-4">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> New Mapping
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source */}
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</h3>
              <div className="space-y-2">
                <Label className="text-xs">Database / Connection</Label>
                <Input placeholder="e.g. Production DB" value={form.sourceDb} onChange={(e) => setForm({ ...form, sourceDb: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Table Name</Label>
                <Input placeholder="e.g. transactions" value={form.sourceTable} onChange={(e) => setForm({ ...form, sourceTable: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Columns (comma-separated or *)</Label>
                <Input placeholder="* or col1, col2" value={form.sourceColumns} onChange={(e) => setForm({ ...form, sourceColumns: e.target.value })} />
              </div>
            </div>
            {/* Destination */}
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destination</h3>
              <div className="space-y-2">
                <Label className="text-xs">Database / Connection</Label>
                <Input placeholder="e.g. Staging DB" value={form.destDb} onChange={(e) => setForm({ ...form, destDb: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Table Name</Label>
                <Input placeholder="e.g. stg_transactions" value={form.destTable} onChange={(e) => setForm({ ...form, destTable: e.target.value })} />
              </div>
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!form.sourceTable || !form.destTable} className="gap-2">
            <Plus className="h-4 w-4" /> Add Mapping
          </Button>
        </motion.div>

        {/* Mappings List */}
        {mappings.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-sm">Configured Mappings</h2>
            {mappings.map((m) => (
              <div key={m.id} className="glass-card p-4 flex items-center gap-4">
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{m.sourceDb || "default"}</span>
                    <span className="font-medium">.{m.sourceTable}</span>
                    <span className="text-xs text-muted-foreground ml-1">({m.sourceColumns})</span>
                  </div>
                  <ArrowRightLeft className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">{m.destDb || "default"}</span>
                    <span className="font-medium">.{m.destTable}</span>
                  </div>
                </div>
                <Badge
                  variant={m.status === "success" ? "default" : m.status === "error" ? "destructive" : "secondary"}
                  className="text-xs capitalize"
                >
                  {m.status}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => handleRun(m.id)} disabled={m.status === "running"}>
                  <Play className="h-3 w-3 mr-1" /> Run
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
