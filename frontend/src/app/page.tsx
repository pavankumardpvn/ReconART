"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  GitCompareArrows,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Database,
  Brain,
  AlertTriangle,
  LineChart,
  Layers,
  Target,
  Eye,
  Check,
  Shield,
  Lock,
  Globe,
  Zap,
  Mail,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) setHasStarted(true);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasStarted]);

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

function useScrollReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

const navLinks = [
  { label: "Product", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#resources" },
];

const valueProps = [
  {
    icon: Layers,
    title: "Vendor-Agnostic",
    description:
      "Connect any data source — ERP, banking core, payment gateway — with zero vendor lock-in. Your data, your rules.",
  },
  {
    icon: Brain,
    title: "AI-Powered Matching",
    description:
      "Intelligent matching engine with configurable rules, fuzzy logic, and ML-driven accuracy that improves over time.",
  },
  {
    icon: Target,
    title: "Hard ROI",
    description:
      "Every deployment targets measurable efficiency gains. No soft promises — you see the numbers from day one.",
  },
  {
    icon: Eye,
    title: "Real-time Visibility",
    description:
      "Live dashboards with match rate trends, exception aging, and operational KPIs — see everything, miss nothing.",
  },
];

const platformFeatures = [
  {
    icon: Database,
    title: "Data Source Management",
    tagline: "Connect, normalize, and manage data from any financial system",
    points: [
      "Multi-format file ingestion (CSV, XLSX, XML, JSON)",
      "Automated schema detection & mapping",
      "Real-time API connections & scheduled imports",
      "Data quality validation & cleansing",
    ],
  },
  {
    icon: Brain,
    title: "Intelligent Matching Engine",
    tagline: "AI-powered transaction matching across unlimited data sources",
    points: [
      "Configurable rule-based matching",
      "Fuzzy matching with ML confidence scoring",
      "Multi-source cross-reconciliation",
      "Batch processing & real-time matching",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Exception Management",
    tagline:
      "Automated detection, classification, and resolution of discrepancies",
    points: [
      "AI severity classification & prioritization",
      "Root cause analysis & pattern detection",
      "Automated routing & escalation workflows",
      "Resolution tracking & audit trails",
    ],
  },
  {
    icon: LineChart,
    title: "Analytics & Reporting",
    tagline:
      "Real-time dashboards and operational intelligence at your fingertips",
    points: [
      "Live match rate & exception dashboards",
      "Trend analysis & predictive insights",
      "Custom KPI tracking & alerts",
      "Compliance & audit report generation",
    ],
  },
];

const steps = [
  {
    title: "Connect Your Data",
    description:
      "Upload files or connect live data sources from any financial system",
  },
  {
    title: "Configure Rules",
    description:
      "Set up matching criteria, validation rules, and exception thresholds",
  },
  {
    title: "Run Reconciliation",
    description:
      "Execute automated matching across all your connected data sources",
  },
  {
    title: "Manage Exceptions",
    description:
      "Review, classify, and resolve discrepancies with AI-powered assistance",
  },
  {
    title: "Analyze & Report",
    description:
      "Track KPIs, generate compliance reports, and optimize performance",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For teams getting started with reconciliation automation",
    features: [
      "Up to 3 data sources",
      "10,000 transactions/month",
      "Basic matching rules",
      "Community support",
      "Standard analytics",
    ],
    cta: "Get Started Free",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$299",
    period: "/month",
    description: "For growing operations that need advanced capabilities",
    features: [
      "Up to 15 data sources",
      "500,000 transactions/month",
      "AI-powered matching",
      "Priority support",
      "Advanced analytics & API",
      "Custom matching rules",
    ],
    cta: "Start Free Trial",
    href: "/sign-up",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large-scale operations with complex requirements",
    features: [
      "Unlimited data sources",
      "Unlimited transactions",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee & SSO",
      "On-premise option",
    ],
    cta: "Contact Sales",
    href: "#",
    highlighted: false,
  },
];

const footerSections = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Integrations", href: "#" },
      { label: "API", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Partners", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "Knowledge Base", href: "#" },
      { label: "Status Page", href: "#" },
      { label: "Security", href: "#" },
      { label: "Privacy Policy", href: "#" },
    ],
  },
];

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const accuracyCounter = useCountUp(999, 2000);
  const txCounter = useCountUp(10, 1500);
  const reductionCounter = useCountUp(85, 1800);
  const integrationsCounter = useCountUp(60, 1600);

  const valueReveal = useScrollReveal();
  const featuresReveal = useScrollReveal();
  const stepsReveal = useScrollReveal();
  const pricingReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) router.push("/dashboard");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) return null;

  const closeMobile = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[var(--background)]/90 backdrop-blur-xl border-b border-[var(--card-border)] shadow-lg shadow-black/20"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/20">
              <GitCompareArrows className="h-5 w-5 text-white" />
            </div>
            <span className="gradient-text text-xl font-bold tracking-tight">
              ReconArt
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Sign In
            </Link>
            <Link href="/sign-up">
              <button className="glow-button inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>

          <button
            className="text-[var(--foreground-muted)] md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={closeMobile}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-[var(--card-border)] pt-4">
                <Link
                  href="/sign-in"
                  onClick={closeMobile}
                  className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                >
                  Sign In
                </Link>
                <Link href="/sign-up" onClick={closeMobile}>
                  <button className="glow-button w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
                    Get Started
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section className="gradient-bg-animated relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

        <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8 text-center animate-float-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-highlight)] bg-[var(--background-secondary)]/60 px-4 py-1.5 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs font-medium text-cyan-400">
              Intelligent Reconciliation Platform
            </span>
          </div>

          <h1 className="text-4xl font-bold tracking-tighter text-[var(--foreground)] sm:text-5xl md:text-7xl">
            Are your reconciliations
            <br />
            actually delivering{" "}
            <span className="gradient-text">ROI</span>?
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-[var(--foreground-muted)] md:text-xl">
            ReconArt combines AI-powered matching, real-time analytics, and
            vendor-agnostic flexibility to transform your reconciliation
            operations — delivering answers in minutes, not months.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Link href="/sign-up">
              <button className="glow-button inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <a href="#features">
              <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-8 py-3.5 text-sm font-semibold text-[var(--foreground)] transition-all hover:border-[var(--border-highlight)] hover:bg-[var(--background-secondary)]">
                Learn More
              </button>
            </a>
          </div>
        </div>

        <a
          href="#stats"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground-muted)]"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </a>
      </section>

      {/* ================================================================
          STATS SECTION
          ================================================================ */}
      <section
        id="stats"
        className="border-y border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-20"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-10 md:grid-cols-4">
          <div
            ref={accuracyCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-4xl font-bold font-mono md:text-5xl">
              {(accuracyCounter.count / 10).toFixed(1)}%
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Match Accuracy
            </span>
          </div>
          <div
            ref={txCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-4xl font-bold font-mono md:text-5xl">
              {txCounter.count}M+
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Transactions Processed
            </span>
          </div>
          <div
            ref={reductionCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-4xl font-bold font-mono md:text-5xl">
              {reductionCounter.count}%
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Reduction in Manual Work
            </span>
          </div>
          <div
            ref={integrationsCounter.ref}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gradient-text text-4xl font-bold font-mono md:text-5xl">
              {integrationsCounter.count}+
            </span>
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              Integrations
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================
          VALUE PROPOSITIONS
          ================================================================ */}
      <section className="bg-[var(--background)] px-6 py-24">
        <div
          ref={valueReveal.ref}
          className={`mx-auto max-w-6xl transition-all duration-700 ${valueReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-4 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Why ReconArt
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            The only platform built{" "}
            <span className="gradient-text">exclusively</span> for
            reconciliation
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-[var(--foreground-muted)]">
            We combine decades of reconciliation expertise with cutting-edge AI
            to deliver a platform that transforms how financial institutions
            operate.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {valueProps.map((prop, i) => (
              <div
                key={prop.title}
                className="glass-card glass-card-hover rounded-2xl p-6 transition-all"
                style={{
                  transitionDelay: `${i * 100}ms`,
                  opacity: valueReveal.isVisible ? 1 : 0,
                  transform: valueReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                  <prop.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
                  {prop.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          PLATFORM FEATURES
          ================================================================ */}
      <section
        id="features"
        className="border-t border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-24"
      >
        <div
          ref={featuresReveal.ref}
          className={`mx-auto max-w-6xl transition-all duration-700 ${featuresReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-4 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Platform Capabilities
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Everything you need to{" "}
            <span className="gradient-text">reconcile at scale</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-[var(--foreground-muted)]">
            A comprehensive platform covering the full reconciliation lifecycle
            — from data ingestion to compliance reporting.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {platformFeatures.map((feature, i) => (
              <div
                key={feature.title}
                className="glass-card glass-card-hover rounded-2xl p-8 transition-all"
                style={{
                  transitionDelay: `${i * 100}ms`,
                  opacity: featuresReveal.isVisible ? 1 : 0,
                  transform: featuresReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                    <feature.icon className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {feature.tagline}
                    </p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                      <span className="text-sm text-[var(--foreground-muted)]">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS
          ================================================================ */}
      <section
        id="how-it-works"
        className="bg-[var(--background)] px-6 py-24"
      >
        <div
          ref={stepsReveal.ref}
          className={`mx-auto max-w-4xl transition-all duration-700 ${stepsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-4 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              How It Works
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Get started in{" "}
            <span className="gradient-text">five simple steps</span>
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-[var(--foreground-muted)]">
            From connecting your first data source to generating compliance
            reports — up and running in minutes.
          </p>

          <div className="relative space-y-8">
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/40 via-purple-500/40 to-transparent md:left-1/2 md:-translate-x-px" />

            {steps.map((step, i) => (
              <div
                key={step.title}
                className={`relative flex items-start gap-6 md:gap-12 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}
                style={{
                  transitionDelay: `${i * 150}ms`,
                  opacity: stepsReveal.isVisible ? 1 : 0,
                  transform: stepsReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                  transition: "all 0.5s ease-out",
                }}
              >
                <div className="flex w-full items-start gap-6 md:w-1/2 md:gap-4">
                  {i % 2 !== 0 && (
                    <div className="hidden md:block md:flex-1" />
                  )}
                  <div className="glass-card glass-card-hover rounded-2xl p-6 flex-1">
                    <h3 className="mb-2 text-base font-semibold text-[var(--foreground)]">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                      {step.description}
                    </p>
                  </div>
                </div>

                <div className="absolute left-0 top-4 z-10 flex h-[47px] w-[47px] items-center justify-center rounded-full border-2 border-cyan-500/40 bg-[var(--background)] font-mono text-sm font-bold text-cyan-400 md:left-1/2 md:-translate-x-1/2">
                  {i + 1}
                </div>

                <div className="hidden w-1/2 md:block" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          TRUST BADGES
          ================================================================ */}
      <section className="border-y border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-12">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4">
          {[
            { icon: Shield, label: "SOC 2 Compliant" },
            { icon: Lock, label: "256-bit Encryption" },
            { icon: Globe, label: "GDPR Ready" },
            { icon: Zap, label: "99.9% SLA" },
          ].map((badge) => (
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
          PRICING
          ================================================================ */}
      <section id="pricing" className="bg-[var(--background)] px-6 py-24">
        <div
          ref={pricingReveal.ref}
          className={`mx-auto max-w-6xl transition-all duration-700 ${pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-4 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Pricing
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Simple,{" "}
            <span className="gradient-text">transparent</span> pricing
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-[var(--foreground-muted)]">
            Start free and scale as your operations grow. No credit card
            required.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {pricingPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 transition-all ${
                  plan.highlighted
                    ? "border-2 border-cyan-500/40 bg-[var(--background-secondary)] shadow-xl shadow-cyan-500/5"
                    : "glass-card glass-card-hover"
                }`}
                style={{
                  transitionDelay: `${i * 100}ms`,
                  opacity: pricingReveal.isVisible ? 1 : 0,
                  transform: pricingReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
                  {plan.name}
                </h3>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[var(--foreground)]">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-sm text-[var(--foreground-muted)]">
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className="mb-8 text-sm text-[var(--foreground-muted)]">
                  {plan.description}
                </p>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                      <span className="text-sm text-[var(--foreground-muted)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className="block">
                  <button
                    className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                      plan.highlighted
                        ? "glow-button text-white"
                        : "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:border-[var(--border-highlight)] hover:bg-[var(--background-tertiary)]"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          QUOTE
          ================================================================ */}
      <section className="border-y border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <blockquote className="mb-6 text-xl font-medium italic leading-relaxed text-[var(--foreground)] md:text-2xl">
            &ldquo;Most teams spend more time managing their reconciliation
            tools than actually reconciling. The right platform should eliminate
            complexity, not add to it.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/40" />
            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              The ReconArt Philosophy
            </span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-500/40" />
          </div>
        </div>
      </section>

      {/* ================================================================
          FINAL CTA
          ================================================================ */}
      <section className="bg-[var(--background)] px-6 py-24">
        <div
          ref={ctaReveal.ref}
          className={`mx-auto flex max-w-3xl flex-col items-center gap-8 text-center transition-all duration-700 ${ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            Ready to transform your{" "}
            <span className="gradient-text">reconciliation operations</span>?
          </h2>
          <p className="max-w-xl text-[var(--foreground-muted)]">
            Join leading financial institutions using ReconArt to automate
            matching, eliminate manual work, and deliver real operational ROI.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link href="/sign-up">
              <button className="glow-button inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <a href="#pricing">
              <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-8 py-3.5 text-sm font-semibold text-[var(--foreground)] transition-all hover:border-[var(--border-highlight)] hover:bg-[var(--background-secondary)]">
                View Pricing
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t border-[var(--card-border)] bg-[var(--background-secondary)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600">
                  <GitCompareArrows className="h-5 w-5 text-white" />
                </div>
                <span className="gradient-text text-xl font-bold tracking-tight">
                  ReconArt
                </span>
              </div>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-[var(--foreground-muted)]">
                AI-powered reconciliation platform that automates matching,
                detects anomalies, and delivers real-time operational
                intelligence for financial institutions.
              </p>
              <div className="flex gap-3">
                {[ExternalLink, Globe, Mail].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] text-[var(--foreground-muted)] transition-all hover:border-[var(--border-highlight)] hover:text-cyan-400"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {footerSections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
                  {section.title}
                </h4>
                <ul className="space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--card-border)] pt-8 sm:flex-row">
            <p className="text-xs text-[var(--foreground-subtle)]">
              &copy; {new Date().getFullYear()} ReconArt. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a
                href="#"
                className="text-xs text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground-muted)]"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-xs text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground-muted)]"
              >
                Terms of Service
              </a>
              <a
                href="#"
                className="text-xs text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground-muted)]"
              >
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
