# Claude Word Plugin (A\W)

A\W is a Microsoft Word add-in for document collaboration with Claude-style assistance. It is inspired by the Claude for Word workflow and focuses on reading selected text, document excerpts, quoted replies, and user-provided context inside Word.

The add-in can use a local proxy to turn a Claude Web session into an API-like provider for the Word plugin. It also supports multi-account routing for Claude Web accounts and a custom Anthropic-compatible API endpoint if you prefer to bring your own provider.

English | [简体中文](README.zh.md)

## Features

- Word task pane experience for document drafting, review, summarization, and rewriting.
- Context attachment from selected Word text, document excerpts, quoted assistant replies, and pasted web links.
- Claude Web account import through a local proxy with multi-account routing.
- Custom Anthropic-compatible API configuration for self-managed providers.
- Model selection for Sonnet/Haiku-style routes and thinking-effort controls.
- Built-in writing shortcuts for summarize, humanize, and review workflows.
- Local-first desktop packaging for macOS Beta 0.1.0.
- Read-only document boundary by default: the add-in reads Word context for assistance and does not autonomously modify the document.

## Getting Started

### Requirements

- macOS with Microsoft Word installed.
- A browser signed in to Claude if you plan to use Claude Web account routing.
- Optional: an Anthropic-compatible API endpoint and key.

The packaged macOS installer includes the local service runtime. End users do not need Node.js or Python installed.

### Install the Beta

1. Download `AW_beta_0.1.0.pkg` from the release page.
2. Open the package and complete the macOS installer.
3. Restart Microsoft Word.
4. Open a document, then launch the add-in from Word's add-ins menu.
5. Open Settings and choose either Claude Web routing or a custom compatible API.

### Import a Claude Web Account

1. Sign in to Claude in your browser.
2. Copy your Claude cookie. The recommended helper is the Chrome extension [Get Cookies](https://chromewebstore.google.com/detail/get-cookies/hdablekeodiopcnddiamhahahkiiloph), which can copy the cookie in one step.
3. Paste the cookie into the add-in Settings account field.
4. Test the connection before using it with document context.

### Use a Compatible API

1. Open Settings.
2. Choose the custom API provider mode.
3. Enter your compatible endpoint, API key, and model mapping.
4. Send a short test prompt before attaching Word context.

## Safety Notice

Claude Web proxying depends on browser-session cookies and may carry account risk. For safer testing, create a separate Claude account before importing cookies, and avoid using a primary personal account until you understand the tradeoffs.

Only import accounts and API keys you are allowed to use. Keep cookies, keys, logs, and local runtime data out of Git and public issue reports.

## Development

```bash
npm install
./scripts/setup-proxy.sh
npm run dev:agent-install
```

Open Word and load the add-in. For local checks:

```bash
npm run typecheck
npm run build
./scripts/check-sanitized.sh
```

Build the macOS package:

```bash
npm run build:installer
cp A-W-Installer-0.1.0.pkg AW_beta_0.1.0.pkg
```

## References

See [REFERENCES.md](REFERENCES.md) for related projects and documentation.

## License

MIT License. See [LICENSE](LICENSE).
