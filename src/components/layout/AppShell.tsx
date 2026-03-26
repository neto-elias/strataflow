"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { cn } from "@/lib/utils";

interface AppShellProps {
  user: Session["user"];
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed((v) => !v)}
        user={user}
      />

      {/* Main content area */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-200",
        )}
      >
        <Header user={user} sidebarCollapsed={sidebarCollapsed} />

        <main
          className="flex-1 overflow-y-auto p-6 lg:p-8"
          id="main-content"
          role="main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
