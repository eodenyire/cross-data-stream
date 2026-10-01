import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parquetReadObjects } from "hyparquet";
import { parquetWriteBuffer } from "hyparquet-writer";

export type Row = Record<string, unknown>;
export type Parsed = { format: string; sheets: string[]; columns: Record<string, string[]>; data: Record<string, Row[]> };
export const OUTPUT_FORMATS = ["xlsx", "csv", "json", "parquet", "tsv", "txt", "xml"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const FORMAT_LABEL: Record<OutputFormat, string> = {
  xlsx: "Excel (.xlsx)", csv: "CSV", json: "JSON", parquet: "Parquet", tsv: "TSV (tab-separated)", txt: "Text (pipe-separated)", xml: "XML",
};

/** Detects the real file type from its first bytes, falling back to the extension. */
export function detectFormat(name: string, b: Uint8Array): string {
  if (b[0] === 0x50 && b[1] === 0x41 && b[2] === 0x52 && b[3] === 0x31) return "parquet";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b[0] === 0x50 && b[1] === 0x4b) return "xlsx";
  if (b[0] === 0xd0 && b[1] === 0xcf) return "xls";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "tsv", "txt", "json", "xml"].includes(ext)) return ext;
  const head = new TextDecoder().decode(b.slice(0, 200)).trimStart();
  if (head.startsWith("[") || head.startsWith("{")) return "json";
  if (head.startsWith("<")) return "xml";
  return "csv";
}

const clean = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "bigint" ? v.toString() : v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const colsOf = (rows: Row[]) => { const s = new Set<string>(); rows.slice(0, 200).forEach((r) => Object.keys(r).forEach((k) => s.add(k))); return [...s]; };
const one = (format: string, rows: Row[]): Parsed => ({ format, sheets: ["data"], columns: { data: colsOf(rows) }, data: { data: rows } });

export async function parseFile(file: File): Promise<Parsed> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const format = detectFormat(file.name, bytes);
  if (format === "pdf") throw new Error("PDF tables can't be read in the browser yet. Export the PDF to Excel or CSV first.");
  if (format === "parquet") {
    const objs = (await parquetReadObjects({ file: buf })) as Row[];
    return one(format, objs.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clean(v)]))));
  }
  const text = () => new TextDecoder().decode(bytes);
  if (format === "json") {
    const d = JSON.parse(text());
    return one(format, Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [d]);
  }
  if (format === "xml") {
    const doc = new DOMParser().parseFromString(text(), "application/xml");
    const root = doc.documentElement;
    const rows = Array.from(root.children).map((el) => Object.fromEntries(Array.from(el.children).map((c) => [c.tagName, c.textContent])));
    return one(format, rows);
  }
  if (format === "csv" || format === "tsv" || format === "txt") {
    const r = Papa.parse<Row>(text(), { header: true, skipEmptyLines: true, delimiter: format === "tsv" ? "\t" : "" });
    return { format, sheets: ["data"], columns: { data: r.meta.fields ?? [] }, data: { data: r.data } };
  }
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const columns: Record<string, string[]> = {}, data: Record<string, Row[]> = {};
  for (const s of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[s], { defval: null, raw: false });
    data[s] = rows;
    columns[s] = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[s], { header: 1 })[0] as string[] | undefined)?.map(String) ?? colsOf(rows);
  }
  return { format, sheets: wb.SheetNames, columns, data };
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlTag = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "_$1");

export function writeFile(format: OutputFormat, columns: string[], rows: Row[], sheet = "data"): Blob {
  const text = (s: string, type = "text/plain;charset=utf-8") => new Blob([s], { type });
  switch (format) {
    case "csv": case "tsv": case "txt":
      return text(Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) }, { delimiter: format === "csv" ? "," : format === "tsv" ? "\t" : "|" }));
    case "json": return text(JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))), null, 2), "application/json");
    case "xml":
      return text(`<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${rows.map((r) => `  <row>${columns.map((c) => `<${xmlTag(c)}>${xmlEsc(String(r[c] ?? ""))}</${xmlTag(c)}>`).join("")}</row>`).join("\n")}\n</rows>\n`, "application/xml");
    case "parquet": {
      const buf = parquetWriteBuffer({ columnData: columns.map((c) => ({ name: c, type: "STRING", data: rows.map((r) => (r[c] == null ? null : String(r[c]))) })) } as never);
      return new Blob([buf], { type: "application/vnd.apache.parquet" });
    }
    case "xlsx": {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: columns }), sheet.slice(0, 31) || "data");
      return new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }
  }
}
