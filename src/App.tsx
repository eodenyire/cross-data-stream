import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import FileConverter from "./pages/FileConverter";
import Connections from "./pages/Connections";
import TableMapping from "./pages/TableMapping";
import SQLWorkspace from "./pages/SQLWorkspace";
import Ingestion from "./pages/Ingestion";
import SettingsPage from "./pages/Settings";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const protect = (el: JSX.Element) => <ProtectedRoute>{el}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={protect(<Index />)} />
            <Route path="/convert" element={protect(<FileConverter />)} />
            <Route path="/connections" element={protect(<Connections />)} />
            <Route path="/mapping" element={protect(<TableMapping />)} />
            <Route path="/sql" element={protect(<SQLWorkspace />)} />
            <Route path="/ingestion" element={protect(<Ingestion />)} />
            <Route path="/settings" element={protect(<SettingsPage />)} />
            <Route path="/admin" element={protect(<Admin />)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
