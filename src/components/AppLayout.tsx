import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import AlertsBell from "./AlertsBell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 ml-[260px] p-6 overflow-auto relative">
        <div className="absolute top-6 right-6 z-10"><AlertsBell /></div>
        {children}
      </main>
    </div>
  );
}
