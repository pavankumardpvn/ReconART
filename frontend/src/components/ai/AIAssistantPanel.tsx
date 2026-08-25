"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import {
  X, Send, Sparkles, Bot, User, Check, XCircle, Paperclip,
  Loader2, Trash2, MessageSquare, Plus, ChevronLeft, History,
  AlertCircle, Copy, RefreshCw,
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
  actionStatus?: "pending" | "confirmed" | "cancelled" | "done";
  failed?: boolean;
  failedQuery?: string;
}

interface StoredChat {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
}

const MAX_CHATS = 3;
const STORAGE_KEY = "reconart-chat-history";

function loadChatsFromStorage(): StoredChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChatsToStorage(chats: StoredChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch { /* ignore */ }
}

function generateTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.text.length > 40 ? first.text.slice(0, 40) + "..." : first.text;
}

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

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const QUICK_ACTIONS = [
  "What's my overall status?",
  "List my data sources",
  "Help me create a reconciliation",
  "Help me improve match rates",
];

const THINKING_PHRASES = [
  "Analyzing your request...",
  "Looking up your data...",
  "Processing...",
  "Thinking...",
  "Preparing response...",
];

function getFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.includes("source") && (lower.includes("created") || lower.includes("list")))
    return ["Create a reconciliation", "Upload another file", "Show source details"];
  if (lower.includes("reconciliation") && (lower.includes("created") || lower.includes("list")))
    return ["Run reconciliation", "View match results", "List data sources"];
  if (lower.includes("match") || lower.includes("accuracy"))
    return ["Suggest matching rules", "View exceptions", "Run reconciliation"];
  if (lower.includes("exception") || lower.includes("unmatched"))
    return ["Resolve exceptions", "Adjust matching rules", "Export results"];
  if (lower.includes("upload") || lower.includes("file"))
    return ["Upload a file", "List my data sources", "Create a reconciliation"];
  return [];
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
  const [storedChats, setStoredChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [welcomed, setWelcomed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshChats = useCallback(() => {
    const chats = loadChatsFromStorage();
    setStoredChats(chats);
    return chats;
  }, []);

  useEffect(() => {
    if (open) {
      refreshChats();
      if (!welcomed && firstName) {
        const hour = new Date().getHours();
        const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        setMessages([{
          id: "welcome",
          role: "assistant",
          text: `${g}, **${firstName}**!\n\nI'm your ReconART agent. I can **create data sources**, **set up reconciliations**, **run matching**, and analyze your data.\n\nTry a quick action below or type your question.`,
        }]);
        setWelcomed(true);
      }
    }
  }, [open, welcomed, firstName, refreshChats]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!isTyping) { setThinkingStatus(""); return; }
    let i = 0;
    setThinkingStatus(THINKING_PHRASES[0]);
    const timer = setInterval(() => {
      i = (i + 1) % THINKING_PHRASES.length;
      setThinkingStatus(THINKING_PHRASES[i]);
    }, 2500);
    return () => clearInterval(timer);
  }, [isTyping]);

  function handleCopy(text: string, msgId: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleRetry(msg: Message) {
    if (!msg.failedQuery) return;
    const updated = messages.filter((m) => m.id !== msg.id);
    setMessages(updated);
    handleSend(msg.failedQuery);
  }

  function saveCurrentChat(msgs: Message[], chatId?: string | null) {
    const id = chatId || activeChatId || `chat-${Date.now()}`;
    const chats = loadChatsFromStorage();
    const existing = chats.findIndex((c) => c.id === id);
    const chatData: StoredChat = {
      id,
      title: generateTitle(msgs),
      messages: msgs.filter((m) => m.id !== "welcome"),
      updatedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      chats[existing] = chatData;
    } else {
      chats.unshift(chatData);
    }

    saveChatsToStorage(chats);
    setStoredChats(chats);
    if (!activeChatId) setActiveChatId(id);
    return id;
  }

  function selectChat(chat: StoredChat) {
    setActiveChatId(chat.id);
    setMessages(chat.messages);
    setView("chat");
  }

  function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const chats = loadChatsFromStorage().filter((c) => c.id !== id);
    saveChatsToStorage(chats);
    setStoredChats(chats);
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
      setView("history");
    }
  }

  function goBack() {
    setActiveChatId(null);
    setMessages([]);
    setWelcomed(false);
    setView("new");
    refreshChats();
  }

  function switchToNewChat() {
    const chats = refreshChats();
    if (chats.length >= MAX_CHATS) {
      setView("new");
      return;
    }
    setActiveChatId(null);
    setMessages([]);
    setWelcomed(false);
    setView("new");
  }

  async function handleSend(text?: string) {
    const question = text || input.trim();
    if (!question) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: question };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
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

        const sysMsg: Message = {
          id: (Date.now() + 1).toString(), role: "system",
          text: `Source **${sourceName}** created with **${file.name}** synced.\n\nSource ID: \`${source.id}\`${colsStr ? `\nColumns: ${colsStr}` : ""}\n\nAll rows have been assigned unique **ART IDs** automatically.`,
        };

        const aiQuestion = `I created source "${sourceName}" from file "${file.name}". Source ID: ${source.id}. Columns: ${colsStr || "unknown"}. What should I do next?`;
        const { response, action } = await callAI(aiQuestion, firstName);

        const aiMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant", text: response,
          action, actionStatus: action ? "pending" : undefined,
        };

        const updated = [...newMessages, sysMsg, aiMsg];
        setMessages(updated);
        saveCurrentChat(updated);

        queryClient.invalidateQueries({ queryKey: ["resources"] });
        queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const errMsg: Message = { id: (Date.now() + 1).toString(), role: "system", text: `Failed to create source: ${msg}` };
        const updated = [...newMessages, errMsg];
        setMessages(updated);
        saveCurrentChat(updated);
      }

      setIsTyping(false);
      if (view === "new") setView("chat");
      return;
    }

    setIsTyping(true);
    const { response, action } = await callAI(question, firstName);

    const isFailed = response.includes("Something went wrong") || response.includes("Can't reach the server");
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant", text: response,
      action, actionStatus: action ? "pending" : undefined,
      failed: isFailed || undefined,
      failedQuery: isFailed ? question : undefined,
    };

    const updated = [...newMessages, aiMsg];
    setMessages(updated);
    saveCurrentChat(updated);

    if (view === "new") setView("chat");
    setIsTyping(false);
  }

  async function handleActionConfirm(msgId: string) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.action) return;

    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionStatus: "confirmed" as const } : m));
    setIsTyping(true);

    let result = "Done!";
    try {
      const { data } = await api.post("/api/v1/ai/chat", {
        message: `Execute action: ${msg.action.type} with params ${JSON.stringify(msg.action.params)}`,
        user_name: firstName,
      });
      result = data.response || "Done!";
    } catch (err: unknown) {
      result = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    const sysMsg: Message = { id: (Date.now() + 2).toString(), role: "system", text: result };

    setMessages((prev) => {
      const updated = [
        ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "done" as const } : m),
        sysMsg,
      ];
      saveCurrentChat(updated);
      return updated;
    });

    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    setIsTyping(false);
  }

  function handleActionCancel(msgId: string) {
    const cancelMsg: Message = {
      id: (Date.now() + 3).toString(),
      role: "assistant",
      text: "No problem! Let me know if you'd like to do something else.",
    };

    setMessages((prev) => {
      const updated = [
        ...prev.map((m) => m.id === msgId ? { ...m, actionStatus: "cancelled" as const } : m),
        cancelMsg,
      ];
      saveCurrentChat(updated);
      return updated;
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

    setPendingFile(file);

    const fileMsg: Message = { id: Date.now().toString(), role: "user", text: `Selected **${file.name}**` };
    const promptMsg: Message = {
      id: (Date.now() + 1).toString(), role: "assistant",
      text: `I've read your file:\n\n**File:** ${file.name}\n**Type:** ${ext}\n**Size:** ${sizeMB} MB\n\nWhat would you like to **name this source**? Type your preferred name below.`,
    };

    setMessages((prev) => [...prev, fileMsg, promptMsg]);
    if (view === "new") setView("chat");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!open) return null;

  const inChat = view === "chat";
  const isFull = storedChats.length >= MAX_CHATS;

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && !m.failed);
  const followUps = lastAssistantMsg && !isTyping ? getFollowUps(lastAssistantMsg.text) : [];

  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, idx) => (
        <div key={msg.id}>
          <div className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role !== "user" && (
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                msg.role === "system" ? "bg-emerald-500/20" : "bg-gradient-to-br from-purple-500/20 to-cyan-500/20")}>
                {msg.role === "system" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Bot className="h-3.5 w-3.5 text-cyan-400" />}
              </div>
            )}
            <div className="group/msg relative max-w-[85%]">
              <div className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user" ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                  : msg.role === "system" ? "bg-emerald-500/10 text-[var(--foreground)] border border-emerald-500/20"
                  : msg.failed ? "bg-red-500/5 text-[var(--foreground)] border border-red-500/20"
                  : "bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--card-border)]"
              )}>
                {msg.text.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-1" : ""}>
                    {line.split("**").map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
                  </p>
                ))}
              </div>
              {/* Copy button — shown on hover for assistant/system messages */}
              {msg.role !== "user" && msg.id !== "welcome" && (
                <button
                  onClick={() => handleCopy(msg.text, msg.id)}
                  className="absolute -bottom-1 right-1 hidden items-center gap-1 rounded-md bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--foreground-subtle)] hover:text-[var(--foreground)] group-hover/msg:flex"
                >
                  {copiedId === msg.id ? <><Check className="h-2.5 w-2.5 text-emerald-400" /> Copied</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
                </button>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--background-tertiary)]">
                <User className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
              </div>
            )}
          </div>

          {/* Retry button for failed messages */}
          {msg.failed && msg.failedQuery && (
            <div className="ml-10 mt-2">
              <button
                onClick={() => handleRetry(msg)}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          )}

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
            <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Loader2 className="h-3 w-3 animate-spin" /> Executing...</div>
          )}
          {msg.action && msg.actionStatus === "done" && (
            <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-emerald-400"><Check className="h-3 w-3" /> Done</div>
          )}
          {msg.action && msg.actionStatus === "cancelled" && (
            <div className="ml-10 mt-2 flex items-center gap-2 text-xs text-[var(--foreground-subtle)]"><XCircle className="h-3 w-3" /> Cancelled</div>
          )}

          {/* Follow-up suggestions after the last assistant message */}
          {followUps.length > 0 && msg.id === lastAssistantMsg?.id && idx === messages.length - 1 && (
            <div className="ml-10 mt-3 flex flex-wrap gap-1.5">
              {followUps.map((fu) => (
                <button
                  key={fu}
                  onClick={() => handleSend(fu)}
                  className="rounded-full border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1 text-[11px] text-[var(--foreground-muted)] transition-colors hover:border-cyan-500/30 hover:text-cyan-400"
                >
                  {fu}
                </button>
              ))}
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
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-[11px] text-[var(--foreground-subtle)]">{thinkingStatus}</span>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );

  const renderInput = () => (
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
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !isTyping && handleSend()}
          placeholder={pendingFile ? "Type your preferred source name..." : isTyping ? "Type your next message..." : "Ask me or upload a file..."}
          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] outline-none"
          disabled={isUploading}
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
  );

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
              {inChat ? "Active chat" : "AI-powered assistant"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!inChat ? (
        <div className="flex flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-[var(--card-border)]">
            <button
              onClick={switchToNewChat}
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
              onClick={() => { setView("history"); refreshChats(); }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold transition-all",
                view === "history"
                  ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
              )}
            >
              <History className="h-3.5 w-3.5" />
              History
              {storedChats.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-500/20 px-1 text-[10px] font-bold text-purple-400">
                  {storedChats.length}
                </span>
              )}
            </button>
          </div>

          {view === "new" ? (
            isFull ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
                  <AlertCircle className="h-7 w-7 text-amber-400" />
                </div>
                <div className="text-center">
                  <h3 className="mb-2 text-base font-semibold text-[var(--foreground)]">History Full</h3>
                  <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
                    You have {MAX_CHATS} saved conversations. Delete one from the <strong>History</strong> tab to start a new chat.
                  </p>
                </div>
                <button
                  onClick={() => { setView("history"); refreshChats(); }}
                  className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/10"
                >
                  <History className="h-3.5 w-3.5" /> Go to History
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                {renderMessages()}

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

                {renderInput()}
              </div>
            )
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-2">
                <p className="text-[10px] font-medium text-[var(--foreground-subtle)]">
                  {storedChats.length}/{MAX_CHATS} conversations saved
                </p>
              </div>
              {storedChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 pt-12">
                  <History className="h-10 w-10 text-[var(--foreground-subtle)]/30" />
                  <p className="text-sm font-medium text-[var(--foreground-muted)]">No previous chats</p>
                  <p className="text-xs text-[var(--foreground-subtle)]">Start a new conversation to see it here.</p>
                  <button
                    onClick={() => setView("new")}
                    className="mt-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Chat
                  </button>
                </div>
              ) : (
                storedChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => selectChat(chat)}
                    className="group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-all hover:bg-[var(--background-tertiary)] border border-transparent hover:border-cyan-500/10"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
                      <MessageSquare className="h-3.5 w-3.5 text-[var(--foreground-subtle)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">{chat.title}</p>
                      <p className="text-[10px] text-[var(--foreground-subtle)]">
                        {chat.messages.length} messages &middot; {timeAgo(chat.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
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
        <>
          {renderMessages()}
          {renderInput()}
        </>
      )}
    </div>
  );
}
