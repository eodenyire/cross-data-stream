import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Download, Copy, Loader2, Terminal } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SQLWorkspace() {
  const [query, setQuery] = useState("SELECT * FROM your_table LIMIT 100;");
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [running, setRunning] = useState(false);
  const [outputFormat, setOutputFormat] = useState("table");
  const [error, setError] = useState("");

  const handleRun = () => {
    setRunning(true);
    setError("");
    setResults(null);
    // Simulated — will be real once Cloud is connected
    setTimeout(() => {
      setRunning(false);
      setError("No database connection configured. Add a connection first, then come back to run queries.");
    }, 1500);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">SQL Workspace</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Write and execute queries, export results in any format
          </p>
        </motion.div>

        {/* Query Editor */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-heading font-semibold flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" /> Query Editor
            </h2>
            <div className="flex items-center gap-2">
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table View</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV Export</SelectItem>
                  <SelectItem value="xlsx">Excel Export</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="font-mono text-sm min-h-[150px] bg-secondary/50 border-border/50"
            placeholder="Write your SQL query here..."
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleRun} disabled={running || !query.trim()} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running..." : "Execute Query"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(query)}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
        </motion.div>

        {/* Results / Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-4 border-warning/30">
            <p className="text-sm text-warning">{error}</p>
          </motion.div>
        )}

        {results && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="secondary">{results.length} rows</Badge>
              <Button variant="outline" size="sm" className="gap-1">
                <Download className="h-3 w-3" /> Export
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {Object.keys(results[0] || {}).map((key) => (
                      <th key={key} className="text-left p-2 text-muted-foreground font-medium">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="p-2">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
