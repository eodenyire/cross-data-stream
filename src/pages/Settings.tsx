import { useState } from "react";
import { motion } from "framer-motion";
import { Settings, FolderOpen, Save } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [inputDir, setInputDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-heading font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure directories and default behaviors</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 space-y-5">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" /> Directory Configuration
          </h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Default Input Directory</Label>
              <Input placeholder="/data/input" value={inputDir} onChange={(e) => setInputDir(e.target.value)} />
              <p className="text-xs text-muted-foreground">Where to look for files to process</p>
            </div>
            <div className="space-y-2">
              <Label>Default Output Directory</Label>
              <Input placeholder="/data/output" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
              <p className="text-xs text-muted-foreground">Where converted files will be saved</p>
            </div>
          </div>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" /> {saved ? "Saved!" : "Save Settings"}
          </Button>
        </motion.div>
      </div>
    </AppLayout>
  );
}
