# Security

Harness Chrome uses Chrome's **debugger** API (CDP) to control your real Chrome browser.

- The relay listens on **127.0.0.1:19882** — loopback only, never exposed to the network.
- Every request must carry the local token in the `X-Hermes-Token` header.
  The token is generated once and stored in `%LOCALAPPDATA%\hermes\chrome-control\token` (mode 600 on Unix).
- The extension holds the token in `chrome.storage.local` — it never leaves the machine.
- `<all_urls>` host permissions are needed for `chrome.debugger` to drive any page.
- Screenshots and uploads are saved locally to `%LOCALAPPDATA%\hermes\chrome-control\`.
- No telemetry. No external servers. No cloud services.

If you report a security issue, open an issue or contact the maintainer.
