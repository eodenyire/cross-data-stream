import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";
import mysql from "npm:mysql2@3.11.0/promise";
import { hasRules, runQuality, type QualityRules } from "../_shared/dq.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Conn = {
  id: string; name: string; db_type: string; host: string | null; port: number | null;
  database_name: string | null; username: string | null; use_ssl: boolean; is_internal: boolean;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const MAX_ROWS = 5000;

function checkIdent(name: string) {
  if (!IDENT.test(name)) throw new Error(`Invalid table name "${name}". Use letters, numbers and underscores.`);
  return name;
}
function cleanCol(c: string) {
  const s = String(c).trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1").toLowerCase();
  return s || "col";
}
function guardSql(sql: string) {
  if (/\b(reset|set)\s+(session\s+)?role\b|\bset\s+session\s+authorization\b/i.test(sql))
    throw new Error("Changing roles is not allowed.");
}

interface Driver {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  quote(id: string): string;
  close(): Promise<void>;
  internal: boolean;
}

async function openDriver(conn: Conn): Promise<Driver> {
  if (conn.is_internal) {
    const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
    const q = (id: string) => id.split(".").map((p) => `"${p}"`).join(".");
    return {
      internal: true,
      quote: q,
      async query(text, params = []) {
        guardSql(text);
        return await sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE datahub_staging");
          await tx.unsafe("SET LOCAL search_path TO staging");
          await tx.unsafe("SET LOCAL statement_timeout = '60s'");
          const r = await tx.unsafe(text, params as never[]);
          return [...r] as Record<string, unknown>[];
        });
      },
      close: () => sql.end(),
    };
  }
  const { data: sec } = await admin.from("db_connection_secrets").select("password").eq("connection_id", conn.id).maybeSingle();
  const password = sec?.password ?? "";
  const t = conn.db_type;
  if (t === "PostgreSQL") {
    const sql = postgres({
      host: conn.host!, port: conn.port || 5432, database: conn.database_name!, username: conn.username!,
      password, ssl: conn.use_ssl ? "require" : false, max: 1, prepare: false, connect_timeout: 15,
    });
    return {
      internal: false,
      quote: (id) => id.split(".").map((p) => `"${p}"`).join("."),
      async query(text, params = []) { return [...(await sql.unsafe(text, params as never[]))] as Record<string, unknown>[]; },
      close: () => sql.end(),
    };
  }
  if (t === "MySQL" || t === "MariaDB") {
    const c = await mysql.createConnection({
      host: conn.host!, port: conn.port || 3306, database: conn.database_name!, user: conn.username!, password,
      ssl: conn.use_ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 15000,
    });
    return {
      internal: false,
      quote: (id) => id.split(".").map((p) => `\`${p}\``).join("."),
      async query(text, params = []) {
        const [rows] = await c.query(text, params);
        return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [{ affected_rows: (rows as any).affectedRows }];
      },
      close: () => c.end(),
    };
  }
  throw new Error(
    `${t} servers on the bank's internal network can't be reached from the cloud yet. A secure gateway (VPN or tunnel) is needed — use PostgreSQL/MySQL or the Data Hub Staging database for now.`,
  );
}

async function getConn(id: string): Promise<Conn> {
  const { data, error } = await admin.from("db_connections").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Connection not found");
  return data as Conn;
}

async function withDriver<T>(id: string, fn: (d: Driver, c: Conn) => Promise<T>) {
  const c = await getConn(id);
  const d = await openDriver(c);
  try { return await fn(d, c); } finally { await d.close().catch(() => {}); }
}

async function listTables(d: Driver, c: Conn) {
  if (d.internal)
    return (await d.query("select table_name as name from information_schema.tables where table_schema='staging' order by 1")).map((r) => String(r.name));
  if (c.db_type === "PostgreSQL")
    return (await d.query("select table_schema||'.'||table_name as name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1")).map((r) => String(r.name));
  return (await d.query("select table_name as name from information_schema.tables where table_schema = database() order by 1")).map((r) => String(r.name ?? (r as any).NAME ?? (r as any).TABLE_NAME));
}

async function countRows(d: Driver, table: string, where?: string | null) {
  const r = await d.query(`select count(*) as n from ${d.quote(table)}${where ? ` where ${where}` : ""}`);
  return Number(Object.values(r[0])[0]);
}

async function ensureTable(d: Driver, table: string, cols: string[], replace: boolean) {
  const q = d.quote(table);
  if (replace) await d.query(`drop table if exists ${q}`);
  await d.query(`create table if not exists ${q} (${cols.map((c) => `${d.quote(c)} text`).join(", ")})`);
}

async function insertRows(d: Driver, table: string, cols: string[], rows: unknown[][]) {
  const q = d.quote(table);
  const colList = cols.map((c) => d.quote(c)).join(", ");
  const batch = Math.max(1, Math.floor(1000 / Math.max(cols.length, 1)));
  let n = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const ph = cols.map((_, j) => {
        const v = row[j];
        params.push(v === null || v === undefined || v === "" ? null : String(v));
        return d.internal || !d.quote("x").startsWith("`") ? `$${params.length}` : "?";
      });
      return `(${ph.join(", ")})`;
    });
    await d.query(`insert into ${q} (${colList}) values ${values.join(", ")}`, params);
    n += chunk.length;
  }
  return n;
}

async function logJob(job: Record<string, unknown>) {
  await admin.from("etl_jobs").insert({ ...job, finished_at: new Date().toISOString() });
}

const toCell = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "object" && v !== null ? JSON.stringify(v) : typeof v === "bigint" ? v.toString() : v);

async function describeSchema(d: Driver, c: Conn) {
  const tables = (await listTables(d, c)).slice(0, 60);
  const out: string[] = [];
  for (const t of tables) {
    if (!IDENT.test(t)) continue;
    try {
      const [schema, name] = t.includes(".") ? t.split(".") : [null, t];
      const rows = d.internal
        ? await d.query("select column_name, data_type from information_schema.columns where table_schema='staging' and table_name=$1 order by ordinal_position", [name])
        : c.db_type === "PostgreSQL"
          ? await d.query("select column_name, data_type from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position", [schema, name])
          : await d.query("select column_name, data_type from information_schema.columns where table_schema=database() and table_name=? order by ordinal_position", [name]);
      out.push(`${t}(${rows.map((r: any) => `${r.column_name ?? r.COLUMN_NAME} ${r.data_type ?? r.DATA_TYPE}`).join(", ")})`);
    } catch { out.push(`${t}(?)`); }
  }
  return out.join("\n");
}

const RUN_ID = "X-Lovable-AIG-Run-ID";
async function askModel(req: Request, system: string, user: string) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("AI is not configured for this app.");
  const headers: Record<string, string> = { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" };
  const rid = req.headers.get(RUN_ID);
  if (rid) headers[RUN_ID] = rid;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers, signal: req.signal,
    body: JSON.stringify({
      model: "openai/gpt-6-astra", stream: true, store: false,
      reasoning: { effort: "medium", summary: "auto" }, include: ["reasoning.encrypted_content"],
      input: [{ role: "system", content: system }, { role: "user", content: user }],
      text: {
        format: {
          type: "json_schema", name: "sql_answer", strict: true,
          schema: {
            type: "object", additionalProperties: false, required: ["sql", "explanation", "assumptions"],
            properties: { sql: { type: "string" }, explanation: { type: "string" }, assumptions: { type: "array", items: { type: "string" } } },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    let msg = `AI request failed (${res.status})`;
    try { const j = await res.json(); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* ignore */ }
    if (res.status === 402) msg = "AI credits are used up. Add credits in workspace billing settings to keep using the assistant.";
    if (res.status === 429) msg = "The AI assistant is busy. Please wait a moment and try again.";
    const e = new Error(msg); (e as any).status = res.status; throw e;
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", refusal = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        else if (ev.type === "response.refusal.delta") refusal += ev.delta;
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message ?? ev.message ?? "AI request failed");
      } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    }
  }
  if (!text) throw new Error(refusal || "The AI assistant declined to answer this request.");
  return JSON.parse(text) as { sql: string; explanation: string; assumptions: string[] };
}

function isReadOnly(sql: string) {
  const s = sql.trim().replace(/;\s*$/, "");
  if (s.includes(";")) return false;
  if (!/^(select|with)\b/i.test(s)) return false;
  return !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|call|exec|copy|into)\b/i.test(s.replace(/'[^']*'/g, ""));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isPower = (roles ?? []).some((r) => r.role === "admin" || r.role === "analyst");
    const body = await req.json();
    const { action } = body;

    const needPower = () => { if (!isPower) throw new Error("Only analysts and admins can run this. Ask an admin to upgrade your role."); };

    switch (action) {
      case "save_connection": {
        const { name, db_type, host, port, database_name, username, password, use_ssl } = body;
        if (!name || !db_type || !host || !database_name || !username) throw new Error("Fill in name, host, database and username.");
        const { data, error } = await admin.from("db_connections").insert({
          name: String(name).slice(0, 100), db_type, host, port: port ? Number(port) : null, database_name, username,
          use_ssl: !!use_ssl, created_by: user.id,
        }).select().single();
        if (error) throw error;
        await admin.from("db_connection_secrets").insert({ connection_id: data.id, password: password ?? "" });
        return json({ connection: data });
      }
      case "test": {
        const c = await getConn(body.connection_id);
        let status = "connected", message = "Connection OK";
        try {
          const d = await openDriver(c);
          try { await d.query("select 1 as ok"); } finally { await d.close().catch(() => {}); }
        } catch (e) { status = "error"; message = (e as Error).message; }
        await admin.from("db_connections").update({ status, status_message: message, last_tested_at: new Date().toISOString() }).eq("id", c.id);
        return json({ status, message });
      }
      case "list_tables":
        return json({ tables: await withDriver(body.connection_id, listTables) });
      case "columns": {
        const t = checkIdent(body.table);
        const rows = await withDriver(body.connection_id, (d) => d.query(`select * from ${d.quote(t)} limit 1`));
        return json({ columns: rows[0] ? Object.keys(rows[0]) : [] });
      }
      case "query": {
        needPower();
        const sql = String(body.sql ?? "").trim().replace(/;\s*$/, "");
        if (!sql) throw new Error("Query is empty");
        const started = Date.now();
        const startedAt = new Date().toISOString();
        let rows: Record<string, unknown>[];
        try {
          rows = await withDriver(body.connection_id, (d) => d.query(sql));
        } catch (e) {
          await logJob({ job_type: "query", title: sql.slice(0, 200), connection_id: body.connection_id, status: "error", message: (e as Error).message, started_at: startedAt, duration_ms: Date.now() - started, details: { sql, ai_generated: !!body.ai_generated }, created_by: user.id });
          throw e;
        }
        const out = rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toCell(v)])));
        const ms = Date.now() - started;
        await logJob({ job_type: "query", title: sql.slice(0, 200), connection_id: body.connection_id, status: "success", dest_count: rows.length, started_at: startedAt, duration_ms: ms, details: { sql, ai_generated: !!body.ai_generated, columns: out[0] ? Object.keys(out[0]) : [] }, created_by: user.id });
        return json({ rows: out, total: rows.length, truncated: rows.length > MAX_ROWS, ms });
      }
      case "ai_sql": {
        needPower();
        const question = String(body.question ?? "").trim().slice(0, 2000);
        if (!question) throw new Error("Describe what you want to find out.");
        const c = await getConn(body.connection_id);
        const schema = await withDriver(c.id, describeSchema);
        const dialect = c.is_internal || c.db_type === "PostgreSQL" ? "PostgreSQL" : "MySQL";
        const system = `You are a careful SQL analyst at Wekeza Bank. Write ONE read-only ${dialect} query (SELECT or WITH ... SELECT only, no semicolons, no data changes) that answers the analyst's question using only the tables and columns listed. Use explicit JOINs when combining tables. Add LIMIT 1000 unless the question is an aggregate. Columns loaded from files are stored as text, so cast when doing maths or date comparisons. If the question cannot be answered from the schema, return an empty sql string and explain why. The explanation should be plain English for a business analyst (2-5 sentences). List any assumptions you made.\n\nSchema:\n${schema || "(no tables found)"}`;
        const ans = await askModel(req, system, question);
        const safe = !ans.sql || isReadOnly(ans.sql);
        return json({ ...ans, sql: ans.sql.trim(), safe, warning: safe ? null : "The generated query was not read-only and has been blocked. Rephrase your question." });
      }
      case "log_job": {
        const j = body.job ?? {};
        const pick = ["job_type", "title", "connection_id", "target", "status", "source_count", "dest_count", "message", "started_at", "duration_ms", "details"];
        await logJob({ ...Object.fromEntries(pick.filter((k) => k in j).map((k) => [k, j[k]])), created_by: user.id });
        return json({ ok: true });
      }
      case "check_mapping": {
        const { data: m } = await admin.from("table_mappings").select("*").eq("id", body.mapping_id).single();
        if (!m) throw new Error("Mapping not found");
        const src = checkIdent(m.source_table);
        const colsReq = m.source_columns.trim() === "*" ? null : m.source_columns.split(",").map((s: string) => checkIdent(s.trim()));
        const where = m.where_clause?.trim() || null;
        if (where) guardSql(where);
        const rows = await withDriver(m.source_connection_id, (d) =>
          d.query(`select ${colsReq ? colsReq.map((x: string) => d.quote(x)).join(", ") : "*"} from ${d.quote(src)}${where ? ` where ${where}` : ""}`));
        const cols = rows[0] ? Object.keys(rows[0]) : colsReq ?? [];
        const report = runQuality(cols, rows.map((r) => Object.values(r).map(toCell)), (m.quality_rules ?? {}) as QualityRules);
        return json({ report });
      }
      case "ingest_chunk": {
        needPower();
        const table = checkIdent(body.table);
        const cols: string[] = (body.columns as string[]).map(cleanCol);
        const inserted = await withDriver(body.connection_id, async (d) => {
          if (body.first) await ensureTable(d, table, cols, body.mode === "replace");
          return insertRows(d, table, cols, body.rows);
        });
        return json({ inserted });
      }
      case "ingest_finalize": {
        needPower();
        const table = checkIdent(body.table);
        const destCount = await withDriver(body.connection_id, (d) => countRows(d, table));
        const expected = Number(body.source_count) + Number(body.pre_count ?? 0);
        const ok = destCount === expected;
        await logJob({
          job_type: "ingestion", title: body.file_name, connection_id: body.connection_id, target: table,
          status: ok ? "success" : "mismatch", source_count: body.source_count, dest_count: destCount - Number(body.pre_count ?? 0),
          message: ok ? "Row counts match" : `Expected ${expected} rows in table, found ${destCount}`, created_by: user.id,
          started_at: body.started_at ?? null, duration_ms: body.started_at ? Date.now() - Date.parse(body.started_at) : null,
          details: { mode: body.mode, pre_count: body.pre_count ?? 0, columns: body.columns ?? [], quality: body.quality ?? null },
        });
        return json({ dest_count: destCount, ok });
      }
      case "count": {
        const table = checkIdent(body.table);
        try { return json({ count: await withDriver(body.connection_id, (d) => countRows(d, table)) }); }
        catch { return json({ count: 0 }); }
      }
      case "run_mapping": {
        needPower();
        const { data: m } = await admin.from("table_mappings").select("*").eq("id", body.mapping_id).single();
        if (!m) throw new Error("Mapping not found");
        const src = checkIdent(m.source_table), dst = checkIdent(m.dest_table);
        const colsReq = m.source_columns.trim() === "*" ? null : m.source_columns.split(",").map((s: string) => checkIdent(s.trim()));
        const where = m.where_clause?.trim() || null;
        if (where) guardSql(where);
        const started = Date.now(), startedAt = new Date().toISOString();
        const rules = (m.quality_rules ?? {}) as QualityRules;
        const baseDetails = { source_table: src, dest_table: dst, columns: m.source_columns, filter: where, rules };
        await admin.from("table_mappings").update({ status: "running" }).eq("id", m.id);
        try {
          const { rows, srcCount } = await withDriver(m.source_connection_id, async (d) => {
            const sel = colsReq ? colsReq.map((c: string) => d.quote(c)).join(", ") : "*";
            const rows = await d.query(`select ${sel} from ${d.quote(src)}${where ? ` where ${where}` : ""}`);
            return { rows, srcCount: await countRows(d, src, where) };
          });
          const rawCols = rows[0] ? Object.keys(rows[0]) : colsReq ?? [];
          const cells = rows.map((r) => Object.values(r).map(toCell));
          const quality = hasRules(rules) ? runQuality(rawCols, cells, rules) : null;
          if (quality && !quality.passed && rules.block_on_fail) {
            const msg = `Blocked by data quality rules: ${quality.issues.reduce((a, i) => a + i.count, 0)} issue(s) found. Nothing was loaded.`;
            await admin.from("table_mappings").update({ status: "error", last_source_count: srcCount, last_dest_count: 0, last_message: msg, last_run_at: new Date().toISOString() }).eq("id", m.id);
            await logJob({ job_type: "mapping", title: `${src} → ${dst}`, connection_id: m.dest_connection_id, target: dst, status: "blocked", source_count: srcCount, dest_count: 0, message: msg, started_at: startedAt, duration_ms: Date.now() - started, details: { ...baseDetails, quality }, created_by: user.id });
            return json({ ok: false, blocked: true, message: msg, quality });
          }
          const cols = rawCols.map(cleanCol);
          const { before, after } = await withDriver(m.dest_connection_id, async (d) => {
            await ensureTable(d, dst, cols, false);
            const before = await countRows(d, dst);
            await insertRows(d, dst, cols, cells);
            return { before, after: await countRows(d, dst) };
          });
          const loaded = after - before;
          const ok = loaded === srcCount;
          const msg = ok ? `Validated: ${srcCount} source rows = ${loaded} loaded` : `Mismatch: ${srcCount} source vs ${loaded} loaded`;
          await admin.from("table_mappings").update({ status: ok ? "success" : "mismatch", last_source_count: srcCount, last_dest_count: loaded, last_message: msg, last_run_at: new Date().toISOString() }).eq("id", m.id);
          await logJob({ job_type: "mapping", title: `${src} → ${dst}`, connection_id: m.dest_connection_id, target: dst, status: ok ? "success" : "mismatch", source_count: srcCount, dest_count: loaded, message: msg, started_at: startedAt, duration_ms: Date.now() - started, details: { ...baseDetails, quality, dest_before: before, dest_after: after }, created_by: user.id });
          return json({ ok, source_count: srcCount, dest_count: loaded, message: msg, quality });
        } catch (e) {
          const msg = (e as Error).message;
          await admin.from("table_mappings").update({ status: "error", last_message: msg, last_run_at: new Date().toISOString() }).eq("id", m.id);
          await logJob({ job_type: "mapping", title: `${src} → ${dst}`, connection_id: m.dest_connection_id, target: dst, status: "error", message: msg, started_at: startedAt, duration_ms: Date.now() - started, details: baseDetails, created_by: user.id });
          throw e;
        }
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 400);
  }
});
