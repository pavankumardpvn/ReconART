"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Search,
  Upload,
  Plus,
  ArrowRight,
  Command,
  LayoutDashboard,
  Database,
  GitCompareArrows,
  Layers,
  Download,
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  shortcut?: string;
  section: "quick" | "navigation";
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const COMMANDS: CommandItem[] = [
  // Quick Actions
  { id: "upload", label: "Upload Data Source", icon: Upload, href: "/data-sources/new", section: "quick" },
  { id: "create-recon", label: "Create Reconciliation", icon: Plus, href: "/reconciliations/new", section: "quick" },
  { id: "export", label: "Export Results", icon: Download, href: "/exports", section: "quick" },
  // Navigation
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", shortcut: "G D", section: "navigation" },
  { id: "data-sources", label: "Data Sources", icon: Database, href: "/data-sources", shortcut: "G S", section: "navigation" },
  { id: "reconciliations", label: "Reconciliations", icon: GitCompareArrows, href: "/reconciliations", shortcut: "G R", section: "navigation" },
  { id: "segments", label: "Segments", icon: Layers, href: "/segments", section: "navigation" },
  { id: "exports", label: "Exports", icon: Download, href: "/exports", section: "navigation" },
  { id: "schedules", label: "Schedules", icon: Clock, href: "/schedules", section: "navigation" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings", section: "navigation" },
];

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Dialog                                                             */
/* ------------------------------------------------------------------ */

function CommandPaletteDialog() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands by search query
  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  const quickActions = filtered.filter((c) => c.section === "quick");
  const navigation = filtered.filter((c) => c.section === "navigation");
  const allFiltered = [...quickActions, ...navigation];

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  // Select handler
  const handleSelect = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [setOpen, router]
  );

  // Keyboard navigation inside dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(allFiltered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          i <= 0 ? Math.max(allFiltered.length - 1, 0) : i - 1
        );
      } else if (e.key === "Enter" && allFiltered[activeIndex]) {
        e.preventDefault();
        handleSelect(allFiltered[activeIndex]);
      }
    },
    [allFiltered, activeIndex, handleSelect]
  );

  // Clamp activeIndex when filtered list shrinks
  useEffect(() => {
    if (activeIndex >= allFiltered.length) {
      setActiveIndex(Math.max(allFiltered.length - 1, 0));
    }
  }, [allFiltered.length, activeIndex]);

  let flatIndex = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">
            Command Palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search for commands and navigate the application
          </DialogPrimitive.Description>
          <div
            className={cn(
              "glass-card gradient-border w-full max-w-lg rounded-xl shadow-2xl",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "backdrop-blur-2xl"
            )}
            style={{
              boxShadow: "0 0 60px rgba(6, 182, 212, 0.08), 0 25px 50px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-[var(--card-border)] px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-[var(--foreground-subtle)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--foreground-subtle)] outline-none"
              />
              <kbd className="hidden rounded border border-[var(--card-border)] bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground-subtle)] sm:inline-block">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto p-2">
              {allFiltered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-[var(--foreground-subtle)]">
                  No results found.
                </p>
              )}

              {quickActions.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                    Quick Actions
                  </p>
                  {quickActions.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          idx === activeIndex
                            ? "bg-[var(--background-tertiary)] border-l-2 border-l-[var(--accent-cyan)]"
                            : "border-l-2 border-l-transparent"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />
                        <span className="flex-1 text-left text-[var(--foreground)]">
                          {item.label}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[var(--foreground-subtle)] opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}

              {navigation.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                    Navigation
                  </p>
                  {navigation.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          idx === activeIndex
                            ? "bg-[var(--background-tertiary)] border-l-2 border-l-[var(--accent-cyan)]"
                            : "border-l-2 border-l-transparent"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />
                        <span className="flex-1 text-left text-[var(--foreground)]">
                          {item.label}
                        </span>
                        {item.shortcut && (
                          <kbd className="rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground-subtle)]">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-[var(--card-border)] px-4 py-2.5 text-[10px] text-[var(--foreground-subtle)]">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-1 py-0.5 font-mono">
                  &uarr;&darr;
                </kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-1 py-0.5 font-mono">
                  &crarr;
                </kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-1 py-0.5 font-mono">
                  esc
                </kbd>
                Close
              </span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandPaletteDialog />
    </CommandPaletteContext.Provider>
  );
}
