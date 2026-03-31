import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, FolderOutput, Play, CheckCircle2, Loader2, FileUp } from "lucide-react";
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

type IngestionJob = {
  id: string;
  fileName: string;
  targetDb: string;
  targetTable: string;
  format: string;
  status: "queued" | "running" | "done" | "error";
  rowCount?: number;
};

export default function Ingestion() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [targetDb, setTargetDb] = useState("");
  const [targetTable, setTargetTable] = useState("");

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv,.json,.tsv,.txt,.parquet";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      const newJobs: IngestionJob[] = Array.from(files).map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        targetDb: targetDb || "default",
        targetTable: targetTable || f.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_"),
        format: f.name.split(".").pop()?.toUpperCase() || "UNKNOWN",
        status: "queued",
      }));
      setJobs((prev) => [...prev, ...newJobs]);
    };
    input.click();
  };

  const handleRunAll = () => {
    setJobs((prev) => prev.map((j) => (j.status === "queued" ? { ...j, status: "running" as const } : j)));
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.status === "running"
            ? { ...j, status: "done" as const, rowCount: Math.floor(Math.random() * 10000) + 100 }
            : j
        )
      );
    }, 2500);
  };

  const queuedCount = jobs.filter((j) => j.status === "queued").length;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">Data Ingestion</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ingest files into database tables for staging and analysis
          </p>
        </motion.div>

        {/* Config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Database</Label>
              <Input placeholder="e.g. staging_db" value={targetDb} onChange={(e) => setTargetDb(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Table (optional)</Label>
              <Input placeholder="Auto-generated from filename" value={targetTable} onChange={(e) => setTargetTable(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleFileUpload} variant="outline" className="gap-2">
              <FileUp className="h-4 w-4" /> Select Files
            </Button>
            {queuedCount > 0 && (
              <Button onClick={handleRunAll} className="gap-2">
                <Play className="h-4 w-4" /> Ingest {queuedCount} File(s)
              </Button>
            )}
          </div>
        </motion.div>

        {/* Jobs */}
        {jobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-sm">Ingestion Queue</h2>
            {jobs.map((job) => (
              <div key={job.id} className="glass-card p-4 flex items-center gap-4">
                <FolderOutput className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{job.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    → {job.targetDb}.{job.targetTable}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">{job.format}</Badge>
                <Badge
                  variant={
                    job.status === "done" ? "default" :
                    job.status === "error" ? "destructive" : "secondary"
                  }
                  className="text-xs capitalize"
                >
                  {job.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {job.status === "done" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {job.status} {job.rowCount ? `(${job.rowCount.toLocaleString()} rows)` : ""}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {jobs.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading font-semibold">No Files Queued</h3>
            <p className="text-sm text-muted-foreground mt-1">Select files to start the ingestion pipeline</p>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
