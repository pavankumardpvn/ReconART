"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitCompareArrows, ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";

const links = [
  { label: "Product", href: "#features" },
  { label: "Solutions", href: "#integration" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#stats" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#030712]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-2xl shadow-blue-500/5"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-lg shadow-blue-500/25 transition-shadow group-hover:shadow-blue-500/40">
            <GitCompareArrows className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            recon<span className="text-[#2563EB]">ART</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="relative text-sm font-medium text-white/50 transition-colors hover:text-white after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-[#2563EB] after:transition-all hover:after:w-full"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/sign-in" className="text-sm font-medium text-white/50 transition-colors hover:text-white">
            Sign In
          </Link>
          <Link href="/sign-up">
            <button className="inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:-translate-y-0.5">
              Request Demo
              <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>

        <button className="text-white/50 md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-white/[0.06] bg-[#030712]/98 backdrop-blur-2xl md:hidden"
        >
          <div className="flex flex-col gap-1 px-6 py-4">
            {links.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-[#111827] hover:text-white">
                {l.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
              <Link href="/sign-in" onClick={() => setOpen(false)} className="px-3 py-2.5 text-center text-sm text-white/50">Sign In</Link>
              <Link href="/sign-up" onClick={() => setOpen(false)}>
                <button className="w-full rounded-full bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white">Request Demo</button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
