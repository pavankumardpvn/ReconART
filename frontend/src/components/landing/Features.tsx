"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import {
  Sparkles,
  Zap,
  Layers,
  Shield,
  Clock,
  CircleDollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* =========================================================================
   Data
   ========================================================================= */

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: "AI-Powered Matching",
    description:
      "Smart rule engine powered by machine learning delivers higher accuracy and catches anomalies traditional systems miss entirely.",
  },
  {
    icon: CircleDollarSign,
    title: "Cross-Border Currency",
    description:
      "Reconcile across 150+ currencies with real-time FX rates, automated conversion, and tolerance-based matching for global operations.",
  },
  {
    icon: Zap,
    title: "Real-time Reconciliation",
    description:
      "Instant visibility into every transaction as it happens. No batch delays, no waiting -- always up to date, always reconciled.",
  },
  {
    icon: Layers,
    title: "Multi-source Integration",
    description:
      "Connect banks, PSPs, ERPs, and more. 500+ data sources with automated schema detection and zero vendor lock-in.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description:
      "Bank-grade encryption, SOC 2 certified, PCI DSS compliant. Your data is protected with the highest security standards in the industry.",
  },
  {
    icon: Clock,
    title: "Automated Workflows",
    description:
      "Eliminate manual effort with scheduled reconciliations, smart alerts, and resolution workflows that run on autopilot.",
  },
];

/* =========================================================================
   Component
   ========================================================================= */

export default function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.05 });

  return (
    <section id="features" className="relative bg-[#030712] px-6 py-28">
      {/* Background glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-[#2563EB]/[0.03] blur-[80px]" />

      <div
        ref={sectionRef}
        className="relative mx-auto max-w-[1200px]"
        style={{
          transition:
            "opacity 1.2s cubic-bezier(.37,0,.63,1), transform 1.2s cubic-bezier(.37,0,.63,1)",
          opacity: isInView ? 1 : 0,
          transform: isInView ? "translateY(0)" : "translateY(24px)",
        }}
      >
        {/* Section header */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#2563EB]/50" />
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#2563EB]">
            Why ReconArt
          </span>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#2563EB]/50" />
        </div>
        <h2 className="mb-5 text-center text-3xl font-bold tracking-tight text-white md:text-5xl">
          The ReconArt{" "}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text text-transparent">
            Advantage
          </span>
        </h2>
        <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
          Our platform delivers what traditional reconciliation tools
          cannot -- speed, intelligence, and complete transparency.
        </p>

        {/* Feature cards -- 3x2 grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827]/70 p-7 pl-9 backdrop-blur-xl transition-all duration-[400ms] hover:-translate-y-1 hover:border-[#2563EB]/40 hover:shadow-[0_0_40px_rgba(37,99,235,0.08),0_20px_60px_rgba(0,0,0,0.3)]"
              style={{
                transition: `opacity 0.8s cubic-bezier(.37,0,.63,1) ${i * 150}ms, transform 0.8s cubic-bezier(.37,0,.63,1) ${i * 150}ms`,
                opacity: isInView ? 1 : 0,
                transform: isInView ? "translateY(0)" : "translateY(30px)",
              }}
            >
              {/* Top glow line on hover */}
              <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#2563EB] to-transparent opacity-0 transition-opacity duration-[400ms] group-hover:opacity-100" />

              {/* Left accent bar */}
              <div className="absolute bottom-6 left-0 top-6 w-[3px] rounded-full bg-gradient-to-b from-[#2563EB] to-[#22C55E] opacity-40 transition-opacity group-hover:opacity-100" />

              {/* Icon */}
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB]/20 to-[#22C55E]/10 transition-shadow group-hover:shadow-lg group-hover:shadow-[#2563EB]/20">
                <feature.icon className="h-5 w-5 text-[#2563EB] transition-colors group-hover:text-[#3B82F6]" />
              </div>

              {/* Text */}
              <h3 className="mb-2 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/50">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
