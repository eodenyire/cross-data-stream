import { motion } from "framer-motion";
import {
  FileSpreadsheet,
  Database,
  ArrowRightLeft,
  Terminal,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";

const stats = [
  { label: "Files Converted", value: "0", icon: FileSpreadsheet, color: "text-primary" },
  { label: "DB Connections", value: "0", icon: Database, color: "text-info" },
  { label: "Tables Mapped", value: "0", icon: ArrowRightLeft, color: "text-warning" },
  { label: "Queries Run", value: "0", icon: Terminal, color: "text-success" },
];

const quickActions = [
  { label: "Convert File", description: "Upload & convert between formats", icon: Upload, path: "/convert" },
  { label: "Add Connection", description: "Connect to a database", icon: Database, path: "/connections" },
  { label: "Map Tables", description: "Source to destination mapping", icon: ArrowRightLeft, path: "/mapping" },
  { label: "Run Query", description: "Execute SQL queries", icon: Terminal, path: "/sql" },
];

const recentActivity = [
  { action: "System ready", status: "success", time: "Just now" },
  { action: "Awaiting first file conversion", status: "pending", time: "-" },
  { action: "No database connections configured", status: "warning", time: "-" },
];

const statusIcon = {
  success: CheckCircle2,
  warning: AlertTriangle,
  pending: Clock,
};

const statusColor = {
  success: "text-success",
  warning: "text-warning",
  pending: "text-muted-foreground",
};

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <h1 className="text-3xl font-heading font-bold">
            Welcome to <span className="gradient-text">Data Hub</span>
          </h1>
          <p className="text-muted-foreground">
            Wekeza Bank's data discovery & transformation platform
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-heading font-bold">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-lg font-heading font-semibold">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.05 }}
              >
                <Link
                  to={action.path}
                  className="glass-card p-4 block hover:border-primary/40 transition-all duration-200 group glow-green hover:glow-green"
                >
                  <action.icon className="h-8 w-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-heading font-semibold text-sm">{action.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-3">
          <h2 className="text-lg font-heading font-semibold">System Status</h2>
          <div className="glass-card divide-y divide-border">
            {recentActivity.map((item, i) => {
              const Icon = statusIcon[item.status as keyof typeof statusIcon];
              const color = statusColor[item.status as keyof typeof statusColor];
              return (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="flex-1 text-sm">{item.action}</span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
