import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

type N = { id: string; title: string; body: string | null; level: string; created_at: string };
const KEY = "datahub_alerts_seen";

export default function AlertsBell() {
  const [items, setItems] = useState<N[]>([]);
  const [seen, setSeen] = useState(() => localStorage.getItem(KEY) ?? "1970");

  useEffect(() => {
    const load = () => supabase.from("notifications").select("id,title,body,level,created_at").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setItems((data ?? []) as N[]));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((n) => n.created_at > seen).length;
  const markSeen = (o: boolean) => {
    if (!o || !items[0]) return;
    localStorage.setItem(KEY, items[0].created_at); setSeen(items[0].created_at);
  };

  return (
    <Popover onOpenChange={markSeen}>
      <PopoverTrigger asChild>
        <button aria-label="Alerts" className="relative h-9 w-9 rounded-full glass-card flex items-center justify-center hover:border-primary/40">
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">{unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border flex justify-between items-center"><p className="text-sm font-medium">Alerts</p><Link to="/monitoring" className="text-xs text-primary">All runs</Link></div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? <p className="text-xs text-muted-foreground p-4">No alerts. Failed scheduled runs will show here.</p> : items.map((n) => (
            <div key={n.id} className="p-3 border-b border-border/50">
              <p className={`text-xs font-medium ${n.level === "error" ? "text-destructive" : ""}`}>{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.body}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
