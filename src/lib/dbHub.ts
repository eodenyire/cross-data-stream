import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export async function dbHub<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("db-hub", { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { msg = (await error.context.json()).error ?? msg; } catch { /* ignore */ }
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type DbConnection = {
  id: string; name: string; db_type: string; host: string | null; port: number | null;
  database_name: string | null; username: string | null; is_internal: boolean; status: string;
  status_message: string | null; last_tested_at: string | null; created_by: string | null;
};

export async function fetchConnections(): Promise<DbConnection[]> {
  const { data, error } = await supabase.from("db_connections").select("*").order("is_internal", { ascending: false }).order("created_at");
  if (error) throw error;
  return (data ?? []) as DbConnection[];
}
