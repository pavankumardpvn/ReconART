"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Database, Brain, AlertTriangle, LineChart } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const steps = [
  {
    title: "Connect Data",
    description:
      "Ingest from 500+ sources including banks, ERPs, payment processors, and custom APIs.",
    Icon: Database,
  },
  {
    title: "Smart Matching",
    description:
      "AI-powered engine matches transactions with configurable rules, fuzzy logic, and ML confidence scoring.",
    Icon: Brain,
  },
  {
    title: "Resolve Exceptions",
    description:
      "Surface unmatched items instantly. Assign, investigate, and close exceptions in a single workflow.",
    Icon: AlertTriangle,
  },
  {
    title: "Report & Comply",
    description:
      "Generate audit-ready reports, track SLAs, and meet regulatory deadlines automatically.",
    Icon: LineChart,
  },
];

/* ------------------------------------------------------------------ */
/*  Framer-motion variants                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stepFade: any = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.3 + i * 0.2,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntegrationHub() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="integration"
      className="relative overflow-hidden bg-[#030712] px-6 py-28"
    >
      {/* Background accent line */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-0 h-px w-[800px] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#2563EB]/10 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1100px]">
        {/* ── Section heading ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From Data to{" "}
            <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text text-transparent">
              Decision
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-white/40">
            Four steps to transform raw transaction data into actionable
            reconciliation intelligence.
          </p>
        </motion.div>

        {/* ── Workflow steps ───────────────────────────────────── */}
        <div ref={sectionRef} className="relative">
          {/* Connecting line — visible on md+ only */}
          <div
            className="absolute left-[12.5%] right-[12.5%] top-7 hidden md:block"
            aria-hidden="true"
          >
            {/* Static track */}
            <div className="h-px w-full bg-white/[0.06]" />

            {/* Gradient fill that draws on scroll */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-px origin-left bg-gradient-to-r from-[#2563EB]/50 via-[#2563EB]/70 to-[#22C55E]/50"
            />

            {/* Flowing light that travels the line */}
            {inView && (
              <div
                className="absolute -top-0.5 h-[5px] w-14 rounded-full bg-gradient-to-r from-transparent via-[#2563EB] to-transparent blur-[2px]"
                style={{
                  animation: "integrationFlow 3s ease-in-out 1.5s infinite",
                }}
              />
            )}
          </div>

          {/* Step cards grid */}
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                variants={stepFade}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
                custom={i}
                className="flex flex-col items-center text-center"
              >
                {/* Numbered circle */}
                <div className="relative z-10 mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-[#111827]">
                  <span className="text-sm font-bold text-[#2563EB]">
                    {i + 1}
                  </span>
                </div>

                {/* Icon box */}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-[#111827]/60">
                  <step.Icon className="h-5 w-5 text-[#2563EB]" />
                </div>

                {/* Title */}
                <h3 className="mb-2 text-sm font-semibold text-white">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="max-w-[220px] text-xs leading-relaxed text-white/35">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Scoped keyframe animation for flowing light */}
      <style>{`
        @keyframes integrationFlow {
          0%   { left: -10%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
      `}</style>
    </section>
  );
}
