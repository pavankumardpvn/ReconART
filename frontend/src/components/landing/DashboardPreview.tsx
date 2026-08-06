"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  GitCompareArrows,
  LayoutDashboard,
  RefreshCcw,
  AlertTriangle,
  ArrowLeftRight,
  Landmark,
  FileBarChart,
  BarChart3,
  Plug,
  Settings,
  Search,
  Bell,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const sidebarNav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Reconciliation", icon: RefreshCcw },
  { label: "Exceptions", icon: AlertTriangle },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Settlements", icon: Landmark },
  { label: "Reports", icon: FileBarChart },
  { label: "Analytics", icon: BarChart3 },
  { label: "Connectors", icon: Plug },
  { label: "Settings", icon: Settings },
];

const kpis = [
  {
    label: "Total Transactions",
    value: "128.45M",
    change: "+12.6%",
    sub: "vs last month",
    up: true,
  },
  {
    label: "Reconciled",
    value: "126.89M",
    change: "+98.79%",
    sub: "match rate",
    up: true,
  },
  {
    label: "Unreconciled",
    value: "1.56M",
    change: "-1.21%",
    sub: "pending review",
    up: false,
  },
  {
    label: "Exceptions",
    value: "23,152",
    change: "-8.4%",
    sub: "vs last month",
    up: true,
    invertColor: true,
  },
];

const donutSegments = [
  { label: "Banks", pct: 42.5, color: "#2563EB" },
  { label: "Visa", pct: 17.8, color: "#3B82F6" },
  { label: "Mastercard", pct: 16.3, color: "#60A5FA" },
  { label: "Gateways", pct: 12.6, color: "#22C55E" },
  { label: "Vendors", pct: 6.1, color: "#A78BFA" },
  { label: "Others", pct: 4.7, color: "#6B7280" },
];

const exceptions = [
  { label: "Amount Mismatch", count: "8,521" },
  { label: "Missing Reference", count: "6,842" },
  { label: "Duplicate Transactions", count: "4,231" },
  { label: "Currency Mismatch", count: "2,870" },
  { label: "Others", count: "715" },
];

const trendMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const trendValues = [82, 78, 88, 91, 95, 93, 98];

/* ------------------------------------------------------------------ */
/*  SVG sub-components                                                 */
/* ------------------------------------------------------------------ */

function LineChart() {
  const w = 280;
  const h = 120;
  const px = 28;
  const py = 16;
  const plotW = w - px * 2;
  const plotH = h - py * 2;

  const min = Math.min(...trendValues);
  const max = Math.max(...trendValues);
  const range = max - min || 1;

  const points = trendValues.map((v, i) => ({
    x: px + (i / (trendValues.length - 1)) * plotW,
    y: py + plotH - ((v - min) / range) * plotH,
  }));

  // Smooth cubic bezier path
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }

  // Area fill path
  const areaD =
    d +
    ` L ${points[points.length - 1].x},${h - py} L ${points[0].x},${h - py} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={px}
          x2={w - px}
          y1={py + plotH * (1 - t)}
          y2={py + plotH * (1 - t)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
      ))}

      {/* Area fill */}
      <path d={areaD} fill="url(#lineGrad)" />

      {/* Line */}
      <path
        d={d}
        fill="none"
        stroke="#2563EB"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="#030712"
          stroke="#2563EB"
          strokeWidth={1.5}
        />
      ))}

      {/* Month labels */}
      {trendMonths.map((m, i) => (
        <text
          key={m}
          x={points[i].x}
          y={h - 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.35)"
          fontSize={8}
          fontFamily="inherit"
        >
          {m}
        </text>
      ))}
    </svg>
  );
}

function DonutChart() {
  const r = 44;
  const stroke = 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-[100px] h-[100px] shrink-0">
        {donutSegments.map((seg) => {
          const dash = (seg.pct / 100) * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={seg.label}
              cx={60}
              cy={60}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text
          x={60}
          y={57}
          textAnchor="middle"
          fill="white"
          fontSize={14}
          fontWeight={700}
          fontFamily="inherit"
        >
          6
        </text>
        <text
          x={60}
          y={70}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={7}
          fontFamily="inherit"
        >
          sources
        </text>
      </svg>

      <div className="flex flex-col gap-1.5">
        {donutSegments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-[10px]">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-white/50 whitespace-nowrap">{seg.label}</span>
            <span className="text-white/80 font-medium ml-auto">
              {seg.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPreview() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section
      ref={ref}
      className="relative w-full overflow-hidden py-24 md:py-32"
    >
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[900px] rounded-full opacity-30 blur-[160px]"
        style={{
          background:
            "radial-gradient(ellipse, #2563EB 0%, transparent 70%)",
        }}
      />

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="relative mx-auto max-w-[1200px] px-6 text-center mb-14"
      >
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          The Intelligent Reconciliation Platform
        </h2>
        <p className="mt-4 text-base text-white/50 sm:text-lg">
          Built for finance. Designed for scale.
        </p>
      </motion.div>

      {/* Dashboard container with perspective tilt */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.9, delay: 0.15 }}
        className="relative mx-auto max-w-[1100px] px-4 sm:px-6"
        style={{ perspective: "1800px" }}
      >
        <div
          className="rounded-2xl border border-white/[0.08] bg-[#0A0F1A] shadow-2xl shadow-blue-500/10 overflow-hidden"
          style={{
            transform: "rotateX(2deg)",
            transformOrigin: "center bottom",
          }}
        >
          <div className="flex min-h-[520px]">
            {/* ---- Sidebar ---- */}
            <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-white/[0.06] bg-[#060B14] py-5 px-3">
              {/* Logo */}
              <div className="flex items-center gap-2 px-2 mb-6">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-md shadow-blue-500/25">
                  <GitCompareArrows className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight text-white">
                  recon<span className="text-[#2563EB]">ART</span>
                </span>
              </div>

              {/* Nav */}
              <nav className="flex flex-col gap-0.5">
                {sidebarNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors ${
                        item.active
                          ? "bg-[#2563EB]/10 text-[#60A5FA]"
                          : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </div>
                  );
                })}
              </nav>
            </aside>

            {/* ---- Main content ---- */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Top bar */}
              <header className="flex items-center justify-between border-b border-white/[0.06] px-4 sm:px-6 py-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">
                    Overview
                  </h3>
                  <span className="hidden sm:inline-block rounded-md bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/40 border border-white/[0.06]">
                    01 May &ndash; 31 May 2025
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Search className="h-3.5 w-3.5 text-white/30" />
                  <div className="relative">
                    <Bell className="h-3.5 w-3.5 text-white/30" />
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-[9px] font-bold text-white">
                    RK
                  </div>
                </div>
              </header>

              {/* Content body */}
              <div className="flex-1 p-4 sm:p-5 space-y-4">
                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {kpis.map((kpi) => {
                    const isPositive = kpi.invertColor ? !kpi.up : kpi.up;
                    return (
                      <div
                        key={kpi.label}
                        className="rounded-xl border border-white/[0.06] bg-[#111827] p-3.5"
                      >
                        <p className="text-[10px] text-white/40 mb-1.5">
                          {kpi.label}
                        </p>
                        <p className="text-lg font-bold text-white leading-none mb-1.5">
                          {kpi.value}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {kpi.up ? (
                            <TrendingUp
                              className={`h-3 w-3 ${
                                isPositive
                                  ? "text-[#22C55E]"
                                  : "text-[#EF4444]"
                              }`}
                            />
                          ) : (
                            <TrendingDown
                              className={`h-3 w-3 ${
                                isPositive
                                  ? "text-[#22C55E]"
                                  : "text-[#EF4444]"
                              }`}
                            />
                          )}
                          <span
                            className={`text-[10px] font-medium ${
                              isPositive
                                ? "text-[#22C55E]"
                                : "text-[#EF4444]"
                            }`}
                          >
                            {kpi.change}
                          </span>
                          <span className="text-[10px] text-white/25">
                            {kpi.sub}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom row: charts + table */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* Reconciliation Trend */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#111827] p-4">
                    <p className="text-[11px] font-semibold text-white/70 mb-3">
                      Reconciliation Trend
                    </p>
                    <LineChart />
                  </div>

                  {/* Transactions by Source */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#111827] p-4">
                    <p className="text-[11px] font-semibold text-white/70 mb-3">
                      Transactions by Source
                    </p>
                    <DonutChart />
                  </div>

                  {/* Top Exceptions */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#111827] p-4 flex flex-col">
                    <p className="text-[11px] font-semibold text-white/70 mb-3">
                      Top Exceptions
                    </p>
                    <div className="flex-1 flex flex-col gap-2">
                      {exceptions.map((ex) => (
                        <div
                          key={ex.label}
                          className="flex items-center justify-between"
                        >
                          <span className="text-[10px] text-white/50">
                            {ex.label}
                          </span>
                          <span className="text-[10px] font-medium text-white/80 tabular-nums">
                            {ex.count}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button className="mt-3 flex items-center gap-1 text-[10px] font-medium text-[#60A5FA] hover:text-[#93C5FD] transition-colors self-start">
                      View All Exceptions
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
