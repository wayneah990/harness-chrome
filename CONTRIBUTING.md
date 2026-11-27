# Contributing

Thanks for your interest in Harness Chrome.

## Workflow

1. Fork the repo.
2. Create a branch: `git checkout -b feature/your-change`
3. Make your change. Keep the code stdlib-only (no runtime dependencies for the relay).
4. Commit with a clear message.
5. Open a Pull Request against `main`.

## Style

- No build step, no bundler — plain ES modules and a vanilla MV3 extension.
- Keep the extension self-contained in `extension/`.
- Keep the relay in `relay.js` stdlib-only (`node:http`, `node:crypto`, `node:fs`, `node:path`, `node:os`).

## Reporting bugs

Open an issue with: what you ran, what you expected, what happened, and the relevant output.
