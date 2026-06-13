# A\W Word 侧边栏插件 MVP SPEC

## 1. 当前定位

A\W 是一个面向个人实验使用的 Microsoft Word for Mac 侧边栏插件 MVP。当前目标不是公开发布或 AppSource 上架，而是先验证一条可用链路：

1. Word 通过 Office.js Task Pane 加载 A\W 侧边栏。
2. 侧边栏读取当前选区或文档正文片段。
3. 前端把用户消息、可选 Word 上下文和内置写作规则发送给模型服务。
4. 模型回复显示在侧边栏中。
5. 用户确认后可把回复插入 Word 或替换当前选区。

当前实现已经从单纯方案文档进入可运行原型阶段，但安装、运行依赖打包和 Windows 适配仍未完成。

## 2. 当前架构

```text
Microsoft Word for Mac
  |
  | Office.js Task Pane Add-in
  v
React / Vite add-in UI
  |
  | /aw-proxy in dev, or direct compatible endpoint
  v
Local Claude2API-compatible proxy or compatible API provider
  |
  v
Claude Free account session / compatible model provider
```

项目由三层组成：

- `addin/`：React + TypeScript + Office.js 侧边栏前端。
- `local-proxy/`：基于 `clove-proxy[rnet]` 的本地 Claude2API-compatible FastAPI 包装（以下简称 aw-proxy）。
- `scripts/`：Mac 本地开发/侧载脚本。

## 3. 已完成情况

### 3.1 Office.js 插件骨架

- 已提供 `addin/manifest.xml`，可在 Word for Mac 通过本地 manifest 侧载。
- manifest 使用 `ReadDocument` 权限。
- 插件入口为 `https://localhost:3000/index.html`。
- Vite 开发服务提供 HTTPS，并代理 `/aw-proxy` 到 `http://127.0.0.1:5201`。

### 3.2 前端侧边栏

- 已实现 A\W 单栏侧边栏 UI。
- 已实现顶部新会话、历史、设置和服务状态入口。
- 已实现启动欢迎态，使用橙色 A\W 字符标识与欢迎语。
- 已实现聊天消息流、输入框、发送按钮和生成中状态。
- 已实现 `/` 快捷任务菜单、`@` Word 上下文菜单和模型菜单。
- 已实现多段 Selection、Document 和 Quote token 注入。
- 已实现 assistant 单轮回复的 Retry、Copy 和 Quote 图标动作。
- 已实现本地历史保存和恢复，当前存储在浏览器 `localStorage`。
- 已实现设置抽屉，支持 Claude Web 路由和 Custom API 路由切换。
- 已实现模型名称、Thinking Effort、Prefer Names、账户 New Cookie 和 A\W Profile 等基础配置。

### 3.3 Word 文档交互

- 已实现当前选区读取。
- 已实现文档正文读取，并按 `MAX_DOCUMENT_CHARS` 截断。
- 已实现点击 `@` 时优先读取当前选区；无选区时展示 Selection/Document 菜单。
- 已实现最多 5 段 Selection token，第二段开始自动显示为 Selection 01、Selection 02 等。
- 已移除 Word 写回按钮和写回确认弹窗；当前不提供插入或替换 Word 正文的前端入口。

当前尚未实现完整段落级索引、可点击引用定位、批注/修订集成和 Track Changes 专用写回。

### 3.4 模型调用

- Claude Web 路由默认通过 `/aw-proxy/v1/messages` 调用本地代理。
- Custom API 路由支持用户配置 URL、API Key、Model Mapping (Sonnet) 和 Model Mapping (Haiku)。
- 当前默认 Sonnet model id 为 `claude-sonnet-4-6`。
- Custom API 响应只读取 `content` 里的 text block，因此不会把 thinking block 当作最终回复显示。
- 无文档上下文时支持直接聊天，不再强制要求 Word 文本。

### 3.5 本地代理

- `local-proxy/aw_proxy.py` 提供 FastAPI app。
- 服务绑定目标为 `127.0.0.1:5201`。
- 已提供：
  - `GET /health`
  - `GET /auth/status`
  - `POST /service/restart`
  - `GET /models`
  - upstream `POST /v1/messages`
  - upstream account admin routes
- 已对 Claude web processor 做本地包装，用 prompt payload 发送合并后的系统提示和消息文本。
- 已对 event stream 换行做标准化处理。
- 已禁用浏览器 token exchange 路径，当前以 cookie account 方式接入。

### 3.6 写作技能系统

- 已实现 `/` 快捷任务技能菜单，选中技能后其内容作为系统提示注入 API 请求。
- 三个技能已完成（每个 ~30-45 行，面向 Free Plan 有限上下文优化）：
  - `/summarize` — 双模式：学术论文摘要模式（200-300 词，Background→Methods→Findings→Conclusion）和通用总结模式
  - `/humanize` — 去 AI 痕迹编辑器：5 大类 20 种 AI 写作模式检测和自然改写
  - `/review` — 四维度文本评审：Clarity & Structure / Logic & Evidence / Style & Tone / Completeness，结构化输出
- 技能注册于 `addin/public/skills/registry.json`，SKILL.md 按需 fetch。
- `buildSystemPrompt()` 将选中技能内容附加到 system prompt，单技能保证（`useState` 单值替换，无追加路径）。
- 端到端已验证：HTTP 端点全部 200，技能内容互不重叠（词汇重叠率 10-15%）。

### 3.7 开发脚本

- `scripts/setup-proxy.sh`：创建 Python venv、安装代理依赖、写入本地 `.env` 和 `runtime.json`。
- `scripts/start-proxy.sh`：启动本地代理。
- `scripts/start-addin.sh`：启动 Vite add-in。
- `scripts/dev-control.sh`：统一管理开发态 add-in 和 proxy 端口，支持 `start`、`stop`、`restart`、`status`、`word-watch`、`word-session`、`force-start`、`force-restart`。
- `scripts/sideload-mac.sh`：复制 manifest 到 Word for Mac 常见侧载目录。

## 4. 当前运行方式

开发态推荐使用 Word 生命周期 watcher。目标流程是：

```text
端口默认关闭 -> 打开 Word -> 端口打开 -> 使用插件 -> 关闭插件 -> 完全 quit Word -> 端口关闭
```

安装并加载 watcher：

```bash
npm run dev:agent-install
```

`dev:agent-install` 会安装当前用户的 macOS LaunchAgent，并把 watcher 加载到后台。watcher 自身常驻，但端口默认关闭；检测到 Microsoft Word 运行后才确保：

- add-in HTTPS dev server: `https://localhost:3000`
- local proxy: `http://127.0.0.1:5201`

Word 完全退出并经过 `AW_WORD_GRACE_SECONDS` 后，watcher 会停止脚本管理的端口。关闭插件面板不立即杀端口，因为 Office.js task pane 的 unload 生命周期不适合作为本机进程控制边界。

`dev:agent-install`、`dev:start` 和 `dev:restart` 都不直接打开端口。日常流程中端口必须由 Word 运行状态触发：

```text
端口关闭 -> watcher 等待 -> Word 打开 -> 端口打开 -> Word 完全退出 -> 端口关闭
```

手动强制启动端口仅用于调试：

```bash
npm run dev:force-start
```

查看状态：

```bash
npm run dev:status
```

停止脚本管理的进程：

```bash
npm run dev:stop
```

也可以使用 Word 会话模式；它会先打开 Microsoft Word，再进入同一个 watcher：

```bash
npm run dev:session
```

Office.js task pane 本身不负责本机进程生命周期；插件启动时只做 health check，端口生命周期由本地 helper 或开发脚本负责。

首次使用或依赖缺失时：

```bash
npm install
./scripts/setup-proxy.sh
./scripts/sideload-mac.sh
```

然后重启 Word，在 Home > Add-ins 中打开 A\W。

## 5. 当前限制

- 还不是一键安装包。
- 还不是正式一键安装/启动流程；当前只有开发态统一启停脚本。
- 用户仍需要本机 Node、Python、Office add-in dev cert 和 Word 侧载目录。
- 本地代理依赖 Claude Free account cookie，稳定性受上游网页/会话机制影响。
- 历史记录仍是浏览器 `localStorage`，未按 Word 文档 fingerprint 分组。
- 当前 RAG 是轻量上下文拼接，不是段落索引或向量检索。
- 文档引用卡片、点击定位、批注读取、修订写回尚未实现。
- Windows 侧载路径、证书、脚本和启动方式尚未适配。
- 无 Web Fetch 能力 — 模型无法联网获取实时信息（已确认 Claude Free 无透传联网搜索）。
- 定位为「Word 里的 Claude 聊天框」而非文档操作 Agent（对比 word-GPT-Plus 有 25+ 文档读写工具）。

## 6. 安全边界

- 本地代理只应绑定 `127.0.0.1`。
- `.env`、`runtime.json`、代理数据目录、日志目录、Python venv、测试 API key 文件不进入 Git。
- Claude cookie 只应由用户本机保存，不提交仓库。
- 会修改 Word 文档的动作必须由用户在 UI 中点击确认。
- 公开发布前必须重新评估 Claude Free account / web session 接入方式，优先考虑正式 API、BYOK 或组织 LLM gateway。

## 7. 验证状态

当前可作为基础验收的检查项：

- TypeScript 编译：`npm run typecheck`
- 前端生产构建：`npm run build`
- CSS 结构检查：读取 `addin/src/styles.css` 并校验括号平衡
- Python 语法编译：`python3 -m py_compile local-proxy/aw_proxy.py`
- 本地端口检查：
  - add-in dev server: `127.0.0.1:3000`
  - local proxy: `127.0.0.1:5201`
- 技能 HTTP 端点测试：registry.json + 3 个 SKILL.md 均返回 200
- 技能唯一性验证：三个技能词汇重叠率 10-15%，互不干扰

## 8. 下一步工作方向

### 8.1 组件与运行依赖打包

- 固化 Node、Python、proxy runtime 和 Office dev cert 的版本要求。
- 将 `npm install`、Python venv、proxy dependency、manifest 侧载纳入可复现安装流程。
- 明确哪些文件是用户数据，哪些文件是可替换程序组件。
- 增加卸载流程，清理 manifest、启动项、缓存和可选账户数据。

### 8.2 一键安装和启动流程复现

- 做 Mac .pkg 标准安装器（非独立应用，仅安装 Word 插件所需后台服务）。
- 参考 word-GPT-Plus 的 `release/` 目录结构，预留 Windows 适配空间。
- 安装时自动完成：
  - 代理二进制部署（PyInstaller 编译 aw-proxy → 独立可执行文件，含 Python 运行时）
  - 自签名 HTTPS 证书生成和 Keychain 信任
  - manifest 侧载到 WEF 目录
  - 本地服务 LaunchAgent 自启配置
- 安装后路径布局：
  - 系统级：`/Library/Application Support/AW/{bin/aw-server, static/, manifest.xml, uninstall.sh}`
  - 用户级：`~/Library/Application Support/AW/{config.json, certs/, data/, logs/, .env}`
  - LaunchAgent：`~/Library/LaunchAgents/com.aw.word-server.plist`
  - WEF 侧载：`~/Library/Containers/com.microsoft.Word/Data/Documents/wef/aw-manifest.xml`
- 提供一个用户双击即可卸载的 `A-W-Uninstall.command` 脚本。
- 将现在的双终端开发启动流程收敛为单服务（aw_server.py：API + 静态文件均在端口 5201）。
- 打包流程脱敏步骤：
  - `DEFAULT_SETTINGS` 中 apiKey/adminKey 清空
  - 前端运行时从 `/config.json` 获取安装时生成的随机密钥
  - 构建前检查无开发者密钥/路径泄露
- 详细打包方案见 `.claude/plans/proud-dreaming-gray.md`。

### 8.3 Web Fetch 能力

- 当前模型无联网搜索能力（已验证—Claude Free 无 tool use 联网透传）。
- 后续在 aw-proxy 添加 `GET /fetch?url=<url>` 端点，服务端抓取网页内容并返回纯文本。
- 前端增加 Web Fetch 快捷任务或 URL 粘贴自动识别，将抓取结果注入上下文。
- 提供技能化封装（`/fetch`），与现有 summarize/humanize/review 并列。

### 8.4 Word 文档能力补齐

- 建立段落级 chunk 索引和标题路径。
- 回复中输出引用标记并渲染为引用卡片。
- 点击引用后定位到 Word 段落。
- 增加批注读取和修订文本处理。
- 写回时尽量继承目标段落样式，并评估 Track Changes 集成。

### 8.5 Windows 适配

- 调研 Windows Office Add-in sideload 路径和信任配置。
- 替换或补充 shell 脚本为 PowerShell / .msi installer 流程。
- 验证 localhost HTTPS 证书在 Windows Word 中的加载行为。
- 验证本地代理、防火墙和启动项在 Windows 环境下的权限边界。

## 9. 暂不做

- 不提交 Microsoft AppSource。
- 不做云端数据库、团队账号、企业权限、审计日志。
- 不做跨 Word/Excel/PowerPoint 的通用上下文层。
- 不承诺 Claude Free web/session 接入的长期稳定性。
- 不在当前阶段做完整 Windows 发行包。
- 不做文档 Agent（操作 Word 的读写/格式化/搜索工具链，如 word-GPT-Plus 的 25+ 工具）。

## 10. 参考项目

### 10.1 内部参考

- 打包方案：`.claude/plans/proud-dreaming-gray.md`
- 技能文档：`addin/public/skills/skill-one/SKILL.md` (summarize)、`skill-two/SKILL.md` (humanize)、`skill-three/SKILL.md` (review)
- Humanizer 参考：[blader/humanizer](https://github.com/blader/humanizer)
- Academic Paper Reviewer 参考：[Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills/tree/main/academic-paper-reviewer)

### 10.2 外部参考

- [word-GPT-Plus](https://github.com/Kuingsmile/word-GPT-Plus) — Vue/TS Word 插件，纯前端 + 云端 API 架构，无本地后端。25+ 文档 Agent 工具（读写/格式化/搜索）、双重模式（Chat + Agent with LangChain）、Windows 共享文件夹侧载、Docker 自托管。A\W 的参考对标项目：打包发布结构参考其 `release/` 目录；架构路线与之不同（A\W 需要本地代理因 Claude Free cookie 鉴权，定位为聊天框而非文档 Agent）。
- Claude for Word 官方帮助页：`https://support.claude.com/en/articles/14465370-use-claude-for-word`
- Microsoft Marketplace Claude for Word 页面：`https://marketplace.microsoft.com/en-us/product/office/wa200010453?tab=overview`
- Microsoft Office Add-ins 概览：`https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins`
- Claude for Microsoft 365 产品页：`https://claude.com/claude-for-microsoft-365`
