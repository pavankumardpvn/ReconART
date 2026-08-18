"use client";

import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { X, Send, Sparkles, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  "What's my overall status?",
  "How are my reconciliations performing?",
  "Any exceptions I should worry about?",
  "Show me today's activity",
  "What needs my attention?",
  "Help me improve match rates",
];

function parseDate(q: string): { label: string; days: number } | null {
  if (/today|24\s*h/i.test(q)) return { label: "today", days: 1 };
  if (/yesterday/i.test(q)) return { label: "yesterday", days: 2 };
  if (/last\s*(7|seven)\s*days?|this\s*week|past\s*week/i.test(q)) return { label: "the last 7 days", days: 7 };
  if (/last\s*(30|thirty)\s*days?|this\s*month|past\s*month/i.test(q)) return { label: "the last 30 days", days: 30 };
  if (/last\s*(90|ninety)\s*days?|quarter|3\s*months/i.test(q)) return { label: "the last 90 days", days: 90 };
  if (/last\s*(\d+)\s*days?/i.test(q)) {
    const m = q.match(/last\s*(\d+)\s*days?/i);
    if (m) return { label: `the last ${m[1]} days`, days: parseInt(m[1]) };
  }
  return null;
}

async function fetchData() {
  try {
    const [summaryRes, trendsRes] = await Promise.all([
      api.get("/api/v1/dashboard/summary"),
      api.get("/api/v1/dashboard/match-rates?days=30"),
    ]);
    return { summary: summaryRes.data, trends: trendsRes.data, error: null };
  } catch {
    return { summary: null, trends: null, error: "backend" };
  }
}

async function fetchSources() {
  try {
    const { data } = await api.get("/api/v1/data-sources");
    return data;
  } catch {
    return null;
  }
}

async function fetchExceptions() {
  try {
    const { data } = await api.get("/api/v1/exceptions/stats");
    return data;
  } catch {
    return null;
  }
}

async function fetchTrends(days: number) {
  try {
    const { data } = await api.get(`/api/v1/dashboard/match-rates?days=${days}`);
    return data;
  } catch {
    return null;
  }
}

async function getResponse(q: string, name: string): Promise<string> {
  const lq = q.toLowerCase().trim();

  // ── Greetings ──
  if (/^(hi|hello|hey|howdy|yo|sup)\b/i.test(lq) || /^good\s*(morning|afternoon|evening|day)/i.test(lq)) {
    const hour = new Date().getHours();
    const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return `${g}, **${name}**! 👋\n\nI'm your finance operations copilot. I have full visibility into your reconciliation data, match rates, exceptions, and trends.\n\nWhat would you like to know? Here are some things I can do:\n\n` +
      `• **"What's my overall status?"** — full health check\n` +
      `• **"Show me today's activity"** — recent runs and stats\n` +
      `• **"Any exceptions I should worry about?"** — risk analysis\n` +
      `• **"Help me improve match rates"** — actionable recommendations\n` +
      `• **"Compare last 7 days vs this week"** — trend analysis`;
  }

  // ── Casual conversation ──
  if (/^(how are you|how'?s it going|how do you do|what'?s up)/i.test(lq))
    return `I'm running at full capacity, ${name}! All systems are operational. More importantly — let me check on **your** operations...\n\nWant me to give you a quick status update?`;

  if (/^(thanks|thank\s*you|ty|cheers|appreciate)/i.test(lq))
    return `Happy to help, ${name}! I'm always here whenever you need insights into your reconciliation data. Just ask! 🎯`;

  if (/^(ok|okay|got\s*it|sure|alright|understood|makes\s*sense)/i.test(lq))
    return `Great! Anything else you'd like to explore, ${name}? I can dig into specific reconciliations, analyze trends, or help you optimize your match rates.`;

  if (/^(bye|goodbye|see\s*you|later|exit|quit|close)/i.test(lq))
    return `See you later, ${name}! Remember — I'm monitoring your reconciliation data 24/7. Come back anytime you need insights. 👋`;

  if (/who are you|what are you|your name|about you/i.test(lq))
    return `I'm **ReconART AI** — your intelligent reconciliation copilot, ${name}.\n\nThink of me as your finance operations analyst who never sleeps. I can:\n\n` +
      `🔍 **Analyze** — Match rates, trends, exception patterns\n` +
      `📊 **Report** — Daily, weekly, monthly summaries\n` +
      `⚠️ **Alert** — Flag issues that need attention\n` +
      `💡 **Recommend** — Actions to improve performance\n` +
      `📈 **Compare** — Period-over-period analysis\n\n` +
      `I have real-time access to all your reconciliation data. Just ask me anything!`;

  if (/what can you do|help me|capabilities|features/i.test(lq))
    return `Here's everything I can do for you, ${name}:\n\n` +
      `**📊 Data Queries**\n` +
      `• "What's my match rate?" / "Show reconciliation summary"\n` +
      `• "How many data sources do I have?"\n` +
      `• "List my open exceptions"\n\n` +
      `**📈 Analysis**\n` +
      `• "How are match rates trending this week?"\n` +
      `• "Compare last 7 days performance"\n` +
      `• "Which reconciliation needs attention?"\n\n` +
      `**⚠️ Risk & Alerts**\n` +
      `• "Any exceptions I should worry about?"\n` +
      `• "What's my unreconciled percentage?"\n` +
      `• "What needs my attention today?"\n\n` +
      `**💡 Recommendations**\n` +
      `• "Help me improve match rates"\n` +
      `• "How can I reduce exceptions?"\n` +
      `• "What should I focus on?"\n\n` +
      `Just talk to me naturally — I'll figure out what you need!`;

  // ── Data queries — fetch data ──
  const { summary, trends, error } = await fetchData();

  if (error || !summary) {
    if (/network|err_/i.test(String(error)))
      return `I'm having trouble reaching the server, ${name}. It might be waking up — try again in a few seconds.`;
    return `I need a moment to connect to your data, ${name}. Please make sure you're signed in and try again.`;
  }

  const rate = summary.average_match_rate ?? 0;
  const recons = summary.total_reconciliations ?? 0;
  const exceptions = summary.open_exceptions ?? 0;
  const runs = summary.runs_this_month ?? 0;
  const recentRuns = summary.recent_runs ?? [];

  // ── Overall status / summary ──
  if (/overall|status|summary|overview|dashboard|how.*doing|how.*look|picture|health/i.test(lq)) {
    const health = rate >= 95 ? "🟢 Excellent" : rate >= 85 ? "🟡 Good" : "🔴 Needs Attention";
    return `Here's your operations overview, ${name}:\n\n` +
      `**Health: ${health}**\n\n` +
      `| Metric | Value |\n` +
      `|---|---|\n` +
      `| Reconciliations | **${recons}** active |\n` +
      `| Average Match Rate | **${rate.toFixed(1)}%** |\n` +
      `| Open Exceptions | **${exceptions}** |\n` +
      `| Runs This Month | **${runs}** |\n\n` +
      (exceptions > 0
        ? `⚠️ You have **${exceptions}** open exceptions that need review. Would you like me to analyze them?`
        : `✅ All clean — no open exceptions. Your operations are running smoothly!`) +
      `\n\n💡 **Suggestion:** ` +
      (rate < 90 ? `Your match rate is below 90%. Ask me "How can I improve match rates?" for recommendations.`
        : rate < 95 ? `Your match rate is good but could be better. Consider adding tolerance-based matching rules.`
        : `Your match rate is excellent! Keep monitoring for any dips.`);
  }

  // ── Match rate queries ──
  if (/match\s*rate|accuracy|matching|reconcil.*percent|reconcil.*rate/i.test(lq)) {
    const dateRange = parseDate(lq);
    if (dateRange) {
      const periodTrends = await fetchTrends(dateRange.days);
      if (periodTrends && periodTrends.length > 0) {
        const avgRate = periodTrends.reduce((s: number, t: { match_rate: number }) => s + t.match_rate, 0) / periodTrends.length;
        const totalRuns = periodTrends.reduce((s: number, t: { run_count: number }) => s + t.run_count, 0);
        const best = Math.max(...periodTrends.map((t: { match_rate: number }) => t.match_rate));
        const worst = Math.min(...periodTrends.map((t: { match_rate: number }) => t.match_rate));
        return `Match rate analysis for **${dateRange.label}**, ${name}:\n\n` +
          `📊 **Average:** ${avgRate.toFixed(1)}%\n` +
          `📈 **Best day:** ${best.toFixed(1)}%\n` +
          `📉 **Worst day:** ${worst.toFixed(1)}%\n` +
          `🔄 **Total runs:** ${totalRuns}\n\n` +
          (best - worst > 5
            ? `⚠️ There's a **${(best - worst).toFixed(1)}%** variance between your best and worst days. This suggests inconsistency — some data sources may have quality issues on certain days.`
            : `✅ Variance is low (${(best - worst).toFixed(1)}%). Your reconciliations are performing consistently.`);
      }
    }
    return `Your current average match rate is **${rate.toFixed(1)}%**, ${name}.\n\n` +
      (rate >= 95 ? `🎯 **Excellent!** You're in the top tier. This means nearly all transactions are matching automatically.`
        : rate >= 90 ? `📊 **Good** — but there's room to push higher. You could gain efficiency by:\n\n1. Adding tolerance-based rules for small amount differences\n2. Using fuzzy matching for reference number variations\n3. Reviewing your top exception types for patterns`
        : `⚠️ **Below target.** Here's what I'd recommend:\n\n1. **Check data quality** — inconsistent formats cause false mismatches\n2. **Add tolerance rules** — small rounding differences shouldn't be exceptions\n3. **Review matching criteria** — your rules may be too strict\n4. **Use AI suggested rules** — let the system learn from manual matches`) +
      `\n\nWant me to analyze trends? Ask "How are match rates trending this month?"`;
  }

  // ── Exception queries ──
  if (/exception|unmatched|unmatch|unreconcil|discrepan|issue|problem|error|anomal|worry|risk|attention/i.test(lq)) {
    const excStats = await fetchExceptions();
    if (excStats) {
      const byStatus = excStats.by_status || {};
      const open = byStatus.open || 0;
      const resolved = byStatus.resolved || 0;
      const total = open + resolved;
      const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : "0";
      return `Exception analysis for you, ${name}:\n\n` +
        `| Status | Count |\n` +
        `|---|---|\n` +
        `| 🔴 Open | **${open}** |\n` +
        `| ✅ Resolved | **${resolved}** |\n` +
        `| Resolution Rate | **${resolutionRate}%** |\n\n` +
        (open === 0
          ? `🎉 **No open exceptions!** Your reconciliation operations are clean. Great work!`
          : open <= 5
          ? `👍 Only **${open}** open — manageable. I'd recommend reviewing them today to keep things clean.`
          : open <= 20
          ? `⚠️ **${open}** open exceptions need attention. Consider:\n\n1. Sort by severity — tackle high-severity first\n2. Use **Auto-Resolve** for small tolerance differences\n3. Assign exceptions to team members for parallel resolution`
          : `🚨 **${open}** open exceptions is high. Urgent steps:\n\n1. Check if there's a data quality issue in recent uploads\n2. Review matching rules — they may need loosening\n3. Use **Bulk Resolve** for common patterns\n4. Set up **Sweeps** to auto-handle recurring patterns`);
    }
    return `You currently have **${exceptions}** open exceptions, ${name}.\n\n` +
      `Go to any completed reconciliation run to review and resolve them. Would you like tips on reducing exceptions?`;
  }

  // ── Unreconciled / reconciled percentage ──
  if (/%.*unreconcil|unreconcil.*%|%.*reconcil|reconcil.*%|percentage/i.test(lq)) {
    const reconciledPct = rate.toFixed(1);
    const unreconciledPct = (100 - rate).toFixed(1);
    return `Here's the breakdown, ${name}:\n\n` +
      `✅ **Reconciled:** ${reconciledPct}%\n` +
      `❌ **Unreconciled:** ${unreconciledPct}%\n\n` +
      (parseFloat(unreconciledPct) > 10
        ? `⚠️ ${unreconciledPct}% unreconciled is high. This means roughly 1 in ${Math.round(100 / parseFloat(unreconciledPct))} transactions aren't matching. Check your matching rules and data quality.`
        : parseFloat(unreconciledPct) > 5
        ? `📊 ${unreconciledPct}% unreconciled is acceptable but improvable. Focus on the most common exception types to bring this down.`
        : `🎯 Only ${unreconciledPct}% unreconciled — that's excellent performance!`);
  }

  // ── Data source queries ──
  if (/data\s*source|source|upload|file|connect|import/i.test(lq)) {
    const sources = await fetchSources();
    if (sources) {
      const items = sources.items || [];
      const count = items.length;
      if (/list|show|all/i.test(lq) && count > 0) {
        const list = items.slice(0, 10).map((s: { name: string; status: string; row_count: number | null }) =>
          `• **${s.name}** — ${s.status} ${s.row_count ? `(${s.row_count.toLocaleString()} rows)` : ""}`
        ).join("\n");
        return `You have **${count}** data source(s), ${name}:\n\n${list}` +
          (count > 10 ? `\n\n...and ${count - 10} more. Check the **Data Sources** page for the full list.` : "") +
          `\n\nNeed to add more? Go to **Data Sources → Create Source** to upload files or connect a database.`;
      }
      return `You have **${count}** data source(s), ${name}.\n\n` +
        `To manage your data:\n` +
        `1. **Upload files** — CSV, Excel, JSON supported\n` +
        `2. **Connect databases** — PostgreSQL, MySQL, Databricks\n` +
        `3. **Create unions** — combine multiple sources\n` +
        `4. **Create groups** — aggregate by columns\n\n` +
        `Would you like to see the list? Ask "List all my data sources".`;
    }
    return `I couldn't fetch your data sources right now. Try again in a moment, ${name}.`;
  }

  // ── Recent activity / runs ──
  if (/recent|latest|today|activity|run|last\s*run|what\s*happen/i.test(lq)) {
    if (recentRuns.length > 0) {
      const lines = recentRuns.slice(0, 5).map((r: { status: string; match_rate: number | null; matched_count: number | null; exception_count: number | null; created_at: string }) => {
        const status = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
        const time = new Date(r.created_at).toLocaleString();
        return `${status} **${r.match_rate?.toFixed(1) ?? "N/A"}%** match rate | ${r.matched_count ?? 0} matched | ${r.exception_count ?? 0} exceptions — ${time}`;
      });
      return `Recent activity, ${name}:\n\n${lines.join("\n")}\n\n` +
        `📊 **${runs}** total runs this month.\n\n` +
        `Want me to analyze the trends? Ask "How are match rates trending this month?"`;
    }
    return `No recent runs found, ${name}. Create a reconciliation and run it to start generating data. Need help getting started?`;
  }

  // ── Trend analysis ──
  if (/trend|trending|over\s*time|improve|progress|getting\s*better|getting\s*worse|compare|comparison|week|month/i.test(lq)) {
    const dateRange = parseDate(lq) || { label: "the last 30 days", days: 30 };
    const periodTrends = await fetchTrends(dateRange.days);
    if (periodTrends && periodTrends.length > 0) {
      const rates = periodTrends.map((t: { match_rate: number }) => t.match_rate);
      const avgRate = rates.reduce((s: number, r: number) => s + r, 0) / rates.length;
      const firstHalf = rates.slice(0, Math.floor(rates.length / 2));
      const secondHalf = rates.slice(Math.floor(rates.length / 2));
      const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s: number, r: number) => s + r, 0) / firstHalf.length : 0;
      const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s: number, r: number) => s + r, 0) / secondHalf.length : 0;
      const improving = secondAvg > firstAvg;

      return `Trend analysis for **${dateRange.label}**, ${name}:\n\n` +
        `📊 **Average match rate:** ${avgRate.toFixed(1)}%\n` +
        `📈 **Best:** ${Math.max(...rates).toFixed(1)}%\n` +
        `📉 **Worst:** ${Math.min(...rates).toFixed(1)}%\n` +
        `📅 **Data points:** ${periodTrends.length} days\n\n` +
        (improving
          ? `🟢 **Trend: Improving** — Your match rate went from ${firstAvg.toFixed(1)}% to ${secondAvg.toFixed(1)}% (+${(secondAvg - firstAvg).toFixed(1)}%). Keep doing what you're doing!`
          : secondAvg === firstAvg
          ? `🟡 **Trend: Stable** — Match rates are holding steady around ${avgRate.toFixed(1)}%. Consider optimizing your rules to push higher.`
          : `🔴 **Trend: Declining** — Match rate dropped from ${firstAvg.toFixed(1)}% to ${secondAvg.toFixed(1)}% (${(secondAvg - firstAvg).toFixed(1)}%). Investigate:\n\n1. New data sources with different formats?\n2. Changed transaction patterns?\n3. Rules that need updating?`);
    }
    return `No trend data available for ${dateRange.label}, ${name}. Run some reconciliations first and I'll track the trends for you.`;
  }

  // ── Improvement / optimization advice ──
  if (/improve|optimi|better|increase|reduce|lower|fix|suggest|recommend|advice|tip|best\s*practice/i.test(lq)) {
    const areas: string[] = [];
    if (rate < 95) areas.push(`📈 **Boost match rate** (currently ${rate.toFixed(1)}%)\n   • Add tolerance rules for small amount differences (±0.01-1.00)\n   • Enable fuzzy matching for reference numbers\n   • Use AI suggested rules to learn from manual matches`);
    if (exceptions > 5) areas.push(`⚠️ **Reduce exceptions** (currently ${exceptions} open)\n   • Set up auto-resolve sweeps for common patterns\n   • Create segments to separate clean vs messy data\n   • Review top exception types for root causes`);
    if (recons === 0) areas.push(`🔄 **Get started**\n   • Upload your first data sources\n   • Create a reconciliation with matching rules\n   • Run it and review the results`);
    if (runs < 5) areas.push(`🏃 **Increase automation**\n   • Set up scheduled runs (daily/weekly)\n   • Connect live data sources for real-time recon\n   • Use the API for programmatic triggers`);

    if (areas.length === 0) {
      return `Your operations look great, ${name}! Here are some advanced optimizations:\n\n` +
        `1. **Multi-currency matching** — enable FX tolerance for cross-border transactions\n` +
        `2. **Custom sweeps** — auto-handle recurring exception patterns\n` +
        `3. **Scheduling** — automate daily reconciliation runs\n` +
        `4. **Exports** — generate PDF/CSV reports for stakeholders\n` +
        `5. **Segments** — slice data by entity, region, or product for granular analysis`;
    }
    return `Here's my optimization plan for you, ${name}:\n\n${areas.join("\n\n")}\n\n` +
      `Want me to dive deeper into any of these?`;
  }

  // ── Lowest / worst performing ──
  if (/lowest|worst|problem|poor|bad|concern|flag/i.test(lq)) {
    if (recentRuns.length > 0) {
      const sorted = [...recentRuns].sort((a: { match_rate: number | null }, b: { match_rate: number | null }) => (a.match_rate ?? 100) - (b.match_rate ?? 100));
      const worst = sorted[0];
      return `The reconciliation run with the lowest performance, ${name}:\n\n` +
        `📉 **Match Rate:** ${worst.match_rate?.toFixed(1) ?? "N/A"}%\n` +
        `📊 **Status:** ${worst.status}\n` +
        `⚠️ **Exceptions:** ${worst.exception_count ?? 0}\n` +
        `📅 **Date:** ${new Date(worst.created_at).toLocaleString()}\n\n` +
        `**What I'd investigate:**\n` +
        `1. Were there data quality issues in the source files?\n` +
        `2. Were the matching rules appropriate for this data?\n` +
        `3. Were there any new transaction types that rules don't cover?\n\n` +
        `Go to **Reconciliations** to review this run in detail.`;
    }
    return `No runs found to analyze, ${name}. Run a reconciliation first!`;
  }

  // ── Create / setup questions ──
  if (/create|setup|set\s*up|add|new|configure|start|begin|how\s*to/i.test(lq)) {
    if (/reconcil/i.test(lq))
      return `To create a new reconciliation, ${name}:\n\n1. Go to **Reconciliations** → **New Reconciliation**\n2. Select your **left source** (e.g., bank statement)\n3. Select your **right source** (e.g., company ledger)\n4. Add **matching rules** (column pairs + comparison type)\n5. Click **Run** to execute\n\n💡 **Pro tip:** Use "AI Suggested Rules" to auto-detect the best matching columns!`;
    if (/source|upload|data/i.test(lq))
      return `To add a data source, ${name}:\n\n1. Go to **Data Sources** → **Create Source**\n2. Upload a file (CSV, Excel, JSON supported)\n3. The system will auto-detect columns and data types\n4. You can upload multiple files into the same source\n\n💡 **Pro tip:** Name your sources clearly (e.g., "Bank Statement - August 2026") for easy tracking.`;
    if (/schedule/i.test(lq))
      return `To set up automated runs, ${name}:\n\n1. Go to **Schedules** → **Create Schedule**\n2. Select a reconciliation\n3. Set the cron expression (e.g., \`0 8 * * *\` for daily at 8 AM)\n4. Enable notifications to get emailed on completion/failure\n\n💡 **Pro tip:** Start with weekly runs and increase frequency as your data pipeline matures.`;
    if (/export|report|download/i.test(lq))
      return `To export your data, ${name}:\n\n1. Go to **Exports** → **New Export**\n2. Select a reconciliation run\n3. Choose format: **CSV**, **Excel**, or **PDF**\n4. Choose scope: matched, unmatched, exceptions, or full\n5. Click Export — you'll get a download when it's ready\n\n💡 **Pro tip:** PDF exports include branded summary reports, perfect for stakeholders.`;
    return `I can help you set things up, ${name}! What would you like to create?\n\n• **"Create a reconciliation"** — match two data sources\n• **"Add a data source"** — upload files or connect databases\n• **"Set up a schedule"** — automate recurring runs\n• **"Create an export"** — download reports`;
  }

  // ── Default — intelligent fallback ──
  return `I hear you, ${name}! Let me give you a quick snapshot:\n\n` +
    `📊 **${recons}** reconciliations | **${rate.toFixed(1)}%** avg match rate | **${exceptions}** open exceptions | **${runs}** runs this month\n\n` +
    `I can help with anything related to your reconciliation operations. Try:\n\n` +
    `• **"What needs my attention?"** — priority items\n` +
    `• **"How are match rates trending?"** — performance analysis\n` +
    `• **"Help me improve"** — optimization recommendations\n` +
    `• **"Show me last 7 days"** — period analysis\n\n` +
    `Or just ask me anything — I'll do my best to help!`;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [welcomed, setWelcomed] = useState(false);

  useEffect(() => {
    if (open && !welcomed && firstName) {
      const hour = new Date().getHours();
      const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      setMessages([{
        id: "welcome",
        role: "assistant",
        text: `${g}, **${firstName}**! 👋\n\nI'm your ReconART finance copilot. I have full access to your reconciliation data, match rates, exceptions, and trends.\n\nWhat can I help you with today?`,
        timestamp: new Date(),
      }]);
      setWelcomed(true);
    }
  }, [open, welcomed, firstName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text?: string) {
    const question = text || input.trim();
    if (!question) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: question,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const response = await getResponse(question, firstName);

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      text: response,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsTyping(false);
  }

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-[var(--card-border)] bg-[var(--background)] shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">ReconART AI</h3>
            <p className="text-[10px] text-emerald-400">Finance Copilot · Online</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                  : "bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--card-border)]"
              )}
            >
              {msg.text.split("\n").map((line, i) => (
                <p key={i} className={i > 0 ? "mt-1" : ""}>
                  {line.split("**").map((part, j) =>
                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                  )}
                </p>
              ))}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--background-tertiary)]">
                <User className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
              <Bot className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <div className="rounded-2xl bg-[var(--background-secondary)] border border-[var(--card-border)] px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">Suggested</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => handleSend(action)}
                className="rounded-full border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1 text-xs text-[var(--foreground-muted)] transition-colors hover:border-cyan-500/30 hover:text-cyan-400"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 focus-within:border-cyan-500/30">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask me anything about your reconciliations..."
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] outline-none"
            disabled={isTyping}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white transition-opacity disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
