"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import {
  X, Send, Sparkles, Bot, User, Check, XCircle, Paperclip,
  Loader2, Trash2, MessageSquare, Plus, ChevronLeft, History,
} from "lucide-react";
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
    const { data } = await api.post("/api/v1/agent/execute-action", {
      action_type: action.type,
      params: action.params,
    });
    return data.result || "Done!";
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: { result?: string; detail?: string } }; message?: string };
    if (axiosErr.response?.data?.result) return axiosErr.response.data.result;
    if (axiosErr.response?.data?.detail) return `Failed: ${axiosErr.response.data.detail}`;
    return `Failed: ${axiosErr.message || String(err)}`;
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

type PanelView = "new" | "history" | "chat";

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";

  const [view, setView] = useState<PanelView>("new");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
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
        ...m, action: m.action || null, actionStatus: m.actionStatus || null,
      })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      loadSessions();
      setView("new");
      setActiveSession(null);
      setMessages([]);
    }
  }, [open, loadSessions]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function startNewChat() {
    try {
      const { data } = await api.post("/api/v1/agent/sessions");
      setActiveSession(data.sessionId);
      setMessages([]);
      setView("chat");
      await loadSessions();
    } catch { /* ignore */ }
  }

  async function selectSession(id: string) {
    setActiveSession(id);
    await loadMessages(id);
    setView("chat");
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.delete(`/api/v1/agent/sessions/${id}`);
      if (activeSession === id) { setActiveSession(null); setMessages([]); }
      await loadSessions();
    } catch { /* ignore */ }
  }

  function goBack() {
    setActiveSession(null);
    setMessages([]);
    setView("new");
  }

  async function handleSend(text?: string) {
    const q = text || input.trim();
    if (!q) return;

    if (!activeSession) {
      try {
        const { data } = await api.post("/api/v1/agent/sessions");
        setActiveSession(data.sessionId);
        setView("chat");
        await loadSessions();

        setMessages([{ id: Date.now().toString(), role: "user", text: q }]);
        setInput("");
        setIsTyping(true);

        const resp = await api.post(`/api/v1/agent/sessions/${data.sessionId}/messages`, { message: q, user_name: firstName });
        setMessages((prev) => [...prev, {
          id: resp.data.messageId || (Date.now() + 1).toString(),
          role: "assistant", text: resp.data.response,
          action: resp.data.action || null, actionStatus: resp.data.action ? "pending" : null,
        }]);
        await loadSessions();
        setIsTyping(false);
      } catch {
        setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", text: "Something went wrong. Try again." }]);
        setIsTyping(false);
      }
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: q }]);
    setInput("");

    if (pendingFile) {
      const file = pendingFile;
      const sourceName = q.trim();
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
          id: (Date.now() + 1).toString(), role: "system",
          text: `Source **${sourceName}** created with **${file.name}** synced.\n\nSource ID: \`${source.id}\`${colsStr ? `\nColumns: ${colsStr}` : ""}\n\nAll rows have been assigned unique **ART IDs** automatically.`,
        }]);

        queryClient.invalidateQueries({ queryKey: ["resources"] });
        queryClient.invalidateQueries({ queryKey: ["data-sources"] });

        const aiMsg = `I created source "${sourceName}" from file "${file.name}". Source ID: ${source.id}. Columns: ${colsStr || "unknown"}. What should I do next?`;
        const { data } = await api.post(`/api/v1/agent/sessions/${activeSession}/messages`, { message: aiMsg, user_name: firstName });
        setMessages((prev) => [...prev, {
          id: data.messageId || (Date.now() + 2).toString(),
          role: "assistant", text: data.response,
          action: data.action || null, actionStatus: data.action ? "pending" : null,
        }]);
        await loadSessions();
      } catch (err: unknown) {
        setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "system", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }]);
      }
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    try {
      const { data } = await api.post(`/api/v1/agent/sessions/${activeSession}/messages`, { message: q, user_name: firstName });
      setMessages((prev) => [...prev, {
        id: data.messageId || (Date.now() + 1).toString(),
        role: "assistant", text: data.response,
        action: data.action || null, actionStatus: data.action ? "pending" : null,
      }]);
      await loadSessions();
    } catch {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", text: "Something went wrong. Try again." }]);
    }
    setIsTyping(false);
  }

  async function handleConfirm(msgId: string) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.action || !activeSession) return;

    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionStatus: "confirmed" } : m));
    setIsTyping(true);

    let result = "Done!";
    try {
      const { data } = await api.post(`/api/v1/agent/sessions/${activeSession}/messages`, {
        message: `Execute action: ${msg.action.type} with params ${JSON.stringify(msg.action.params)}`,
        user_name: firstName,
      });
      result = data.response || "Done!";
    } catch (err: unknown) {
      result = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    setMessages((prev) => [
      ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "done" } : m),
      { id: (Date.now() + 2).toString(), role: "system", text: result },
    ]);
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
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
    if (!file) return;

    if (!activeSession) {
      try {
        const { data } = await api.post("/api/v1/agent/sessions");
        setActiveSession(data.sessionId);
        setView("chat");
        await loadSessions();
      } catch { return; }
    }

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

    setPendingFile(file);

    setMessages((prev) => [...prev,
      { id: Date.now().toString(), role: "user" as const, text: `📎 Selected **${file.name}**` },
      {
        id: (Date.now() + 1).toString(), role: "assistant" as const,
        text: `I've read your file:\n\n**File:** ${file.name}\n**Type:** ${ext}\n**Size:** ${sizeMB} MB\n\nWhat would you like to **name this source**? Type your preferred name below.`,
      },
    ]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!open) return null;

  const inChat = view === "chat" && activeSession;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-[var(--card-border)] bg-[var(--background)] shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          {inChat && (
            <button
              onClick={goBack}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">ReconART Agent</h3>
            <p className="text-[10px] text-emerald-400">
              {inChat ? "Active session" : "AI-powered assistant"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!inChat ? (
        /* ============================================================
           TAB VIEW — New Chat / History
           ============================================================ */
        <div className="flex flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-[var(--card-border)]">
            <button
              onClick={() => setView("new")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold transition-all",
                view === "new"
                  ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </button>
            <button
              onClick={() => { setView("history"); loadSessions(); }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold transition-all",
                view === "history"
                  ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
              )}
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </div>

          {view === "new" ? (
            /* ---- NEW CHAT TAB ---- */
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
                  <Sparkles className="h-8 w-8 text-cyan-400" />
                </div>
                <div className="text-center">
                  <h3 className="mb-2 text-base font-semibold text-[var(--foreground)]">
                    Hi {firstName}!
                  </h3>
                  <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
                    I can create data sources, set up reconciliations, run matching, and analyze your data. Type below or upload a file to get started.
                  </p>
                </div>

                <div className="w-full space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">Quick Start</p>
                  {[
                    "What's my overall status?",
                    "List my data sources",
                    "Help me create a reconciliation",
                    "Help me improve match rates",
                  ].map((action) => (
                    <button
                      key={action}
                      onClick={() => handleSend(action)}
                      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 text-xs text-[var(--foreground-muted)] transition-all hover:border-cyan-500/30 hover:text-cyan-400 hover:bg-cyan-500/5"
                    >
                      <MessageSquare className="h-3 w-3 shrink-0" />
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input for new chat */}
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
                    placeholder="Start a new conversation..."
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
          ) : (
            /* ---- HISTORY TAB ---- */
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 pt-16">
                  <History className="h-10 w-10 text-[var(--foreground-subtle)]/30" />
                  <p className="text-sm font-medium text-[var(--foreground-muted)]">No previous chats</p>
                  <p className="text-xs text-[var(--foreground-subtle)]">
                    Start a new conversation to see it here.
                  </p>
                  <button
                    onClick={() => setView("new")}
                    className="mt-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Chat
                  </button>
                </div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.sessionId}
                    onClick={() => selectSession(s.sessionId)}
                    className="group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-all hover:bg-[var(--background-tertiary)] border border-transparent hover:border-cyan-500/10"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
                      <MessageSquare className="h-3.5 w-3.5 text-[var(--foreground-subtle)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">{s.title || "New conversation"}</p>
                      <p className="text-[10px] text-[var(--foreground-subtle)]">{timeAgo(s.updatedAt)}</p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(s.sessionId, e)}
                      className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-[var(--foreground-subtle)] hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        /* ============================================================
           CHAT VIEW
           ============================================================ */
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 pt-16">
                <Bot className="h-10 w-10 text-cyan-400/40" />
                <p className="text-sm text-[var(--foreground-subtle)]">Send a message or upload a file to get started.</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role !== "user" && (
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      msg.role === "system" ? "bg-emerald-500/20" : "bg-gradient-to-br from-purple-500/20 to-cyan-500/20")}>
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

                {msg.action && msg.actionStatus === "pending" && (
                  <div className="ml-10 mt-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                    <p className="mb-2 text-xs font-medium text-purple-300">{getActionLabel(msg.action)}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleConfirm(msg.id)} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">
                        <Check className="h-3 w-3" /> Confirm
                      </button>
                      <button onClick={() => handleCancel(msg.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]">
                        <XCircle className="h-3 w-3" /> Cancel
                      </button>
                    </div>
                  </div>
                )}
                {msg.action && msg.actionStatus === "confirmed" && (
                  <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Loader2 className="h-3 w-3 animate-spin" /> Executing...</div>
                )}
                {msg.action && msg.actionStatus === "done" && (
                  <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Check className="h-3 w-3" /> Done</div>
                )}
                {msg.action && msg.actionStatus === "cancelled" && (
                  <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-[var(--foreground-subtle)]"><XCircle className="h-3 w-3" /> Cancelled</div>
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
                placeholder={pendingFile ? "Type your preferred source name..." : "Ask me anything or upload a file..."}
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
        </>
      )}
    </div>
  );
}
