# A\W Word Claude MVP

A\W is a private MVP Word task pane add-in for Mac. It reads selected Word text or a truncated document body, sends the context to a local Claude-compatible proxy, and keeps follow-up chat grounded with selection, document, and quoted-response tokens.

## Local Setup

1. Install JavaScript dependencies:

   ```bash
   npm install
   ```

2. Prepare the local Claude proxy:

   ```bash
   ./scripts/setup-proxy.sh
   ```

3. Sideload the manifest in Word for Mac:

   ```bash
   ./scripts/sideload-mac.sh
   ```

   This follows Microsoft's Mac sideload path for Word:
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`.

4. Install and load the Word lifecycle watcher:

   ```bash
   npm run dev:agent-install
   ```

   This installs a macOS LaunchAgent watcher for the current user. Ports stay
   closed by default; the watcher starts the HTTPS add-in server on `3000` and
   the local proxy on `5201` after Microsoft Word opens, then stops them after
   Word fully quits.

5. Open Word, open a document, then choose Home > Add-ins > A\W.

6. When done, fully quit Word. The watcher stops the managed ports after the
   grace period. Press Ctrl+C in the watcher terminal to stop watching.

   ```bash
   npm run dev:stop
   ```

Useful dev lifecycle commands:

```bash
npm run dev:status
npm run dev:agent-install
npm run dev:stop
npm run dev:session
```

`dev:agent-install` is the durable workflow: it loads a per-user macOS
LaunchAgent that watches Word even after the terminal command returns.
`dev:start` is a lighter background watcher for the current shell session.
`dev:watch` runs the same watcher in the foreground for debugging.
`dev:session` starts the watcher and opens Microsoft Word for you.

For troubleshooting only, `dev:force-start` and `dev:force-restart` can force
both ports online without waiting for Word. The Word task pane itself cannot
reliably start or kill local processes, so the dev watcher/helper is the
lifecycle owner.

## MVP Scope

- Mac first.
- Uses Office.js Task Pane Add-in.
- Uses a local Claude2API-compatible service runtime.
- Supports explicit selection, document, and quoted-response context tokens.
- Supports assistant retry, copy, and quote actions inside the conversation.
- No AppSource, installer, cloud database, multi-user auth, full RAG, or Track Changes integration yet.
