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
  Mail,
  ExternalLink,
  Sparkles,
  Search,
  Clock,
  Star,
  TrendingUp,
  Currency,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldAlert,
  Receipt,
  Calculator,
  BookOpen,
  FileCheck,
  Bell,
  Landmark,
  CreditCard,
  Smartphone,
  Store,
  Coins,
  ShoppingCart,
  HandCoins,
  Gamepad2,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import RegionSelector from "@/components/shared/RegionSelector";

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

function useMouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, active: false });

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, active: true });
  };
  const onLeave = () => setPos((p) => ({ ...p, active: false }));

  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    borderRadius: "inherit",
    opacity: pos.active ? 1 : 0,
    transition: "opacity 0.4s ease",
    background: `radial-gradient(700px circle at ${pos.x}px ${pos.y}px, rgba(124,58,237,0.07), transparent 40%)`,
  };

  return { ref, onMove, onLeave, glowStyle: style };
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
  { icon: Sparkles, tKey: "adv.ai" },
  { icon: Layers, tKey: "adv.vendor" },
  { icon: Currency, tKey: "adv.currency" },
  { icon: Search, tKey: "adv.data" },
  { icon: Clock, tKey: "adv.speed" },
  { icon: Target, tKey: "adv.roi" },
];

const services = [
  { icon: Database, tIndex: 1 },
  { icon: Brain, tIndex: 2 },
  { icon: AlertTriangle, tIndex: 3 },
  { icon: LineChart, tIndex: 4 },
  { icon: Clock, tIndex: 5 },
  { icon: ArrowLeftRight, tIndex: 6 },
  { icon: Shield, tIndex: 7 },
];

const caseStudies = [
  { stat: "85%", tIndex: 1 },
  { stat: "99.9%", tIndex: 2 },
  { stat: "500K+", tIndex: 3 },
  { stat: "8", tIndex: 4 },
];

const pricingPlans = [
  {
    nameKey: "pricing.starter",
    priceKey: "pricing.free",
    period: "",
    descKey: "pricing.starterDesc",
    featureKeys: [
      "pricing.feat.sources3",
      "pricing.feat.tx10k",
      "pricing.feat.basicRules",
      "pricing.feat.commSupport",
      "pricing.feat.stdAnalytics",
    ],
    ctaKey: "pricing.getStarted",
    href: "/sign-up",
    highlighted: false,
  },
  {
    nameKey: "pricing.professional",
    priceKey: "",
    priceRaw: "$299",
    period: "/month",
    descKey: "pricing.professionalDesc",
    featureKeys: [
      "pricing.feat.sources15",
      "pricing.feat.tx500k",
      "pricing.feat.aiMatching",
      "pricing.feat.prioSupport",
      "pricing.feat.advAnalytics",
      "pricing.feat.customRules",
    ],
    ctaKey: "pricing.startTrial",
    href: "/sign-up",
    highlighted: true,
  },
  {
    nameKey: "pricing.enterprise",
    priceKey: "pricing.custom",
    period: "",
    descKey: "pricing.enterpriseDesc",
    featureKeys: [
      "pricing.feat.unlimitedSources",
      "pricing.feat.unlimitedTx",
      "pricing.feat.customIntegrations",
      "pricing.feat.dedicatedAM",
      "pricing.feat.sla",
      "pricing.feat.onPrem",
    ],
    ctaKey: "pricing.contactSales",
    href: "mailto:reconartai@gmail.com",
    highlighted: false,
  },
];

const domainGroups = [
  {
    catKey: "domains.moneyMovement",
    color: "#14B8A6",
    domains: [
      { icon: ArrowDownToLine, tKey: "dom.cashIn" },
      { icon: ArrowUpFromLine, tKey: "dom.cashOut" },
    ],
  },
  {
    catKey: "domains.riskManagement",
    color: "#F59E0B",
    domains: [
      { icon: ShieldAlert, tKey: "dom.claims" },
      { icon: Receipt, tKey: "dom.fees" },
    ],
  },
  {
    catKey: "domains.accounting",
    color: "#9D5CF5",
    domains: [
      { icon: Calculator, tKey: "dom.accAuto" },
      { icon: BookOpen, tKey: "dom.accOps" },
    ],
  },
  {
    catKey: "domains.governance",
    color: "#3B82F6",
    domains: [
      { icon: FileCheck, tKey: "dom.reporting" },
      { icon: Bell, tKey: "dom.oversight" },
    ],
  },
];

const templates = [
  { tIndex: 1 },
  { tIndex: 2 },
  { tIndex: 3 },
  { tIndex: 4 },
  { tIndex: 5 },
  { tIndex: 6 },
];

const industries = [
  { icon: Landmark, tIndex: 1 },
  { icon: CreditCard, tIndex: 2 },
  { icon: Smartphone, tIndex: 3 },
  { icon: Store, tIndex: 4 },
  { icon: Shield, tIndex: 5 },
  { icon: Coins, tIndex: 6 },
  { icon: ShoppingCart, tIndex: 7 },
  { icon: HandCoins, tIndex: 8 },
  { icon: Gamepad2, tIndex: 9 },
  { icon: Building2, tIndex: 10 },
];

const logoPartners = [
  "Visa", "Mastercard", "Stripe", "PayPal", "Adyen", "SWIFT", "SAP", "Oracle",
  "NetSuite", "Plaid", "Square", "Worldpay", "FIS", "Fiserv", "Braintree",
];

const workflowSteps = [
  { icon: Database, tKey: "workflow.step1" },
  { icon: Brain, tKey: "workflow.step2" },
  { icon: AlertTriangle, tKey: "workflow.step3" },
  { icon: LineChart, tKey: "workflow.step4" },
];

const comparisonRows = [
  { tKey: "compare.setup", reconart: "compare.val.days", legacy: "compare.val.months36", manual: "compare.val.ongoing", isBool: false },
  { tKey: "compare.matchAccuracy", reconart: "99.9%", legacy: "~95%", manual: "~80%", isBool: false, rawVals: true },
  { tKey: "compare.aiMatching", reconart: true, legacy: false, manual: false, isBool: true },
  { tKey: "compare.crossBorder", reconart: true, legacy: false, manual: false, isBool: true },
  { tKey: "compare.realTime", reconart: true, legacy: false, manual: false, isBool: true },
  { tKey: "compare.audit", reconart: true, legacy: false, manual: false, isBool: true },
  { tKey: "compare.scalability", reconart: "compare.val.unlimited", legacy: "compare.val.limited", manual: "compare.val.none", isBool: false },
  { tKey: "compare.tco", reconart: "compare.val.low", legacy: "compare.val.high", manual: "compare.val.veryHigh", isBool: false },
];

const faqs = [
  { tIndex: 1 },
  { tIndex: 2 },
  { tIndex: 3 },
  { tIndex: 4 },
  { tIndex: 5 },
  { tIndex: 6 },
];

const footerSections = [
  {
    titleKey: "footer.quickLinks",
    links: [
      { labelKey: "nav.home", href: "#" },
      { labelKey: "nav.product", href: "#advantages" },
      { labelKey: "nav.services", href: "#services" },
      { labelKey: "nav.pricing", href: "#pricing" },
      { labelKey: "nav.resources", href: "#results" },
    ],
  },
  {
    titleKey: "footer.industries",
    links: [
      { labelKey: "ind.1.title", href: "#industries" },
      { labelKey: "ind.2.title", href: "#industries" },
      { labelKey: "ind.5.title", href: "#industries" },
      { labelKey: "ind.6.title", href: "#industries" },
      { labelKey: "ind.3.title", href: "#industries" },
    ],
  },
  {
    titleKey: "footer.contact",
    links: [
      { label: "reconartai@gmail.com", href: "mailto:reconartai@gmail.com" },
      { labelKey: "footer.documentation", href: "#services" },
      { labelKey: "footer.privacy", href: "/privacy" },
    ],
  },
];

/* =========================================================================
   Page Component
   ========================================================================= */

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const statsReveal = useScrollReveal(0.2);
  const accuracyCount = useCountUp(999, 2800, statsReveal.isVisible);
  const txCount = useCountUp(10, 2200, statsReveal.isVisible);
  const reductionCount = useCountUp(85, 2500, statsReveal.isVisible);
  const integrationsCount = useCountUp(60, 2300, statsReveal.isVisible);

  const workflowReveal = useScrollReveal(0.2);
  const advantagesReveal = useScrollReveal(0.05);
  const advantagesGlow = useMouseGlow();
  const comparisonReveal = useScrollReveal(0.05);
  const domainsReveal = useScrollReveal(0.05);
  const servicesReveal = useScrollReveal(0.05);
  const servicesGlow = useMouseGlow();
  const templatesReveal = useScrollReveal(0.05);
  const resultsReveal = useScrollReveal(0.05);
  const industriesReveal = useScrollReveal(0.05);
  const pricingReveal = useScrollReveal(0.05);
  const faqReveal = useScrollReveal(0.05);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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
        <div className="mx-auto flex max-w-[90%] items-center justify-between px-6 py-4">
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
                className="bubble-hover relative rounded-lg px-2 py-1 text-sm font-medium text-white/60 hover:text-white after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[#7C3AED] after:transition-all hover:after:w-full"
              >
                {t(`nav.${link.label.toLowerCase()}`)}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <RegionSelector variant="landing" />
            <Link
              href="/sign-in"
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              {t("nav.signIn")}
            </Link>
            <Link href="/sign-up">
              <button className="landing-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white">
                {t("nav.startTrial")}
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
                  {t(`nav.${link.label.toLowerCase()}`)}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-[#2f3c5b]/50 pt-4">
                <Link href="/sign-in" onClick={closeMobile} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/60">{t("nav.signIn")}</Link>
                <Link href="/sign-up" onClick={closeMobile}>
                  <button className="landing-btn-primary w-full rounded-full px-5 py-2.5 text-sm font-semibold text-white">{t("nav.startTrial")}</button>
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

        <div className="relative z-10 mx-auto grid max-w-[90%] grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left — Text */}
          <div className="flex flex-col gap-8">
            <div
              className="animate-fade-in-up bubble-hover inline-flex w-fit items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/[0.08] px-4 py-2 backdrop-blur-sm"
              style={{ animationDelay: "0.1s" }}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#9D5CF5]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9D5CF5]">
                {t("hero.badge")}
              </span>
            </div>

            <h1
              className="animate-fade-in-up text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem]"
              style={{ animationDelay: "0.3s" }}
            >
              {t("hero.title1")}
              <br />
              {t("hero.title2")}{" "}
              <span className="landing-gradient-text">{t("hero.roi")}</span>?
            </h1>

            <p
              className="animate-fade-in-up max-w-lg text-lg leading-relaxed text-white/50"
              style={{ animationDelay: "0.5s" }}
            >
              {t("hero.subtitle")}
            </p>

            <div
              className="animate-fade-in-up flex flex-col gap-4 sm:flex-row"
              style={{ animationDelay: "0.7s" }}
            >
              <Link href="/sign-up">
                <button className="landing-btn-primary inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white">
                  {t("hero.cta1")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <a href="#advantages">
                <button className="bubble-hover inline-flex items-center gap-2 rounded-full border border-[#9D5CF5]/40 bg-[#9D5CF5]/[0.06] px-8 py-4 text-sm font-semibold text-[#9D5CF5] backdrop-blur-sm hover:bg-[#9D5CF5]/15 hover:border-[#9D5CF5]/60">
                  {t("hero.cta2")}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </a>
            </div>

            {/* Trust strip */}
            <div
              className="animate-fade-in-up flex flex-wrap items-center gap-4 pt-4"
              style={{ animationDelay: "0.9s" }}
            >
              <div className="flex items-center gap-2 rounded-full border border-[#14B8A6]/20 bg-[#14B8A6]/[0.06] px-4 py-2">
                <Shield className="h-3.5 w-3.5 text-[#14B8A6]" />
                <span className="text-xs font-medium text-[#14B8A6]">{t("hero.soc2")}</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#9D5CF5]/20 bg-[#9D5CF5]/[0.06] px-4 py-2">
                <Lock className="h-3.5 w-3.5 text-[#9D5CF5]" />
                <span className="text-xs font-medium text-[#9D5CF5]">{t("hero.encryption")}</span>
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                ))}
                <span className="ml-2 text-xs text-white/40">{t("hero.trusted")}</span>
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
                      <h3 className="text-sm font-semibold text-white">{t("hero.platform")}</h3>
                      <p className="text-xs text-white/30">{t("hero.recon")}</p>
                    </div>
                  </div>
                  <div className="flex h-2 w-2 rounded-full bg-[#10b981] shadow-lg shadow-[#10b981]/50">
                    <div className="h-2 w-2 animate-ping rounded-full bg-[#10b981]" />
                  </div>
                </div>

                <div className="mb-5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#14B8A6]">{t("hero.coreLabel")}</p>
                  {["hero.feature1", "hero.feature2", "hero.feature3"].map((key) => (
                    <div key={key} className="flex items-center gap-2.5 rounded-lg py-2 text-sm text-white/60 transition-colors hover:text-white/80">
                      <Check className="h-3.5 w-3.5 text-[#14B8A6]" />
                      {t(key)}
                    </div>
                  ))}
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9D5CF5]">{t("hero.advancedLabel")}</p>
                  {["hero.feature4", "hero.feature5", "hero.feature6"].map((key) => (
                    <div key={key} className="flex items-center gap-2.5 rounded-lg py-2 text-sm text-white/60 transition-colors hover:text-white/80">
                      <Check className="h-3.5 w-3.5 text-[#9D5CF5]" />
                      {t(key)}
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1729] to-[#1a243a] p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED]/5 to-[#14B8A6]/5" />
                  <span className="relative text-xs font-medium text-white/40">{t("hero.matchRate")}</span>
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
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <p className="mb-14 text-center text-lg text-white/40">
            {t("stats.tagline1")}{" "}
            <span className="landing-gradient-text font-semibold">{t("stats.tagline2")}</span>
          </p>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { val: (accuracyCount / 10).toFixed(1), suffix: "%", labelKey: "stats.accuracy" },
              { val: txCount, suffix: "M+", labelKey: "stats.transactions" },
              { val: reductionCount, suffix: "%", labelKey: "stats.reduction" },
              { val: integrationsCount, suffix: "+", labelKey: "stats.integrations" },
            ].map((stat, i) => (
              <div key={stat.labelKey} className="bubble-hover group flex flex-col items-center gap-3 rounded-2xl border border-transparent p-4 text-center" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="relative">
                  <span className="text-4xl font-bold text-white md:text-5xl">
                    {stat.val}
                  </span>
                  <span className="landing-gradient-text text-4xl font-bold md:text-5xl">{stat.suffix}</span>
                </div>
                <span className="text-sm font-medium text-white/50 transition-colors group-hover:text-white/70">
                  {t(stat.labelKey)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          LOGO TICKER
          ================================================================ */}
      <section className="border-y border-[#7C3AED]/[0.06] bg-[#0a0f1d] px-6 py-10 overflow-hidden">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/20">
          {t("ticker.label")}
        </p>
        <div className="relative mx-auto max-w-[90%] overflow-hidden">
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-20 bg-gradient-to-r from-[#0a0f1d] to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-20 bg-gradient-to-l from-[#0a0f1d] to-transparent" />
          <div className="logo-ticker">
            {[...logoPartners, ...logoPartners].map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="mx-8 flex shrink-0 items-center"
              >
                <span className="text-base font-bold tracking-tight text-white/25 transition-colors hover:text-white/50" style={{ fontVariant: "small-caps" }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          WORKFLOW DIAGRAM
          ================================================================ */}
      <section className="relative bg-[#0F1729] px-6 py-28">
        <div
          ref={workflowReveal.ref}
          className={`relative mx-auto max-w-[900px] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${workflowReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("workflow.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("workflow.title1")} <span className="landing-gradient-text">{t("workflow.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/40">
            {t("workflow.subtitle")}
          </p>

          <div className="relative flex flex-col items-center gap-12 md:flex-row md:justify-between md:gap-0">
            {/* Connecting line with flowing light */}
            <div className="absolute left-[10%] right-[10%] top-[58px] hidden md:block">
              {/* Base line */}
              <div
                className="h-[2px] rounded-full bg-gradient-to-r from-[#7C3AED]/30 via-[#9D5CF5]/30 to-[#14B8A6]/30"
                style={{
                  transition: "transform 2s cubic-bezier(.37,0,.63,1)",
                  transformOrigin: "left",
                  transform: workflowReveal.isVisible ? "scaleX(1)" : "scaleX(0)",
                }}
              />
              {/* Flowing light */}
              {workflowReveal.isVisible && (
                <div className="absolute top-[-2px] h-[6px] w-[20%] rounded-full bg-gradient-to-r from-transparent via-[#9D5CF5] to-transparent blur-[2px]" style={{ animation: "flow-right 3s ease-in-out infinite" }} />
              )}
            </div>

            {workflowSteps.map((step, i) => (
              <div
                key={step.tKey}
                className="relative z-10 flex flex-col items-center gap-4 text-center"
                style={{
                  transition: `opacity 0.8s cubic-bezier(.37,0,.63,1) ${400 + i * 400}ms, transform 0.8s cubic-bezier(.37,0,.63,1) ${400 + i * 400}ms`,
                  opacity: workflowReveal.isVisible ? 1 : 0,
                  transform: workflowReveal.isVisible ? "translateY(0)" : "translateY(20px)",
                }}
              >
                {/* Number above */}
                <div className="bubble-hover flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#14B8A6] text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/30">
                  {i + 1}
                </div>

                {/* Icon box */}
                <div className="relative">
                  <div className="bubble-hover flex h-20 w-20 items-center justify-center rounded-2xl border border-[#7C3AED]/20 bg-[#1a243a] shadow-lg shadow-[#7C3AED]/5">
                    <step.icon className="h-8 w-8 text-[#9D5CF5]" />
                  </div>
                  {workflowReveal.isVisible && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-[#7C3AED]/30" style={{ animation: `pulse-ring 2s ease-out ${i * 0.4}s` }} />
                  )}
                </div>

                {/* Text below */}
                <h3 className="text-sm font-semibold text-white">{t(step.tKey)}</h3>
                <p className="max-w-[120px] text-xs text-white/40">{t(`${step.tKey}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          ADVANTAGES
          ================================================================ */}
      <section id="advantages" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb right-0 top-0 h-[400px] w-[400px] bg-[#7C3AED]/[0.03]" />
        <div
          ref={advantagesReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${advantagesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("advantages.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("advantages.title1")} <span className="landing-gradient-text">{t("advantages.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("advantages.subtitle")}
          </p>

          <div
            ref={advantagesGlow.ref}
            onMouseMove={advantagesGlow.onMove}
            onMouseLeave={advantagesGlow.onLeave}
            className="relative grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div style={advantagesGlow.glowStyle} />
            {advantages.map((item, i) => (
              <div
                key={item.tKey}
                className="landing-card landing-card-glow group relative rounded-2xl p-7 pl-9"
                style={itemReveal(advantagesReveal.isVisible, i)}
              >
                <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-[#7C3AED] to-[#14B8A6] opacity-40 transition-opacity group-hover:opacity-100" />
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10 transition-all group-hover:shadow-lg group-hover:shadow-[#7C3AED]/20">
                  <item.icon className="h-5 w-5 text-[#9D5CF5] transition-colors group-hover:text-[#7C3AED]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{t(`${item.tKey}.title`)}</h3>
                <p className="text-sm leading-relaxed text-white/50">{t(`${item.tKey}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          COMPARISON TABLE
          ================================================================ */}
      <section className="relative bg-[#0F1729] px-6 py-28">
        <div className="landing-glow-orb left-[20%] top-[30%] h-[400px] w-[400px] bg-[#14B8A6]/[0.03]" />
        <div
          ref={comparisonReveal.ref}
          className={`relative mx-auto max-w-4xl transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${comparisonReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("compare.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("compare.title1")} <span className="landing-gradient-text">{t("compare.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/40">
            {t("compare.subtitle")}
          </p>

          <div className="landing-card rounded-2xl overflow-hidden">
            <div className="grid grid-cols-4 gap-0 border-b border-[#7C3AED]/10 bg-[#7C3AED]/[0.04]">
              <div className="px-6 py-4 text-sm font-semibold text-white/50">{t("compare.feature")}</div>
              <div className="px-6 py-4 text-center text-sm font-bold landing-gradient-text">{t("compare.reconart")}</div>
              <div className="px-6 py-4 text-center text-sm font-semibold text-white/40">{t("compare.legacy")}</div>
              <div className="px-6 py-4 text-center text-sm font-semibold text-white/40">{t("compare.manual")}</div>
            </div>
            {comparisonRows.map((row, i) => (
              <div
                key={row.tKey}
                className={`grid grid-cols-4 gap-0 border-b border-[#2f3c5b]/20 transition-colors hover:bg-[#1a243a]/60 ${i === comparisonRows.length - 1 ? "border-b-0" : ""}`}
                style={itemReveal(comparisonReveal.isVisible, i, 100)}
              >
                <div className="px-6 py-4 text-sm text-white/60">{t(row.tKey)}</div>
                <div className="flex items-center justify-center px-6 py-4 text-sm font-medium text-[#14B8A6]">
                  {row.isBool ? (
                    <Check className="h-5 w-5 text-[#14B8A6]" />
                  ) : (
                    row.rawVals ? String(row.reconart) : t(String(row.reconart))
                  )}
                </div>
                <div className="flex items-center justify-center px-6 py-4 text-sm text-white/30">
                  {row.isBool ? (
                    row.legacy ? <Check className="h-4 w-4 text-white/30" /> : <X className="h-4 w-4 text-white/15" />
                  ) : (
                    row.rawVals ? String(row.legacy) : t(String(row.legacy))
                  )}
                </div>
                <div className="flex items-center justify-center px-6 py-4 text-sm text-white/30">
                  {row.isBool ? (
                    row.manual ? <Check className="h-4 w-4 text-white/30" /> : <X className="h-4 w-4 text-white/15" />
                  ) : (
                    row.rawVals ? String(row.manual) : t(String(row.manual))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          DOMAIN COVERAGE
          ================================================================ */}
      <section id="domains" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb left-[20%] top-[30%] h-[400px] w-[400px] bg-[#14B8A6]/[0.03]" />
        <div
          ref={domainsReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${domainsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("domains.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("domains.title1")} <span className="landing-gradient-text">{t("domains.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("domains.subtitle")}
          </p>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {domainGroups.map((group, gi) => (
              <div
                key={group.catKey}
                className="flex flex-col gap-4"
                style={itemReveal(domainsReveal.isVisible, gi, 200)}
              >
                <div className="flex items-center gap-2 px-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: group.color }}>
                    {t(group.catKey)}
                  </span>
                </div>
                {group.domains.map((domain) => (
                  <div
                    key={domain.tKey}
                    className="landing-card landing-card-glow group rounded-2xl p-6"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-all group-hover:shadow-lg" style={{ background: `${group.color}15` }}>
                      <domain.icon className="h-5 w-5 transition-colors" style={{ color: group.color }} />
                    </div>
                    <h3 className="mb-1.5 text-sm font-semibold text-white">{t(`${domain.tKey}.title`)}</h3>
                    <p className="text-xs leading-relaxed text-white/40">{t(`${domain.tKey}.desc`)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          SERVICES
          ================================================================ */}
      <section id="services" className="relative bg-[#0F1729] px-6 py-28">
        <div className="landing-glow-orb left-0 bottom-0 h-[400px] w-[400px] bg-[#14B8A6]/[0.03]" />
        <div
          ref={servicesReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${servicesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("services.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("services.title1")} <span className="landing-gradient-text">{t("services.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("services.subtitle")}
          </p>

          <div
            ref={servicesGlow.ref}
            onMouseMove={servicesGlow.onMove}
            onMouseLeave={servicesGlow.onLeave}
            className="relative"
          >
            <div style={servicesGlow.glowStyle} />
            {/* Row 1 — 4 cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {services.slice(0, 4).map((service, i) => (
                <div
                  key={service.tIndex}
                  className="landing-card landing-card-glow group relative rounded-2xl p-7 pl-9"
                  style={itemReveal(servicesReveal.isVisible, i)}
                >
                  <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-[#7C3AED] to-[#14B8A6] opacity-40 transition-opacity group-hover:opacity-100" />
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10 transition-all group-hover:shadow-lg group-hover:shadow-[#7C3AED]/20">
                    <service.icon className="h-5 w-5 text-[#9D5CF5] transition-colors group-hover:text-[#7C3AED]" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{t(`svc.${service.tIndex}.title`)}</h3>
                  <p className="mb-5 text-sm leading-relaxed text-white/50">{t(`svc.${service.tIndex}.desc`)}</p>
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#9D5CF5] transition-all hover:text-white hover:gap-3"
                  >
                    {t(`svc.${service.tIndex}.cta`)}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
            {/* Row 2 — 3 cards, blank on right */}
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {services.slice(4).map((service, i) => (
                <div
                  key={service.tIndex}
                  className="landing-card landing-card-glow group relative rounded-2xl p-7 pl-9"
                  style={itemReveal(servicesReveal.isVisible, i + 4)}
                >
                  <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-[#7C3AED] to-[#14B8A6] opacity-40 transition-opacity group-hover:opacity-100" />
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10 transition-all group-hover:shadow-lg group-hover:shadow-[#7C3AED]/20">
                    <service.icon className="h-5 w-5 text-[#9D5CF5] transition-colors group-hover:text-[#7C3AED]" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{t(`svc.${service.tIndex}.title`)}</h3>
                  <p className="mb-5 text-sm leading-relaxed text-white/50">{t(`svc.${service.tIndex}.desc`)}</p>
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#9D5CF5] transition-all hover:text-white hover:gap-3"
                  >
                    {t(`svc.${service.tIndex}.cta`)}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          PRE-BUILT TEMPLATES
          ================================================================ */}
      <section id="templates" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb right-[10%] top-[20%] h-[350px] w-[350px] bg-[#7C3AED]/[0.03]" />
        <div
          ref={templatesReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${templatesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("templates.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("templates.title1")} <span className="landing-gradient-text">{t("templates.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("templates.subtitle")}
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tmpl, i) => (
              <div
                key={tmpl.tIndex}
                className="landing-card landing-card-glow group rounded-2xl overflow-hidden"
                style={itemReveal(templatesReveal.isVisible, i)}
              >
                <div className="border-b border-[#7C3AED]/10 bg-gradient-to-r from-[#7C3AED]/[0.06] to-transparent px-7 py-4">
                  <h3 className="text-base font-semibold text-white">{t(`tmpl.${tmpl.tIndex}.title`)}</h3>
                  <p className="text-xs font-medium text-[#14B8A6]">{t(`tmpl.${tmpl.tIndex}.examples`)}</p>
                </div>
                <div className="px-7 py-5">
                  <p className="mb-4 text-sm leading-relaxed text-white/50">{t(`tmpl.${tmpl.tIndex}.desc`)}</p>
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#9D5CF5] transition-all hover:text-white hover:gap-3"
                  >
                    {t("templates.useTemplate")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
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
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${resultsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("cases.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("cases.title1")} <span className="landing-gradient-text">{t("cases.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("cases.subtitle")}
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {caseStudies.map((study, i) => (
              <div
                key={study.tIndex}
                className="landing-card landing-card-glow group rounded-2xl overflow-hidden"
                style={itemReveal(resultsReveal.isVisible, i)}
              >
                <div className="flex items-center gap-5 border-b border-[#7C3AED]/10 bg-gradient-to-r from-[#7C3AED]/[0.06] to-transparent px-8 py-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#14B8A6]/10">
                    <span className="text-lg font-bold text-white">{study.stat}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t(`case.${study.tIndex}.statLabel`)}</p>
                    <p className="text-xs text-white/40">{t(`case.${study.tIndex}.title`)}</p>
                  </div>
                  <TrendingUp className="ml-auto h-5 w-5 text-[#14B8A6]/30 transition-colors group-hover:text-[#14B8A6]" />
                </div>
                <div className="px-8 py-6">
                  <p className="mb-4 text-sm leading-relaxed text-white/50">{t(`case.${study.tIndex}.desc`)}</p>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-[#7C3AED]/10 px-3 py-1 text-[10px] font-semibold text-[#9D5CF5]">{t(`case.${study.tIndex}.industry`)}</span>
                    <span className="rounded-full bg-[#14B8A6]/10 px-3 py-1 text-[10px] font-semibold text-[#14B8A6]">{t(`case.${study.tIndex}.region`)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          INDUSTRY VERTICALS
          ================================================================ */}
      <section id="industries" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb left-1/2 bottom-0 h-[400px] w-[400px] -translate-x-1/2 bg-[#7C3AED]/[0.03]" />
        <div
          ref={industriesReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${industriesReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("industries.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("industries.title1")} <span className="landing-gradient-text">{t("industries.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-white/40">
            {t("industries.subtitle")}
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {industries.map((ind, i) => (
              <div
                key={ind.tIndex}
                className="landing-card landing-card-glow group rounded-2xl p-5 text-center"
                style={itemReveal(industriesReveal.isVisible, i, 100)}
              >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/15 to-[#14B8A6]/10 transition-all group-hover:shadow-lg group-hover:shadow-[#7C3AED]/20">
                  <ind.icon className="h-5 w-5 text-[#9D5CF5]/70 transition-colors group-hover:text-[#9D5CF5]" />
                </div>
                <h3 className="mb-1 text-xs font-semibold text-white">{t(`ind.${ind.tIndex}.title`)}</h3>
                <p className="text-[11px] leading-relaxed text-white/35">{t(`ind.${ind.tIndex}.desc`)}</p>
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

        {/* Security badges */}
        <div className="relative mx-auto mb-20 flex flex-wrap items-center justify-center gap-6 max-w-3xl">
          {[
            { icon: Shield, labelKey: "security.soc2", subKey: "security.soc2Sub" },
            { icon: Lock, labelKey: "security.aes", subKey: "security.aesSub" },
            { icon: Globe, labelKey: "security.gdpr", subKey: "security.gdprSub" },
            { icon: Eye, labelKey: "security.uptime", subKey: "security.uptimeSub" },
          ].map((badge) => (
            <div key={badge.labelKey} className="flex items-center gap-3 rounded-xl border border-[#2f3c5b]/30 bg-[#1a243a]/40 px-5 py-3">
              <badge.icon className="h-5 w-5 text-[#14B8A6]" />
              <div>
                <p className="text-sm font-semibold text-white/70">{t(badge.labelKey)}</p>
                <p className="text-[10px] text-white/30">{t(badge.subKey)}</p>
              </div>
            </div>
          ))}
        </div>
        <div
          ref={pricingReveal.ref}
          className={`relative mx-auto max-w-[90%] transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("pricing.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("pricing.title1")} <span className="landing-gradient-text">{t("pricing.title2")}</span> {t("pricing.title3")}
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/40">
            {t("pricing.subtitle")}
          </p>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {pricingPlans.map((plan, i) => (
              <div
                key={plan.nameKey}
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
                    <div className="absolute top-4 right-4 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#9D5CF5] px-4 py-1 text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/30">
                      {t("pricing.mostPopular")}
                    </div>
                  </>
                )}
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{t(plan.nameKey)}</h3>
                  <div className="mb-1 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.priceRaw || t(plan.priceKey)}</span>
                    {plan.period && <span className="text-sm text-white/30">{plan.period}</span>}
                  </div>
                  <p className="mb-8 text-sm text-white/40">{t(plan.descKey)}</p>
                  <ul className="mb-8 space-y-3">
                    {plan.featureKeys.map((fk) => (
                      <li key={fk} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#14B8A6]" />
                        <span className="text-sm text-white/50">{t(fk)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} className="block">
                    <button
                      className={`bubble-hover w-full rounded-full px-6 py-3.5 text-sm font-semibold ${
                        plan.highlighted
                          ? "landing-btn-primary text-white"
                          : "border border-[#9D5CF5]/30 bg-[#9D5CF5]/[0.06] text-[#9D5CF5] hover:bg-[#9D5CF5]/15 hover:border-[#9D5CF5]/50"
                      }`}
                    >
                      {t(plan.ctaKey)}
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
          PHILOSOPHY
          ================================================================ */}
      <section className="relative bg-[#0F1729] px-6 py-28 overflow-hidden">
        <div className="landing-glow-orb left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 bg-[#7C3AED]/[0.04]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.6) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#7C3AED]/20 bg-[#7C3AED]/[0.06] px-4 py-2">
            <Sparkles className="h-3.5 w-3.5 text-[#9D5CF5]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9D5CF5]">{t("philosophy.tag")}</span>
          </div>
          <h2 className="mb-8 text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
            {t("philosophy.title1")}{" "}
            <span className="landing-gradient-text">{t("philosophy.title2")}</span>
            <br className="hidden sm:block" />
            {t("philosophy.title3")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-white/40">
            {t("philosophy.desc")}
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-center">
            {[
              { valueKey: "philosophy.zero", labelKey: "philosophy.zeroLabel" },
              { valueKey: "philosophy.audit", labelKey: "philosophy.auditLabel" },
              { valueKey: "philosophy.one", labelKey: "philosophy.oneLabel" },
            ].map((item) => (
              <div key={item.labelKey} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold landing-gradient-text">{t(item.valueKey)}</span>
                <span className="text-xs text-white/40">{t(item.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ================================================================
          FAQ
          ================================================================ */}
      <section id="faq" className="relative bg-[#0c1220] px-6 py-28">
        <div className="landing-glow-orb right-[10%] bottom-[20%] h-[350px] w-[350px] bg-[#7C3AED]/[0.03]" />
        <div
          ref={faqReveal.ref}
          className={`relative mx-auto max-w-3xl transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${faqReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#7C3AED]/50" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#9D5CF5]">{t("faq.tag")}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#7C3AED]/50" />
          </div>
          <h2 className="mb-5 text-center text-3xl font-bold tracking-tight md:text-5xl">
            {t("faq.title1")} <span className="landing-gradient-text">{t("faq.title2")}</span>
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-white/40">
            {t("faq.subtitle")}
          </p>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={faq.tIndex}
                className="landing-card rounded-2xl overflow-hidden"
                style={itemReveal(faqReveal.isVisible, i, 100)}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-7 py-5 text-left"
                >
                  <span className="text-sm font-semibold text-white pr-4">{t(`faq.q${faq.tIndex}`)}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#9D5CF5] transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: openFaq === i ? "200px" : "0px",
                    opacity: openFaq === i ? 1 : 0,
                  }}
                >
                  <p className="px-7 pb-6 text-sm leading-relaxed text-white/45">{t(`faq.a${faq.tIndex}`)}</p>
                </div>
              </div>
            ))}
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
          className={`relative mx-auto max-w-[90%] overflow-hidden rounded-3xl transition-all duration-[1200ms] ease-[cubic-bezier(.37,0,.63,1)] ${ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
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
              {t("cta.title")}
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-white/80">
              {t("cta.subtitle")}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sign-up">
                <button className="bubble-hover inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-[#7C3AED] shadow-xl">
                  {t("cta.btn1")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <a href="#pricing">
                <button className="bubble-hover inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20">
                  {t("cta.btn2")}
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
        <div className="mx-auto max-w-[90%]">
          <p className="mb-14 text-center text-lg font-medium text-white/30">
            {t("footer.tagline1")}{" "}
            <span className="landing-gradient-text font-bold">{t("footer.tagline2")}</span>.
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
                {t("footer.desc")}
              </p>
              <div className="flex gap-3">
                {[
                  { icon: Globe, href: "https://recon-art.vercel.app" },
                  { icon: ExternalLink, href: "#services" },
                  { icon: Mail, href: "mailto:reconartai@gmail.com" },
                ].map((item, i) => (
                  <a
                    key={i}
                    href={item.href}
                    className="bubble-hover flex h-9 w-9 items-center justify-center rounded-lg border border-[#2f3c5b]/50 text-white/30 hover:border-[#7C3AED]/40 hover:text-[#9D5CF5]"
                  >
                    <item.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {footerSections.map((section) => (
              <div key={section.titleKey}>
                <h4 className="mb-4 text-sm font-semibold text-white/80">{t(section.titleKey)}</h4>
                <ul className="space-y-2.5">
                  {section.links.map((link, li) => (
                    <li key={li}>
                      <a href={link.href} className="text-sm text-white/30 transition-colors hover:text-white/60">{link.label || t(link.labelKey!)}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#2f3c5b]/30 pt-8 sm:flex-row">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} ReconArt. {t("footer.rights")}
            </p>
            <div className="flex gap-6">
              <a href="/privacy" className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline">{t("footer.privacy")}</a>
              <a href="/terms" className="text-xs text-white/20 transition-colors hover:text-white/40 hover:underline">{t("footer.terms")}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
