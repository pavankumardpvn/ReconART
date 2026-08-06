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
  Star,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

/* =========================================================================
   Hooks
   ========================================================================= */

function useScrollReveal(threshold = 0.1) {
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

function itemReveal(isVisible: boolean, i: number, stagger = 200): React.CSSProperties {
  const delay = i * stagger;
  return {
    transition: `opacity 1.2s cubic-bezier(.37,0,.63,1) ${delay}ms, transform 1.2s cubic-bezier(.37,0,.63,1) ${delay}ms`,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(30px)",
  };
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
    icon: Database,
    title: "Data Sources",
    description:
      "Connect, normalize, and manage data from any financial system with automated schema detection and real-time sync.",
    cta: "Connect Data",
  },
  {
    num: "02",
    icon: Brain,
    title: "Matching Engine",
    description:
      "AI-powered transaction matching with configurable rules, fuzzy logic, and ML-driven confidence scoring.",
    cta: "Configure Matching",
  },
  {
    num: "03",
    icon: AlertTriangle,
    title: "Exception Management",
    description:
      "Automated detection, severity classification, and resolution workflows for every discrepancy.",
    cta: "Manage Exceptions",
  },
  {
    num: "04",
    icon: LineChart,
    title: "Analytics & Reporting",
    description:
      "Real-time dashboards, trend analysis, and operational KPIs to drive continuous improvement.",
    cta: "View Analytics",
  },
  {
    num: "05",
    icon: Clock,
    title: "Automation",
    description:
      "Scheduled reconciliations, automated alerts, and workflow triggers that eliminate manual intervention.",
    cta: "Automate Now",
  },
  {
    num: "06",
    icon: Shield,
    title: "Compliance & Audit",
    description:
      "Complete audit trails, regulatory reporting, and governance frameworks built into every workflow.",
    cta: "Ensure Compliance",
  },
];

const caseStudies = [
  {
    title: "Global Payment Processor",
    stat: "85%",
    statLabel: "Faster Exception Handling",
    description:
      "Automated matching of 2M+ daily transactions across 15 payment channels, reducing exception handling time by 85%.",
  },
  {
    title: "Investment Management Firm",
    stat: "99.9%",
    statLabel: "Match Accuracy",
    description:
      "End-to-end trade reconciliation transformation across all asset classes, achieving 99.9% match accuracy within 30 days.",
  },
  {
    title: "Digital Banking Platform",
    stat: "500K+",
    statLabel: "Daily Transactions",
    description:
      "Real-time transaction reconciliation for a neo-bank processing 500K+ daily transactions with zero manual intervention.",
  },
  {
    title: "Insurance Group",
    stat: "8",
    statLabel: "Business Units",
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

  const statsReveal = useScrollReveal(0.2);
  const accuracyCount = useCountUp(999, 2800, statsReveal.isVisible);
  const txCount = useCountUp(10, 2200, statsReveal.isVisible);
  const reductionCount = useCountUp(85, 2500, statsReveal.isVisible);
  const integrationsCount = useCountUp(60, 2300, statsReveal.isVisible);

  const advantagesReveal = useScrollReveal(0.05);
  const servicesReveal = useScrollReveal(0.05);
  const resultsReveal = useScrollReveal(0.05);
  const pricingReveal = useScrollReveal(0.05);
  const ctaReveal = useScrollReveal(0.05);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) router.push("/dashboard");
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && isSignedIn) return null;

  const closeMobile = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#0F1729] text-white font-[var(--font-geist-sans)] overflow-x-hidden">
      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-[#0F1729]/80 backdrop-blur-2xl border-b border-[#7C3AED]/10 shadow-2xl shadow-[#7C3AED]/5"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] shadow-lg shadow-[#7C3AED]/25 transition-shadow group-hover:shadow-[#7C3AED]/40">
              <GitCompareArrows className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Recon<span className="text-[#9D5CF5]">Art</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="relative text-sm font-medium text-white/60 transition-colors hover:text-white after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-[#7C3AED] after:transition-all hover:after:w-full"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              Sign In
            </Link>
            <Link href="/sign-up">
              <button className="landing-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>

          <button
            className="text-white/60 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#7C3AED]/10 bg-[#0F1729]/98 backdrop-blur-2xl md:hidden">
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a key={link.label} href={link.href} onClick={closeMobile} className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-[#1a243a] hover:text-white">
                  {link.label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-[#2f3c5b]/50 pt-4">
                <Link href="/sign-in" onClick={closeMobile} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/60">Sign In</Link>
                <Link href="/sign-up" onClick={closeMobile}>
                  <button className="landing-btn-primary w-full rounded-full px-5 py-2.5 text-sm font-semibold text-white">Start Free Trial</button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section className="landing-hero-bg relative flex min-h-screen items-center overflow-hidden px-6 pt-20">
        {/* Decorative orbs */}
        <div className="landing-glow-orb animate-float left-[10%] top-[20%] h-[400px] w-[400px] bg-[#7C3AED]/[0.04]" />
        <div className="landing-glow-orb animate-float left-[60%] top-[60%] h-[350px] w-[350px] bg-[#14B8A6]/[0.03]" style={{ animationDelay: "3s" }} />
        <div className="landing-glow-orb left-[80%] top-[10%] h-[200px] w-[200px] bg-[#9D5CF5]/[0.05]" />

        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left — Text */}
          <div className="flex flex-col gap-8">
            <div
              className="animate-fade-in-up inline-flex w-fit items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/[0.08] px-4 py-2 backdrop-blur-sm"
              style={{ animationDelay: "0.1s" }}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#9D5CF5]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9D5CF5]">
                Intelligent Reconciliation Platform
              </span>
            </div>

            <h1
              className="animate-fade-in-up text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem]"
              style={{ animationDelay: "0.3s" }}
            >
              Are your reconciliations
              <br />
              actually delivering{" "}
              <span className="landing-gradient-text">ROI</span>?
            </h1>

            <p
              className="animate-fade-in-up max-w-lg text-lg leading-relaxed text-white/50"
              style={{ animationDelay: "0.5s" }}
            >
              ReconArt is the only platform that combines AI-powered matching,
              real-time analytics, and vendor-agnostic flexibility — delivering
              answers in minutes, not months.
            </p>

            <div
              className="animate-fade-in-up flex flex-col gap-4 sm:flex-row"
              style={{ animationDelay: "0.7s" }}
            >
              <Link href="/sign-up">
                <button className="landing-btn-primary inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <a href="#advantages">
                <button className="inline-flex items-center gap-2 rounded-full border border-[#9D5CF5]/40 bg-[#9D5CF5]/[0.06] px-8 py-4 text-sm font-semibold text-[#9D5CF5] backdrop-blur-sm transition-all hover:bg-[#9D5CF5]/15 hover:border-[#9D5CF5]/60">
                  Learn More
                  <ChevronDown className="h-4 w-4" />
                </button>
              </a>
            </div>

            {/* Trust strip */}
            <div
              className="animate-fade-in-up flex items-center gap-6 pt-4"
              style={{ animationDelay: "0.9s" }}
            >
              <div className="flex -space-x-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0F1729] bg-gradient-to-br from-[#7C3AED]/40 to-[#14B8A6]/40 text-[10px] font-bold text-white/80">
                    {["JP", "GS", "DB", "UB"][i]}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                ))}
                <span className="ml-2 text-xs text-white/40">Trusted by 60+ institutions</span>
              </div>
            </div>
          </div>

          {/* Right — Platform Card */}
          <div
            className="animate-fade-in-up hidden lg:block"
            style={{ animationDelay: "0.6s" }}
          >
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#7C3AED]/10 to-[#14B8A6]/5 blur-2xl" />

              <div className="landing-card landing-card-glow relative rounded-3xl p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#14B8A6]/20">
                      <GitCompareArrows className="h-5 w-5 text-[#9D5CF5]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">ReconArt Platform</h3>
                      <p className="text-xs text-white/30">Reconciliation Intelligence</p>
                    </div>
                  </div>
                  <div className="flex h-2 w-2 rounded-full bg-[#10b981] shadow-lg shadow-[#10b981]/50">
                    <div className="h-2 w-2 animate-ping rounded-full bg-[#10b981]" />
                  </div>
                </div>

                <div className="mb-5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#14B8A6]">Core Features</p>
                  {["Multi-source transaction matching", "AI-powered exception detection", "Real-time analytics dashboards"].map((item) => (
                    <div key={item} className="flex items-center gap-2.5 rounded-lg py-2 text-sm text-white/60 transition-colors hover:text-white/80">
                      <Check className="h-3.5 w-3.5 text-[#14B8A6]" />
                      {item}
                    </div>
                  ))}
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9D5CF5]">Advanced</p>
                  {["ML confidence scoring", "Automated compliance workflows", "Custom ROI reporting"].map((item) => (
                    <div key={item} className="flex items-center gap-2.5 rounded-lg py-2 text-sm text-white/60 transition-colors hover:text-white/80">
                      <Check className="h-3.5 w-3.5 text-[#9D5CF5]" />
                      {item}
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1729] to-[#1a243a] p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED]/5 to-[#14B8A6]/5" />
                  <span className="relative text-xs font-medium text-white/40">Match Rate</span>
                  <div className="relative text-3xl font-bold tracking-tight">
                    <span className="landing-gradient-text">99.9%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <a href="#stats" className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20 transition-colors hover:text-white/50">
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </a>
      </section>

      {/* Gradient divider */}
      <div className="section-divider" />

      {/* ================================================================
          STATS SECTION
          ================================================================ */}
      <section id="stats" className="relative bg-[#0c1220] px-6 py-24">
        <div className="landing-glow-orb left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 bg-[#7C3AED]/[0.03]" />
        <div
          ref={statsReveal.ref}
          className={`relative mx-auto max-w-[1200px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <p className="mb-14 text-center text-lg text-white/40">
            Traditional reconciliation takes weeks.{" "}
            <span className="landing-gradient-text font-semibold">ReconArt does it in minutes.</span>
          </p>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { val: (accuracyCount / 10).toFixed(1), suffix: "%", label: "Match Accuracy", icon: Check },
              { val: txCount, suffix: "M+", label: "Transactions Processed", icon: Database },
              { val: reductionCount, suffix: "%", label: "Reduction in Manual Work", icon: Clock },
              { val: integrationsCount, suffix: "+", label: "Integrations", icon: Layers },
            ].map((stat, i) => (
              <div key={stat.label} className="group flex flex-col items-center gap-4 text-center" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(124,58,237,0.08)" strokeWidth="3" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="url(#statGrad)" strokeWidth="3" strokeLinecap="round"
                      strokeDasharray="276" strokeDashoffset={statsReveal.isVisible ? 276 * (1 - Math.min((typeof stat.val === 'string' ? parseFloat(stat.val) : stat.val) / 100, 1)) : 276}
                      style={{ transition: 'stroke-dashoffset 2.5s cubic-bezier(.37,0,.63,1)' }} />
                    <defs><linearGradient id="statGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#14B8A6" /></linearGradient></defs>
                  </svg>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-bold text-white md:text-3xl">
                      {stat.val}<span className="landing-gradient-text">{stat.suffix}</span>
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-white/50 transition-colors group-hover:text-white/70">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          ADVANTAGES
          ================================================================ */}
      <section id="advantages" className="relative bg-[#0F1729] px-6 py-28">
        <div className="landing-glow-orb right-0 top-0 h-[400px] w-[400px] bg-[#7C3AED]/[0.03]" />
        <div
          ref={advantagesReveal.ref}
          className={`relative mx-auto max-w-[1200px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${advantagesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">Why ReconArt</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            The ReconArt <span className="landing-gradient-text">Advantage</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            Our platform delivers what traditional reconciliation tools can&apos;t — speed, intelligence, and complete transparency.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {advantages.map((item, i) => (
              <div
                key={item.title}
                className="landing-card landing-card-glow group relative rounded-2xl p-7 pl-9"
                style={itemReveal(advantagesReveal.isVisible, i)}
              >
                <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-[#7C3AED] to-[#14B8A6] opacity-40 transition-opacity group-hover:opacity-100" />
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10 transition-all group-hover:shadow-lg group-hover:shadow-[#7C3AED]/20">
                  <item.icon className="h-5 w-5 text-[#9D5CF5] transition-colors group-hover:text-[#7C3AED]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-white/50">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          SERVICES
          ================================================================ */}
      <section id="services" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb left-0 bottom-0 h-[400px] w-[400px] bg-[#14B8A6]/[0.03]" />
        <div
          ref={servicesReveal.ref}
          className={`relative mx-auto max-w-[1200px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${servicesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">Platform</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            Our Specialized <span className="landing-gradient-text">Services</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            A comprehensive reconciliation platform covering the full lifecycle — from data ingestion to compliance reporting.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, i) => (
              <div
                key={service.num}
                className="landing-card landing-card-glow group rounded-2xl p-7"
                style={itemReveal(servicesReveal.isVisible, i)}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-3xl font-bold text-[#7C3AED]/20">{service.num}</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#7C3AED]/[0.08] transition-colors group-hover:bg-[#7C3AED]/15">
                    <service.icon className="h-5 w-5 text-[#9D5CF5]/70 transition-colors group-hover:text-[#9D5CF5]" />
                  </div>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-white">{service.title}</h3>
                <p className="mb-6 text-sm leading-relaxed text-white/40">{service.description}</p>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#9D5CF5] transition-all hover:text-white hover:gap-3"
                >
                  {service.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          RESULTS / CASE STUDIES
          ================================================================ */}
      <section id="results" className="relative bg-[#0F1729] px-6 py-28">
        <div
          ref={resultsReveal.ref}
          className={`relative mx-auto max-w-[1200px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${resultsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">Case Studies</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            Proven <span className="landing-gradient-text">Results</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            Trusted by financial institutions across banking, payments, insurance, and asset management.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {caseStudies.map((study, i) => (
              <div
                key={study.title}
                className="landing-card landing-card-glow group rounded-2xl overflow-hidden"
                style={itemReveal(resultsReveal.isVisible, i)}
              >
                <div className="flex items-center gap-5 border-b border-[#7C3AED]/10 bg-gradient-to-r from-[#7C3AED]/[0.06] to-transparent px-8 py-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10">
                    <span className="text-lg font-bold text-white">{study.stat}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{study.statLabel}</p>
                    <p className="text-xs text-white/40">{study.title}</p>
                  </div>
                  <TrendingUp className="ml-auto h-5 w-5 text-[#14B8A6]/30 transition-colors group-hover:text-[#14B8A6]" />
                </div>
                <div className="px-8 py-6">
                  <p className="text-sm leading-relaxed text-white/50">{study.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          PRICING
          ================================================================ */}
      <section id="pricing" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb left-1/2 top-0 h-[400px] w-[400px] -translate-x-1/2 bg-[#7C3AED]/[0.04]" />
        <div
          ref={pricingReveal.ref}
          className={`relative mx-auto max-w-[1200px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">Plans</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            Simple, <span className="landing-gradient-text">Transparent</span> Pricing
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/40">
            Start free and scale as your operations grow. No credit card required.
          </p>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {pricingPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 overflow-hidden ${
                  plan.highlighted
                    ? "landing-card border-[#7C3AED]/50 shadow-2xl shadow-[#7C3AED]/10"
                    : "landing-card"
                }`}
                style={itemReveal(pricingReveal.isVisible, i, 250)}
              >
                {plan.highlighted && (
                  <>
                    <div className="absolute -inset-[1px] -z-10 rounded-2xl bg-gradient-to-b from-[#7C3AED]/50 via-[#7C3AED]/20 to-transparent" />
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#9D5CF5] px-4 py-1 text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/30">
                      Most Popular
                    </div>
                  </>
                )}
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{plan.name}</h3>
                  <div className="mb-1 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    {plan.period && <span className="text-sm text-white/30">{plan.period}</span>}
                  </div>
                  <p className="mb-8 text-sm text-white/40">{plan.description}</p>
                  <ul className="mb-8 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#14B8A6]" />
                        <span className="text-sm text-white/50">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} className="block">
                    <button
                      className={`w-full rounded-full px-6 py-3.5 text-sm font-semibold transition-all ${
                        plan.highlighted
                          ? "landing-btn-primary text-white"
                          : "border border-[#9D5CF5]/30 bg-[#9D5CF5]/[0.06] text-[#9D5CF5] hover:bg-[#9D5CF5]/15 hover:border-[#9D5CF5]/50"
                      }`}
                    >
                      {plan.cta}
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          QUOTE
          ================================================================ */}
      <section className="relative bg-[#0F1729] px-6 py-24">
        <div className="landing-glow-orb left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 bg-[#7C3AED]/[0.03]" />
        <div className="relative mx-auto max-w-3xl">
          <div className="landing-card rounded-3xl px-10 py-14 text-center">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10">
              <span className="text-2xl font-bold text-[#7C3AED]">&ldquo;</span>
            </div>
            <blockquote className="mb-8 text-xl font-medium leading-relaxed text-white/80 md:text-2xl">
              Most teams spend more time managing their reconciliation tools than
              actually reconciling. The right platform should eliminate complexity,
              not add to it.
            </blockquote>
            <div className="flex items-center justify-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#14B8A6] text-xs font-bold text-white">RA</div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">ReconArt Team</p>
                <p className="text-xs text-white/40">Product Philosophy</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          FINAL CTA
          ================================================================ */}
      <section className="relative px-6 py-28">
        <div
          ref={ctaReveal.ref}
          className={`relative mx-auto max-w-[1200px] overflow-hidden rounded-3xl transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {/* Animated gradient bg */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED] via-[#6D28D9] to-[#9D5CF5]" />
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, rgba(20,184,166,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(124,58,237,0.3) 0%, transparent 50%)",
          }} />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }} />

          <div className="relative px-8 py-20 text-center">
            <h2 className="mb-6 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Ready to find out what your reconciliations are really costing you?
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-white/80">
              Join leading financial institutions using ReconArt to automate
              matching, eliminate manual work, and deliver real operational ROI.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sign-up">
                <button className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-[#7C3AED] shadow-xl transition-all hover:shadow-2xl hover:shadow-white/20 hover:-translate-y-0.5">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <a href="#pricing">
                <button className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20">
                  View Pricing
                </button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t border-[#7C3AED]/10 bg-[#0a0f1d] px-6 py-16">
        <div className="mx-auto max-w-[1200px]">
          <p className="mb-14 text-center text-lg font-medium text-white/30">
            Vendor-agnostic. AI-powered. Reconciliations{" "}
            <span className="landing-gradient-text font-bold">mastered</span>.
          </p>

          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9]">
                  <GitCompareArrows className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  Recon<span className="text-[#9D5CF5]">Art</span>
                </span>
              </div>
              <p className="mb-6 max-w-sm text-sm leading-relaxed text-white/30">
                AI-powered reconciliation platform that automates matching,
                detects anomalies, and delivers real-time operational
                intelligence for financial institutions.
              </p>
              <div className="flex gap-3">
                {[ExternalLink, Globe, Mail].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2f3c5b]/50 text-white/30 transition-all hover:border-[#7C3AED]/40 hover:text-[#9D5CF5] hover:shadow-lg hover:shadow-[#7C3AED]/10"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {footerSections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-4 text-sm font-semibold text-white/80">{section.title}</h4>
                <ul className="space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-white/30 transition-colors hover:text-white/60">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#2f3c5b]/30 pt-8 sm:flex-row">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} ReconArt. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline">Privacy Policy</a>
              <a href="#" className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
