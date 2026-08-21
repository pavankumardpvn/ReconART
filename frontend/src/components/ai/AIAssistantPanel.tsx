"use client";

import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import { X, Send, Sparkles, Bot, User, Check, XCircle, Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, createSource, uploadFileToSource, getDataSourceColumns } from "@/lib/api";

interface Action {
  type: string;
  params: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
  action?: Action | null;
  actionStatus?: "pending" | "confirmed" | "cancelled" | "done";
}

const QUICK_ACTIONS = [
  "What's my overall status?",
  "List my data sources",
  "Help me create a reconciliation",
  "Upload a file to get started",
  "What needs my attention?",
  "Help me improve match rates",
];

async function callAI(q: string, name: string): Promise<{ response: string; action: Action | null }> {
  const doCall = () => api.post("/api/v1/ai/chat", { message: q, user_name: name });
  try {
    const { data } = await doCall();
    return { response: data.response || "Could you rephrase that?", action: data.action || null };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: { response?: string } }; message?: string };
    if (axiosErr.response?.status === 401) {
      try {
        const { refreshToken } = await import("@/lib/auth");
        await refreshToken();
        const { data } = await doCall();
        return { response: data.response || "Could you rephrase?", action: data.action || null };
      } catch {
        return { response: `Your session may have expired, ${name}. Please refresh the page.`, action: null };
      }
    }
    const msg = axiosErr.message || "";
    if (msg.includes("Network") || msg.includes("ERR_"))
      return { response: `Can't reach the server, ${name}. Try again in 10 seconds.`, action: null };
    return { response: `Something went wrong (${axiosErr.response?.status || msg}), ${name}. Try again.`, action: null };
  }
}

async function executeAction(action: Action, name: string): Promise<string> {
  try {
    const { data } = await api.post("/api/v1/ai/chat", {
      message: `Execute action: ${action.type} with params ${JSON.stringify(action.params)}`,
      user_name: name,
    });
    return data.response || "Done!";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed: ${msg}`;
  }
}

function getActionLabel(action: Action): string {
  const labels: Record<string, string> = {
    create_source: `Create source "${(action.params as { name?: string }).name || ""}"`,
    delete_source: "Delete source",
    create_reconciliation: `Create reconciliation "${(action.params as { name?: string }).name || ""}"`,
    delete_reconciliation: "Delete reconciliation",
    run_reconciliation: "Run reconciliation",
    create_union: `Create union "${(action.params as { name?: string }).name || ""}"`,
    list_sources: "List data sources",
    list_reconciliations: "List reconciliations",
    suggest_rules: "Analyze & suggest rules",
  };
  return labels[action.type] || action.type;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [welcomed, setWelcomed] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (open && !welcomed && firstName) {
      const hour = new Date().getHours();
      const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      setMessages([{
        id: "welcome",
        role: "assistant",
        text: `${g}, **${firstName}**! 👋\n\nI'm your ReconART agent. I can **create data sources**, **set up reconciliations**, **run matching**, and analyze your data.\n\nTry: "Help me create a reconciliation" or upload a file to get started.`,
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

    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      role: "user",
      text: question,
      timestamp: new Date(),
    }]);
    setInput("");

    if (pendingFile) {
      const file = pendingFile;
      const sourceName = question.trim();
      setPendingFile(null);
      setIsTyping(true);

      try {
        const source = await createSource({ name: sourceName, source_type: "file_upload" });
        const formData = new FormData();
        formData.append("file", file);
        await uploadFileToSource(source.id, formData);

        let colsStr = "";
        try {
          const cols = await getDataSourceColumns(source.id);
          colsStr = cols
            .filter((c: { name: string }) => !c.name.startsWith("art_"))
            .map((c: { name: string; data_type: string }) => `${c.name} (${c.data_type})`)
            .join(", ");
        } catch { /* ignore */ }

        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "system",
          text: `Source **${sourceName}** created with **${file.name}** synced.\n\nSource ID: \`${source.id}\`${colsStr ? `\nColumns: ${colsStr}` : ""}\n\nAll rows have been assigned unique **ART IDs** automatically.`,
          timestamp: new Date(),
        }]);

        queryClient.invalidateQueries({ queryKey: ["resources"] });
        queryClient.invalidateQueries({ queryKey: ["data-sources"] });

        const aiMsg = `I created source "${sourceName}" from file "${file.name}". Source ID: ${source.id}. Columns: ${colsStr || "unknown"}. What should I do next?`;
        const { response, action } = await callAI(aiMsg, firstName);

        setMessages((prev) => [...prev, {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          text: response,
          timestamp: new Date(),
          action,
          actionStatus: action ? "pending" : undefined,
        }]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "system",
          text: `Failed to create source: ${msg}`,
          timestamp: new Date(),
        }]);
      }

      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    const { response, action } = await callAI(question, firstName);

    setMessages((prev) => [...prev, {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      text: response,
      timestamp: new Date(),
      action: action,
      actionStatus: action ? "pending" : undefined,
    }]);
    setIsTyping(false);
  }

  async function handleActionConfirm(msgId: string) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.action) return;

    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionStatus: "confirmed" as const } : m));
    setIsTyping(true);

    const result = await executeAction(msg.action, firstName);

    setMessages((prev) => [
      ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "done" as const } : m),
      {
        id: (Date.now() + 2).toString(),
        role: "system" as const,
        text: result,
        timestamp: new Date(),
      },
    ]);
    setIsTyping(false);
  }

  function handleActionCancel(msgId: string) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionStatus: "cancelled" as const } : m));
    setMessages((prev) => [...prev, {
      id: (Date.now() + 3).toString(),
      role: "assistant",
      text: "No problem! Let me know if you'd like to do something else.",
      timestamp: new Date(),
    }]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

    setPendingFile(file);

    setMessages((prev) => [...prev,
      {
        id: Date.now().toString(),
        role: "user" as const,
        text: `📎 Selected **${file.name}**`,
        timestamp: new Date(),
      },
      {
        id: (Date.now() + 1).toString(),
        role: "assistant" as const,
        text: `I've read your file:\n\n**File:** ${file.name}\n**Type:** ${ext}\n**Size:** ${sizeMB} MB\n\nWhat would you like to **name this source**? Type your preferred name below.`,
        timestamp: new Date(),
      },
    ]);

    if (fileInputRef.current) fileInputRef.current.value = "";
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
            <h3 className="text-sm font-semibold text-[var(--foreground)]">ReconART Agent</h3>
            <p className="text-[10px] text-emerald-400">Can create & run reconciliations</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role !== "user" && (
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", msg.role === "system" ? "bg-emerald-500/20" : "bg-gradient-to-br from-purple-500/20 to-cyan-500/20")}>
                  {msg.role === "system" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Bot className="h-3.5 w-3.5 text-cyan-400" />}
                </div>
              )}
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user" ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                  : msg.role === "system" ? "bg-emerald-500/10 text-[var(--foreground)] border border-emerald-500/20"
                  : "bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--card-border)]"
              )}>
                {msg.text.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-1" : ""}>
                    {line.split("**").map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
                  </p>
                ))}
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--background-tertiary)]">
                  <User className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
                </div>
              )}
            </div>

            {/* Action Card */}
            {msg.action && msg.actionStatus === "pending" && (
              <div className="ml-10 mt-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                <p className="mb-2 text-xs font-medium text-purple-300">{getActionLabel(msg.action)}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleActionConfirm(msg.id)} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">
                    <Check className="h-3 w-3" /> Confirm
                  </button>
                  <button onClick={() => handleActionCancel(msg.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]">
                    <XCircle className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            )}
            {msg.action && msg.actionStatus === "confirmed" && (
              <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Executing...
              </div>
            )}
            {msg.action && msg.actionStatus === "done" && (
              <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400">
                <Check className="h-3 w-3" /> Done
              </div>
            )}
            {msg.action && msg.actionStatus === "cancelled" && (
              <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-[var(--foreground-subtle)]">
                <XCircle className="h-3 w-3" /> Cancelled
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
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">Quick Start</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button key={action} onClick={() => handleSend(action)} className="rounded-full border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1 text-xs text-[var(--foreground-muted)] transition-colors hover:border-cyan-500/30 hover:text-cyan-400">
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 focus-within:border-cyan-500/30">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.xlsx,.xls,.json,.txt" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping || isUploading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] disabled:opacity-30"
            title="Upload a file"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={pendingFile ? "Type your preferred source name..." : "Ask me or upload a file..."}
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] outline-none"
            disabled={isTyping || isUploading}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping || isUploading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white transition-opacity disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
