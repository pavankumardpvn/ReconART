"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n, REGIONS, LANG_LABELS, type Region } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FLAG_COLORS: Record<string, string[]> = {
  us: ["#B22234", "#3C3B6E", "#FFFFFF"],
  ca: ["#FF0000", "#FFFFFF", "#FF0000"],
  uk: ["#012169", "#C8102E", "#FFFFFF"],
  eu: ["#003399", "#FFCC00", "#003399"],
  br: ["#009C3B", "#FFDF00", "#002776"],
  co: ["#FCD116", "#003893", "#CE1126"],
  mx: ["#006847", "#FFFFFF", "#CE1126"],
  ar: ["#74ACDF", "#FFFFFF", "#74ACDF"],
  in: ["#FF9933", "#FFFFFF", "#138808"],
};

function FlagCircle({ region, size = 28, active = false }: { region: Region; size?: number; active?: boolean }) {
  const colors = FLAG_COLORS[region.flag] || ["#666", "#999", "#CCC"];
  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full overflow-hidden border-2 transition-all",
        active ? "border-cyan-400 shadow-lg shadow-cyan-500/20" : "border-transparent hover:border-white/30"
      )}
      style={{ width: size, height: size }}
      title={region.name}
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1" style={{ backgroundColor: colors[0] }} />
        <div className="flex-1" style={{ backgroundColor: colors[1] }} />
        <div className="flex-1" style={{ backgroundColor: colors[2] }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[8px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ fontSize: size * 0.32 }}>
          {region.code}
        </span>
      </div>
    </div>
  );
}

interface RegionSelectorProps {
  variant?: "landing" | "dashboard";
}

export default function RegionSelector({ variant = "landing" }: RegionSelectorProps) {
  const { region, setRegion } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open]);

  const groups = REGIONS.reduce<Record<string, Region[]>>((acc, r) => {
    (acc[r.group] = acc[r.group] || []).push(r);
    return acc;
  }, {});

  const isDashboard = variant === "dashboard";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-full transition-all",
          isDashboard
            ? "px-2 py-1.5 hover:bg-[var(--background-tertiary)]"
            : "px-2 py-1.5 hover:bg-white/10"
        )}
      >
        <FlagCircle region={region} size={24} active={open} />
        {!isDashboard && (
          <span className="text-xs font-medium text-white/60">{region.code}</span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-[100] mt-2 w-72 rounded-2xl border shadow-2xl overflow-hidden",
            isDashboard
              ? "right-0 border-[var(--card-border)] bg-[var(--background)]"
              : "right-0 border-[#7C3AED]/20 bg-[#0F1729]"
          )}
        >
          <div className={cn(
            "px-4 py-3 border-b",
            isDashboard ? "border-[var(--card-border)]" : "border-[#2f3c5b]/30"
          )}>
            <p className={cn(
              "text-xs font-semibold",
              isDashboard ? "text-[var(--foreground)]" : "text-white"
            )}>
              Select Region
            </p>
            <p className={cn(
              "text-[10px]",
              isDashboard ? "text-[var(--foreground-muted)]" : "text-white/40"
            )}>
              Content language will update automatically
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {Object.entries(groups).map(([group, regions]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className={cn(
                  "px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em]",
                  isDashboard ? "text-[var(--foreground-subtle)]" : "text-white/30"
                )}>
                  {group}
                </p>
                {regions.map((r) => {
                  const isActive = r.code === region.code;
                  return (
                    <button
                      key={r.code}
                      onClick={() => { setRegion(r.code); setOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-all",
                        isActive
                          ? isDashboard
                            ? "bg-cyan-500/10 border border-cyan-500/20"
                            : "bg-[#7C3AED]/10 border border-[#7C3AED]/20"
                          : isDashboard
                            ? "border border-transparent hover:bg-[var(--background-tertiary)]"
                            : "border border-transparent hover:bg-white/5"
                      )}
                    >
                      <FlagCircle region={r} size={28} active={isActive} />
                      <div className="flex-1 text-left">
                        <p className={cn(
                          "text-sm font-medium",
                          isDashboard ? "text-[var(--foreground)]" : "text-white"
                        )}>
                          {r.name}
                        </p>
                        <p className={cn(
                          "text-[10px]",
                          isDashboard ? "text-[var(--foreground-subtle)]" : "text-white/30"
                        )}>
                          {LANG_LABELS[r.lang]}
                        </p>
                      </div>
                      {isActive && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500">
                          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
