import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DbConnection, fetchConnections } from "@/lib/dbHub";

export default function ConnectionSelect({
  value, onChange, placeholder = "Choose a connection",
}: { value: string; onChange: (id: string) => void; placeholder?: string }) {
  const [conns, setConns] = useState<DbConnection[]>([]);
  useEffect(() => {
    fetchConnections().then((c) => {
      setConns(c);
      if (!value && c[0]) onChange(c[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {conns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name} <span className="text-muted-foreground text-xs">· {c.is_internal ? "built-in" : c.db_type}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
