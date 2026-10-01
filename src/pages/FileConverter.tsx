import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, Download, X, Loader2, FolderUp, Filter } from "lucide-react";
import { saveAs } from "file-saver";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { FORMAT_LABEL, OUTPUT_FORMATS, OutputFormat, Parsed, parseFile, writeFile } from "@/lib/fileIO";
import { toast } from "sonner";

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const cleanFolder = (s: string) => s.trim().replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_\-/ ]/g, "_");

export default function FileConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Parsed | null>(null);
  const [sheet, setSheet] = useState("");
  const [cols, setCols] = useState<string[]>([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const [filterCol, setFilterCol] = useState("");
  const [filterText, setFilterText] = useState("");
  const [format, setFormat] = useState<OutputFormat>("csv");
  const [dest, setDest] = useState<"download" | "shared">("download");
  const [folder, setFolder] = useState("converted");
  const [outName, setOutName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const pickSheet = (p: Parsed, s: string) => {
    setSheet(s); setCols(p.columns[s] ?? []); setFrom(1); setTo(p.data[s]?.length ?? 0); setFilterCol(""); setFilterText("");
  };

  const load = useCallback(async (f: File) => {
    setLoading(true);
    try {
      const p = await parseFile(f);
      setFile(f); setInfo(p); pickSheet(p, p.sheets[0]); setOutName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) { toast.error(e.message || "Couldn't read this file."); }
    setLoading(false);
  }, []);

  const allCols = info?.columns[sheet] ?? [];
  const rows = useMemo(() => {
    const all = info?.data[sheet] ?? [];
    let r = all.slice(Math.max(0, from - 1), to > 0 ? to : undefined);
    if (filterCol && filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      r = r.filter((x) => String(x[filterCol] ?? "").toLowerCase().includes(q));
    }
    return r.map((x) => Object.fromEntries(cols.map((c) => [c, x[c] ?? null])));
  }, [info, sheet, from, to, filterCol, filterText, cols]);

  const convert = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const ordered = allCols.filter((c) => cols.includes(c));
      const blob = writeFile(format, ordered, rows, sheet);
      const name = `${(outName.trim() || "output").replace(/[^A-Za-z0-9_\- .]/g, "_")}.${format}`;
      if (dest === "download") { saveAs(blob, name); toast.success(`Downloaded ${name}`); }
      else {
        const path = `${cleanFolder(folder) || "converted"}/${name}`;
        const { error } = await supabase.storage.from("datahub-files").upload(path, blob, { upsert: true, contentType: blob.type });
        if (error) throw error;
        toast.success(`Saved to shared folder: ${path}`);
      }
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">File Converter</h1>
          <p className="text-muted-foreground text-sm mt-1">Load a file, pick the sheet, columns and rows you need, and save it in any format.</p>
        </motion.div>

        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
          onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".xlsx,.xls,.csv,.json,.tsv,.txt,.parquet,.xml"; i.onchange = () => i.files?.[0] && load(i.files[0]); i.click(); }}
          className={`glass-card border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
          {loading ? <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" /> : <>
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Drop a file here or <span className="text-primary font-medium">browse</span></p>
            <p className="text-xs text-muted-foreground mt-1">Excel, CSV, TSV, TXT, JSON, XML and Parquet. The real file type is detected automatically.</p>
          </>}
        </div>

        {info && file && (
          <div className="space-y-4">
            <div className="glass-card p-4 flex items-center gap-4">
              <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">Detected: {info.format.toUpperCase()}</Badge>
                  <Badge variant="outline" className="text-xs">{size(file.size)}</Badge>
                  <Badge variant="outline" className="text-xs">{info.sheets.length} sheet(s)</Badge>
                  <Badge variant="outline" className="text-xs">{(info.data[sheet]?.length ?? 0).toLocaleString()} rows</Badge>
                </div>
              </div>
              <button aria-label="Remove file" onClick={() => { setInfo(null); setFile(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-3">
                {info.sheets.length > 1 && (<div className="space-y-1"><Label className="text-xs">Sheet</Label>
                  <Select value={sheet} onValueChange={(v) => pickSheet(info, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{info.sheets.map((s) => <SelectItem key={s} value={s}>{s} ({info.data[s].length} rows)</SelectItem>)}</SelectContent>
                  </Select></div>)}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Columns ({cols.length}/{allCols.length})</Label>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setCols(cols.length === allCols.length ? [] : [...allCols])}>
                    {cols.length === allCols.length ? "Clear" : "Select all"}</Button>
                </div>
                <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto">
                  {allCols.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-secondary/50 cursor-pointer">
                      <Checkbox checked={cols.includes(c)} onCheckedChange={() => setCols((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} />
                      <span className="truncate">{c}</span>
                    </label>))}
                </div>
              </div>

              <div className="glass-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Filter className="h-3 w-3" /> Rows</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">From row</Label><Input type="number" min={1} value={from} onChange={(e) => setFrom(Math.max(1, Number(e.target.value)))} /></div>
                  <div className="space-y-1"><Label className="text-xs">To row</Label><Input type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={filterCol || "_none"} onValueChange={(v) => setFilterCol(v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Only rows where…" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">No filter</SelectItem>{allCols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="contains…" value={filterText} disabled={!filterCol} onChange={(e) => setFilterText(e.target.value)} />
                </div>
                <p className="text-xs text-primary">{rows.length.toLocaleString()} rows selected</p>
              </div>
            </div>

            <div className="glass-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</p>
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="space-y-1"><Label className="text-xs">Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OUTPUT_FORMATS.map((f) => <SelectItem key={f} value={f}>{FORMAT_LABEL[f]}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="space-y-1"><Label className="text-xs">File name</Label><Input value={outName} onChange={(e) => setOutName(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Save to</Label>
                  <Select value={dest} onValueChange={(v) => setDest(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="download">My computer</SelectItem><SelectItem value="shared">Shared folder</SelectItem></SelectContent>
                  </Select></div>
                {dest === "shared" && <div className="space-y-1"><Label className="text-xs">Folder</Label><Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. risk/daily" /></div>}
              </div>
              <Button onClick={convert} disabled={busy || cols.length === 0} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : dest === "download" ? <Download className="h-4 w-4" /> : <FolderUp className="h-4 w-4" />}
                {dest === "download" ? "Convert & download" : "Convert & save"}
              </Button>
            </div>

            {cols.length > 0 && (
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-medium">Preview (first {Math.min(10, rows.length)} of {rows.length.toLocaleString()} rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border">{allCols.filter((c) => cols.includes(c)).map((c) => <th key={c} className="text-left p-2 text-muted-foreground font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                    <tbody>{rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-b border-border/50">{allCols.filter((c) => cols.includes(c)).map((c) => <td key={c} className="p-2 truncate max-w-[200px]">{String(r[c] ?? "")}</td>)}</tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
