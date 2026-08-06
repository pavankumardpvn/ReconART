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
  Sparkles,
  Search,
  Clock,
} from "lucide-react";
import Link from "next/link";

/* =========================================================================
   Hooks
   ========================================================================= */

function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

function useCountUp(target: number, duration: number, shouldStart: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shouldStart) return;
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
  }, [shouldStart, target, duration]);

  return count;
}

/* =========================================================================
   Data
   ========================================================================= */

const navLinks = [
  { label: "Home", href: "#" },
  { label: "Product", href: "#advantages" },
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#results" },
];

const advantages = [
  {
    icon: Sparkles,
    title: "AI-Powered Matching",
    description:
      "Our proprietary AI engine identifies matching patterns and anomalies that traditional rule-based systems miss entirely.",
  },
  {
    icon: Layers,
    title: "Vendor-Agnostic Platform",
    description:
      "Connect any data source — ERP, banking core, payment gateway — with zero vendor lock-in. Your data, your rules.",
  },
  {
    icon: Zap,
    title: "Free Tier Available",
    description:
      "Start with our free plan to audit your reconciliation landscape. No credit card, no commitment, just clarity.",
  },
  {
    icon: Search,
    title: "Deep Data Intelligence",
    description:
      "60+ integrations and automated schema detection mean your data flows seamlessly from any source into actionable insights.",
  },
  {
    icon: Clock,
    title: "Reconciliation in Minutes",
    description:
      "Our pre-built matching templates and AI-driven rule suggestions collapse weeks of setup into minutes.",
  },
  {
    icon: Target,
    title: "Hard ROI, No Soft Promises",
    description:
      "Every deployment delivers measurable outcomes — from reduced manual effort to optimized match rates. Your bottom line is our focus.",
  },
];

const services = [
  {
    num: "01",
    title: "Data Sources",
    description:
      "Connect, normalize, and manage data from any financial system with automated schema detection and real-time sync.",
    cta: "Connect Data",
  },
  {
    num: "02",
    title: "Matching Engine",
    description:
      "AI-powered transaction matching with configurable rules, fuzzy logic, and ML-driven confidence scoring.",
    cta: "Configure Matching",
  },
  {
    num: "03",
    title: "Exception Management",
    description:
      "Automated detection, severity classification, and resolution workflows for every discrepancy.",
    cta: "Manage Exceptions",
  },
  {
    num: "04",
    title: "Analytics & Reporting",
    description:
      "Real-time dashboards, trend analysis, and operational KPIs to drive continuous improvement.",
    cta: "View Analytics",
  },
  {
    num: "05",
    title: "Automation",
    description:
      "Scheduled reconciliations, automated alerts, and workflow triggers that eliminate manual intervention.",
    cta: "Automate Now",
  },
  {
    num: "06",
    title: "Compliance & Audit",
    description:
      "Complete audit trails, regulatory reporting, and governance frameworks built into every workflow.",
    cta: "Ensure Compliance",
  },
];

const caseStudies = [
  {
    title: "Global Payment Processor",
    description:
      "Automated matching of 2M+ daily transactions across 15 payment channels, reducing exception handling time by 85%.",
  },
  {
    title: "Investment Management Firm",
    description:
      "End-to-end trade reconciliation transformation across all asset classes, achieving 99.9% match accuracy within 30 days.",
  },
  {
    title: "Digital Banking Platform",
    description:
      "Real-time transaction reconciliation for a neo-bank processing 500K+ daily transactions with zero manual intervention.",
  },
  {
    title: "Insurance Group",
    description:
      "Multi-entity premium reconciliation across 8 business units, eliminating month-end bottlenecks and ensuring regulatory compliance.",
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
    title: "Quick Links",
    links: [
      { label: "Home", href: "#" },
      { label: "Product", href: "#advantages" },
      { label: "Services", href: "#services" },
      { label: "Pricing", href: "#pricing" },
      { label: "Resources", href: "#results" },
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

/* =========================================================================
   Page Component
   ========================================================================= */

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Stats — single section-level trigger so all counters start together on scroll
  const statsReveal = useScrollReveal(0.3);
  const accuracyCount = useCountUp(999, 2000, statsReveal.isVisible);
  const txCount = useCountUp(10, 1500, statsReveal.isVisible);
  const reductionCount = useCountUp(85, 1800, statsReveal.isVisible);
  const integrationsCount = useCountUp(60, 1600, statsReveal.isVisible);

  // Section reveals
  const advantagesReveal = useScrollReveal();
  const servicesReveal = useScrollReveal();
  const resultsReveal = useScrollReveal();
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
    <div className="min-h-screen bg-[#0F1729] text-white font-[var(--font-geist-sans)]">
      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#0F1729]/95 backdrop-blur-xl border-b border-[#2f3c5b]/50 shadow-lg shadow-black/30"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7C3AED] shadow-lg shadow-[#7C3AED]/20">
              <GitCompareArrows className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              ReconArt
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-white/70 transition-colors hover:text-white hover:underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              Sign In
            </Link>
            <Link href="/sign-up">
              <button className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0F1729] transition-all hover:bg-white/90 hover:shadow-lg hover:shadow-white/10">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>

          <button
            className="text-white/70 md:hidden"
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
          <div className="border-t border-[#2f3c5b]/50 bg-[#0F1729]/98 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={closeMobile}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-[#1a243a] hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-[#2f3c5b]/50 pt-4">
                <Link
                  href="/sign-in"
                  onClick={closeMobile}
                  className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/70"
                >
                  Sign In
                </Link>
                <Link href="/sign-up" onClick={closeMobile}>
                  <button className="w-full rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0F1729]">
                    Start Free Trial
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
      <section className="relative flex min-h-screen items-center overflow-hidden px-6 pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(124,58,237,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.06)_0%,transparent_70%)]" />

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left — Text */}
          <div className="flex flex-col gap-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#1a243a]/60 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
              <span className="text-xs font-medium text-[#9D5CF5]">
                Intelligent Reconciliation Platform
              </span>
            </div>

            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Are your reconciliations actually delivering{" "}
              <span className="text-[#7C3AED]">ROI</span>?
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-white/60">
              ReconArt is the only platform that combines AI-powered matching,
              real-time analytics, and vendor-agnostic flexibility — delivering
              answers in minutes, not months.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href="/sign-up">
                <button className="inline-flex items-center gap-2 rounded-full bg-[#7C3AED] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#6D28D9] hover:shadow-lg hover:shadow-[#7C3AED]/30">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <a href="#advantages">
                <button className="inline-flex items-center gap-2 rounded-full border border-[#9D5CF5] bg-transparent px-8 py-3.5 text-sm font-semibold text-[#9D5CF5] transition-all hover:bg-[#9D5CF5]/10">
                  Learn More
                </button>
              </a>
            </div>
          </div>

          {/* Right — Platform Card */}
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-[#2f3c5b] bg-[#1a243a] p-8 shadow-2xl shadow-[#7C3AED]/5">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED]/20">
                  <GitCompareArrows className="h-5 w-5 text-[#7C3AED]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    ReconArt Platform
                  </h3>
                  <p className="text-xs text-white/40">
                    Reconciliation Intelligence
                  </p>
                </div>
              </div>

              <div className="mb-6 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#14B8A6]">
                  Core Features
                </p>
                {[
                  "Multi-source transaction matching",
                  "AI-powered exception detection",
                  "Real-time analytics dashboards",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 py-1.5 text-sm text-white/70"
                  >
                    <Check className="h-3.5 w-3.5 text-[#14B8A6]" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mb-6 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9D5CF5]">
                  Advanced
                </p>
                {[
                  "ML confidence scoring",
                  "Automated compliance workflows",
                  "Custom ROI reporting",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 py-1.5 text-sm text-white/70"
                  >
                    <Check className="h-3.5 w-3.5 text-[#9D5CF5]" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-[#0F1729] px-4 py-3 text-center">
                <span className="text-xs text-white/40">Match Rate</span>
                <div className="text-2xl font-bold text-[#7C3AED]">99.9%</div>
              </div>
            </div>
          </div>
        </div>

        <a
          href="#stats"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 transition-colors hover:text-white/60"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </a>
      </section>

      {/* ================================================================
          STATS SECTION
          ================================================================ */}
      <section id="stats" className="border-y border-[#2f3c5b]/40 bg-[#0F1729] px-6 py-20">
        <div
          ref={statsReveal.ref}
          className="mx-auto max-w-[1200px]"
        >
          <p className="mb-12 text-center text-lg text-white/50">
            Traditional reconciliation takes weeks.{" "}
            <span className="text-[#9D5CF5] font-medium">
              ReconArt does it in minutes.
            </span>
          </p>

          <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-4xl font-bold text-white md:text-5xl">
                {(accuracyCount / 10).toFixed(1)}
                <span className="text-[#7C3AED]">%</span>
              </span>
              <span className="text-sm font-medium text-white/50">
                Match Accuracy
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-4xl font-bold text-white md:text-5xl">
                {txCount}
                <span className="text-[#7C3AED]">M+</span>
              </span>
              <span className="text-sm font-medium text-white/50">
                Transactions Processed
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-4xl font-bold text-white md:text-5xl">
                {reductionCount}
                <span className="text-[#7C3AED]">%</span>
              </span>
              <span className="text-sm font-medium text-white/50">
                Reduction in Manual Work
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-4xl font-bold text-white md:text-5xl">
                {integrationsCount}
                <span className="text-[#7C3AED]">+</span>
              </span>
              <span className="text-sm font-medium text-white/50">
                Integrations
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          ADVANTAGES
          ================================================================ */}
      <section id="advantages" className="bg-[#0F1729] px-6 py-24">
        <div
          ref={advantagesReveal.ref}
          className={`mx-auto max-w-[1200px] transition-all duration-700 ${advantagesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            The ReconArt <span className="text-[#7C3AED]">Advantage</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/50">
            Our platform delivers what traditional reconciliation tools
            can&apos;t — speed, intelligence, and complete transparency.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {advantages.map((item, i) => (
              <div
                key={item.title}
                className="rounded-3xl border-l-[3px] border-l-[#7C3AED] bg-[#1a243a] p-7 transition-all duration-300 hover:shadow-lg hover:shadow-[#7C3AED]/10"
                style={{
                  transitionDelay: `${i * 80}ms`,
                  opacity: advantagesReveal.isVisible ? 1 : 0,
                  transform: advantagesReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#7C3AED]/15">
                  <item.icon className="h-5 w-5 text-[#7C3AED]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          SERVICES
          ================================================================ */}
      <section id="services" className="bg-[#0F1729] px-6 py-24">
        <div
          ref={servicesReveal.ref}
          className={`mx-auto max-w-[1200px] transition-all duration-700 ${servicesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            Our Specialized{" "}
            <span className="text-[#7C3AED]">Services</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/50">
            A comprehensive reconciliation platform covering the full lifecycle
            — from data ingestion to compliance reporting.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, i) => (
              <div
                key={service.num}
                className="group rounded-3xl border border-[#2f3c5b] bg-[#1a243a] p-7 transition-all duration-300 hover:border-[#7C3AED]/40 hover:shadow-lg hover:shadow-[#7C3AED]/10"
                style={{
                  transitionDelay: `${i * 80}ms`,
                  opacity: servicesReveal.isVisible ? 1 : 0,
                  transform: servicesReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                <span className="mb-3 block text-3xl font-bold text-[#7C3AED]/30">
                  {service.num}
                </span>
                <h3 className="mb-3 text-xl font-semibold text-white">
                  {service.title}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-white/50">
                  {service.description}
                </p>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#9D5CF5] transition-colors hover:text-[#7C3AED]"
                >
                  {service.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          RESULTS / CASE STUDIES
          ================================================================ */}
      <section id="results" className="bg-[#0F1729] px-6 py-24">
        <div
          ref={resultsReveal.ref}
          className={`mx-auto max-w-[1200px] transition-all duration-700 ${resultsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            Proven <span className="text-[#7C3AED]">Results</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/50">
            Trusted by financial institutions across banking, payments,
            insurance, and asset management.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {caseStudies.map((study, i) => (
              <div
                key={study.title}
                className="rounded-3xl border border-[#2f3c5b] bg-[#1a243a] p-8 transition-all duration-300 hover:border-[#7C3AED]/40 hover:shadow-lg hover:shadow-[#7C3AED]/10"
                style={{
                  transitionDelay: `${i * 100}ms`,
                  opacity: resultsReveal.isVisible ? 1 : 0,
                  transform: resultsReveal.isVisible
                    ? "translateY(0)"
                    : "translateY(20px)",
                }}
              >
                <h3 className="mb-3 text-xl font-semibold text-white">
                  {study.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50">
                  {study.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          PRICING
          ================================================================ */}
      <section id="pricing" className="bg-[#0F1729] px-6 py-24">
        <div
          ref={pricingReveal.ref}
          className={`mx-auto max-w-[1200px] transition-all duration-700 ${pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            Simple, <span className="text-[#7C3AED]">Transparent</span> Pricing
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/50">
            Start free and scale as your operations grow. No credit card
            required.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {pricingPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative rounded-3xl p-8 transition-all duration-300 ${
                  plan.highlighted
                    ? "border-2 border-[#7C3AED] bg-[#1a243a] shadow-xl shadow-[#7C3AED]/10"
                    : "border border-[#2f3c5b] bg-[#1a243a] hover:border-[#7C3AED]/40"
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
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#7C3AED] px-4 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {plan.name}
                </h3>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-sm text-white/40">{plan.period}</span>
                  )}
                </div>
                <p className="mb-8 text-sm text-white/50">{plan.description}</p>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#14B8A6]" />
                      <span className="text-sm text-white/60">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className="block">
                  <button
                    className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition-all ${
                      plan.highlighted
                        ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9] hover:shadow-lg hover:shadow-[#7C3AED]/30"
                        : "border border-[#9D5CF5] bg-transparent text-[#9D5CF5] hover:bg-[#9D5CF5]/10"
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
          CTA SECTION
          ================================================================ */}
      <section className="px-6 py-24">
        <div
          ref={ctaReveal.ref}
          className={`mx-auto max-w-[1200px] rounded-3xl bg-[#9D5CF5] px-8 py-20 text-center transition-all duration-700 ${ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Ready to find out what your reconciliations are really costing you?
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-white/80">
            Join leading financial institutions using ReconArt to automate
            matching, eliminate manual work, and deliver real operational ROI.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/sign-up">
              <button className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#0F1729] transition-all hover:bg-white/90 hover:shadow-lg">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <a href="#pricing">
              <button className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-transparent px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10">
                View Pricing
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t border-[#2f3c5b]/40 bg-[#0F1729] px-6 py-16">
        <div className="mx-auto max-w-[1200px]">
          <p className="mb-12 text-center text-lg font-medium text-white/50">
            Vendor-agnostic. AI-powered. Reconciliations{" "}
            <span className="text-[#7C3AED]">mastered</span>.
          </p>

          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7C3AED]">
                  <GitCompareArrows className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  ReconArt
                </span>
              </div>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-white/40">
                AI-powered reconciliation platform that automates matching,
                detects anomalies, and delivers real-time operational
                intelligence for financial institutions.
              </p>
              <div className="flex gap-3">
                {[ExternalLink, Globe, Mail].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2f3c5b] text-white/40 transition-all hover:border-[#7C3AED]/40 hover:text-[#9D5CF5]"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {footerSections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-4 text-sm font-semibold text-white">
                  {section.title}
                </h4>
                <ul className="space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-white/40 transition-colors hover:text-white/70"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#2f3c5b]/40 pt-8 sm:flex-row">
            <p className="text-xs text-white/30">
              &copy; {new Date().getFullYear()} ReconArt. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a
                href="#"
                className="text-xs text-white/30 transition-colors hover:text-white/50 hover:underline"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-xs text-white/30 transition-colors hover:text-white/50 hover:underline"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
