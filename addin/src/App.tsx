import {
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  Clipboard,
  FileText,
  History,
  KeyRound,
  LogIn,
  MessageCirclePlus,
  PenLine,
  PlugZap,
  RefreshCw,
  Settings,
  Slash,
  SquarePen,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

type ConnectionState = "checking" | "offline" | "not-connected" | "connected";
type ContextMode = "selection" | "document";
type WriteAction = "insert" | "replace";
type ComposerMenu = "commands" | "context" | "model" | null;
type ModelChoice = "auto" | "sonnet" | "haiku";
type ThinkingEffort = "auto" | "low" | "medium" | "high";
type ProviderMode = "claude2api" | "compatible";

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
}

interface QuickTask {
  label: string;
  command: string;
}

interface ConversationSnapshot {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextSummary: string;
  createdAt: number;
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

const DEFAULT_SETTINGS: ProxySettings = {
  provider: "claude2api",
  baseUrl: "/aw-proxy",
  apiKey: "aw-local-dev-key",
  adminKey: "aw-local-admin-key",
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

const MAX_DOCUMENT_CHARS = 12000;
const LEGACY_SONNET_MODELS = new Set(["claude-sonnet-4-20250514", "claude-sonnet-4-6"]);
const LEGACY_HAIKU_MODELS = new Set(["claude-3-5-haiku-20241022"]);
const LEGACY_LOCAL_PROXY_URLS = new Set([
  "http://127.0.0.1:5201",
  "http://localhost:5201",
]);

const quickTasks: QuickTask[] = [
  {
    label: "Draft",
    command: "/Draft ",
  },
  {
    label: "Summarize",
    command: "/Summarize ",
  },
  {
    label: "Review",
    command: "/Review ",
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

  if (settings.model === "haiku") return "claude-3-5-haiku-20241022";
  return "claude-sonnet-4-6";
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

function summarizeContext(documentContext: DocumentContext) {
  if (!documentContext.text) return "No Word text found";

  if (documentContext.mode === "selection") {
    return `Selection: ${documentContext.selectionLength} chars`;
  }

  return `Document: ${documentContext.text.length} chars${
    documentContext.truncated ? " (truncated)" : ""
  }`;
}

function buildUserContent(prompt: string, documentContext: DocumentContext | null) {
  if (!documentContext?.text) {
    return [
      "Direct chat. No file, pasted content, Word selection, or document context is attached.",
      "Respond only to the user's message below.",
      "",
      "User message:",
      prompt,
    ].join("\n");
  }

  return [
    `User request: ${prompt}`,
    "",
    `Context source: ${documentContext.mode}`,
    `Document: ${documentContext.documentName}`,
    "",
    "Word context:",
    documentContext.text,
  ].join("\n");
}

function buildSystemPrompt(
  awInstructions: string,
  documentContext: DocumentContext | null,
  activeSkill: SkillDefinition | null,
) {
  const parts: string[] = [];

  if (documentContext?.text && awInstructions.trim()) {
    parts.push(awInstructions.trim());
  }

  if (activeSkill?.content.trim()) {
    parts.push(activeSkill.content.trim());
  }

  return parts.length ? parts.join("\n\n") : undefined;
}

function promptWithoutSkillCommand(prompt: string, activeSkill: SkillDefinition | null) {
  if (!activeSkill) return prompt;
  const command = `/${activeSkill.label}`;
  return prompt.startsWith(command) ? prompt.slice(command.length).trim() : prompt;
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

async function readBestContext() {
  const selection = await readSelectionContext();
  if (selection.text) return selection;
  return readDocumentBodyContext();
}

async function writeToWord(action: WriteAction, text: string) {
  if (typeof Word === "undefined") {
    throw new Error("Open this task pane inside Microsoft Word to write content.");
  }

  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.insertText(
      text,
      action === "replace" ? Word.InsertLocation.replace : Word.InsertLocation.end,
    );
    await context.sync();
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
  const [settings, setSettings] = useState<ProxySettings>(() => loadSettings());
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [contextSummary, setContextSummary] = useState("Chat only");
  const [attachedContext, setAttachedContext] = useState<DocumentContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<ConversationSnapshot[]>(() => loadHistory());
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [newAccountCookie, setNewAccountCookie] = useState("");
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [activeSkill, setActiveSkill] = useState<SkillDefinition | null>(null);
  const [awInstructions, setAwInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerMenu, setComposerMenu] = useState<ComposerMenu>(null);
  const [pendingWrite, setPendingWrite] = useState<WriteAction | null>(null);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  const isAttachMode = Boolean(attachedContext?.text);

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
        createdAt: Date.now(),
      };

      saveHistory([snapshot, ...history.filter((item) => item.title !== snapshot.title)]);
    },
    [contextSummary, history, messages, saveHistory],
  );

  const checkCompatibleApi = useCallback(async () => {
    const endpoint = normalizeMessagesEndpoint(settings.compatibleBaseUrl);
    const model = resolveModelId(settings);

    if (!endpoint || !settings.compatibleApiKey.trim() || !model) {
      setConnection("not-connected");
      return;
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

    setConnection(response.ok ? "connected" : "not-connected");
    if (!response.ok) {
      throw new Error(`Compatible API test failed with HTTP ${response.status}.`);
    }
  }, [settings]);

  const checkConnection = useCallback(async () => {
    setConnection("checking");
    setError("");
    setNotice("");

    try {
      if (settings.provider === "compatible") {
        await checkCompatibleApi();
        setNotice("API link is ready.");
        return;
      }

      const health = await fetch(`${settings.baseUrl}/health`);
      if (!health.ok) {
        setConnection("offline");
        return;
      }

      const stats = await fetch(`${settings.baseUrl}/auth/status`, {
        headers: { Authorization: `Bearer ${settings.adminKey}` },
      });

      if (!stats.ok) {
        setConnection("not-connected");
        return;
      }

      const payload = await stats.json();
      setConnection(payload?.connected ? "connected" : "not-connected");
      await fetchAccounts();
    } catch (connectionError) {
      setConnection("offline");
      setError(explainError(connectionError));
    }
  }, [checkCompatibleApi, fetchAccounts, settings.adminKey, settings.baseUrl, settings.provider]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    void loadSkillRegistry().then(setSkills);
    void fetch("/AW.md")
      .then((response) => (response.ok ? response.text() : ""))
      .then(setAwInstructions)
      .catch(() => setAwInstructions(""));
  }, []);

  async function attachContext(mode: ContextMode) {
    try {
      setError("");
      const documentContext =
        mode === "selection" ? await readSelectionContext() : await readDocumentBodyContext();
      setAttachedContext(documentContext.text ? documentContext : null);
      setContextSummary(documentContext.text ? summarizeContext(documentContext) : "Chat only");
      setPrompt((current) => (current.endsWith("@") ? current.slice(0, -1) : current));
      setComposerMenu(null);
    } catch (contextError) {
      setError(explainError(contextError));
    }
  }

  async function getContextForSend(attachCurrentContext: boolean) {
    if (!attachCurrentContext) return attachedContext?.text ? attachedContext : null;

    const documentContext = await readBestContext();
    setAttachedContext(documentContext.text ? documentContext : null);
    setContextSummary(documentContext.text ? summarizeContext(documentContext) : "Chat only");
    return documentContext.text ? documentContext : null;
  }

  async function sendPrompt(nextPrompt = prompt, attachCurrentContext = false) {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt || isGenerating) return;
    const userPrompt = promptWithoutSkillCommand(trimmedPrompt, activeSkill) || trimmedPrompt;

    setIsGenerating(true);
    setError("");
    setNotice("");
    setComposerMenu(null);

    try {
      const documentContext = await getContextForSend(attachCurrentContext);
      const userContent = buildUserContent(userPrompt, documentContext);
      const systemPrompt = buildSystemPrompt(awInstructions, documentContext, activeSkill);
      const outgoingMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmedPrompt },
      ];

      setMessages(outgoingMessages);
      setPrompt("");

      const endpoint =
        settings.provider === "compatible"
          ? normalizeMessagesEndpoint(settings.compatibleBaseUrl)
          : `${settings.baseUrl}/v1/messages`;
      const authKey =
        settings.provider === "compatible" ? settings.compatibleApiKey.trim() : settings.apiKey;

      if (!endpoint || !authKey) {
        throw new Error("Configure a provider endpoint and key before sending.");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authKey}`,
        },
        body: JSON.stringify({
          model: resolveModelId(settings),
          max_tokens: maxTokensForEffort(settings.thinkingEffort),
          thinking: thinkingPayload(settings.thinkingEffort),
          system: systemPrompt,
          messages: [
            ...messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            { role: "user", content: userContent },
          ],
          metadata: documentContext
            ? {
                documentName: documentContext.documentName,
                contextMode: documentContext.mode,
                selectionLength: documentContext.selectionLength,
                thinkingEffort: settings.thinkingEffort,
                skill: activeSkill?.id,
              }
            : {
                contextMode: "chat",
                thinkingEffort: settings.thinkingEffort,
                skill: activeSkill?.id,
              },
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Request failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const content = Array.isArray(payload.content)
        ? payload.content
            .filter((part: { type?: string; text?: string }) => !part.type || part.type === "text")
            .map((part: { text?: string }) => part.text)
            .filter(Boolean)
            .join("\n")
        : "";

      if (!content) {
        throw new Error("The provider returned an empty response.");
      }

      const completedMessages: ChatMessage[] = [
        ...outgoingMessages,
        { role: "assistant", content },
      ];
      const snapshot: ConversationSnapshot = {
        id: `${Date.now()}`,
        title: titleFromPrompt(outgoingMessages[0]?.content ?? userPrompt),
        messages: completedMessages,
        contextSummary: documentContext ? summarizeContext(documentContext) : "Chat only",
        createdAt: Date.now(),
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

  async function copyResponse() {
    if (!lastAssistantMessage) return;
    await navigator.clipboard.writeText(lastAssistantMessage.content);
  }

  async function openLogin() {
    try {
      const response = await fetch(`${settings.baseUrl}/auth/open`, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.adminKey}` },
      });
      const payload = await response.json();
      window.open(payload.url ?? settings.baseUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Unable to open the account page. Check whether the local service is running.");
    }
  }

  async function restartAndCheck() {
    setIsTesting(true);
    setError("");
    setNotice("");

    try {
      if (settings.provider === "claude2api") {
        await fetch(`${settings.baseUrl}/service/restart`, {
          method: "POST",
          headers: { Authorization: `Bearer ${settings.adminKey}` },
        });
      }

      await checkConnection();
      setNotice("Service tested.");
    } catch (serviceError) {
      setError(explainError(serviceError));
    } finally {
      setIsTesting(false);
    }
  }

  async function addCookieAccount() {
    const cookie = newAccountCookie.trim();
    if (!cookie || isSavingAccount) return;

    setIsSavingAccount(true);
    setError("");
    setNotice("");

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
      setNotice("Account saved.");
      await fetchAccounts();
      await checkConnection();
    } catch (accountError) {
      setError(explainError(accountError));
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function deleteAccount(id: string) {
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${settings.baseUrl}/api/admin/accounts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${settings.adminKey}` },
      });

      if (!response.ok) {
        throw new Error(`Account delete failed with HTTP ${response.status}.`);
      }

      setNotice("Account removed.");
      await fetchAccounts();
      await checkConnection();
    } catch (accountError) {
      setError(explainError(accountError));
    }
  }

  async function confirmWrite() {
    if (!pendingWrite || !lastAssistantMessage) return;

    try {
      await writeToWord(pendingWrite, lastAssistantMessage.content);
      setPendingWrite(null);
    } catch (writeError) {
      setError(explainError(writeError));
    }
  }

  function startNewConversation() {
    archiveConversation();
    setMessages([]);
    setPrompt("");
    setError("");
    setNotice("");
    setAttachedContext(null);
    setContextSummary("Chat only");
    setActiveSkill(null);
    setComposerMenu(null);
  }

  function restoreConversation(snapshot: ConversationSnapshot) {
    archiveConversation();
    setMessages(snapshot.messages);
    setContextSummary(snapshot.contextSummary);
    setAttachedContext(null);
    setHistoryOpen(false);
    setComposerMenu(null);
  }

  function updatePrompt(value: string) {
    setPrompt(value);
    const lastCharacter = value.slice(-1);
    if (lastCharacter === "/") {
      setComposerMenu("commands");
    } else if (lastCharacter === "@") {
      setComposerMenu("context");
    }
  }

  function selectSkill(skill: SkillDefinition) {
    setActiveSkill(skill);
    const command = quickTasks.find((task) => task.label === skill.label)?.command ?? `/${skill.label} `;
    setPrompt((current) => {
      if (!current || current === "/" || current.endsWith("/")) return command;
      return current.startsWith(command) ? current : `${command}${current}`;
    });
    setComposerMenu(null);
    setNotice(skill.loaded ? `${skill.label} loaded.` : `${skill.label} is ready.`);
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
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={20} />
          </button>
        </div>
        <button
          className="brandButton"
          type="button"
          aria-label="Restart and test service"
          title="Restart and test service"
          onClick={() => void restartAndCheck()}
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

      {connection !== "connected" && settings.provider === "claude2api" ? (
        <section className="connectPanel">
          <div>
            <h2>Connect account</h2>
            <p>Add a Claude Free account cookie in Settings, then test the local link.</p>
          </div>
          <div className="connectActions">
            <button type="button" className="primaryButton compact" onClick={openLogin}>
              <LogIn size={16} />
              Login
            </button>
            <button type="button" className="ghostButton compact" onClick={checkConnection}>
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
                <MarkdownMessage content={message.content} />
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
            <div className="emptyMark" aria-hidden="true">
              A\W
            </div>
            <div className="emptyTitle">How can I help you with this document?</div>
            <span className="emptyRule" />
          </div>
        )}
      </section>

      {lastAssistantMessage && isAttachMode ? (
        <section className="actions" aria-label="Response actions">
          <button type="button" onClick={() => setPendingWrite("insert")}>
            <PenLine size={15} />
            Insert
          </button>
          <button type="button" onClick={() => setPendingWrite("replace")}>
            <SquarePen size={15} />
            Replace
          </button>
          <button type="button" onClick={copyResponse}>
            <Clipboard size={15} />
            Copy
          </button>
        </section>
      ) : null}

      {notice ? <div className="notice">{notice}</div> : null}

      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendPrompt();
        }}
      >
        {composerMenu ? (
          <div className="composerMenu" role="menu">
            {composerMenu === "commands" ? (
              <>
                {skills.length ? (
                  skills.map((skill) => (
                    <button key={skill.id} type="button" onClick={() => selectSkill(skill)}>
                      <KeyRound size={16} />
                      <span>{skill.label}</span>
                      {skill.loaded ? <Check className="trailingIcon" size={14} /> : null}
                    </button>
                  ))
                ) : (
                  <div className="menuEmpty">No skills found</div>
                )}
              </>
            ) : composerMenu === "context" ? (
              <>
                <button type="button" onClick={() => void attachContext("selection")}>
                  <AtSign size={16} />
                  <span>Current selection</span>
                </button>
                <button type="button" onClick={() => void attachContext("document")}>
                  <FileText size={16} />
                  <span>Document body</span>
                </button>
              </>
            ) : (
              <>
                <div className="menuSectionLabel">Model</div>
                <div className="optionList" role="group" aria-label="Model">
                  {(["auto", "sonnet", "haiku"] as const).map((model) => (
                    <button
                      key={model}
                      type="button"
                      className={settings.model === model ? "selected" : ""}
                      onClick={() => saveSettings({ ...settings, model })}
                    >
                      <span>{modelLabel(model)}</span>
                      {settings.model === model ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
                <div className="menuSectionLabel">Thinking effort</div>
                <div className="optionList" role="group" aria-label="Thinking effort">
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
              </>
            )}
          </div>
        ) : null}

        <label className="srOnly" htmlFor="prompt">
          Message
        </label>
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
          placeholder="Message"
        />
        <div className="composerFooter">
          <button
            className="toolButton"
            type="button"
            aria-label="Open task commands"
            title="Tasks"
            onClick={() => setComposerMenu(composerMenu === "commands" ? null : "commands")}
          >
            <Slash size={19} />
          </button>
          <button
            className={`toolButton ${attachedContext?.text ? "active" : ""}`}
            type="button"
            aria-label="Attach Word context"
            aria-pressed={Boolean(attachedContext?.text)}
            title="Attach Word context"
            onClick={() => setComposerMenu(composerMenu === "context" ? null : "context")}
          >
            <AtSign size={19} />
          </button>
          {attachedContext ? (
            <button
              className="contextPill"
              type="button"
              title="Remove Word context"
              onClick={() => {
                setAttachedContext(null);
                setContextSummary("Chat only");
              }}
            >
              <span>{contextSummary}</span>
              <X size={12} />
            </button>
          ) : null}
          {activeSkill ? (
            <button
              className="skillPill"
              type="button"
              title="Remove skill"
              onClick={() => setActiveSkill(null)}
            >
              <span>{activeSkill.label}</span>
              <X size={12} />
            </button>
          ) : null}
          <button
            type="button"
            className="modelButton"
            aria-label="Open model options"
            onClick={() => setComposerMenu(composerMenu === "model" ? null : "model")}
          >
            <span>{modelLabel(settings.model)}</span>
            <ChevronDown size={17} />
          </button>
          <button
            type="submit"
            className="sendButton"
            aria-label="Send"
            disabled={isGenerating || !prompt.trim()}
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
                {history.map((item) => (
                  <button key={item.id} type="button" onClick={() => restoreConversation(item)}>
                    <span>{item.title}</span>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </button>
                ))}
                <button type="button" className="dangerButton" onClick={() => saveHistory([])}>
                  <Trash2 size={15} />
                  Clear history
                </button>
              </div>
            ) : (
              <p className="drawerNote">No saved conversations yet.</p>
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
              <div className="sectionTitle">Route</div>
              <div className="routeSwitch" role="group" aria-label="Provider route">
                <button
                  type="button"
                  className={settings.provider === "claude2api" ? "selected" : ""}
                  onClick={() => saveSettings({ ...settings, provider: "claude2api" })}
                >
                  Claude2API
                </button>
                <button
                  type="button"
                  className={settings.provider === "compatible" ? "selected" : ""}
                  onClick={() => saveSettings({ ...settings, provider: "compatible" })}
                >
                  Compatible API
                </button>
              </div>
            </section>

            {settings.provider === "claude2api" ? (
              <section className="drawerSection">
                <div className="sectionTitle">Service</div>
                <label>
                  Proxy URL
                  <input
                    value={settings.baseUrl}
                    onChange={(event) => saveSettings({ ...settings, baseUrl: event.target.value })}
                  />
                </label>
                <label>
                  API key
                  <input
                    value={settings.apiKey}
                    onChange={(event) => saveSettings({ ...settings, apiKey: event.target.value })}
                  />
                </label>
                <label>
                  Admin key
                  <input
                    value={settings.adminKey}
                    onChange={(event) =>
                      saveSettings({ ...settings, adminKey: event.target.value })
                    }
                  />
                </label>
                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={settings.autoRouteAccounts}
                    onChange={(event) =>
                      saveSettings({ ...settings, autoRouteAccounts: event.target.checked })
                    }
                  />
                  <span>Auto-route when an account is limited</span>
                </label>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => void restartAndCheck()}
                    disabled={isTesting}
                  >
                    <PlugZap size={15} />
                    Restart & test
                  </button>
                  <button type="button" className="ghostButton" onClick={openLogin}>
                    <LogIn size={15} />
                    Login
                  </button>
                </div>
              </section>
            ) : (
              <section className="drawerSection">
                <div className="sectionTitle">Compatible API</div>
                <label>
                  Base URL
                  <input
                    placeholder="https://api.example.com"
                    value={settings.compatibleBaseUrl}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleBaseUrl: event.target.value })
                    }
                  />
                </label>
                <label>
                  Key
                  <input
                    value={settings.compatibleApiKey}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleApiKey: event.target.value })
                    }
                  />
                </label>
                <label>
                  Sonnet map
                  <input
                    value={settings.compatibleSonnetModel}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleSonnetModel: event.target.value })
                    }
                  />
                </label>
                <label>
                  Haiku map
                  <input
                    value={settings.compatibleHaikuModel}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleHaikuModel: event.target.value })
                    }
                  />
                </label>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={() => void restartAndCheck()}
                    disabled={isTesting}
                  >
                    <PlugZap size={15} />
                    Test API
                  </button>
                </div>
              </section>
            )}

            {settings.provider === "claude2api" ? (
              <section className="drawerSection">
                <div className="sectionTitle">Accounts</div>
                <div className="accountList">
                  {accounts.length ? (
                    accounts.map((account) => (
                      <div className="accountRow" key={account.organization_uuid}>
                        <div>
                          <strong>{account.organization_uuid.slice(0, 8)}</strong>
                          <span>{account.status}</span>
                        </div>
                        <button
                          type="button"
                          className="iconButton"
                          aria-label="Remove account"
                          onClick={() => void deleteAccount(account.organization_uuid)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="drawerNote">No account linked.</p>
                  )}
                </div>
                <label>
                  Cookie
                  <textarea
                    className="cookieInput"
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
                  Add account
                </button>
              </section>
            ) : null}

            <section className="drawerSection">
              <div className="sectionTitle">Model</div>
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
                Thinking effort
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
              <div className="sectionTitle">Names</div>
              <label>
                User role
                <input
                  value={settings.userName}
                  onChange={(event) => saveSettings({ ...settings, userName: event.target.value })}
                />
              </label>
              <label>
                Assistant role
                <input
                  value={settings.assistantName}
                  onChange={(event) =>
                    saveSettings({ ...settings, assistantName: event.target.value })
                  }
                />
              </label>
            </section>

          </aside>
        </div>
      ) : null}

      {pendingWrite ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Confirm writeback">
          <section className="confirm">
            <h2>{pendingWrite === "replace" ? "Replace selected text?" : "Insert response?"}</h2>
            <p>Word content will change after confirmation. Review the response before continuing.</p>
            <div className="preview">{lastAssistantMessage?.content}</div>
            <div className="buttonRow">
              <button type="button" className="primaryButton" onClick={confirmWrite}>
                Confirm
              </button>
              <button type="button" className="ghostButton" onClick={() => setPendingWrite(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
