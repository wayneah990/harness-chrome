/* Harness Chrome — registers a `chrome` tool that drives the user's
   real Google Chrome via the localhost relay + Chrome extension (CDP).

   The relay is started in-process on 127.0.0.1:19882. The Chrome extension
   (loaded unpacked from the bundled extension/ directory) polls the relay
   and executes commands via chrome.debugger.
*/

import { startRelay, stopRelay, isRelayRunning, getToken } from './relay.js'

export const name = 'dsh-chrome'
export const inject = ['tools']

const RELAY = 'http://127.0.0.1:19882'

async function callRelay(path, body) {
  const token = getToken()
  const res = await fetch(RELAY + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hermes-Token': token },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return data
}

export function apply(ctx, config) {
  let relayStarted = false

  const start = async () => {
    const running = await isRelayRunning()
    if (!running) {
      await startRelay()
      relayStarted = true
    }
  }

  start().catch(() => {})

  const tool = {
    name: 'chrome',
    description:
      'Control the user\'s real Google Chrome browser via CDP. ' +
      'Actions: status, tabs, new_tab, close_tab, switch_tab, navigate, back, forward, reload, ' +
      'snapshot, click, dblclick, right_click, hover, fill, type, key, scroll, screenshot, js, text, wait, find. ' +
      'Use status first to check the extension is connected. Use navigate to go to a URL, snapshot to read the page, ' +
      'then click/fill by ref (eN) from the snapshot. Use screenshot to capture the page.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'The action to perform.',
        enum: [
          'status', 'tabs', 'new_tab', 'close_tab', 'switch_tab', 'navigate',
          'back', 'forward', 'reload', 'snapshot', 'click', 'dblclick', 'right_click',
          'hover', 'fill', 'type', 'key', 'scroll', 'screenshot', 'js', 'text',
          'wait', 'find',
        ],
      },
      url: { type: 'string', description: 'URL for navigate/new_tab.' },
      tab_id: { type: 'number', description: 'Tab id for close_tab/switch_tab/snapshot/click/etc.' },
      ref: { type: 'string', description: 'Element ref (eN) from a snapshot, for click/dblclick/right_click/hover/fill/type.' },
      text: { type: 'string', description: 'Text for fill/type/key/find.' },
      key: { type: 'string', description: 'Key name for key action (e.g. Enter, Tab, Escape).' },
      query: { type: 'string', description: 'Search query for find.' },
      filter: { type: 'string', description: 'Snapshot filter: interactive, all, text.' },
      script: { type: 'string', description: 'JavaScript for js action.' },
      direction: { type: 'string', description: 'Scroll direction: up, down, left, right.' },
      amount: { type: 'number', description: 'Scroll amount (1-20) or wait seconds.' },
      wait_ms: { type: 'number', description: 'Wait time in milliseconds for wait action.' },
      timeout: { type: 'number', description: 'Command timeout in seconds (default 60).' },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const running = await isRelayRunning()
      if (!running) {
        try { await startRelay() } catch (_) {}
      }

      const payload = { action: args.action }
      if (args.url !== undefined) payload.url = args.url
      if (args.tab_id !== undefined) payload.tab_id = args.tab_id
      if (args.ref !== undefined) payload.ref = args.ref
      if (args.filter !== undefined) payload.filter = args.filter
      if (args.direction !== undefined) payload.direction = args.direction
      if (args.amount !== undefined) payload.amount = args.amount
      if (args.timeout !== undefined) payload.timeout = args.timeout

      if (args.action === 'fill') {
        payload.ref = args.ref
        payload.value = args.text
      } else if (args.action === 'type') {
        payload.text = args.text
      } else if (args.action === 'key') {
        payload.keys = args.key || args.text
      } else if (args.action === 'js') {
        payload.code = args.script || args.text
      } else if (args.action === 'wait') {
        payload.seconds = args.wait_ms ? args.wait_ms / 1000 : (args.amount || 1)
      } else if (args.action === 'find') {
        payload.query = args.query || args.text
      } else if (args.action === 'text') {
        // no args
      } else if (args.action === 'screenshot') {
        // no args
      } else if (args.text !== undefined) {
        payload.text = args.text
      }

      if (args.action === 'status') {
        const token = getToken()
        const res = await fetch(RELAY + '/status', { headers: { 'X-Hermes-Token': token } })
        return await res.json()
      }
      const result = await callRelay('/cmd', payload)
      return result
    },
  }

  ctx.tools.register(tool)

  return () => {
    if (relayStarted) {
      stopRelay().catch(() => {})
    }
  }
}
