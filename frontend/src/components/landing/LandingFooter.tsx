"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import { GitCompareArrows, ExternalLink, Globe, Mail } from "lucide-react";
import Link from "next/link";

/* =========================================================================
   Data
   ========================================================================= */

const footerSections = [
  {
    title: "Quick Links",
    links: [
      { label: "Home", href: "#" },
      { label: "Product", href: "#features" },
      { label: "Services", href: "#services" },
      { label: "Pricing", href: "#pricing" },
      { label: "Resources", href: "#stats" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "Investment Banking", href: "#" },
      { label: "Asset Management", href: "#" },
      { label: "Payment Processing", href: "#" },
      { label: "Insurance", href: "#" },
      { label: "FinTech", href: "#" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "info@reconart.io", href: "mailto:info@reconart.io" },
      { label: "Documentation", href: "#" },
      { label: "Privacy Policy", href: "#" },
    ],
  },
];

const socialIcons = [ExternalLink, Globe, Mail];

/* =========================================================================
   Component
   ========================================================================= */

export default function LandingFooter() {
  const footerRef = useRef<HTMLElement>(null);
  const isInView = useInView(footerRef, { once: true, amount: 0.1 });

  return (
    <footer
      ref={footerRef}
      className="border-t border-white/[0.06] bg-[#030712] px-6 py-16"
    >
      <div
        className="mx-auto max-w-[1200px]"
        style={{
          transition:
            "opacity 1.2s cubic-bezier(.37,0,.63,1), transform 1.2s cubic-bezier(.37,0,.63,1)",
          opacity: isInView ? 1 : 0,
          transform: isInView ? "translateY(0)" : "translateY(24px)",
        }}
      >
        {/* Tagline */}
        <p className="mb-14 text-center text-lg font-medium text-white/30">
          Vendor-agnostic. AI-powered. Reconciliations{" "}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#22C55E] bg-clip-text font-bold text-transparent">
            mastered
          </span>
          .
        </p>

        {/* Columns */}
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-lg shadow-blue-500/25">
                <GitCompareArrows className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                recon<span className="text-[#2563EB]">ART</span>
              </span>
            </Link>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-white/30">
              AI-powered reconciliation platform that automates matching, detects
              anomalies, and delivers real-time operational intelligence for
              financial institutions worldwide.
            </p>
            <div className="flex gap-3">
              {socialIcons.map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-white/30 transition-all hover:border-[#2563EB]/40 hover:text-[#2563EB] hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h4 className="mb-4 text-sm font-semibold text-white/80">
                {section.title}
              </h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-white/30 transition-colors hover:text-white/60"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
          <p className="text-xs text-white/20">
            &copy; 2026 ReconArt. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a
              href="#"
              className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
