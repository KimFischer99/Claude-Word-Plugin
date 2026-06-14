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
type AttachmentKind = "selection" | "document" | "quote" | "web";
type Language = "en" | "zh-CN";

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
  language: Language;
  autoRouteAccounts: boolean;
  userName: string;
  assistantName: string;
}

interface RuntimeConfig {
  baseUrl: string;
  apiKey: string;
  adminKey: string;
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

interface WebFetchResult {
  url: string;
  title: string;
  text: string;
  chars: number;
  truncated: boolean;
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
  language: "en",
  autoRouteAccounts: false,
  userName: "You",
  assistantName: "A\\W",
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  baseUrl: "/aw-proxy",
  apiKey: "",
  adminKey: "",
};

interface RequestProfile {
  model: string;
  effort: ThinkingEffort;
}

const MAX_DOCUMENT_CHARS = 50000;
const MAX_WEB_URLS = 3;
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

const UI_TEXT = {
  en: {
    addAccount: "Add Account",
    advanced: "Advanced",
    apiKey: "API Key",
    apiRoute: "API Route",
    apiService: "API Service",
    accountsManagement: "Accounts Management",
    assistantActions: "Assistant actions",
    assistantRole: "Assistant Role",
    attachWordContext: "Attach Word context",
    attachedContext: "Attached context",
    awProfile: "A\\W Profile",
    autoRoute: "Auto Route",
    check: "Check",
    checkService: "Check service",
    checking: "Checking",
    clearAllHistory: "Clear All History",
    closeHistory: "Close history",
    closeSettings: "Close settings",
    connected: "Connected",
    connectAccount: "Connect account",
    connectAccountNote: "Add a Claude Free account cookie in Settings, then test the local link.",
    conversation: "Conversation",
    copy: "Copy",
    customApi: "Custom API",
    default: "Default",
    deleteHistoryItem: "Delete history item",
    document: "Document",
    emptyTitle: "How can I help you with this document?",
    history: "History",
    language: "Language",
    limited: "Limited",
    cookiePlaceholder: "Log in to claude.ai in your browser, copy the cookie, then paste it here.",
    message: "Message",
    model: "Model",
    modelMappingHaiku: "Model Mapping (Haiku)",
    modelMappingSonnet: "Model Mapping (Sonnet)",
    modelSetting: "Model Setting",
    newAccountCookie: "New Cookie",
    newConversation: "New conversation",
    noAccountLinked: "No account linked.",
    noArchivedSession: "No archived session yet.",
    noSkillsFound: "No skills found",
    notLinked: "Not linked",
    offline: "Offline",
    online: "Online",
    openHistory: "Open history",
    openModelOptions: "Open model options",
    openSettings: "Open settings",
    openTaskCommands: "Open task commands",
    otherDocuments: "Other documents",
    placeholder: "Ask anything about this document...",
    preferNames: "Prefer Names",
    quote: "Quote",
    removeAccount: "Remove account",
    removeSkill: "Remove skill",
    retry: "Retry",
    selection: "Selection",
    send: "Send",
    settings: "Settings",
    tasks: "Tasks",
    test: "Test",
    testing: "Testing",
    thinking: "Thinking",
    thinkingEffort: "Thinking Effort",
    userRole: "User Role",
    zhChinese: "简体中文",
    english: "English",
    uninstallTitle: "Uninstall A\\W",
    uninstallButton: "Uninstall",
    uninstallStarted: "System password prompt requested. The sidebar may close during uninstall.",
    uninstalling: "Uninstalling...",
  },
  "zh-CN": {
    addAccount: "添加账户",
    advanced: "高级",
    apiKey: "API Key",
    apiRoute: "API 路由",
    apiService: "API 服务",
    accountsManagement: "账户管理",
    assistantActions: "助手操作",
    assistantRole: "助手角色",
    attachWordContext: "附加 Word 上下文",
    attachedContext: "已附加上下文",
    awProfile: "A\\W 配置",
    autoRoute: "自动路由",
    check: "检查",
    checkService: "检查服务",
    checking: "检查中",
    clearAllHistory: "清空全部历史",
    closeHistory: "关闭历史",
    closeSettings: "关闭设置",
    connected: "已连接",
    connectAccount: "连接账户",
    connectAccountNote: "在设置中添加 Claude Free 账户 cookie，然后测试本地连接。",
    conversation: "对话",
    copy: "复制",
    customApi: "Custom API",
    default: "默认",
    deleteHistoryItem: "删除历史项",
    document: "文档",
    emptyTitle: "How can I help you with this document?",
    history: "历史",
    language: "语言",
    limited: "受限",
    cookiePlaceholder: "在浏览器登录 claude.ai，复制 cookie，然后粘贴到这里。",
    message: "消息",
    model: "Model",
    modelMappingHaiku: "模型映射 (Haiku)",
    modelMappingSonnet: "模型映射 (Sonnet)",
    modelSetting: "Model 设置",
    newAccountCookie: "New Cookie",
    newConversation: "新建对话",
    noAccountLinked: "尚未连接账户。",
    noArchivedSession: "还没有归档会话。",
    noSkillsFound: "未找到技能",
    notLinked: "未连接",
    offline: "离线",
    online: "在线",
    openHistory: "打开历史",
    openModelOptions: "打开 Model 选项",
    openSettings: "打开设置",
    openTaskCommands: "打开任务命令",
    otherDocuments: "其他文档",
    placeholder: "询问关于这份文档的任何问题...",
    preferNames: "偏好称呼",
    quote: "引用",
    removeAccount: "移除账户",
    removeSkill: "移除技能",
    retry: "重试",
    selection: "选区",
    send: "发送",
    settings: "设置",
    tasks: "任务",
    test: "测试",
    testing: "测试中",
    thinking: "思考中",
    thinkingEffort: "Thinking Effort",
    userRole: "用户角色",
    zhChinese: "简体中文",
    english: "English",
    uninstallTitle: "卸载 A\\W",
    uninstallButton: "卸载",
    uninstallStarted: "已请求系统密码提示。卸载过程中侧边栏可能会关闭。",
    uninstalling: "卸载中...",
  },
} as const;

type UiTextKey = keyof typeof UI_TEXT.en;

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

    if (!["en", "zh-CN"].includes(settings.language)) {
      settings.language = DEFAULT_SETTINGS.language;
    }

    if (LEGACY_LOCAL_PROXY_URLS.has(settings.baseUrl)) {
      settings.baseUrl = DEFAULT_SETTINGS.baseUrl;
    }

    settings.userName =
      !settings.userName || settings.userName === "YOU" ? DEFAULT_SETTINGS.userName : settings.userName;
    settings.assistantName = settings.assistantName || DEFAULT_SETTINGS.assistantName;
    settings.autoRouteAccounts = settings.autoRouteAccounts ?? false;
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

function skillLabel(label: string, language: Language = "en") {
  if (language !== "zh-CN") return label;
  if (label === "summarize") return "摘要";
  if (label === "humanize") return "润色";
  if (label === "review") return "审阅";
  return label;
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

function normalizeServiceEndpoint(baseUrl: string, path: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBaseUrl}${normalizedPath}`;
}

function extractWebUrls(value: string) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const matches = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [];

  for (const match of matches) {
    const cleaned = match.replace(/[),.;:!?}\]]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (!["http:", "https:"].includes(url.protocol) || seen.has(url.href)) continue;
      seen.add(url.href);
      urls.push(url.href);
      if (urls.length >= MAX_WEB_URLS) break;
    } catch {
      // Ignore malformed URL-looking text.
    }
  }

  return urls;
}

function isDefaultInput(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "default" || normalized === "默认";
}

function isAttachedContextPlaceholder(value: string) {
  return value === UI_TEXT.en.attachedContext || value === UI_TEXT["zh-CN"].attachedContext;
}

function explainError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Check the service and try again.";
}

function selectionLabel(index: number, total: number, language: Language = "en") {
  const label = UI_TEXT[language].selection;
  return total > 1 ? `${label} ${String(index + 1).padStart(2, "0")}` : label;
}

function normalizeContextLabels(attachments: ComposerAttachment[], language: Language = "en") {
  const selectionIds = attachments
    .filter((attachment) => attachment.kind === "selection")
    .map((attachment) => attachment.id);

  return attachments.map((attachment) => {
    if (attachment.kind === "document") {
      return { ...attachment, label: UI_TEXT[language].document };
    }

    if (attachment.kind !== "selection") return attachment;
    const index = selectionIds.indexOf(attachment.id);
    return {
      ...attachment,
      label: selectionLabel(index, selectionIds.length, language),
    };
  });
}

function contextSummaryFromAttachments(attachments: ComposerAttachment[], language: Language = "en") {
  const contextLabels = attachments
    .filter((attachment) => attachment.kind === "selection" || attachment.kind === "document")
    .map((attachment) => attachment.label);

  return contextLabels.length ? contextLabels.join(", ") : language === "zh-CN" ? "仅聊天" : "Chat only";
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

function accountDisplayName(index: number, language: Language = "en") {
  const label = language === "zh-CN" ? "账户" : "Account";
  return `${label} ${String(index + 1).padStart(2, "0")}`;
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
  if (normalized === "online" || value === UI_TEXT["zh-CN"].online) return "online";
  if (normalized === "testing" || value === UI_TEXT["zh-CN"].testing) return "testing";
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

    if (attachment.kind === "web") {
      return [
        "Context source: web",
        `Label: ${attachment.label}`,
        `URL: ${attachment.documentName}`,
        "",
        attachment.text,
      ].join("\n");
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

async function fetchWebAttachment(
  url: string,
  localBaseUrl: string,
  localApiKey: string,
): Promise<MessageAttachment> {
  const endpoint = normalizeServiceEndpoint(localBaseUrl, `/web/fetch?url=${encodeURIComponent(url)}`);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${localApiKey}` },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Could not read URL with HTTP ${response.status}.`);
  }

  const result = (await response.json()) as WebFetchResult;
  if (!result.text.trim()) {
    throw new Error(`Could not read text from URL: ${url}`);
  }

  return {
    kind: "web",
    label: result.title ? `Web: ${result.title}` : "Web",
    text: result.text,
    documentName: result.url,
    selectionLength: result.chars,
    truncated: result.truncated,
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

function titleFromPrompt(prompt: string, language: Language = "en") {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 36 ? `${clean.slice(0, 34)}...` : clean || (language === "zh-CN" ? "未命名对话" : "Untitled chat");
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
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const t = useCallback((key: UiTextKey) => UI_TEXT[settings.language][key], [settings.language]);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState<string>("");
  const [testStatus, setTestStatus] = useState<string>("");
  const [uninstallStatus, setUninstallStatus] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [contextSummary, setContextSummary] = useState(() =>
    settings.language === "zh-CN" ? "仅聊天" : "Chat only",
  );
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
  const [isUninstalling, setIsUninstalling] = useState(false);
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
  const canAutoRouteAccounts = accounts.length > 1;
  const autoRouteAccountsActive = canAutoRouteAccounts && settings.autoRouteAccounts;
  const localBaseUrl = settings.baseUrl || runtimeConfig.baseUrl || DEFAULT_SETTINGS.baseUrl;
  const localApiKey = settings.apiKey || runtimeConfig.apiKey;
  const localAdminKey = settings.adminKey || runtimeConfig.adminKey;

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

    const response = await fetch(`${localBaseUrl}/api/admin/accounts`, {
      headers: { Authorization: `Bearer ${localAdminKey}` },
    });

    if (response.ok) {
      setAccounts(await response.json());
    }
  }, [localAdminKey, localBaseUrl, settings.provider]);

  const archiveConversation = useCallback(
    (nextMessages = messages) => {
      if (!nextMessages.length) return;

      const firstUserMessage = nextMessages.find((message) => message.role === "user");
      const snapshot: ConversationSnapshot = {
        id: `${Date.now()}`,
        title: titleFromPrompt(firstUserMessage?.content ?? "", settings.language),
        messages: nextMessages,
        contextSummary,
        documentFingerprint: currentDocFingerprint || undefined,
        createdAt: Date.now(),
        closedAt: Date.now(),
      };

      saveHistory([snapshot, ...history.filter((item) => item.title !== snapshot.title)]);
    },
    [contextSummary, currentDocFingerprint, history, messages, saveHistory, settings.language],
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

      const health = await fetch(`${localBaseUrl}/health`);
      if (!health.ok) {
        setConnection("offline");
        return "offline";
      }

      const stats = await fetch(`${localBaseUrl}/auth/status`, {
        headers: { Authorization: `Bearer ${localAdminKey}` },
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
  }, [checkCompatibleApi, fetchAccounts, localAdminKey, localBaseUrl, settings.provider]);

  useEffect(() => {
    async function fetchRuntimeConfig() {
      for (const path of ["/config.json", "/aw-proxy/config.json"]) {
        try {
          const response = await fetch(path);
          if (response.ok) return response.json();
        } catch {
          // Try the next runtime config path.
        }
      }

      return DEFAULT_RUNTIME_CONFIG;
    }

    void fetchRuntimeConfig()
      .then((config) => {
        setRuntimeConfig({
          baseUrl: config.baseUrl || DEFAULT_RUNTIME_CONFIG.baseUrl,
          apiKey: config.apiKey || "",
          adminKey: config.adminKey || "",
        });
      })
      .catch(() => {
        setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
      });
  }, []);

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
    setContextAttachments((current) => normalizeContextLabels(current, settings.language));
  }, [settings.language]);

  useEffect(() => {
    setContextSummary(contextSummaryFromAttachments(contextAttachments, settings.language));
  }, [contextAttachments, settings.language]);

  function makeAttachment(context: DocumentContext, idSuffix = `${Date.now()}`): ComposerAttachment {
    return {
      id: `${context.mode}-${idSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      kind: context.mode,
      label: context.mode === "selection" ? t("selection") : t("document"),
      text: context.text,
      documentName: context.documentName,
      selectionLength: context.selectionLength,
      truncated: context.truncated,
    };
  }

  function updateContextAttachments(
    updater: (current: ComposerAttachment[]) => ComposerAttachment[],
  ) {
    setContextAttachments((current) => normalizeContextLabels(updater(current), settings.language));
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
        setError(
          mode === "selection"
            ? settings.language === "zh-CN"
              ? "没有找到已选中的 Word 文本。"
              : "No selected Word text found."
            : settings.language === "zh-CN"
              ? "没有找到可读取的 Word 文本。"
              : "No readable Word text found.",
        );
        setComposerMenu(mode === "selection" ? "context" : null);
        return;
      }

      updateContextAttachments((current) => {
        if (mode === "document") {
          return [...current.filter((attachment) => attachment.kind !== "document"), makeAttachment(documentContext)];
        }

        const selectionCount = current.filter((attachment) => attachment.kind === "selection").length;
        if (selectionCount >= 5) {
          setError(
            settings.language === "zh-CN"
              ? "Selection 最多支持 5 段文本。"
              : "Selection supports up to 5 text blocks.",
          );
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
    const skillCommand = activeSkill ? `/${skillLabel(activeSkill.label, settings.language)}` : "";
    const effectivePrompt = trimmedPrompt || skillCommand;
    if ((!effectivePrompt && !composerAttachments.length) || isGenerating) return;
    const userPrompt = trimmedPrompt || activeSkill?.label || effectivePrompt;

    setIsGenerating(true);
    setError("");
    setComposerMenu(null);

    try {
      const baseAttachmentsForSend = attachmentOverride ?? composerAttachments.map(messageAttachmentFromComposer);
      const webAttachments =
        attachmentOverride === undefined
          ? await Promise.all(
              extractWebUrls(userPrompt).map((url) => fetchWebAttachment(url, localBaseUrl, localApiKey)),
            )
          : [];
      const attachmentsForSend = [...baseAttachmentsForSend, ...webAttachments];
      const messageAttachments = attachmentsForSend.map((attachment) => ({
        ...attachment,
        label:
          attachment.kind === "document"
            ? "@ doc"
            : attachment.kind === "selection"
              ? `@ ${attachment.label.toLowerCase()}`
              : attachment.kind === "web"
                ? "@ web"
                : "@ quote",
      }));
      const userContent = buildUserContent(userPrompt, attachmentsForSend);
      const systemPrompt = buildSystemPrompt(awInstructions, attachmentsForSend, activeSkill);
      const outgoingMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "user",
          content: effectivePrompt || t("attachedContext"),
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
          : `${localBaseUrl}/v1/messages`;
      const authKey =
        settings.provider === "compatible" ? settings.compatibleApiKey.trim() : localApiKey;

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
                hasWeb: attachmentsForSend.some((attachment) => attachment.kind === "web"),
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
        title: titleFromPrompt(outgoingMessages[0]?.content ?? effectivePrompt, settings.language),
        messages: completedMessages,
        contextSummary: attachmentsForSend.length
          ? attachmentsForSend.map((attachment) => attachment.label).join(", ")
          : contextSummaryFromAttachments([], settings.language),
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
      label: t("quote"),
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
    setPrompt(isAttachedContextPlaceholder(userMessage.content) ? "" : userMessage.content);
    void sendPrompt(
      isAttachedContextPlaceholder(userMessage.content) ? "" : userMessage.content,
      baseMessages,
      userMessage.attachments ?? [],
    );
  }

  async function restartAndCheck() {
    setIsTesting(true);
    setError("");
    setTestStatus(t("testing"));

    try {
      if (settings.provider === "claude2api") {
        const response = await fetch(`${localBaseUrl}/service/restart`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localAdminKey}` },
        });
        if (!response.ok) {
          throw new Error(`Service test failed with HTTP ${response.status}.`);
        }
      }

      const nextConnection = await checkConnection({ quiet: true });
      setTestStatus(nextConnection === "connected" ? t("online") : t("offline"));
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
    setTestStatus(t("testing"));

    try {
      const response = await fetch(`${localBaseUrl}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localAdminKey}`,
        },
        body: JSON.stringify({ cookie_value: cookie }),
      });

      if (!response.ok) {
        throw new Error(`Account save failed with HTTP ${response.status}.`);
      }

      setNewAccountCookie("");
      await fetchAccounts();
      const nextConnection = await checkConnection({ quiet: true });
      setTestStatus(nextConnection === "connected" ? t("online") : t("limited"));
    } catch (accountError) {
      setError(explainError(accountError));
      setTestStatus(t("limited"));
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function deleteAccount(id: string) {
    setError("");

    try {
      const response = await fetch(`${localBaseUrl}/api/admin/accounts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localAdminKey}` },
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

  async function uninstallAddin() {
    if (isUninstalling) return;
    setIsUninstalling(true);
    setError("");
    setUninstallStatus("");

    try {
      const response = await fetch(`${localBaseUrl}/service/uninstall?purge_data=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localAdminKey}` },
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Uninstall failed with HTTP ${response.status}.`);
      }
      // The server spawns a detached uninstall process. The macOS admin
      // password dialog appears within ~2 s. If the user cancels it, the
      // server stays alive and the add-in remains functional — reset the
      // button state so they can retry (or simply continue using the add-in).
      setUninstallStatus(t("uninstallStarted"));
      setIsUninstalling(false);
    } catch (uninstallError) {
      setIsUninstalling(false);
      setError(explainError(uninstallError));
    }
  }

  function startNewConversation() {
    archiveConversation();
    setMessages([]);
    setPrompt("");
    setError("");
    setContextAttachments([]);
    setQuoteAttachment(null);
    setContextSummary(contextSummaryFromAttachments([], settings.language));
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
            aria-label={t("newConversation")}
            title={t("newConversation")}
            onClick={startNewConversation}
          >
            <MessageCirclePlus size={20} />
          </button>
          <button
            className="iconButton"
            type="button"
            aria-label={t("openHistory")}
            title={t("history")}
            onClick={() => setHistoryOpen(true)}
          >
            <History size={20} />
          </button>
          <button
            className="iconButton"
            type="button"
            aria-label={t("openSettings")}
            title={t("settings")}
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
          aria-label={t("checkService")}
          title={t("checkService")}
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
              ? t("connected")
              : connection === "checking"
                ? t("checking")
                : t("notLinked")}
          </span>
        </button>
      </header>

      {connection !== "connected" &&
      settings.provider === "claude2api" &&
      !accounts.length &&
      !connectPanelSeen ? (
        <section className="connectPanel">
          <div>
            <h2>{t("connectAccount")}</h2>
            <p>{t("connectAccountNote")}</p>
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
              {t("settings")}
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
              {t("check")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="workspace" aria-label={t("conversation")}>
        {messages.length ? (
          <div className="messages">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="messageRole">
                  {message.role === "user" ? settings.userName : settings.assistantName}
                </div>
                {message.attachments?.length ? (
                  <div className="messageTags" aria-label={t("attachedContext")}>
                    {message.attachments.map((attachment, attachmentIndex) => (
                      <span key={`${attachment.kind}-${attachment.label}-${attachmentIndex}`}>{attachment.label}</span>
                    ))}
                  </div>
                ) : null}
                <MarkdownMessage content={message.content} />
                {message.role === "assistant" ? (
                  <div className="assistantActions" aria-label={t("assistantActions")}>
                    <button
                      type="button"
                      aria-label={t("retry")}
                      title={t("retry")}
                      onClick={() => retryFromMessage(index)}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("copy")}
                      title={t("copy")}
                      onClick={() => void copyMessage(message.content)}
                    >
                      <Clipboard size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("quote")}
                      title={t("quote")}
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
                    {t("thinking")}<span className="thinkingDots" />
                  </span>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="emptyState">
            <img className="emptyMark" src="/assets/aw-logo-mark.svg" alt="" aria-hidden="true" />
            <div className="emptyTitle">{t("emptyTitle")}</div>
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
                      <span className="skillName">{skillLabel(skill.label, settings.language)}</span>
                      {activeSkill?.id === skill.id ? <Check className="trailingIcon" size={14} /> : null}
                    </button>
                  ))
                ) : (
                  <div className="menuEmpty">{t("noSkillsFound")}</div>
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
                  <span>{t("selection")}</span>
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
                  <span>{t("document")}</span>
                  {contextAttachments.some((attachment) => attachment.kind === "document") ? (
                    <Check className="trailingIcon" size={14} />
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <div className="menuSectionLabel">{t("thinkingEffort")}</div>
                <div className="optionList" role="group" aria-label={t("thinkingEffort")}>
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
                  <span>{t("modelSetting")}</span>
                  <strong>{modelLabel(settings.model)}</strong>
                  <ChevronDown size={15} />
                </button>
                {modelListOpen ? (
                  <div className="optionList" role="group" aria-label={t("model")}>
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
          {t("message")}
        </label>
        {activeSkill || composerAttachments.length ? (
          <div className="composerTokens">
            {activeSkill ? (
              <button
                className="skillPill"
                type="button"
                title={t("removeSkill")}
                onClick={() => setActiveSkill(null)}
              >
                <span>/{skillLabel(activeSkill.label, settings.language)}</span>
                <X size={12} />
              </button>
            ) : null}
            {composerAttachments.map((attachment) => (
              <button
                key={attachment.id}
                className={`contextPill ${attachment.kind}`}
                type="button"
                title={`${settings.language === "zh-CN" ? "移除" : "Remove"} ${attachment.label}`}
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
          placeholder={t("placeholder")}
        />
        <div className="composerFooter">
          <button
            className={`toolButton ${activeSkill || composerMenu === "commands" ? "active" : ""}`}
            type="button"
            aria-label={t("openTaskCommands")}
            title={t("tasks")}
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
            aria-label={t("attachWordContext")}
            aria-pressed={Boolean(contextAttachments.length || quoteAttachment)}
            title={t("attachWordContext")}
            onClick={() => void handleContextButton()}
          >
            <AtSign size={19} />
          </button>
          <button
            type="button"
            className="modelButton"
            aria-label={t("openModelOptions")}
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
            aria-label={t("send")}
            disabled={isGenerating || !canSubmit}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>

      {historyOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t("history")}>
          <aside className="drawer">
            <div className="drawerHeader">
              <button
                className="iconButton"
                type="button"
                aria-label={t("closeHistory")}
                onClick={() => setHistoryOpen(false)}
              >
                <X size={18} />
              </button>
              <h2>{t("history")}</h2>
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
                          aria-label={t("deleteHistoryItem")}
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
                            {t("otherDocuments")}
                          </div>
                          {otherDocItems.map(renderHistoryItem)}
                        </>
                      ) : null}
                    </>
                  );
                })()}
                <button type="button" className="clearHistoryButton" onClick={() => saveHistory([])}>
                  <Trash2 size={15} />
                  {t("clearAllHistory")}
                </button>
              </div>
            ) : (
              <p className="drawerNote">{t("noArchivedSession")}</p>
            )}
          </aside>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t("settings")}>
          <aside className="drawer settingsDrawer">
            <div className="drawerHeader">
              <button
                className="iconButton"
                type="button"
                aria-label={t("closeSettings")}
                onClick={() => {
                  setUninstallStatus("");
                  setSettingsOpen(false);
                }}
              >
                <X size={18} />
              </button>
              <h2>{t("settings")}</h2>
              <span className="drawerHeaderSpacer" aria-hidden="true" />
            </div>

            <section className="drawerSection">
              <div className="sectionTitle">{t("language")}</div>
              <label>
                <span className="srOnly">{t("language")}</span>
                <select
                  value={settings.language}
                  onChange={(event) =>
                    saveSettings({ ...settings, language: event.target.value as Language })
                  }
                >
                  <option value="zh-CN">{t("zhChinese")}</option>
                  <option value="en">{t("english")}</option>
                </select>
              </label>
            </section>

            <section className="drawerSection">
              <div className="sectionTitle">{t("preferNames")}</div>
              <label>
                {t("userRole")}
                <input
                  value={settings.userName}
                  onChange={(event) => saveSettings({ ...settings, userName: event.target.value })}
                />
              </label>
              <label>
                {t("assistantRole")}
                <input
                  value={settings.assistantName}
                  onChange={(event) =>
                    saveSettings({ ...settings, assistantName: event.target.value })
                  }
                />
              </label>
            </section>

            <section className="drawerSection">
              <div className="sectionTitle">{t("apiRoute")}</div>
              <div className="routeSwitch" role="group" aria-label={t("apiRoute")}>
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
                <div className="sectionTitle">{t("apiService")}</div>
                <label>
                  URL
                  <span className="inputShell">
                    <input
                      value={
                        settings.baseUrl === DEFAULT_SETTINGS.baseUrl ? t("default") : settings.baseUrl
                      }
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          baseUrl:
                            isDefaultInput(event.target.value)
                              ? DEFAULT_SETTINGS.baseUrl
                              : event.target.value,
                        })
                      }
                    />
                  </span>
                </label>
                <label>
                  {t("apiKey")}
                  <span className="inputShell">
                    <input
                      value={
                        settings.apiKey === DEFAULT_SETTINGS.apiKey ? t("default") : settings.apiKey
                      }
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          apiKey:
                            isDefaultInput(event.target.value)
                              ? DEFAULT_SETTINGS.apiKey
                              : event.target.value,
                        })
                      }
                    />
                  </span>
                </label>
                <details className="advancedSettings">
                  <summary>{t("advanced")}</summary>
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
                    className={`routeActionButton ${autoRouteAccountsActive ? "active" : ""}`}
                    aria-pressed={autoRouteAccountsActive}
                    onClick={() => {
                      markConnectPanelSeen();
                      saveSettings({
                        ...settings,
                        autoRouteAccounts: !settings.autoRouteAccounts,
                      });
                    }}
                    disabled={!canAutoRouteAccounts}
                  >
                    <Route size={15} />
                    {t("autoRoute")}
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
                    {t("test")}
                  </button>
                  {testStatus ? (
                    <span className={`testStatus ${testStatusTone(testStatus)}`}>{testStatus}</span>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="drawerSection">
                <div className="sectionTitle">{t("customApi")}</div>
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
                  {t("apiKey")}
                  <input
                    value={settings.compatibleApiKey}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleApiKey: event.target.value })
                    }
                  />
                </label>
                <label>
                  {t("modelMappingSonnet")}
                  <input
                    value={settings.compatibleSonnetModel}
                    onChange={(event) =>
                      saveSettings({ ...settings, compatibleSonnetModel: event.target.value })
                    }
                  />
                </label>
                <label>
                  {t("modelMappingHaiku")}
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
                    {t("test")}
                  </button>
                  {testStatus ? (
                    <span className={`testStatus ${testStatusTone(testStatus)}`}>{testStatus}</span>
                  ) : null}
                </div>
              </section>
            )}

            {settings.provider === "claude2api" ? (
              <section className="drawerSection">
                <div className="sectionTitle">{t("accountsManagement")}</div>
                <div className="accountList">
                  {accounts.length ? (
                    accounts.map((account, index) => {
                      const state = accountState(account);
                      return (
                        <div className="accountRow" key={account.organization_uuid}>
                          <div>
                            <strong>{accountDisplayName(index, settings.language)}</strong>
                            <span title={account.organization_uuid}>
                              {account.organization_uuid.slice(0, 8)}
                            </span>
                          </div>
                          <span className={`accountStatus ${state}`}>
                            {state === "online" ? (
                              t("online")
                            ) : (
                              <>
                                <CircleAlert size={12} />
                                {t("limited")}
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            className="iconButton"
                            aria-label={t("removeAccount")}
                            onClick={() => void deleteAccount(account.organization_uuid)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="drawerNote">{t("noAccountLinked")}</p>
                  )}
                </div>
                <label>
                  {t("newAccountCookie")}
                  <textarea
                    className="cookieInput"
                    placeholder={t("cookiePlaceholder")}
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
                  {isSavingAccount ? t("testing") : t("addAccount")}
                </button>
              </section>
            ) : null}

            <section className="drawerSection">
              <div className="sectionTitle">{t("modelSetting")}</div>
              <label>
                {t("model")}
                <select
                  value={settings.model}
                  onChange={(event) =>
                    saveSettings({ ...settings, model: event.target.value as ModelChoice })
                  }
                >
                  <option value="auto">{modelLabel("auto")}</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                </select>
              </label>
              <label>
                {t("thinkingEffort")}
                <select
                  value={settings.thinkingEffort}
                  onChange={(event) =>
                    saveSettings({
                      ...settings,
                      thinkingEffort: event.target.value as ThinkingEffort,
                    })
                  }
                >
                  <option value="auto">{effortLabel("auto")}</option>
                  <option value="low">{effortLabel("low")}</option>
                  <option value="medium">{effortLabel("medium")}</option>
                  <option value="high">{effortLabel("high")}</option>
                </select>
              </label>
            </section>

            <section className="drawerSection">
              <div className="sectionTitle">{t("awProfile")}</div>
              <textarea
                className="profileInput"
                aria-label={t("awProfile")}
                value={awProfile}
                onChange={(event) => saveAwProfile(event.target.value)}
              />
            </section>

            <section className="drawerSection drawerSectionDanger">
              <div className="sectionTitle">{t("uninstallTitle")}</div>
              <button
                type="button"
                className="dangerButton fullWidth"
                onClick={() => void uninstallAddin()}
                disabled={isUninstalling}
              >
                <Trash2 size={15} />
                {isUninstalling ? t("uninstalling") : t("uninstallButton")}
              </button>
              {uninstallStatus ? (
                <span className="testStatus testing">{uninstallStatus}</span>
              ) : null}
            </section>

          </aside>
        </div>
      ) : null}
    </main>
  );
}
