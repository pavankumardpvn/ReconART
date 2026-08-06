"use client";

import { motion } from "framer-motion";
import {
  Landmark,
  CreditCard,
  Store,
  Globe,
  Building2,
  Database,
  ArrowRight,
  Play,
  Sparkles,
  Shield,
  Zap,
  Star,
  Clock,
} from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const CX = 250;
const CY = 250;

const sources = [
  { label: "Banks",      Icon: Landmark,   left: "3%",  top: "5%",  sx: 75,  sy: 48  },
  { label: "Visa",       Icon: CreditCard, left: "66%", top: "3%",  sx: 385, sy: 38  },
  { label: "Mastercard", Icon: CreditCard, left: "72%", top: "41%", sx: 420, sy: 232 },
  { label: "Gateway",    Icon: Globe,      left: "58%", top: "79%", sx: 352, sy: 422 },
  { label: "Vendor",     Icon: Store,      left: "3%",  top: "79%", sx: 75,  sy: 422 },
  { label: "ERP",        Icon: Building2,  left: "0%",  top: "43%", sx: 42,  sy: 242 },
];

const featureBadges = [
  { label: "AI Powered",          Icon: Sparkles },
  { label: "Real-time Matching",  Icon: Clock },
  { label: "Enterprise Security", Icon: Shield },
  { label: "Multi Currency",      Icon: Globe },
  { label: "500+ Integrations",   Icon: Zap },
];

/* ------------------------------------------------------------------ */
/*  Framer-motion variants                                             */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
const fadeUp: any = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const cardPop: any = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: 0.5 + i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Hero() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-[#030712]">
      {/* ── Animated ambient glow ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-[30%] top-[10%] h-[600px] w-[600px] rounded-full bg-[#2563EB]/[0.07] blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 25, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-[20%] bottom-[10%] h-[500px] w-[500px] rounded-full bg-[#22C55E]/[0.05] blur-[120px]"
        />
        <div className="absolute left-1/2 top-0 h-px w-[600px] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#2563EB]/20 to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center gap-16 px-6 pt-28 pb-20 lg:flex-row lg:gap-12 lg:pt-0 lg:pb-0">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          {/* Badge */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2563EB]/20 bg-[#2563EB]/[0.08] px-4 py-1.5 text-xs font-medium tracking-wide text-[#60A5FA]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Intelligent. Automated. Reconciled.
          </motion.div>

          {/* Heading */}
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            The Intelligent{" "}
            <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text text-transparent">
              Reconciliation
            </span>{" "}
            Platform
          </motion.h1>

          {/* Description */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="mt-6 max-w-lg text-base leading-relaxed text-white/50 sm:text-lg"
          >
            Automate reconciliation across banks, payment networks, vendors, and
            internal systems. Detect discrepancies in real time and resolve
            exceptions before they become losses.
          </motion.p>

          {/* Buttons */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            <Link href="/sign-up">
              <button className="inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/40">
                Request Demo
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <button className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-7 py-3 text-sm font-semibold text-white/70 transition-all hover:border-white/25 hover:text-white">
              <Play className="h-4 w-4" />
              Watch Demo
            </button>
          </motion.div>

          {/* Feature badges */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-10 flex flex-wrap items-center gap-2.5"
          >
            {featureBadges.map(({ label, Icon }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#111827]/60 px-3 py-1.5 text-[11px] font-medium text-white/40"
              >
                <Icon className="h-3 w-3 text-[#2563EB]" />
                {label}
              </span>
            ))}
          </motion.div>

          {/* Trust strip */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={5}
            className="mt-8 flex items-center gap-3"
          >
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="h-4 w-4 fill-amber-400 text-amber-400"
                />
              ))}
            </div>
            <span className="text-xs text-white/30">
              Trusted by{" "}
              <span className="font-medium text-white/60">
                60+ institutions
              </span>
            </span>
          </motion.div>
        </div>

        {/* ── Right column — Visualization ─────────────────── */}
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="relative aspect-square w-full max-w-[500px]">
            {/* SVG connecting paths */}
            <svg
              viewBox="0 0 500 500"
              fill="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="hero-path-grad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.5" />
                </linearGradient>
              </defs>

              {sources.map((s, i) => (
                <g key={i}>
                  {/* Base track line */}
                  <line
                    x1={s.sx}
                    y1={s.sy}
                    x2={CX}
                    y2={CY}
                    stroke="url(#hero-path-grad)"
                    strokeWidth="1"
                    strokeOpacity="0.12"
                  />
                  {/* Animated flowing dashes */}
                  <line
                    x1={s.sx}
                    y1={s.sy}
                    x2={CX}
                    y2={CY}
                    stroke="url(#hero-path-grad)"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                    className="hero-dash-anim"
                    style={{ animationDelay: `${i * 0.3}s` }}
                  />
                </g>
              ))}

              {/* Ambient rings behind center */}
              <circle
                cx={CX}
                cy={CY}
                r="70"
                fill="#2563EB"
                fillOpacity="0.03"
              />
              <circle
                cx={CX}
                cy={CY}
                r="52"
                fill="#2563EB"
                fillOpacity="0.05"
              />
            </svg>

            {/* Floating source cards */}
            {sources.map((s, i) => (
              <motion.div
                key={s.label}
                variants={cardPop}
                initial="hidden"
                animate="visible"
                custom={i}
                className="absolute"
                style={{ left: s.left, top: s.top }}
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{
                    duration: 3.5 + i * 0.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#111827]/80 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2563EB]/10">
                    <s.Icon className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <span className="whitespace-nowrap text-xs font-medium text-white/70">
                    {s.label}
                  </span>
                </motion.div>
              </motion.div>
            ))}

            {/* Center hub node */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, duration: 0.6, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            >
              <div className="relative flex h-24 w-24 items-center justify-center">
                {/* Pulse rings — centered via inset-0 + m-auto so CSS scale
                    animation does not conflict with positioning transforms */}
                <div className="hero-pulse-outer pointer-events-none absolute inset-0 m-auto h-36 w-36 rounded-full border border-[#2563EB]/10" />
                <div className="hero-pulse-inner pointer-events-none absolute inset-0 m-auto h-28 w-28 rounded-full border border-[#2563EB]/[0.15]" />

                {/* Glow */}
                <div className="absolute inset-0 rounded-full bg-[#2563EB]/20 blur-xl" />

                {/* Main circle */}
                <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-[#2563EB]/30 bg-gradient-to-br from-[#111827] to-[#0a1628]">
                  <Database className="mb-0.5 h-3.5 w-3.5 text-[#2563EB]/40" />
                  <span className="text-[10px] font-bold leading-none tracking-wider text-white/50">
                    recon
                  </span>
                  <span className="text-xs font-bold leading-none text-[#2563EB]">
                    ART
                  </span>
                </div>
              </div>

              {/* Accuracy badge */}
              <div className="mt-3 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/[0.08] px-3 py-1">
                <span className="text-[10px] font-semibold text-[#22C55E]">
                  98.97% Matching Accuracy
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Scoped keyframe animations */}
      <style>{`
        @keyframes heroDash {
          from { stroke-dashoffset: 14; }
          to   { stroke-dashoffset: 0; }
        }
        .hero-dash-anim {
          animation: heroDash 1.2s linear infinite;
        }
        @keyframes heroPulse {
          0%   { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .hero-pulse-outer {
          animation: heroPulse 3s ease-out infinite;
        }
        .hero-pulse-inner {
          animation: heroPulse 3s ease-out 1.5s infinite;
        }
      `}</style>
    </section>
  );
}
