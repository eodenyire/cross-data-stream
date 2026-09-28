// Server-side file reading/writing for scheduled ingestion and conversion jobs.
import * as XLSX from "npm:xlsx@0.18.5";
import { parquetReadObjects } from "npm:hyparquet@1.31.2";
import { parquetWriteBuffer } from "npm:hyparquet-writer@0.16.10";

export type Table = { columns: string[]; rows: unknown[][] };
export const OUTPUT_FORMATS = ["csv", "xlsx", "json", "parquet", "tsv", "txt", "xml"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export function detectFormat(name: string, bytes: Uint8Array): string {
  const b = bytes;
  if (b[0] === 0x50 && b[1] === 0x41 && b[2] === 0x52 && b[3] === 0x31) return "parquet";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b[0] === 0x50 && b[1] === 0x4b) return "xlsx";
  if (b[0] === 0xd0 && b[1] === 0xcf) return "xls";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "tsv", "txt", "json"].includes(ext)) return ext;
  const head = new TextDecoder().decode(b.slice(0, 200)).trimStart();
  if (head.startsWith("[") || head.startsWith("{")) return "json";
  return "csv";
}

const cell = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "bigint" ? v.toString() : v !== null && typeof v === "object" ? JSON.stringify(v) : v);

function fromObjects(objs: Record<string, unknown>[]): Table {
  const columns: string[] = [];
  for (const o of objs.slice(0, 200)) for (const k of Object.keys(o)) if (!columns.includes(k)) columns.push(k);
  return { columns, rows: objs.map((o) => columns.map((c) => cell(o[c]) ?? null)) };
}

export async function parseFile(name: string, bytes: Uint8Array, sheet?: string | null): Promise<Table & { format: string; sheets: string[] }> {
  const format = detectFormat(name, bytes);
  if (format === "pdf") throw new Error("PDF files can't be read by scheduled jobs. Convert them to Excel or CSV first.");
  if (format === "parquet") {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const objs = (await parquetReadObjects({ file: buf })) as Record<string, unknown>[];
    return { ...fromObjects(objs), format, sheets: ["data"] };
  }
  if (format === "json") {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [data];
    return { ...fromObjects(arr), format, sheets: ["data"] };
  }
  const wb = format === "tsv"
    ? XLSX.read(new TextDecoder().decode(bytes), { type: "string", FS: "\t" } as never)
    : XLSX.read(bytes, { type: "array", cellDates: true });
  const sheets = wb.SheetNames;
  const pick = sheet && sheets.includes(sheet) ? sheet : sheets[0];
  if (sheet && !sheets.includes(sheet)) throw new Error(`Sheet "${sheet}" not found. Sheets in file: ${sheets.join(", ")}`);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[pick], { header: 1, defval: null, raw: false });
  const columns = (aoa[0] ?? []).map((h, i) => String(h ?? `column_${i + 1}`));
  const rows = aoa.slice(1).filter((r) => r.some((v) => v !== null && v !== ""));
  return { columns, rows, format, sheets };
}

export function selectColumns(t: Table, wanted?: string[] | null): Table {
  if (!wanted?.length) return t;
  const norm = (s: string) => s.trim().toLowerCase();
  const idx = wanted.map((w) => {
    const i = t.columns.findIndex((c) => norm(c) === norm(w));
    if (i < 0) throw new Error(`Column "${w}" not found. Columns in file: ${t.columns.join(", ")}`);
    return i;
  });
  return { columns: idx.map((i) => t.columns[i]), rows: t.rows.map((r) => idx.map((i) => r[i])) };
}

const esc = (v: unknown, d: string) => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.includes(d) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
};
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlTag = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "_$1");

export function writeFile(format: OutputFormat, t: Table, sheetName = "data"): { bytes: Uint8Array; type: string } {
  const objs = () => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
  const text = (s: string, type = "text/plain") => ({ bytes: new TextEncoder().encode(s), type });
  switch (format) {
    case "csv": case "tsv": case "txt": {
      const d = format === "csv" ? "," : format === "tsv" ? "\t" : "|";
      return text([t.columns, ...t.rows].map((r) => r.map((v) => esc(v, d)).join(d)).join("\n"));
    }
    case "json": return text(JSON.stringify(objs(), null, 2), "application/json");
    case "xml": {
      const body = t.rows.map((r) => `  <row>${t.columns.map((c, i) => `<${xmlTag(c)}>${xmlEsc(String(r[i] ?? ""))}</${xmlTag(c)}>`).join("")}</row>`).join("\n");
      return text(`<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${body}\n</rows>\n`, "application/xml");
    }
    case "xlsx": {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.columns, ...t.rows]), sheetName.slice(0, 31) || "data");
      return { bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    }
    case "parquet": {
      const buf = parquetWriteBuffer({
        columnData: t.columns.map((c, i) => ({ name: c, type: "STRING", data: t.rows.map((r) => (r[i] === null || r[i] === undefined ? null : String(r[i]))) })),
      } as never);
      return { bytes: new Uint8Array(buf), type: "application/vnd.apache.parquet" };
    }
  }
  throw new Error(`Unsupported output format ${format}`);
}
