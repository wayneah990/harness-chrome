# Harness Chrome

Control the user's real Google Chrome browser through a localhost relay and a Chrome extension.

## How it works

1. The plugin starts a localhost relay on `127.0.0.1:19882`.
2. The bundled Chrome extension (loaded unpacked from `extension/`) polls the relay.
3. The `chrome` tool sends commands to the relay; the extension executes them via `chrome.debugger` (CDP).

## Setup

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` directory from this bundle.
4. Click the Harness Chrome icon in the toolbar and press **Connect**.
5. Use the `chrome` tool in DeepSeek Harness.

## Actions

- `status` — check extension connection
- `tabs` — list open tabs
- `new_tab` — open a new tab (`url`)
- `close_tab` — close a tab (`tab_id`)
- `switch_tab` — switch to a tab (`tab_id`)
- `navigate` — navigate to a URL (`url`)
- `back` / `forward` / `reload` — history navigation
- `snapshot` — read the page (`filter`: interactive, all, text)
- `click` / `dblclick` / `right_click` / `hover` — click by ref (`ref`)
- `fill` — fill a field by ref (`ref`, `text`)
- `type` — type text by ref (`ref`, `text`)
- `key` — press a key (`key`)
- `scroll` — scroll (`direction`, `amount`)
- `screenshot` — capture the page
- `js` — run JavaScript (`script`)
- `text` — get page text (`selector`)
- `wait` — wait (`wait_ms`)
- `find` — find elements by query (`query`)

## Limitations

- Requires the Chrome extension to be loaded and connected.
- The extension must be reloaded after the relay restarts.
- Screenshots and uploads are saved to `%LOCALAPPDATA%\hermes\chrome-control\`.
