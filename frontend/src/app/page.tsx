"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  GitCompareArrows,
  AlertTriangle,
  BarChart3,
  Shield,
  Lock,
  Globe,
  Zap,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useCountUp(target: number, duration = 2000, startOnMount = false) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnMount) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !hasStarted) {
            setHasStarted(true);
          }
        },
        { threshold: 0.3 }
      );
      if (ref.current) observer.observe(ref.current);
      return () => observer.disconnect();
    } else {
      setHasStarted(true);
    }
  }, [startOnMount, hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
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
  }, [hasStarted, target, duration]);

  return { count, ref };
}

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

const features = [
  {
    icon: GitCompareArrows,
    title: "Intelligent Matching",
    description:
      "AI-powered transaction matching across multiple data sources with configurable rules and fuzzy logic.",
  },
  {
    icon: AlertTriangle,
    title: "Exception Detection",
    description:
      "Automatically surface anomalies and unmatched items with severity classification and root cause analysis.",
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description:
      "Live dashboards with match rate trends, exception aging, and operational KPIs at your fingertips.",
  },
];

const trustBadges = [
  { icon: Shield, label: "SOC 2 Compliant" },
  { icon: Lock, label: "256-bit Encryption" },
  { icon: Globe, label: "GDPR Ready" },
  { icon: Zap, label: "99.9% SLA" },
];

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  const uptimeCounter = useCountUp(999, 2000);
  const txCounter = useCountUp(10, 1500);
  const securityCounter = useCountUp(256, 1800);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section className="gradient-bg-animated relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Radial glow behind hero */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

        <div className="relative z-10 flex max-w-3xl flex-col items-center gap-8 text-center animate-float-in">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/20">
              <GitCompareArrows className="h-7 w-7 text-white" />
            </div>
            <span className="gradient-text text-3xl font-bold tracking-tight">
              Recon ART
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-bold tracking-tighter text-[var(--foreground)] md:text-7xl">
            Financial Reconciliation,
            <br />
            Powered by{" "}
            <span className="gradient-text">Intelligence</span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-xl text-lg leading-relaxed text-[var(--foreground-muted)]">
            Automate matching, detect anomalies, and reconcile transactions
            across your financial systems with AI-driven precision and real-time
            visibility.
          </p>

          {/* CTAs */}
          <div className="flex gap-4">
            <Link href="/sign-up">
              <button className="glow-button inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <a href="#features">
              <Button
                variant="outline"
                className="rounded-xl border-[var(--border)] bg-transparent px-8 py-3 text-[var(--foreground)] hover:border-[var(--border-highlight)] hover:bg-[var(--background-secondary)]"
              >
                Learn More
              </Button>
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <a
          href="#features"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground-muted)]"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </a>
      </section>

      {/* ================================================================
          FEATURES SECTION
          ================================================================ */}
      <section
        id="features"
        className="relative border-t border-[var(--card-border)] bg-[var(--background)] px-6 py-24"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Built for{" "}
            <span className="gradient-text">Modern Finance</span>
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-[var(--foreground-muted)]">
            Everything you need to automate and monitor your reconciliation
            workflows at scale.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="glass-card glass-card-hover animate-fade-in-up rounded-2xl p-6 transition-all"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                  <feature.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          STATS COUNTER SECTION
          ================================================================ */}
      <section className="border-y border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-20">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 md:grid-cols-3">
          <div
            ref={uptimeCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-5xl font-bold font-mono">
              {(uptimeCounter.count / 10).toFixed(1)}%
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Uptime
            </span>
          </div>
          <div
            ref={txCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-5xl font-bold font-mono">
              {txCounter.count}M+
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Transactions Processed
            </span>
          </div>
          <div
            ref={securityCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-5xl font-bold font-mono">
              {securityCounter.count}-bit
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Bank-Grade Security
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================
          TRUST SECTION
          ================================================================ */}
      <section className="bg-[var(--background)] px-6 py-20">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4">
          {trustBadges.map((badge) => (
            <div
              key={badge.label}
              className="glass-card flex items-center gap-2 rounded-full px-5 py-2.5 text-sm text-[var(--foreground-muted)]"
            >
              <badge.icon className="h-4 w-4 text-cyan-400" />
              {badge.label}
            </div>
          ))}
        </div>
      </section>

      {/* ================================================================
          CTA SECTION
          ================================================================ */}
      <section className="border-t border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Ready to automate your{" "}
            <span className="gradient-text">reconciliation</span>?
          </h2>
          <p className="text-[var(--foreground-muted)]">
            Start free and scale as your operations grow. No credit card
            required.
          </p>
          <div className="flex gap-4">
            <Link href="/sign-in">
              <button className="glow-button inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all">
                Sign In
              </button>
            </Link>
            <Link href="/sign-up">
              <Button
                variant="outline"
                className="rounded-xl border-[var(--border)] bg-transparent px-8 py-3 text-[var(--foreground)] hover:border-[var(--border-highlight)] hover:bg-[var(--background-secondary)]"
              >
                Sign Up
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] bg-[var(--background)] px-6 py-8">
        <p className="text-center text-xs text-[var(--foreground-subtle)]">
          &copy; {new Date().getFullYear()} Recon ART. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
