import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import FileConverter from "./pages/FileConverter";
import Connections from "./pages/Connections";
import TableMapping from "./pages/TableMapping";
import SQLWorkspace from "./pages/SQLWorkspace";
import Ingestion from "./pages/Ingestion";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/convert" element={<FileConverter />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/mapping" element={<TableMapping />} />
          <Route path="/sql" element={<SQLWorkspace />} />
          <Route path="/ingestion" element={<Ingestion />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
