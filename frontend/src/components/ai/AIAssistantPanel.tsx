"use client";

import { useState, useRef, useEffect } from "react";
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
  "Show me my reconciliation summary",
  "How many open exceptions do I have?",
  "What is my average match rate?",
  "Which reconciliation has the lowest match rate?",
  "Show me recent runs",
  "How many data sources do I have?",
];

async function getAssistantResponse(question: string): Promise<string> {
  const q = question.toLowerCase();

  try {
    // Fetch dashboard data for context
    const { data: summary } = await api.get("/api/v1/dashboard/summary");

    if (q.includes("summary") || q.includes("overview") || q.includes("status")) {
      return `Here's your reconciliation summary:\n\n` +
        `• **${summary.total_reconciliations}** total reconciliations\n` +
        `• **${summary.average_match_rate?.toFixed(1) ?? 0}%** average match rate\n` +
        `• **${summary.open_exceptions}** open exceptions\n` +
        `• **${summary.runs_this_month ?? 0}** runs this month\n\n` +
        (summary.open_exceptions > 5
          ? `⚠️ You have ${summary.open_exceptions} exceptions that need attention. Consider reviewing high-severity items first.`
          : `✅ Things look healthy. Keep up the good work!`);
    }

    if (q.includes("exception")) {
      return `You currently have **${summary.open_exceptions}** open exceptions.\n\n` +
        (summary.open_exceptions > 0
          ? `To review them, go to any completed reconciliation run and check the results table. You can filter by status "Unreconciled" to see items that need attention.\n\n` +
            `💡 Tip: Use the "Auto-Resolve" feature to automatically resolve exceptions below a certain threshold.`
          : `Great news — no open exceptions! All your reconciliations are clean.`);
    }

    if (q.includes("match rate") || q.includes("rate")) {
      const rate = summary.average_match_rate ?? 0;
      return `Your average match rate is **${rate.toFixed(1)}%**.\n\n` +
        (rate >= 95 ? `🎯 Excellent! This is above the 95% target.` :
         rate >= 90 ? `📊 Good, but there's room for improvement. Consider reviewing your matching rules.` :
         `⚠️ This is below the 90% target. Here are some suggestions:\n\n` +
         `1. Review your matching rules — you may need tolerance matching\n` +
         `2. Check for data quality issues in your sources\n` +
         `3. Use the "AI Suggested Rules" feature when creating reconciliations`);
    }

    if (q.includes("lowest") || q.includes("worst") || q.includes("problem")) {
      if (summary.recent_runs && summary.recent_runs.length > 0) {
        const worst = [...summary.recent_runs].sort((a: any, b: any) => (a.match_rate ?? 100) - (b.match_rate ?? 100))[0];
        return `The reconciliation run with the lowest match rate is:\n\n` +
          `• **Run ID:** ${String(worst.id).slice(0, 8)}...\n` +
          `• **Match Rate:** ${worst.match_rate?.toFixed(1) ?? 'N/A'}%\n` +
          `• **Status:** ${worst.status}\n` +
          `• **Exceptions:** ${worst.exception_count ?? 0}\n\n` +
          `Go to **Reconciliations** to investigate this run.`;
      }
      return "No reconciliation runs found yet. Create a reconciliation and run it to see results.";
    }

    if (q.includes("recent") || q.includes("runs") || q.includes("latest")) {
      if (summary.recent_runs && summary.recent_runs.length > 0) {
        const lines = summary.recent_runs.slice(0, 5).map((r: any) =>
          `• **${r.status}** — Match rate: ${r.match_rate?.toFixed(1) ?? 'N/A'}% — ${r.matched_count ?? 0} matched, ${r.exception_count ?? 0} exceptions`
        );
        return `Here are your most recent runs:\n\n${lines.join('\n')}\n\nGo to **Reconciliations** to see full details.`;
      }
      return "No recent runs found. Create and run a reconciliation to get started.";
    }

    if (q.includes("data source") || q.includes("source") || q.includes("upload")) {
      const { data: sources } = await api.get("/api/v1/data-sources");
      const count = sources.items?.length ?? sources.total ?? 0;
      return `You have **${count}** data source(s).\n\n` +
        `To add more data:\n` +
        `1. Go to **Data Sources** → **Create Source**\n` +
        `2. Upload files (CSV, Excel, JSON) into your source\n` +
        `3. Or connect a database via **Pipeline** → **Connectors**\n\n` +
        `💡 Tip: You can upload multiple files into the same source for daily reconciliation.`;
    }

    if (q.includes("help") || q.includes("what can") || q.includes("how to")) {
      return `I can help you with:\n\n` +
        `📊 **Data & Sources** — "How many data sources do I have?"\n` +
        `🔄 **Reconciliation** — "Show me my reconciliation summary"\n` +
        `⚠️ **Exceptions** — "How many open exceptions do I have?"\n` +
        `📈 **Performance** — "What is my average match rate?"\n` +
        `🏃 **Recent Activity** — "Show me recent runs"\n` +
        `🔍 **Analysis** — "Which reconciliation has the lowest match rate?"\n\n` +
        `Just type your question or click a quick action below!`;
    }

    // Default response
    return `Based on your data:\n\n` +
      `• **${summary.total_reconciliations}** reconciliations configured\n` +
      `• **${summary.average_match_rate?.toFixed(1) ?? 0}%** average match rate\n` +
      `• **${summary.open_exceptions}** open exceptions\n\n` +
      `Try asking me something specific like "How many exceptions do I have?" or "Show me recent runs".`;

  } catch {
    return "I couldn't fetch your data right now. Make sure you're logged in and try again.\n\nYou can ask me about:\n• Reconciliation summary\n• Open exceptions\n• Match rates\n• Recent runs\n• Data sources";
  }
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! I'm your Recon ART assistant. I can help you understand your reconciliation data, find exceptions, and suggest improvements.\n\nHow can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const response = await getAssistantResponse(question);

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
            <h3 className="text-sm font-semibold text-[var(--foreground)]">AI Assistant</h3>
            <p className="text-[10px] text-emerald-400">Online</p>
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
              {msg.text.split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? "mt-1" : ""}>
                  {line.split('**').map((part, j) =>
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
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">Quick Actions</p>
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
            placeholder="Ask me anything..."
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
