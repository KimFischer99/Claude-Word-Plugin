# A\W Word Claude MVP

A\W is a private MVP Word task pane add-in for Mac. It reads the current Word selection or a truncated document body, sends it to a local Claude-compatible proxy, and lets the user insert or replace the generated result.

## Local Setup

1. Install JavaScript dependencies:

   ```bash
   npm install
   ```

2. Prepare the local Claude proxy:

   ```bash
   ./scripts/setup-proxy.sh
   ```

3. Start the proxy:

   ```bash
   ./scripts/start-proxy.sh
   ```

   The script creates `local-proxy/runtime.json` with the local API key used by the add-in. Configure accounts from the A\W sidebar settings.

4. In another terminal, start the Word add-in web app:

   ```bash
   npm run dev:addin
   ```

5. Sideload the manifest in Word for Mac:

   ```bash
   ./scripts/sideload-mac.sh
   ```

   This follows Microsoft's Mac sideload path for Word:
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`.

6. Restart Word, open a document, then choose Home > Add-ins > A\W.

## MVP Scope

- Mac first.
- Uses Office.js Task Pane Add-in.
- Uses a local Claude2API-compatible service runtime.
- Sends selected text first; falls back to truncated body text.
- Supports insert, replace selection, and copy.
- No AppSource, installer, cloud database, multi-user auth, full RAG, or Track Changes integration yet.
