import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import AlertsBell from "./AlertsBell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 ml-[260px] p-6 overflow-auto">
        <div className="flex justify-end mb-2"><AlertsBell /></div>
        {children}
      </main>
    </div>
  );
}
