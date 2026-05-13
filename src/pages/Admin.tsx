import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type AppRole = "admin" | "analyst" | "user";
const ROLES: AppRole[] = ["admin", "analyst", "user"];

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  department: string | null;
  created_at: string;
  roles: AppRole[];
}

export default function Admin() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, department, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);

    if (pErr || rErr) {
      toast.error(pErr?.message || rErr?.message || "Failed to load users");
      setLoading(false);
      return;
    }

    const byUser = new Map<string, AppRole[]>();
    (roles || []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) || [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });

    setRows(
      (profiles || []).map((p: any) => ({
        ...p,
        roles: byUser.get(p.id) || [],
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const setPrimaryRole = async (userId: string, newRole: AppRole) => {
    setSavingId(userId);
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (delErr) {
      toast.error(delErr.message);
      setSavingId(null);
      return;
    }
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });
    if (insErr) {
      toast.error(insErr.message);
      setSavingId(null);
      return;
    }
    toast.success("Role updated");
    setRows((prev) =>
      prev.map((r) => (r.id === userId ? { ...r, roles: [newRole] } : r)),
    );
    setSavingId(null);
  };

  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto mt-20 glass-card p-8 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-xl font-heading font-bold">Admins only</h2>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold">User Administration</h1>
            <p className="text-sm text-muted-foreground">
              View users and assign roles.
            </p>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead className="w-[200px]">Assign Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const primary = u.roles[0] || "user";
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.display_name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.department || "—"}
                      </TableCell>
                      <TableCell>
                        {u.roles.length === 0 ? (
                          <Badge variant="outline">none</Badge>
                        ) : (
                          u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant={r === "admin" ? "default" : "secondary"}
                              className="mr-1"
                            >
                              {r}
                            </Badge>
                          ))
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={primary}
                          disabled={savingId === u.id}
                          onValueChange={(v) =>
                            setPrimaryRole(u.id, v as AppRole)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-10"
                    >
                      No users yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
