// Data quality rule engine. Keep in sync with src/lib/dataQuality.ts
export type ColType = "text" | "integer" | "number" | "date" | "boolean" | "email";
export type QualityRules = { required?: string[]; unique?: string[]; types?: Record<string, ColType>; block_on_fail?: boolean };
export type Issue = { rule: string; column: string; count: number; examples: string[] };
export type QualityReport = { passed: boolean; rows: number; checked: number; issues: Issue[] };

const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const typeOk: Record<ColType, (s: string) => boolean> = {
  text: () => true,
  integer: (s) => /^-?\d+$/.test(s.replace(/,/g, "")),
  number: (s) => s.replace(/,/g, "") !== "" && !isNaN(Number(s.replace(/,/g, ""))),
  date: (s) => !isNaN(Date.parse(s)),
  boolean: (s) => /^(true|false|yes|no|y|n|0|1)$/i.test(s),
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
};

export function hasRules(r?: QualityRules | null) {
  return !!r && ((r.required?.length ?? 0) + (r.unique?.length ?? 0) + Object.keys(r.types ?? {}).length > 0);
}

export function runQuality(columns: string[], rows: unknown[][], rules: QualityRules): QualityReport {
  const norm = (c: string) => c.trim().toLowerCase();
  const idx = (c: string) => columns.findIndex((x) => norm(x) === norm(c));
  const issues: Issue[] = [];
  let checked = 0;
  const push = (rule: string, column: string, rowNo: number, bad: boolean) => {
    if (!bad) return;
    let i = issues.find((x) => x.rule === rule && x.column === column);
    if (!i) issues.push((i = { rule, column, count: 0, examples: [] }));
    i.count++;
    if (i.examples.length < 5) i.examples.push(`row ${rowNo}`);
  };
  for (const c of rules.required ?? []) {
    checked++;
    const j = idx(c);
    if (j < 0) { issues.push({ rule: "missing column", column: c, count: rows.length, examples: ["column not in data"] }); continue; }
    rows.forEach((r, n) => push("required value missing", c, n + 2, empty(r[j])));
  }
  for (const [c, t] of Object.entries(rules.types ?? {})) {
    checked++;
    const j = idx(c);
    if (j < 0) { issues.push({ rule: "missing column", column: c, count: rows.length, examples: ["column not in data"] }); continue; }
    rows.forEach((r, n) => push(`not a valid ${t}`, c, n + 2, !empty(r[j]) && !typeOk[t](String(r[j]).trim())));
  }
  if (rules.unique?.length) {
    checked++;
    const js = rules.unique.map(idx);
    const label = rules.unique.join(" + ");
    if (js.some((j) => j < 0)) issues.push({ rule: "missing column", column: label, count: rows.length, examples: ["column not in data"] });
    else {
      const seen = new Map<string, number>();
      rows.forEach((r, n) => {
        const k = js.map((j) => String(r[j] ?? "")).join("\u0001");
        const first = seen.get(k);
        if (first !== undefined) push("duplicate", label, n + 2, true);
        else seen.set(k, n + 2);
      });
    }
  }
  return { passed: issues.length === 0, rows: rows.length, checked, issues };
}
