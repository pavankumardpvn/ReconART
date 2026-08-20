"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Plus, Send, Sparkles, Bot, User, Check, XCircle, Paperclip,
  Loader2, Trash2, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  api, createSource, createReconciliation, runReconciliation,
  createUnion, getDataSources, getReconciliations, uploadDataSource,
  getDataSourceColumns,
} from "@/lib/api";
import PageContainer from "@/components/layout/PageContainer";

interface Action {
  type: string;
  params: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  action?: Action | null;
  actionStatus?: string | null;
  createdAt?: string;
}

interface Session {
  sessionId: string;
  title: string | null;
  status: string;
  updatedAt: string | null;
}

async function executeAction(action: Action): Promise<string> {
  try {
    switch (action.type) {
      case "create_source": {
        const p = action.params as { name: string; source_type?: string; description?: string };
        const result = await createSource({ name: p.name, source_type: p.source_type || "file_upload", description: p.description });
        return `Source **${result.name}** created! (ID: \`${result.id}\`)\n\nYou can now upload files to it or use it in a reconciliation.`;
      }
      case "create_reconciliation": {
        const result = await createReconciliation(action.params);
        return `Reconciliation **${(result as { name: string }).name}** created! (ID: \`${(result as { id: string }).id}\`)\n\nWant me to run it?`;
      }
      case "run_reconciliation": {
        const p = action.params as { recon_id: string };
        const result = await runReconciliation(p.recon_id);
        return `Run started! (Run ID: \`${result.id}\`) Status: **${result.status}**\n\nCheck the Reconciliations page for results.`;
      }
      case "create_union": {
        const result = await createUnion(action.params);
        return `Union **${(result as { name: string }).name}** created! (ID: \`${(result as { id: string }).id}\`)`;
      }
      case "list_sources": {
        const result = await getDataSources();
        const items = result.items || [];
        if (!items.length) return "No data sources found. Upload a file or create one to get started.";
        return `**${items.length}** source(s):\n\n` + items.map((s: { name: string; id: string; row_count: number | null; status: string }) =>
          `• **${s.name}** — ${s.row_count?.toLocaleString() || 0} rows (${s.status}) \`${s.id}\``).join("\n");
      }
      case "delete_source": {
        const p = action.params as { source_id: string };
        const sid = p.source_id?.trim();
        if (!sid || sid.length < 10) return `Invalid source ID: "${sid}". Try "list my sources" first to see the correct IDs.`;
        await api.delete(`/api/v1/data-sources/${sid}`);
        return `Source deleted successfully!`;
      }
      case "delete_reconciliation": {
        const p = action.params as { recon_id: string };
        const rid = p.recon_id?.trim();
        if (!rid || rid.length < 10) return `Invalid reconciliation ID: "${rid}". Try "list my reconciliations" first.`;
        await api.delete(`/api/v1/reconciliations/${rid}`);
        return `Reconciliation deleted successfully!`;
      }
      case "list_reconciliations": {
        const result = await getReconciliations();
        const items = result.items || [];
        if (!items.length) return "No reconciliations found. Create one to get started.";
        return `**${items.length}** reconciliation(s):\n\n` + items.map((r: { name: string; id: string; status: string; recon_type: string }) =>
          `• **${r.name}** — ${r.recon_type} (${r.status}) \`${r.id}\``).join("\n");
      }
      case "suggest_rules": {
        const p = action.params as { left_source_id: string; right_source_id: string };
        const { data } = await api.post("/api/v1/ai/analyze-columns", { left_source_id: p.left_source_id, right_source_id: p.right_source_id });
        const sug = data.suggestions || [];
        if (!sug.length) return "No obvious column matches found. Specify the columns manually.";
        return `Suggested rules:\n\n` + sug.map((s: { left_column: string; right_column: string; comparison: string; confidence: number }) =>
          `• **${s.left_column}** ↔ **${s.right_column}** (${s.comparison}, ${Math.round(s.confidence * 100)}%)`).join("\n");
      }
      default: return `Unknown action: ${action.type}`;
    }
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
    const detail = axiosErr.response?.data ? JSON.stringify(axiosErr.response.data) : axiosErr.message || String(err);
    console.error("Action failed:", action.type, action.params, err);
    return `Failed to execute **${action.type}**: ${detail}`;
  }
}

function getActionLabel(action: Action): string {
  const labels: Record<string, string> = {
    create_source: `Create source "${(action.params as { name?: string }).name || ""}"`,
    delete_source: `Delete source`,
    create_reconciliation: `Create reconciliation "${(action.params as { name?: string }).name || ""}"`,
    delete_reconciliation: `Delete reconciliation`,
    run_reconciliation: "Run reconciliation",
    create_union: `Create union "${(action.params as { name?: string }).name || ""}"`,
    list_sources: "List data sources",
    list_reconciliations: "List reconciliations",
    suggest_rules: "Analyze & suggest matching rules",
  };
  return labels[action.type] || action.type;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function AgentPage() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/agent/sessions");
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const { data } = await api.get(`/api/v1/agent/sessions/${sessionId}/messages`);
      setMessages((data.messages || []).map((m: Message) => ({
        ...m,
        action: m.action || null,
        actionStatus: m.actionStatus || null,
      })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function createNewSession() {
    try {
      const { data } = await api.post("/api/v1/agent/sessions");
      setActiveSession(data.sessionId);
      setMessages([]);
      await loadSessions();
    } catch { /* ignore */ }
  }

  async function selectSession(id: string) {
    setActiveSession(id);
    await loadMessages(id);
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.delete(`/api/v1/agent/sessions/${id}`);
      if (activeSession === id) { setActiveSession(null); setMessages([]); }
      await loadSessions();
    } catch { /* ignore */ }
  }

  async function handleSend(text?: string) {
    const q = text || input.trim();
    if (!q || !activeSession) return;

    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: q }]);
    setInput("");
    setIsTyping(true);

    try {
      const { data } = await api.post(`/api/v1/agent/sessions/${activeSession}/messages`, { message: q, user_name: firstName });

      if (data.action && (data.action.type === "list_sources" || data.action.type === "list_reconciliations")) {
        const result = await executeAction(data.action);
        setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", text: result }]);
      } else {
        setMessages((prev) => [...prev, {
          id: data.messageId || (Date.now() + 1).toString(),
          role: "assistant",
          text: data.response,
          action: data.action,
          actionStatus: data.action ? "pending" : null,
        }]);
      }
      await loadSessions();
    } catch {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", text: "Something went wrong. Try again." }]);
    }
    setIsTyping(false);
  }

  async function handleConfirm(msgId: string) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.action) return;

    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionStatus: "confirmed" } : m));
    setIsTyping(true);
    const result = await executeAction(msg.action);
    setMessages((prev) => [
      ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "done" } : m),
      { id: (Date.now() + 2).toString(), role: "system", text: result },
    ]);
    if (activeSession) {
      try { await api.patch(`/api/v1/agent/sessions/${activeSession}/messages/${msgId}`, { action_status: "done" }); } catch { /* ignore */ }
    }
    setIsTyping(false);
  }

  function handleCancel(msgId: string) {
    setMessages((prev) => [
      ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "cancelled" } : m),
      { id: (Date.now() + 3).toString(), role: "assistant", text: "No problem! What else can I help with?" },
    ]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeSession) return;
    setIsUploading(true);
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: `📎 Uploading **${file.name}**...` }]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const source = await uploadDataSource(formData);
      let colsStr = "";
      try { const cols = await getDataSourceColumns(source.id); colsStr = cols.map((c: { name: string; data_type: string }) => `${c.name} (${c.data_type})`).join(", "); } catch { /* */ }

      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "system",
        text: `Uploaded **${file.name}** — **${source.row_count?.toLocaleString() || 0}** rows.\n\nSource ID: \`${source.id}\`${colsStr ? `\nColumns: ${colsStr}` : ""}\n\nWhat would you like to do with this data?`,
      }]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "system", text: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }]);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <PageContainer title="AI Agent">
      <div className="flex h-[calc(100vh-10rem)] rounded-2xl border border-[var(--card-border)] bg-[var(--background-secondary)] overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-64 shrink-0 border-r border-[var(--card-border)] bg-[var(--background)] flex flex-col">
          <div className="p-3 border-b border-[var(--card-border)]">
            <button onClick={createNewSession} className="flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-purple-500/20">
              <Plus className="h-4 w-4" /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--foreground-subtle)]">No conversations yet.<br />Click "New Chat" to start.</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => selectSession(s.sessionId)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-all",
                    activeSession === s.sessionId
                      ? "bg-[var(--background-tertiary)] border border-cyan-500/20"
                      : "hover:bg-[var(--background-tertiary)] border border-transparent"
                  )}
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--foreground-subtle)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--foreground)]">{s.title || "New conversation"}</p>
                    <p className="text-[10px] text-[var(--foreground-subtle)]">{timeAgo(s.updatedAt)}</p>
                  </div>
                  <button onClick={(e) => deleteSession(s.sessionId, e)} className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-[var(--foreground-subtle)] hover:bg-red-500/20 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col">
          {!activeSession ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
                <Sparkles className="h-8 w-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">ReconART Agent</h2>
              <p className="max-w-sm text-center text-sm text-[var(--foreground-muted)]">
                I can create data sources, set up reconciliations, run matching, and analyze your data. Click "New Chat" to start.
              </p>
              <button onClick={createNewSession} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white hover:shadow-lg">
                <Plus className="h-4 w-4" /> Start a conversation
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 pt-20">
                    <Bot className="h-10 w-10 text-cyan-400/40" />
                    <p className="text-sm text-[var(--foreground-subtle)]">Send a message or upload a file to get started.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id}>
                    <div className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role !== "user" && (
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", msg.role === "system" ? "bg-emerald-500/20" : "bg-gradient-to-br from-purple-500/20 to-cyan-500/20")}>
                          {msg.role === "system" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Bot className="h-3.5 w-3.5 text-cyan-400" />}
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        msg.role === "user" ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                          : msg.role === "system" ? "bg-emerald-500/10 text-[var(--foreground)] border border-emerald-500/20"
                          : "bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)]"
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
                    {msg.action && msg.actionStatus === "pending" && (
                      <div className="ml-10 mt-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                        <p className="mb-2 text-xs font-medium text-purple-300">{getActionLabel(msg.action)}</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleConfirm(msg.id)} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"><Check className="h-3 w-3" /> Confirm</button>
                          <button onClick={() => handleCancel(msg.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"><XCircle className="h-3 w-3" /> Cancel</button>
                        </div>
                      </div>
                    )}
                    {msg.action && msg.actionStatus === "confirmed" && <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Loader2 className="h-3 w-3 animate-spin" /> Executing...</div>}
                    {msg.action && msg.actionStatus === "done" && <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Check className="h-3 w-3" /> Done</div>}
                    {msg.action && msg.actionStatus === "cancelled" && <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-[var(--foreground-subtle)]"><XCircle className="h-3 w-3" /> Cancelled</div>}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20"><Bot className="h-3.5 w-3.5 text-cyan-400" /></div>
                    <div className="rounded-2xl bg-[var(--background)] border border-[var(--card-border)] px-4 py-3">
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

              {/* Input */}
              <div className="border-t border-[var(--card-border)] p-4">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 focus-within:border-cyan-500/30">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.xlsx,.xls,.json,.txt" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={isTyping || isUploading} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] disabled:opacity-30" title="Upload file">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                  <input
                    type="text" value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Ask me anything or upload a file..."
                    className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] outline-none"
                    disabled={isTyping || isUploading}
                  />
                  <button onClick={() => handleSend()} disabled={!input.trim() || isTyping || isUploading} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white disabled:opacity-30">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
