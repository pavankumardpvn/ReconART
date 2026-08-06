"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import { Star } from "lucide-react";

/* =========================================================================
   Data
   ========================================================================= */

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  company: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "ReconArt reduced our reconciliation time by 85%. What used to take weeks now happens in minutes.",
    name: "Sarah Chen",
    title: "VP Operations",
    company: "Global Payments Corp",
    initials: "SC",
  },
  {
    quote:
      "The multi-currency matching is exceptional. We reconcile across 50+ countries seamlessly.",
    name: "Rajesh Kumar",
    title: "CFO",
    company: "Digital Banking Solutions",
    initials: "RK",
  },
  {
    quote:
      "Finally, a platform that understands enterprise reconciliation. The AI matching accuracy is remarkable.",
    name: "Michael Torres",
    title: "Head of Finance",
    company: "PayNet Systems",
    initials: "MT",
  },
];

/* =========================================================================
   Component
   ========================================================================= */

export default function Testimonials() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.1 });

  return (
    <section className="relative bg-[#030712] px-6 py-28">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-[20%] top-[30%] h-[400px] w-[400px] rounded-full bg-[#2563EB]/[0.03] blur-[80px]" />
      <div className="pointer-events-none absolute bottom-[20%] right-[10%] h-[300px] w-[300px] rounded-full bg-[#22C55E]/[0.02] blur-[80px]" />

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
            Testimonials
          </span>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#2563EB]/50" />
        </div>
        <h2 className="mb-5 text-center text-3xl font-bold tracking-tight text-white md:text-5xl">
          Trusted by{" "}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text text-transparent">
            Industry Leaders
          </span>
        </h2>
        <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
          See why leading financial institutions choose ReconArt for their
          reconciliation operations.
        </p>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827]/50 p-8 backdrop-blur-xl transition-all duration-[400ms] hover:-translate-y-1 hover:border-[#2563EB]/30 hover:shadow-[0_0_40px_rgba(37,99,235,0.06),0_20px_60px_rgba(0,0,0,0.3)]"
              style={{
                transition: `opacity 0.8s cubic-bezier(.37,0,.63,1) ${i * 200}ms, transform 0.8s cubic-bezier(.37,0,.63,1) ${i * 200}ms`,
                opacity: isInView ? 1 : 0,
                transform: isInView ? "translateY(0)" : "translateY(30px)",
              }}
            >
              {/* Hover glow top line */}
              <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#2563EB] to-transparent opacity-0 transition-opacity duration-[400ms] group-hover:opacity-100" />

              {/* Quote */}
              <p className="mb-6 text-[15px] leading-relaxed text-white/70">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Stars */}
              <div className="mb-6 flex gap-1">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star
                    key={s}
                    className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]"
                  />
                ))}
              </div>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-xs font-bold text-white shadow-lg shadow-blue-500/25">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/40">
                    {t.title}, {t.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
