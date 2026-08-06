"use client";

import { useRef, useState, useEffect } from "react";
import { useInView } from "framer-motion";
import { ShieldCheck, Globe, FileCheck2 } from "lucide-react";

/* =========================================================================
   Counter Hook
   ========================================================================= */

function useCountUp(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);

  return count;
}

/* =========================================================================
   Data
   ========================================================================= */

const logoPartners = [
  "Visa",
  "Mastercard",
  "Stripe",
  "PayPal",
  "Adyen",
  "SWIFT",
  "SAP",
  "Oracle",
  "NetSuite",
  "Plaid",
  "Square",
  "Worldpay",
  "Fiserv",
  "RuPay",
];

/* =========================================================================
   Component
   ========================================================================= */

export default function Statistics() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

  const accuracyCount = useCountUp(999, 2800, isInView);
  const txCount = useCountUp(10, 2200, isInView);
  const sourcesCount = useCountUp(500, 2500, isInView);

  const stats = [
    {
      value: (accuracyCount / 10).toFixed(1),
      suffix: "%",
      label: "Matching Accuracy",
    },
    {
      value: String(txCount),
      suffix: "M+",
      label: "Transactions Reconciled Daily",
    },
    {
      value: String(sourcesCount),
      suffix: "+",
      label: "Data Sources Connected",
    },
    {
      icon: ShieldCheck,
      label: "Enterprise Grade Security",
      isIcon: true as const,
    },
    {
      icon: Globe,
      label: "Global Multi-currency Support",
      isIcon: true as const,
    },
    {
      icon: FileCheck2,
      label: "Compliant: PCI DSS, SOC 2, ISO 27001",
      isIcon: true as const,
    },
  ];

  return (
    <section id="stats" className="relative bg-[#030712] px-6 py-24">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2563EB]/[0.03] blur-[80px]" />

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
        {/* Tagline */}
        <p className="mb-14 text-center text-lg text-white/40">
          Traditional reconciliation takes weeks.{" "}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text font-semibold text-transparent">
            ReconArt does it in minutes.
          </span>
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="group flex flex-col items-center gap-3 text-center"
              style={{
                transition: `opacity 0.8s cubic-bezier(.37,0,.63,1) ${i * 120}ms, transform 0.8s cubic-bezier(.37,0,.63,1) ${i * 120}ms`,
                opacity: isInView ? 1 : 0,
                transform: isInView ? "translateY(0)" : "translateY(20px)",
              }}
            >
              {"isIcon" in stat && stat.isIcon ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB]/20 to-[#22C55E]/10">
                  {"icon" in stat && stat.icon && (
                    <stat.icon className="h-6 w-6 text-[#2563EB]" />
                  )}
                </div>
              ) : (
                <div className="relative">
                  <span className="text-4xl font-bold text-white md:text-5xl">
                    {"value" in stat && stat.value}
                  </span>
                  <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                    {"suffix" in stat && stat.suffix}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-white/50 transition-colors group-hover:text-white/70">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================
          LOGO TICKER
          ================================================================ */}
      <div className="mt-20 overflow-hidden border-y border-white/[0.06] bg-[#030712] px-6 py-10">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/20">
          Integrations &amp; Counterparties
        </p>
        <div className="relative mx-auto max-w-[1200px] overflow-hidden">
          {/* Fade edges */}
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-20 bg-gradient-to-r from-[#030712] to-transparent" />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-20 bg-gradient-to-l from-[#030712] to-transparent" />

          {/* Scrolling strip */}
          <div
            className="flex w-max gap-6"
            style={{
              animation: "ticker-scroll-stats 35s linear infinite",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.animationPlayState =
                "paused";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.animationPlayState =
                "running";
            }}
          >
            {[...logoPartners, ...logoPartners].map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.06] bg-[#111827]/60 px-5 py-2.5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-[#2563EB]/20 to-[#22C55E]/10 text-[8px] font-bold text-[#2563EB]">
                  {name.substring(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white/40">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker keyframe */}
      <style>{`
        @keyframes ticker-scroll-stats {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
