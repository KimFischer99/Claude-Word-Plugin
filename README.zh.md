# Claude Word Plugin

Claude Word Plugin 是一个面向 Microsoft Word 的文档协作插件，参考 Claude for Word 的交互方式设计，专注于在 Word 里读取选中文本、文档片段、引用回复和用户主动注入的上下文，辅助写作、审阅和总结。

插件可以通过本地代理把 Claude Web 会话转换为类似 API 的接口导入到 Word 插件中使用；也支持 Claude Web 多账户路由。如果你有自己的 Anthropic 兼容 API，也可以直接配置自定义接口。

[English](README.md) | 简体中文

## 功能特性

- Microsoft Word 侧边栏插件体验，适合文档起草、审阅、总结和润色。
- 支持从 Word 选区、文档片段、引用回复和粘贴网页链接附加上下文。
- 可通过本地代理导入 Claude Web 账户，并支持多账户路由。
- 支持自定义 Anthropic 兼容 API，适合自行托管或使用第三方兼容服务。
- 支持 Sonnet/Haiku 风格模型路由和 Thinking Effort 设置。
- 内置 summarize、humanize、review 等写作快捷任务。
- macOS Beta 0.1.0 提供本地优先的一键安装包。
- 默认遵守只读文档边界：插件读取 Word 上下文用于辅助回复，不会自行修改文档内容。

## 使用入门

### 环境要求

- 安装了 Microsoft Word 的 macOS 设备。
- 如果使用 Claude Web 路由，需要浏览器中已登录 Claude。
- 可选：Anthropic 兼容 API endpoint 和 API key。

macOS 安装包已经包含本地服务运行时，普通用户电脑不需要预装 Node.js 或 Python。

### 安装 Beta 版本

1. 从 release 页面下载 `AW_beta_0.1.0.pkg`。
2. 打开 pkg 并完成 macOS 安装流程。
3. 重启 Microsoft Word。
4. 打开任意文档，从 Word 插件菜单中启动插件。
5. 进入 Settings，选择 Claude Web 路由或自定义兼容 API。

### 导入 Claude Web 账户

1. 在浏览器中登录 Claude。
2. 复制 Claude cookie。推荐使用 Chrome 插件 [Get Cookies](https://chromewebstore.google.com/detail/get-cookies/hdablekeodiopcnddiamhahahkiiloph)，可以一键复制。
3. 将 cookie 粘贴到插件 Settings 的账户输入区域。
4. 先测试连接，再附加 Word 文档上下文使用。

### 使用兼容 API

1. 打开 Settings。
2. 切换到自定义 API provider。
3. 填写兼容 endpoint、API key 和模型映射。
4. 先发送短测试问题，再附加 Word 上下文。

## 安全提醒

Claude Web 代理依赖浏览器会话 cookie，可能带来账户风险。建议先新建一个单独的 Claude 账户用于测试，不要一开始就导入你的主力个人账户。

请只导入你有权使用的账户和 API key。不要把 cookie、key、日志或本地运行时数据提交到 Git，也不要贴到公开 issue 中。

## 开发

```bash
npm install
./scripts/setup-proxy.sh
npm run dev:agent-install
```

打开 Word 并加载插件。本地检查命令：

```bash
npm run typecheck
npm run build
./scripts/check-sanitized.sh
```

构建 macOS 安装包：

```bash
npm run build:installer
cp A-W-Installer-0.1.0.pkg AW_beta_0.1.0.pkg
```

## 参考资料

相关项目和文档见 [REFERENCES.md](REFERENCES.md)。

## License

MIT License. See [LICENSE](LICENSE).
