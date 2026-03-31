import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  FileJson,
  File,
  Download,
  Check,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { saveAs } from "file-saver";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FileInfo = {
  name: string;
  type: string;
  size: number;
  sheets: string[];
  columns: Record<string, string[]>;
  data: Record<string, Record<string, unknown>[]>;
  rawFile: File;
};

const OUTPUT_FORMATS = ["xlsx", "csv", "json", "tsv", "txt"] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const fileTypeIcon: Record<string, typeof FileSpreadsheet> = {
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileText,
  json: FileJson,
  tsv: FileText,
  txt: FileText,
  parquet: File,
};

function detectFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function FileConverter() {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("csv");
  const [loading, setLoading] = useState(false);
  const [converted, setConverted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setConverted(false);
    const ext = detectFileType(file.name);

    try {
      if (["xlsx", "xls"].includes(ext)) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheets = wb.SheetNames;
        const columns: Record<string, string[]> = {};
        const data: Record<string, Record<string, unknown>[]> = {};
        sheets.forEach((s) => {
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[s]);
          data[s] = json;
          columns[s] = json.length > 0 ? Object.keys(json[0]) : [];
        });
        setFileInfo({ name: file.name, type: ext, size: file.size, sheets, columns, data, rawFile: file });
        setSelectedSheet(sheets[0]);
        setSelectedColumns(columns[sheets[0]] || []);
      } else if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const delimiter = ext === "tsv" ? "\t" : undefined;
        const result = Papa.parse<Record<string, unknown>>(text, { header: true, delimiter, skipEmptyLines: true });
        const cols = result.meta.fields || [];
        const sheetName = "Sheet1";
        setFileInfo({
          name: file.name, type: ext, size: file.size,
          sheets: [sheetName],
          columns: { [sheetName]: cols },
          data: { [sheetName]: result.data },
          rawFile: file,
        });
        setSelectedSheet(sheetName);
        setSelectedColumns(cols);
      } else if (ext === "json") {
        const text = await file.text();
        let parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) parsed = [parsed];
        const cols = parsed.length > 0 ? Object.keys(parsed[0]) : [];
        const sheetName = "Sheet1";
        setFileInfo({
          name: file.name, type: ext, size: file.size,
          sheets: [sheetName],
          columns: { [sheetName]: cols },
          data: { [sheetName]: parsed },
          rawFile: file,
        });
        setSelectedSheet(sheetName);
        setSelectedColumns(cols);
      } else {
        alert("Unsupported file format: " + ext);
      }
    } catch (e) {
      console.error(e);
      alert("Error reading file. Please check the format.");
    }
    setLoading(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
    },
    [processFile]
  );

  const handleConvert = () => {
    if (!fileInfo || !selectedSheet) return;

    const sheetData = fileInfo.data[selectedSheet];
    const filtered = sheetData.map((row) => {
      const newRow: Record<string, unknown> = {};
      selectedColumns.forEach((col) => {
        newRow[col] = row[col];
      });
      return newRow;
    });

    const baseName = fileInfo.name.replace(/\.[^.]+$/, "");

    if (outputFormat === "csv" || outputFormat === "tsv") {
      const delimiter = outputFormat === "tsv" ? "\t" : ",";
      const csv = Papa.unparse(filtered, { delimiter });
      const blob = new Blob([csv], { type: "text/plain;charset=utf-8" });
      saveAs(blob, `${baseName}.${outputFormat}`);
    } else if (outputFormat === "json") {
      const json = JSON.stringify(filtered, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      saveAs(blob, `${baseName}.json`);
    } else if (outputFormat === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(filtered);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, selectedSheet);
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else if (outputFormat === "txt") {
      const csv = Papa.unparse(filtered, { delimiter: "|" });
      const blob = new Blob([csv], { type: "text/plain;charset=utf-8" });
      saveAs(blob, `${baseName}.txt`);
    }

    setConverted(true);
    setTimeout(() => setConverted(false), 3000);
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const allColumns = fileInfo ? fileInfo.columns[selectedSheet] || [] : [];
  const allSelected = selectedColumns.length === allColumns.length;

  const Icon = fileInfo ? fileTypeIcon[fileInfo.type] || File : File;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">File Converter</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload a file, select sheets & columns, and convert to your desired format
          </p>
        </motion.div>

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`glass-card border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".xlsx,.xls,.csv,.json,.tsv,.txt,.parquet";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) processFile(f);
            };
            input.click();
          }}
        >
          {loading ? (
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Drop a file here or <span className="text-primary font-medium">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports Excel, CSV, JSON, TSV, TXT
              </p>
            </>
          )}
        </motion.div>

        {/* File Info & Config */}
        <AnimatePresence>
          {fileInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {/* Detected file */}
              <div className="glass-card p-4 flex items-center gap-4">
                <Icon className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{fileInfo.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{fileInfo.type.toUpperCase()}</Badge>
                    <Badge variant="outline" className="text-xs">{formatSize(fileInfo.size)}</Badge>
                    <Badge variant="outline" className="text-xs">{fileInfo.sheets.length} sheet(s)</Badge>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFileInfo(null);
                    setSelectedColumns([]);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Sheet selector */}
              {fileInfo.sheets.length > 1 && (
                <div className="glass-card p-4 space-y-2">
                  <label className="text-sm font-medium">Select Sheet</label>
                  <Select
                    value={selectedSheet}
                    onValueChange={(v) => {
                      setSelectedSheet(v);
                      setSelectedColumns(fileInfo.columns[v] || []);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fileInfo.sheets.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Column selector */}
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Select Columns ({selectedColumns.length}/{allColumns.length})
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedColumns(allSelected ? [] : [...allColumns])
                    }
                    className="text-xs"
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {allColumns.map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-secondary/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedColumns.includes(col)}
                        onCheckedChange={() => toggleColumn(col)}
                      />
                      <span className="truncate">{col}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Output format & convert */}
              <div className="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-end gap-4">
                <div className="space-y-2 flex-1">
                  <label className="text-sm font-medium">Output Format</label>
                  <Select
                    value={outputFormat}
                    onValueChange={(v) => setOutputFormat(v as OutputFormat)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTPUT_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleConvert}
                  disabled={selectedColumns.length === 0}
                  className="gap-2"
                >
                  {converted ? (
                    <>
                      <Check className="h-4 w-4" /> Downloaded!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> Convert & Download
                    </>
                  )}
                </Button>
              </div>

              {/* Preview */}
              {selectedColumns.length > 0 && (
                <div className="glass-card p-4 space-y-3">
                  <h3 className="text-sm font-medium">
                    Preview ({Math.min(5, fileInfo.data[selectedSheet]?.length || 0)} rows)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {selectedColumns.map((col) => (
                            <th key={col} className="text-left p-2 text-muted-foreground font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fileInfo.data[selectedSheet]?.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {selectedColumns.map((col) => (
                              <td key={col} className="p-2 truncate max-w-[200px]">
                                {String(row[col] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
