# Harness Chrome

Claude-in-Chrome for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a Chrome MV3 extension plus a local host relay so DeepSeek Harness can **drive your real Google Chrome** (cookies, logins, open tabs) — not a fresh Chromium profile, and not a separate browser window.

**This is not an official DeepSeek product.** It is a community plugin. Review the code before you load it.

```
DeepSeek Harness
        │  chrome tool
        ▼
  127.0.0.1:19882 relay  ← token on loopback only
       ▲
Chrome extension (chrome.debugger CDP)
        │
Your Chrome windows & tabs
```

## Features

- **`chrome` tool** — `status`, `tabs`, `navigate`, `snapshot` (refs `e1`…), `click`/`fill`/`type`/`key`, `screenshot`, `js`
- **Side panel chat** — type an instruction on the current tab (same idea as Claude in Chrome)
- **Shared thread** — Chrome side panel and DeepSeek Harness session show the same questions and answers
- **Alt+H** — open the side panel (customize at `chrome://extensions/shortcuts`)
- Unsent draft survives closing the panel
- **Blue pill** on a tab while Harness Chrome is driving it
- Drag **images or PDFs** onto the side panel (or paste / paperclip)
- Existing logins stay; Harness tab group for agent tabs
- Copy icon on messages (ChatGPT-style)

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installed and working
- Google Chrome (or Chromium) on Windows, macOS, or Linux
- Node.js 18+ (the relay is stdlib-only — no npm installs)

## Install

```bash
git clone https://github.com/wayneah990/harness-chrome.git
```

Install the bundle in DeepSeek Harness (via the plugin manager) pointing at this repo directory, then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → the `extension/` folder inside this repo
4. Pin **Harness Chrome** once. It connects when Chrome starts — no puzzle-icon click.

Toolbar icons are cached by Chrome. After an icon change, **Reload** the extension or fully quit Chrome.

## Use

**From any DeepSeek Harness chat** (the `chrome` tool is native — not hidden behind tool_search):

```
chrome(action="status")
chrome(action="navigate", url="https://example.com")
chrome(action="snapshot", filter="interactive")
chrome(action="click", ref="e3")
```

URL-only jobs: `navigate` or `new_tab` and stop. Snapshot only when you will click or fill.

**From Chrome:** open the side panel (`Alt+H`) and type what you want done on this tab. Highlighted text on the page is sent as untrusted context.

You can keep using **another Chrome window** while Harness Chrome works. Do not click inside the same tab it is driving.

## Security

The extension uses Chrome's **debugger** API. The relay listens on **127.0.0.1:19882** with a local token. Read [SECURITY.md](SECURITY.md).

## Contributing

Public repo. **Fork + Pull Request** — see [CONTRIBUTING.md](CONTRIBUTING.md). Direct push to `main` is owner-only.

## License

[MIT](LICENSE)
