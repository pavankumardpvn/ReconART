"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { CommandPaletteProvider } from "@/components/command-palette/CommandPalette";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-[var(--background)]">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div
          className={cn(
            "transition-all duration-300",
            sidebarCollapsed ? "ml-16" : "ml-64"
          )}
        >
          <Header />
          <main className="p-0">{children}</main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
