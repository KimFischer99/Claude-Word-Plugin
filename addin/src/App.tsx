import {
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  FileText,
  History,
  MessageCirclePlus,
  PlugZap,
  Quote,
  RefreshCw,
  Route,
  Settings,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConnectionState = "checking" | "offline" | "not-connected" | "connected";
type ContextMode = "selection" | "document";
type ComposerMenu = "commands" | "context" | "model" | null;
type ModelChoice = "auto" | "sonnet" | "haiku";
type ThinkingEffort = "auto" | "low" | "medium" | "high";
type ProviderMode = "claude2api" | "compatible";
type AttachmentKind = "selection" | "document" | "quote";

interface ProxySettings {
  provider: ProviderMode;
  baseUrl: string;
  apiKey: string;
  adminKey: string;
  compatibleBaseUrl: string;
  compatibleApiKey: string;
  compatibleSonnetModel: string;
  compatibleHaikuModel: string;
  model: ModelChoice;
  thinkingEffort: ThinkingEffort;
  autoRouteAccounts: boolean;
  userName: string;
  assistantName: string;
}

interface DocumentContext {
  mode: ContextMode;
  text: string;
  selectionLength: number;
  documentName: string;
  truncated: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[];
}

interface MessageAttachment {
  kind: AttachmentKind;
  label: string;
  text: string;
  documentName: string;
  selectionLength: number;
  truncated: boolean;
}

interface QuickTask {
  label: string;
}

interface ConversationSnapshot {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextSummary: string;
  documentFingerprint?: string;
  createdAt: number;
  closedAt?: number;
}

interface AccountSummary {
  organization_uuid: string;
  capabilities?: string[] | null;
  cookie_value?: string | null;
  status: string;
  auth_type: string;
  is_pro?: boolean;
  is_max?: boolean;
  last_used: string;
  resets_at?: string | null;
}

interface SkillDefinition {
  id: string;
  label: string;
  path: string;
  content: string;
  loaded: boolean;
}

interface SkillRegistryItem {
  id: string;
  label: string;
  path: string;
}

interface ComposerAttachment extends MessageAttachment {
  id: string;
}

const DEFAULT_SETTINGS: ProxySettings = {
  provider: "claude2api",
  baseUrl: "/aw-proxy",
  apiKey: "",
  adminKey: "",
  compatibleBaseUrl: "",
  compatibleApiKey: "",
  compatibleSonnetModel: "deepseek-chat",
  compatibleHaikuModel: "deepseek-chat",
  model: "sonnet",
  thinkingEffort: "auto",
  autoRouteAccounts: true,
  userName: "You",
  assistantName: "A\\W",
};

interface RequestProfile {
  model: string;
  effort: ThinkingEffort;
}

const MAX_DOCUMENT_CHARS = 12000;
const LEGACY_SONNET_MODELS = new Set(["claude-sonnet-4-20250514", "claude-sonnet-4-6"]);
const LEGACY_HAIKU_MODELS = new Set(["claude-3-5-haiku-20241022", "claude-haiku-4-5"]);
const LEGACY_LOCAL_PROXY_URLS = new Set([
  "http://127.0.0.1:5201",
  "http://localhost:5201",
]);
const PROFILE_STORAGE_KEY = "aw-profile";
const CONNECT_PANEL_SEEN_KEY = "aw-connect-panel-seen";

const quickTasks: QuickTask[] = [
  {
    label: "summarize",
  },
  {
    label: "humanize",
  },
  {
    label: "review",
  },
];

function loadSettings(): ProxySettings {
  try {
    const raw = localStorage.getItem("aw-settings");
    const settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };

    if (LEGACY_SONNET_MODELS.has(settings.model)) {
      settings.model = "sonnet";
    } else if (LEGACY_HAIKU_MODELS.has(settings.model)) {
      settings.model = "haiku";
    } else if (!["auto", "sonnet", "haiku"].includes(settings.model)) {
      settings.model = "sonnet";
    }

    if (!["auto", "low", "medium", "high"].includes(settings.thinkingEffort)) {
      settings.thinkingEffort = "auto";
    }

    if (!["claude2api", "compatible"].includes(settings.provider)) {
      settings.provider = "claude2api";
    }

    if (LEGACY_LOCAL_PROXY_URLS.has(settings.baseUrl)) {
      settings.baseUrl = DEFAULT_SETTINGS.baseUrl;
    }

    settings.userName =
      !settings.userName || settings.userName === "YOU" ? DEFAULT_SETTINGS.userName : settings.userName;
    settings.assistantName = settings.assistantName || DEFAULT_SETTINGS.assistantName;
    settings.autoRouteAccounts = settings.autoRouteAccounts ?? true;
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function loadHistory(): ConversationSnapshot[] {
  try {
    const raw = localStorage.getItem("aw-history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadProfileOverride() {
  try {
    return localStorage.getItem(PROFILE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function loadConnectPanelSeen() {
  try {
    return localStorage.getItem(CONNECT_PANEL_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function modelLabel(model: ModelChoice) {
  if (model === "auto") return "Auto";
  if (model === "haiku") return "Haiku";
  return "Sonnet";
}

function effortLabel(effort: ThinkingEffort) {
  return effort[0].toUpperCase() + effort.slice(1);
}

function resolveModelId(settings: ProxySettings) {
  if (settings.provider === "compatible") {
    if (settings.model === "haiku") return settings.compatibleHaikuModel.trim();
    return settings.compatibleSonnetModel.trim();
  }

  if (settings.model === "haiku") return "claude-haiku-4-5";
  return "claude-sonnet-4-6";
}

function resolveSpecificModelId(settings: ProxySettings, model: Exclude<ModelChoice, "auto">) {
  if (settings.provider === "compatible") {
    return model === "haiku"
      ? settings.compatibleHaikuModel.trim()
      : settings.compatibleSonnetModel.trim();
  }

  return model === "haiku" ? "claude-haiku-4-5" : "claude-sonnet-4-6";
}

function requestProfiles(settings: ProxySettings): RequestProfile[] {
  if (settings.model !== "auto") {
    return [{ model: resolveModelId(settings), effort: settings.thinkingEffort }];
  }

  const profiles: RequestProfile[] = [
    { model: resolveSpecificModelId(settings, "sonnet"), effort: "medium" },
    { model: resolveSpecificModelId(settings, "haiku"), effort: "medium" },
    { model: resolveSpecificModelId(settings, "sonnet"), effort: "low" },
    { model: resolveSpecificModelId(settings, "haiku"), effort: "low" },
  ];

  return profiles.filter((profile) => Boolean(profile.model));
}

function thinkingBudgetTokens(effort: ThinkingEffort) {
  if (effort === "low") return 1024;
  if (effort === "medium") return 2048;
  if (effort === "high") return 4096;
  return 0;
}

function thinkingPayload(effort: ThinkingEffort) {
  const budgetTokens = thinkingBudgetTokens(effort);
  return budgetTokens ? { type: "enabled", budget_tokens: budgetTokens } : undefined;
}

function maxTokensForEffort(effort: ThinkingEffort) {
  const budgetTokens = thinkingBudgetTokens(effort);
  return budgetTokens ? budgetTokens + 1200 : 1200;
}

function plainTextForClipboard(content: string) {
  return content
    .replace(/```[a-z]*\n([\s\S]*?)```/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMessagesEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/v1/messages")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function explainError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Check the service and try again.";
}

function selectionLabel(index: number, total: number) {
  return total > 1 ? `Selection ${String(index + 1).padStart(2, "0")}` : "Selection";
}

function normalizeContextLabels(attachments: ComposerAttachment[]) {
  const selectionIds = attachments
    .filter((attachment) => attachment.kind === "selection")
    .map((attachment) => attachment.id);

  return attachments.map((attachment) => {
    if (attachment.kind !== "selection") return attachment;
    const index = selectionIds.indexOf(attachment.id);
    return {
      ...attachment,
      label: selectionLabel(index, selectionIds.length),
    };
  });
}

function contextSummaryFromAttachments(attachments: ComposerAttachment[]) {
  const contextLabels = attachments
    .filter((attachment) => attachment.kind === "selection" || attachment.kind === "document")
    .map((attachment) => attachment.label);

  return contextLabels.length ? contextLabels.join(", ") : "Chat only";
}

function formatClosedMinute(value: number) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function accountDisplayName(index: number) {
  return `Account ${String(index + 1).padStart(2, "0")}`;
}

function accountState(account: AccountSummary) {
  const status = account.status.toLowerCase();
  if (
    status.includes("limit") ||
    status.includes("rate") ||
    status.includes("invalid") ||
    status.includes("error") ||
    status.includes("disabled")
  ) {
    return "limited";
  }

  if (
    status.includes("valid") ||
    status.includes("online") ||
    status.includes("active") ||
    status.includes("ready") ||
    Boolean(account.cookie_value)
  ) {
    return "online";
  }

  return "limited";
}

function testStatusTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "online") return "online";
  if (normalized === "testing") return "testing";
  return "limited";
}

function buildUserContent(prompt: string, attachments: MessageAttachment[]) {
  if (!attachments.length) {
    return [
      "Direct chat. No file, pasted content, Word selection, or document context is attached.",
      "Respond only to the user's message below.",
      "",
      "User message:",
      prompt,
    ].join("\n");
  }

  const contextBlocks = attachments.map((attachment) => {
    if (attachment.kind === "quote") {
      return [`Quoted assistant response: ${attachment.label}`, attachment.text].join("\n");
    }

    return [
      `Context source: ${attachment.kind}`,
      `Label: ${attachment.label}`,
      `Document: ${attachment.documentName}`,
      "",
      attachment.text,
    ].join("\n");
  });

  return [
    `User request: ${prompt}`,
    "",
    "Attached context:",
    contextBlocks.join("\n\n---\n\n"),
  ].join("\n");
}

function buildSystemPrompt(
  awInstructions: string,
  attachments: MessageAttachment[],
  activeSkill: SkillDefinition | null,
) {
  const parts: string[] = [];

  if (attachments.some((attachment) => attachment.kind !== "quote") && awInstructions.trim()) {
    parts.push(awInstructions.trim());
  }

  if (activeSkill?.content.trim()) {
    parts.push(activeSkill.content.trim());
  }

  return parts.length ? parts.join("\n\n") : undefined;
}

function messageAttachmentFromComposer(attachment: ComposerAttachment): MessageAttachment {
  return {
    kind: attachment.kind,
    label: attachment.label,
    text: attachment.text,
    documentName: attachment.documentName,
    selectionLength: attachment.selectionLength,
    truncated: attachment.truncated,
  };
}

function formatInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    if (value.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{value.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`${match.index}-code`}>{value.slice(1, -1)}</code>);
    }
    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="messageContent">
      {blocks.map((block, blockIndex) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("```")) {
          return (
            <pre key={blockIndex}>
              {trimmed.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "")}
            </pre>
          );
        }

        if (/^#{1,3}\s/.test(trimmed)) {
          return <h3 key={blockIndex}>{formatInline(trimmed.replace(/^#{1,3}\s/, ""))}</h3>;
        }

        const lines = trimmed.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{formatInline(line.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
          return (
            <ol key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{formatInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        return <p key={blockIndex}>{formatInline(trimmed)}</p>;
      })}
    </div>
  );
}

function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 36 ? `${clean.slice(0, 34)}...` : clean || "Untitled chat";
}

async function getDocumentFingerprint(): Promise<string> {
  if (typeof Word === "undefined") return "local";
  return Word.run(async (context) => {
    context.document.properties.load("title");
    await context.sync();
    return context.document.properties.title || "Untitled document";
  });
}

async function readSelectionContext(): Promise<DocumentContext> {
  if (typeof Word === "undefined") {
    return {
      mode: "selection",
      text: "Office.js is not available. This preview text is only for browser development.",
      selectionLength: 0,
      documentName: "Browser preview",
      truncated: false,
    };
  }

  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    context.document.properties.load("title");
    await context.sync();

    const selectedText = selection.text.trim();
    return {
      mode: "selection",
      text: selectedText,
      selectionLength: selectedText.length,
      documentName: context.document.properties.title || "Current Word document",
      truncated: false,
    };
  });
}

async function readDocumentBodyContext(): Promise<DocumentContext> {
  if (typeof Word === "undefined") {
    return {
      mode: "document",
      text: "Office.js is not available. This preview text is only for browser development.",
      selectionLength: 0,
      documentName: "Browser preview",
      truncated: false,
    };
  }

  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    context.document.properties.load("title");
    await context.sync();

    const bodyText = body.text.trim();
    const truncatedText = bodyText.slice(0, MAX_DOCUMENT_CHARS);
    return {
      mode: "document",
      text: truncatedText,
      selectionLength: 0,
      documentName: context.document.properties.title || "Current Word document",
      truncated: bodyText.length > truncatedText.length,
    };
  });
}

async function loadSkillRegistry(): Promise<SkillDefinition[]> {
  const registryResponse = await fetch("/skills/registry.json");
  if (!registryResponse.ok) return [];

  const registry = (await registryResponse.json()) as SkillRegistryItem[];
  return Promise.all(
    registry.map(async (skill) => {
      const builtInSkill = quickTasks.find((task) => task.label === skill.label);
      const fallbackSkill = quickTasks[registry.indexOf(skill)];
      try {
        const skillResponse = await fetch(skill.path);
        return {
          ...skill,
          label: builtInSkill?.label ?? fallbackSkill?.label ?? skill.label,
          content: skillResponse.ok ? await skillResponse.text() : "",
          loaded: skillResponse.ok,
        };
      } catch {
        return {
          ...skill,
          label: builtInSkill?.label ?? fallbackSkill?.label ?? skill.label,
          content: "",
          loaded: false,
        };
      }
    }),
  );
}

export function App() {
  const composerRef = useRef<HTMLFormElement | null>(null);
  const [settings, setSettings] = useState<ProxySettings>(() => loadSettings());
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState<string>("");
  const [testStatus, setTestStatus] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [contextSummary, setContextSummary] = useState("Chat only");
  const [currentDocFingerprint, setCurrentDocFingerprint] = useState("");
  const [contextAttachments, setContextAttachments] = useState<ComposerAttachment[]>([]);
  const [quoteAttachment, setQuoteAttachment] = useState<ComposerAttachment | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<ConversationSnapshot[]>(() => loadHistory());
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [newAccountCookie, setNewAccountCookie] = useState("");
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [activeSkill, setActiveSkill] = useState<SkillDefinition | null>(null);
  const [awInstructions, setAwInstructions] = useState("");
  const [awProfile, setAwProfile] = useState(() => loadProfileOverride());
  const [defaultAwProfile, setDefaultAwProfile] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [connectPanelSeen, setConnectPanelSeen] = useState(() => loadConnectPanelSeen());
  const [composerMenu, setComposerMenu] = useState<ComposerMenu>(null);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const composerAttachments = useMemo(
    () => (quoteAttachment ? [...contextAttachments, quoteAttachment] : contextAttachments),
    [contextAttachments, quoteAttachment],
  );
  const canSubmit = Boolean(prompt.trim() || activeSkill || composerAttachments.length);

  function markConnectPanelSeen() {
    setConnectPanelSeen(true);
    try {
      localStorage.setItem(CONNECT_PANEL_SEEN_KEY, "1");
    } catch {
      // Ignore storage failures in restricted hosts.
    }
  }

  const saveAwProfile = useCallback((next: string) => {
    setAwProfile(next);
    setAwInstructions(next.trim() ? next : defaultAwProfile);
    localStorage.setItem(PROFILE_STORAGE_KEY, next);
  }, [defaultAwProfile]);

  const saveSettings = useCallback((next: ProxySettings) => {
    setSettings(next);
    localStorage.setItem("aw-settings", JSON.stringify(next));
  }, []);

  const saveHistory = useCallback((next: ConversationSnapshot[]) => {
    const limited = next.slice(0, 12);
    setHistory(limited);
    localStorage.setItem("aw-history", JSON.stringify(limited));
  }, []);

  const fetchAccounts = useCallback(async () => {
    if (settings.provider !== "claude2api") {
      setAccounts([]);
      return;
    }

    const response = await fetch(`${settings.baseUrl}/api/admin/accounts`, {
      headers: { Authorization: `Bearer ${settings.adminKey}` },
    });

    if (response.ok) {
      setAccounts(await response.json());
    }
  }, [settings.adminKey, settings.baseUrl, settings.provider]);

  const archiveConversation = useCallback(
    (nextMessages = messages) => {
      if (!nextMessages.length) return;

      const firstUserMessage = nextMessages.find((message) => message.role === "user");
      const snapshot: ConversationSnapshot = {
        id: `${Date.now()}`,
        title: titleFromPrompt(firstUserMessage?.content ?? "Untitled chat"),
        messages: nextMessages,
        contextSummary,
        documentFingerprint: currentDocFingerprint || undefined,
        createdAt: Date.now(),
        closedAt: Date.now(),
      };

      saveHistory([snapshot, ...history.filter((item) => item.title !== snapshot.title)]);
    },
    [contextSummary, currentDocFingerprint, history, messages, saveHistory],
  );

  const checkCompatibleApi = useCallback(async (): Promise<ConnectionState> => {
    const endpoint = normalizeMessagesEndpoint(settings.compatibleBaseUrl);
    const model = resolveModelId(settings);

    if (!endpoint || !settings.compatibleApiKey.trim() || !model) {
      setConnection("not-connected");
      return "not-connected";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.compatibleApiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    const nextConnection = response.ok ? "connected" : "not-connected";
    setConnection(nextConnection);
    if (!response.ok) {
      throw new Error(`Custom API test failed with HTTP ${response.status}.`);
    }
    return nextConnection;
  }, [settings]);

  const checkConnection = useCallback(async (options?: { quiet?: boolean }): Promise<ConnectionState> => {
    setConnection("checking");
    if (!options?.quiet) setError("");

    try {
      if (settings.provider === "compatible") {
        return await checkCompatibleApi();
      }

      const health = await fetch(`${settings.baseUrl}/health`);
      if (!health.ok) {
        setConnection("offline");
        return "offline";
      }

      const stats = await fetch(`${settings.baseUrl}/auth/status`, {
        headers: { Authorization: `Bearer ${settings.adminKey}` },
      });

      if (!stats.ok) {
        setConnection("not-connected");
        return "not-connected";
      }

      const payload = await stats.json();
      const nextConnection = payload?.connected ? "connected" : "not-connected";
      setConnection(nextConnection);
      await fetchAccounts();
      return nextConnection;
    } catch (connectionError) {
      setConnection("offline");
      if (!options?.quiet) setError(explainError(connectionError));
      return "offline";
    }
  }, [checkCompatibleApi, fetchAccounts, settings.adminKey, settings.baseUrl, settings.provider]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    getDocumentFingerprint().then(setCurrentDocFingerprint).catch(() => {});
  }, []);

  useEffect(() => {
    void loadSkillRegistry().then(setSkills);
    void fetch("/AW.md")
      .then((response) => (response.ok ? response.text() : ""))
      .then((profile) => {
        setDefaultAwProfile(profile);
        setAwProfile((prev) => (prev.trim() ? prev : profile));
        setAwInstructions((prev) => (prev.trim() ? prev : profile));
      })
      .catch(() => {
        setAwInstructions((prev) => prev);
      });
  }, []);

  useEffect(() => {
    function archiveOnUnload() {
      archiveConversation();
    }

    window.addEventListener("beforeunload", archiveOnUnload);
    return () => window.removeEventListener("beforeunload", archiveOnUnload);
  }, [archiveConversation]);

  useEffect(() => {
    if (!composerMenu) return;

    function closeMenuOnOutsidePointer(event: PointerEvent) {
      if (!composerRef.current?.contains(event.target as Node)) {
        setComposerMenu(null);
      }
    }

    document.addEventListener("pointerdown", closeMenuOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeMenuOnOutsidePointer);
  }, [composerMenu]);

  useEffect(() => {
    if (composerMenu !== "model") {
      setModelListOpen(false);
    }
  }, [composerMenu]);

  useEffect(() => {
    setContextSummary(contextSummaryFromAttachments(contextAttachments));
  }, [contextAttachments]);

  function makeAttachment(context: DocumentContext, idSuffix = `${Date.now()}`): ComposerAttachment {
    return {
      id: `${context.mode}-${idSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      kind: context.mode,
      label: context.mode === "selection" ? "Selection" : "Document",
      text: context.text,
      documentName: context.documentName,
      selectionLength: context.selectionLength,
      truncated: context.truncated,
    };
  }

  function updateContextAttachments(
    updater: (current: ComposerAttachment[]) => ComposerAttachment[],
  ) {
    setContextAttachments((current) => normalizeContextLabels(updater(current)));
  }

  function removeAttachment(id: string) {
    if (quoteAttachment?.id === id) {
      setQuoteAttachment(null);
      return;
    }

    updateContextAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function attachContext(mode: ContextMode) {
    try {
      setError("");
      const documentContext =
        mode === "selection" ? await readSelectionContext() : await readDocumentBodyContext();
      if (!documentContext.text) {
        setError(mode === "selection" ? "No selected Word text found." : "No readable Word text found.");
        setComposerMenu(mode === "selection" ? "context" : null);
        return;
      }

      updateContextAttachments((current) => {
        if (mode === "document") {
          return [...current.filter((attachment) => attachment.kind !== "document"), makeAttachment(documentContext)];
        }

        const selectionCount = current.filter((attachment) => attachment.kind === "selection").length;
        if (selectionCount >= 5) {
          setError("Selection supports up to 5 text blocks.");
          return current;
        }

        return [...current, makeAttachment(documentContext)];
      });
      setPrompt((current) => (current.endsWith("@") ? current.slice(0, -1) : current));
      setComposerMenu(null);
    } catch (contextError) {
      setError(explainError(contextError));
    }
  }

  async function handleContextButton() {
    if (composerMenu === "context") {
      setComposerMenu(null);
      return;
    }

    try {
      setError("");
      const selection = await readSelectionContext();
      if (selection.text) {
        await attachContext("selection");
        return;
      }
    } catch {
      // Fall through to the explicit context menu.
    }

    setComposerMenu("context");
  }

  async function sendPrompt(
    nextPrompt = prompt,
    baseMessages = messages,
    attachmentOverride?: MessageAttachment[],
  ) {
    const trimmedPrompt = nextPrompt.trim();
    const skillCommand = activeSkill ? `/${activeSkill.label}` : "";
    const effectivePrompt = trimmedPrompt || skillCommand;
    if ((!effectivePrompt && !composerAttachments.length) || isGenerating) return;
    const userPrompt = trimmedPrompt || activeSkill?.label || effectivePrompt;
    const attachmentsForSend = attachmentOverride ?? composerAttachments.map(messageAttachmentFromComposer);
    const messageAttachments = attachmentsForSend.map((attachment) => ({
      ...attachment,
      label:
        attachment.kind === "document"
          ? "@ doc"
          : attachment.kind === "selection"
            ? `@ ${attachment.label.toLowerCase()}`
            : "@ quote",
    }));

    setIsGenerating(true);
    setError("");
    setComposerMenu(null);

    try {
      const userContent = buildUserContent(userPrompt, attachmentsForSend);
      const systemPrompt = buildSystemPrompt(awInstructions, attachmentsForSend, activeSkill);
      const outgoingMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "user",
          content: effectivePrompt || "Attached context",
          attachments: messageAttachments,
        },
      ];

      setMessages(outgoingMessages);
      setPrompt("");
      setContextAttachments([]);
      setQuoteAttachment(null);

      const endpoint =
        settings.provider === "compatible"
          ? normalizeMessagesEndpoint(settings.compatibleBaseUrl)
          : `${settings.baseUrl}/v1/messages`;
      const authKey =
        settings.provider === "compatible" ? settings.compatibleApiKey.trim() : settings.apiKey;

      if (!endpoint || !authKey) {
        throw new Error("Configure a provider endpoint and key before sending.");
      }

      const profiles = requestProfiles(settings);
      let content = "";
      let lastRequestError = "";

      for (const profile of profiles) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authKey}`,
            },
            body: JSON.stringify({
              model: profile.model,
              max_tokens: maxTokensForEffort(profile.effort),
              thinking: thinkingPayload(profile.effort),
              system: systemPrompt,
              messages: [
                ...baseMessages.map((message) => ({
                  role: message.role,
                  content:
                    message.role === "user"
                      ? buildUserContent(message.content, message.attachments ?? [])
                      : message.content,
                })),
                { role: "user", content: userContent },
              ],
              metadata: {
                contextMode: attachmentsForSend.length ? "attached" : "chat",
                contextLabels: attachmentsForSend.map((attachment) => attachment.label),
                selectionCount: attachmentsForSend.filter((attachment) => attachment.kind === "selection").length,
                hasDocument: attachmentsForSend.some((attachment) => attachment.kind === "document"),
                hasQuote: attachmentsForSend.some((attachment) => attachment.kind === "quote"),
                thinkingEffort: profile.effort,
                model: profile.model,
                autoFallback: settings.model === "auto",
                skill: activeSkill?.id,
              },
            }),
          });

          if (!response.ok) {
            const detail = await response.text();
            lastRequestError = detail || `Request failed with HTTP ${response.status}.`;
            continue;
          }

          const payload = await response.json();
          content = Array.isArray(payload.content)
            ? payload.content
                .filter((part: { type?: string; text?: string }) => !part.type || part.type === "text")
                .map((part: { text?: string }) => part.text)
                .filter(Boolean)
                .join("\n")
            : "";

          if (content) break;
          lastRequestError = "The provider returned an empty response.";
        } catch (profileError) {
          lastRequestError = explainError(profileError);
        }
      }

      if (!content) {
        throw new Error(lastRequestError || "The provider returned an empty response.");
      }

      const completedMessages: ChatMessage[] = [
        ...outgoingMessages,
        { role: "assistant", content },
      ];
      const snapshot: ConversationSnapshot = {
        id: `${Date.now()}`,
        title: titleFromPrompt(outgoingMessages[0]?.content ?? effectivePrompt),
        messages: completedMessages,
        contextSummary: attachmentsForSend.length
          ? attachmentsForSend.map((attachment) => attachment.label).join(", ")
          : "Chat only",
        documentFingerprint: currentDocFingerprint || undefined,
        createdAt: Date.now(),
        closedAt: Date.now(),
      };

      setMessages(completedMessages);
      saveHistory([snapshot, ...history.filter((item) => item.title !== snapshot.title)]);
      setConnection("connected");
    } catch (requestError) {
      setError(explainError(requestError));
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyMessage(content: string) {
    await navigator.clipboard.writeText(plainTextForClipboard(content));
  }

  function quoteMessage(content: string, index: number) {
    setQuoteAttachment({
      id: `quote-${Date.now()}-${index}`,
      kind: "quote",
      label: "Quote",
      text: content,
      documentName: "Conversation",
      selectionLength: content.length,
      truncated: false,
    });
    setComposerMenu(null);
  }

  function retryFromMessage(index: number) {
    const lastUserIndex = messages
      .slice(0, index)
      .map((message, messageIndex) => ({ message, messageIndex }))
      .reverse()
      .find((item) => item.message.role === "user")?.messageIndex;

    if (lastUserIndex === undefined) return;

    const userMessage = messages[lastUserIndex];
    const baseMessages = messages.slice(0, lastUserIndex);
    setMessages(baseMessages);
    setPrompt(userMessage.content === "Attached context" ? "" : userMessage.content);
    void sendPrompt(
      userMessage.content === "Attached context" ? "" : userMessage.content,
      baseMessages,
      userMessage.attachments ?? [],
    );
  }

  async function restartAndCheck() {
    setIsTesting(true);
    setError("");
    setTestStatus("Testing");

    try {
      if (settings.provider === "claude2api") {
        const response = await fetch(`${settings.baseUrl}/service/restart`, {
          method: "POST",
          headers: { Authorization: `Bearer ${settings.adminKey}` },
        });
        if (!response.ok) {
          throw new Error(`Service test failed with HTTP ${response.status}.`);
        }
      }

      const nextConnection = await checkConnection({ quiet: true });
      setTestStatus(nextConnection === "connected" ? "Online" : "Offline");
    } catch (serviceError) {
      setConnection("offline");
      setTestStatus(explainError(serviceError).slice(0, 42));
    } finally {
      setIsTesting(false);
    }
  }

  async function addCookieAccount() {
    const cookie = newAccountCookie.trim();
    if (!cookie || isSavingAccount) return;

    setIsSavingAccount(true);
    setError("");
    setTestStatus("Testing");

    try {
      const response = await fetch(`${settings.baseUrl}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.adminKey}`,
        },
        body: JSON.stringify({ cookie_value: cookie }),
      });

      if (!response.ok) {
        throw new Error(`Account save failed with HTTP ${response.status}.`);
      }

      setNewAccountCookie("");
      await fetchAccounts();
      const nextConnection = await checkConnection({ quiet: true });
      setTestStatus(nextConnection === "connected" ? "Online" : "Limited");
    } catch (accountError) {
      setError(explainError(accountError));
      setTestStatus("Limited");
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function deleteAccount(id: string) {
    setError("");

    try {
      const response = await fetch(`${settings.baseUrl}/api/admin/accounts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${settings.adminKey}` },
      });

      if (!response.ok) {
        throw new Error(`Account delete failed with HTTP ${response.status}.`);
      }

      await fetchAccounts();
      await checkConnection({ quiet: true });
    } catch (accountError) {
      setError(explainError(accountError));
    }
  }

  function startNewConversation() {
    archiveConversation();
    setMessages([]);
    setPrompt("");
    setError("");
    setContextAttachments([]);
    setQuoteAttachment(null);
    setContextSummary("Chat only");
    setActiveSkill(null);
    setComposerMenu(null);
    setModelListOpen(false);
  }

  function restoreConversation(snapshot: ConversationSnapshot) {
    archiveConversation();
    setMessages(snapshot.messages);
    setContextSummary(snapshot.contextSummary);
    setContextAttachments([]);
    setQuoteAttachment(null);
    setSelectedHistoryId(snapshot.id);
    setHistoryOpen(false);
    setComposerMenu(null);
    setModelListOpen(false);
  }

  function deleteHistoryItem(id: string) {
    saveHistory(history.filter((item) => item.id !== id));
  }

  function updatePrompt(value: string) {
    setPrompt(value);
    const lastCharacter = value.slice(-1);
    if (lastCharacter === "/") {
      setComposerMenu("commands");
    } else if (lastCharacter === "@") {
      void handleContextButton();
    }
  }

  function selectSkill(skill: SkillDefinition) {
    if (!skill.loaded) return;
    setActiveSkill(skill);
    setPrompt((current) => {
      if (current === "/" || current.endsWith("/")) return current.slice(0, -1);
      return current;
    });
    setComposerMenu(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbarActions">
          <button
            className="iconButton"
            type="button"
            aria-label="New conversation"
            title="New conversation"
            onClick={startNewConversation}
          >
            <MessageCirclePlus size={20} />
          </button>
          <button
            className="iconButton"
            type="button"
            aria-label="Open history"
            title="History"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={20} />
          </button>
          <button
            className="iconButton"
            type="button"
            aria-label="Open settings"
            title="Settings"
            onClick={() => {
              markConnectPanelSeen();
              setSettingsOpen(true);
            }}
          >
            <Settings size={20} />
          </button>
        </div>
        <button
          className="brandButton"
          type="button"
          aria-label="Check service"
          title="Check service"
          onClick={() => {
            markConnectPanelSeen();
            void checkConnection({ quiet: true });
          }}
          disabled={isTesting}
        >
          <img src="/assets/aw-logo.png" alt="" />
          <span className={`statusDot ${connection}`} />
          <span className="statusText">
            {connection === "connected"
              ? "Connected"
              : connection === "checking"
                ? "Checking"
                : "Not linked"}
          </span>
        </button>
      </header>

      {connection !== "connected" &&
      settings.provider === "claude2api" &&
      !accounts.length &&
      !connectPanelSeen ? (
        <section className="connectPanel">
          <div>
            <h2>Connect account</h2>
            <p>Add a Claude Free account cookie in Settings, then test the local link.</p>
          </div>
          <div className="connectActions">
            <button
              type="button"
              className="primaryButton compact"
              onClick={() => {
                markConnectPanelSeen();
                setSettingsOpen(true);
              }}
            >
              <Settings size={16} />
              Settings
            </button>
            <button
              type="button"
              className="ghostButton compact"
              onClick={() => {
                markConnectPanelSeen();
                void checkConnection();
              }}
            >
              <RefreshCw size={16} />
              Check
            </button>
          </div>
        </section>
      ) : null}

      <section className="workspace" aria-label="Conversation">
        {messages.length ? (
          <div className="messages">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="messageRole">
                  {message.role === "user" ? settings.userName : settings.assistantName}
                </div>
                {message.attachments?.length ? (
                  <div className="messageTags" aria-label="Attached context">
                    {message.attachments.map((attachment) => (
                      <span key={`${attachment.kind}-${attachment.label}`}>{attachment.label}</span>
                    ))}
                  </div>
                ) : null}
                <MarkdownMessage content={message.content} />
                {message.role === "assistant" ? (
                  <div className="assistantActions" aria-label="Assistant actions">
                    <button
                      type="button"
                      aria-label="Retry"
                      title="Retry"
                      onClick={() => retryFromMessage(index)}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Copy"
                      title="Copy"
                      onClick={() => void copyMessage(message.content)}
                    >
                      <Clipboard size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Quote"
                      title="Quote"
                      onClick={() => quoteMessage(message.content, index)}
                    >
                      <Quote size={14} />
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            {isGenerating ? (
              <article className="message assistant loading">
                <div className="messageRole">{settings.assistantName}</div>
                <div className="thinkingLine">
                  <span className="thinkingSpinner" />
                  <span>
                    Thinking<span className="thinkingDots" />
                  </span>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="emptyState">
            <img className="emptyMark" src="/assets/aw-logo-mark.svg" alt="" aria-hidden="true" />
            <div className="emptyTitle">How can I help you with this document?</div>
            <div className="emptyCodeBlock" aria-hidden="true">
              <span className="emptyCodePrompt">&gt;</span>
              <span className="emptyCodeCycle" />
            </div>
            <span className="emptyRule" />
          </div>
        )}
      </section>

      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}

      <form
        ref={composerRef}
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendPrompt();
        }}
      >
        {composerMenu ? (
          <div className={`composerMenu ${composerMenu}`} role="menu">
            {composerMenu === "commands" ? (
              <>
                {skills.length ? (
                  skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className={`skillMenuItem ${skill.loaded ? "loaded" : "disabled"} ${
                        activeSkill?.id === skill.id ? "selected" : ""
                      }`}
                      disabled={!skill.loaded}
                      onClick={() => selectSkill(skill)}
                    >
                      <span className="skillSlash" aria-hidden="true">
                        /
                      </span>
                      <span className="skillName">{skill.label}</span>
                      {activeSkill?.id === skill.id ? <Check className="trailingIcon" size={14} /> : null}
                    </button>
                  ))
                ) : (
                  <div className="menuEmpty">No skills found</div>
                )}
              </>
            ) : composerMenu === "context" ? (
              <>
                <button
                  type="button"
                  className={
                    contextAttachments.some((attachment) => attachment.kind === "selection")
                      ? "selected"
                      : ""
                  }
                  onClick={() => void attachContext("selection")}
                >
                  <AtSign size={16} />
                  <span>Selection</span>
                  {contextAttachments.some((attachment) => attachment.kind === "selection") ? (
                    <Check className="trailingIcon" size={14} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={
                    contextAttachments.some((attachment) => attachment.kind === "document")
                      ? "selected"
                      : ""
                  }
                  onClick={() => void attachContext("document")}
                >
                  <FileText size={16} />
                  <span>Document</span>
                  {contextAttachments.some((attachment) => attachment.kind === "document") ? (
                    <Check className="trailingIcon" size={14} />
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <div className="menuSectionLabel">Thinking Effort</div>
                <div className="optionList" role="group" aria-label="Thinking Effort">
                  {(["auto", "low", "medium", "high"] as const).map((effort) => (
                    <button
                      key={effort}
                      type="button"
                      className={settings.thinkingEffort === effort ? "selected" : ""}
                      onClick={() => saveSettings({ ...settings, thinkingEffort: effort })}
                    >
                      <span>{effortLabel(effort)}</span>
                      {settings.thinkingEffort === effort ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="modelMenuToggle"
                  aria-expanded={modelListOpen}
                  onClick={() => setModelListOpen((current) => !current)}
                >
                  <span>Model Setting</span>
                  <strong>{modelLabel(settings.model)}</strong>
                  <ChevronDown size={15} />
                </button>
                {modelListOpen ? (
                  <div className="optionList" role="group" aria-label="Model">
                    {(["auto", "sonnet", "haiku"] as const).map((model) => (
                      <button
                        key={model}
                        type="button"
                        className={settings.model === model ? "selected" : ""}
                        onClick={() => {
                          saveSettings({ ...settings, model });
                          setModelListOpen(false);
                        }}
                      >
                        <span>{modelLabel(model)}</span>
                        {settings.model === model ? <Check size={14} /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <label className="srOnly" htmlFor="prompt">
          Message
        </label>
        {activeSkill || composerAttachments.length ? (
          <div className="composerTokens">
            {activeSkill ? (
              <button
                className="skillPill"
                type="button"
                title="Remove skill"
                onClick={() => setActiveSkill(null)}
              >
                <span>/{activeSkill.label}</span>
                <X size={12} />
              </button>
            ) : null}
            {composerAttachments.map((attachment) => (
              <button
                key={attachment.id}
                className={`contextPill ${attachment.kind}`}
                type="button"
                title={`Remove ${attachment.label}`}
                onClick={() => removeAttachment(attachment.id)}
              >
                <span>{attachment.label}</span>
                <X size={12} />
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          id="prompt"
          value={prompt}
          rows={2}
          onChange={(event) => updatePrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setComposerMenu(null);
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void sendPrompt();
            }
          }}
          placeholder="Ask anything about this document…"
        />
        <div className="composerFooter">
          <button
            className={`toolButton ${activeSkill || composerMenu === "commands" ? "active" : ""}`}
            type="button"
            aria-label="Open task commands"
            title="Tasks"
            onClick={() => setComposerMenu(composerMenu === "commands" ? null : "commands")}
          >
            <span className="slashGlyph" aria-hidden="true">
              /
            </span>
          </button>
          <button
            className={`toolButton ${
              contextAttachments.length || quoteAttachment || composerMenu === "context" ? "active" : ""
            }`}
            type="button"
            aria-label="Attach Word context"
            aria-pressed={Boolean(contextAttachments.length || quoteAttachment)}
            title="Attach Word context"
            onClick={() => void handleContextButton()}
          >
            <AtSign size={19} />
          </button>
          <button
            type="button"
            className="modelButton"
            aria-label="Open model options"
            aria-expanded={composerMenu === "model"}
            onClick={() => {
              const nextMenu = composerMenu === "model" ? null : "model";
              setComposerMenu(nextMenu);
              setModelListOpen(false);
            }}
          >
            <span>{modelLabel(settings.model)}</span>
            <ChevronDown size={14} />
          </button>
          <button
            type="submit"
            className="sendButton"
            aria-label="Send"
            disabled={isGenerating || !canSubmit}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>

      {historyOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="History">
          <aside className="drawer">
            <div className="drawerHeader">
              <button
                className="iconButton"
                type="button"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
              >
                <X size={18} />
              </button>
              <h2>History</h2>
              <span className="drawerHeaderSpacer" aria-hidden="true" />
            </div>
            {history.length ? (
              <div className="historyList">
                {(() => {
                  const currentDocItems = history.filter(
                    (item) => !item.documentFingerprint || item.documentFingerprint === currentDocFingerprint,
                  );
                  const otherDocItems = history.filter(
                    (item) => item.documentFingerprint && item.documentFingerprint !== currentDocFingerprint,
                  );

                  function renderHistoryItem(item: ConversationSnapshot) {
                    return (
                      <div className="historyItem" key={item.id}>
                        <button
                          className="historyRestore"
                          type="button"
                          aria-pressed={selectedHistoryId === item.id}
                          onClick={() => restoreConversation(item)}
                        >
                          <span>{item.title}</span>
                          <small>{formatClosedMinute(item.closedAt ?? item.createdAt)}</small>
                        </button>
                        <button
                          type="button"
                          className="historyDelete"
                          aria-label="Delete history item"
                          onClick={() => deleteHistoryItem(item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      {currentDocItems.map(renderHistoryItem)}
                      {otherDocItems.length ? (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 760, color: "var(--aw-muted)", padding: "6px 4px 2px" }}>
                            Other documents
                          </div>
                          {otherDocItems.map(renderHistoryItem)}
                        </>
                      ) : null}
                    </>
                  );
                })()}
                <button type="button" className="clearHistoryButton" onClick={() => saveHistory([])}>
                  <Trash2 size={15} />
                  Clear All History
                </button>
              </div>
            ) : (
              <p className="drawerNote">No archived session yet.</p>
            )}
          </aside>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Settings">
          <aside className="drawer settingsDrawer">
            <div className="drawerHeader">
              <button
                className="iconButton"
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={18} />
              </button>
              <h2>Settings</h2>
              <span className="drawerHeaderSpacer" aria-hidden="true" />
            </div>

            <section className="drawerSection">
              <div className="sectionTitle">Prefer Names</div>
              <label>
                User Role
                <input
                  value={settings.userName}
                  onChange={(event) => saveSettings({ ...settings, userName: event.target.value })}
                />
              </label>
              <label>
                Assistant Role
                <input
                  value={settings.assistantName}
                  onChange={(event) =>
                    saveSettings({ ...settings, assistantName: event.target.value })
                  }
                />
              </label>
            </section>

            <section className="drawerSection">
              <div className="sectionTitle">API Route</div>
              <div className="routeSwitch" role="group" aria-label="API Route">
                <button
                  type="button"
                  className={settings.provider === "claude2api" ? "selected" : ""}
                  onClick={() => {
                    saveSettings({ ...settings, provider: "claude2api" });
                    setTestStatus("");
                  }}
                >
                  Claude Web
                </button>
                <button
                  type="button"
                  className={settings.provider === "compatible" ? "selected" : ""}
                  onClick={() => {
                    saveSettings({ ...settings, provider: "compatible" });
                    setTestStatus("");
                  }}
                >
                  Custom API
                </button>
              </div>
            </section>

            {settings.provider === "claude2api" ? (
              <section className="drawerSection">
                <div className="sectionTitle">API Service</div>
                <label>
                  URL
                  <span className="inputShell">
                    <input
                      value={
                        settings.baseUrl === DEFAULT_SETTINGS.baseUrl ? "Default" : settings.baseUrl
                      }
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          baseUrl:
                            event.target.value.trim().toLowerCase() === "default"
                              ? DEFAULT_SETTINGS.baseUrl
                              : event.target.value,
                        })
                      }
                    />
                  </span>
                </label>
                <label>
                  API Key
                  <span className="inputShell">
                    <input
                      value={
                        settings.apiKey === DEFAULT_SETTINGS.apiKey ? "Default" : settings.apiKey
                      }
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          apiKey:
                            event.target.value.trim().toLowerCase() === "default"
                              ? DEFAULT_SETTINGS.apiKey
                              : event.target.value,
                        })
                      }
                    />
                  </span>
                </label>
                <details className="advancedSettings">
                  <summary>Advanced</summary>
                  <label>
                    Admin Key
                    <input
                      value={settings.adminKey}
                      onChange={(event) =>
                        saveSettings({ ...settings, adminKey: event.target.value })
                      }
                    />
                  </label>
                </details>
                <div className="serviceActions">
                  <button
                    type="button"
                    className={`routeActionButton ${settings.autoRouteAccounts ? "active" : ""}`}
                    aria-pressed={settings.autoRouteAccounts}
                    onClick={() => {
                      markConnectPanelSeen();
                      saveSettings({
                        ...settings,
                        autoRouteAccounts: !settings.autoRouteAccounts,
                      });
                    }}
                  >
                    <Route size={15} />
                    Auto Route
                  </button>
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => {
                      markConnectPanelSeen();
                      void restartAndCheck();
                    }}
                    disabled={isTesting}
                  >
                    <PlugZap size={15} />
                    Test
                  </button>
                  {testStatus ? (
                    <span className={`testStatus ${testStatusTone(testStatus)}`}>{testStatus}</span>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="drawerSection">
                <div className="sectionTitle">Custom API</div>
                <label>
                  URL
                  <input
                    placeholder="https://api.example.com"
                    value={settings.compatibleBaseUrl}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleBaseUrl: event.target.value })
                    }
                  />
                </label>
                <label>
                  API Key
                  <input
                    value={settings.compatibleApiKey}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleApiKey: event.target.value })
                    }
                  />
                </label>
                <label>
                  Model Mapping (Sonnet)
                  <input
                    value={settings.compatibleSonnetModel}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleSonnetModel: event.target.value })
                    }
                  />
                </label>
                <label>
                  Model Mapping (Haiku)
                  <input
                    value={settings.compatibleHaikuModel}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleHaikuModel: event.target.value })
                    }
                  />
                </label>
                <div className="serviceActions">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => {
                      markConnectPanelSeen();
                      void restartAndCheck();
                    }}
                    disabled={isTesting}
                  >
                    <PlugZap size={15} />
                    Test
                  </button>
                  {testStatus ? (
                    <span className={`testStatus ${testStatusTone(testStatus)}`}>{testStatus}</span>
                  ) : null}
                </div>
              </section>
            )}

            {settings.provider === "claude2api" ? (
              <section className="drawerSection">
                <div className="sectionTitle">Accounts Management</div>
                <div className="accountList">
                  {accounts.length ? (
                    accounts.map((account, index) => {
                      const state = accountState(account);
                      return (
                        <div className="accountRow" key={account.organization_uuid}>
                          <div>
                            <strong>{accountDisplayName(index)}</strong>
                            <span title={account.organization_uuid}>
                              {account.organization_uuid.slice(0, 8)}
                            </span>
                          </div>
                          <span className={`accountStatus ${state}`}>
                            {state === "online" ? (
                              "Online"
                            ) : (
                              <>
                                <CircleAlert size={12} />
                                Limited
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            className="iconButton"
                            aria-label="Remove account"
                            onClick={() => void deleteAccount(account.organization_uuid)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="drawerNote">No account linked.</p>
                  )}
                </div>
                <label>
                  New Cookie
                  <textarea
                    className="cookieInput"
                    placeholder="Log in to claude.ai in your browser, copy the cookie, then paste it here."
                    value={newAccountCookie}
                    onChange={(event) => setNewAccountCookie(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primaryButton fullWidth"
                  onClick={() => void addCookieAccount()}
                  disabled={!newAccountCookie.trim() || isSavingAccount}
                >
                  <UserPlus size={15} />
                  {isSavingAccount ? "Testing" : "Add Account"}
                </button>
              </section>
            ) : null}

            <section className="drawerSection">
              <div className="sectionTitle">Model Setting</div>
              <label>
                Model
                <select
                  value={settings.model}
                  onChange={(event) =>
                    saveSettings({ ...settings, model: event.target.value as ModelChoice })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                </select>
              </label>
              <label>
                Thinking Effort
                <select
                  value={settings.thinkingEffort}
                  onChange={(event) =>
                    saveSettings({
                      ...settings,
                      thinkingEffort: event.target.value as ThinkingEffort,
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </section>

            <section className="drawerSection">
              <div className="sectionTitle">A\W Profile</div>
              <textarea
                className="profileInput"
                aria-label="A\\W Profile"
                value={awProfile}
                onChange={(event) => saveAwProfile(event.target.value)}
              />
            </section>

          </aside>
        </div>
      ) : null}
    </main>
  );
}
