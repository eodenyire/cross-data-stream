import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 ml-[260px] p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
