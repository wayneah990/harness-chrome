/* Harness Chrome relay — localhost HTTP server bridging the DSH tool
   and the Chrome extension. Stdlib only (node:http, node:crypto, node:fs).

   Endpoints:
     GET  /status              relay + extension health
     POST /pair                first-time extension handshake, returns token
     GET  /pull?wait=20        extension long-poll; 200 command | 204 empty
     POST /result              extension posts command result
     POST /cmd                 agent sends a command and blocks for the result
     POST /screenshot          extension uploads a PNG (base64) → saved on disk
     POST /upload              extension uploads a file (base64) → saved on disk
*/

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOST = '127.0.0.1'
const PORT = 19882
const VERSION = '1.0.0'
const DEFAULT_CMD_TIMEOUT = 60.0
const PULL_MAX_WAIT = 12.0
const EXTENSION_STALE_S = 25.0

const stateDir = () => {
  const local = process.env.LOCALAPPDATA || os.homedir()
  const p = path.join(local, 'hermes', 'chrome-control')
  fs.mkdirSync(p, { recursive: true })
  return p
}
const screenshotDir = () => {
  const p = path.join(stateDir(), 'screenshots')
  fs.mkdirSync(p, { recursive: true })
  return p
}
const uploadDir = () => {
  const p = path.join(stateDir(), 'uploads')
  fs.mkdirSync(p, { recursive: true })
  return p
}

const tokenPath = () => path.join(stateDir(), 'token')

function getOrCreateToken() {
  const p = tokenPath()
  try {
    const val = fs.readFileSync(p, 'utf8').trim()
    if (val) return val
  } catch (_) {}
  const token = crypto.randomBytes(24).toString('base64url')
  fs.writeFileSync(p, token, { encoding: 'utf8', mode: 0o600 })
  return token
}

let lastPull = 0
let paired = false
let pendingCmd = null
let cmdReady = false
const results = new Map()
const resultEvents = new Map()
const waiters = []

function extensionConnected() {
  if (lastPull <= 0) return false
  return (Date.now() / 1000 - lastPull) < EXTENSION_STALE_S
}

function statusPayload() {
  return {
    ok: true,
    version: VERSION,
    host: HOST,
    port: PORT,
    paired,
    extension_connected: extensionConnected(),
    last_pull_s: lastPull > 0 ? Math.round((Date.now() / 1000 - lastPull) * 100) / 100 : null,
    pending: pendingCmd !== null,
    token_file: tokenPath(),
  }
}

function submitCommand(payload, timeout = DEFAULT_CMD_TIMEOUT) {
  return new Promise((resolve) => {
    const cmdId = crypto.randomBytes(16).toString('hex')
    const cmd = { id: cmdId, ...payload }
    if (pendingCmd !== null) {
      resolve({ ok: false, error: 'busy', message: 'A Chrome command is already in flight. Retry.' })
      return
    }
    pendingCmd = cmd
    cmdReady = true
    const event = new Promise((res) => resultEvents.set(cmdId, res))

    const waitFor = extensionConnected() ? timeout : Math.min(timeout, 15.0)
    const timer = setTimeout(() => {
      pendingCmd = null
      cmdReady = false
      results.delete(cmdId)
      resultEvents.delete(cmdId)
      resolve({
        ok: false,
        error: extensionConnected() ? 'timeout' : 'chrome_extension_disconnected',
        message: 'Harness Chrome extension did not answer. On chrome://extensions click Reload on Harness Chrome, or open the Harness Chrome icon and press Connect.',
        command_id: cmdId,
        status: statusPayload(),
      })
    }, waitFor * 1000)

    event.then((result) => {
      clearTimeout(timer)
      pendingCmd = null
      cmdReady = false
      results.delete(cmdId)
      resultEvents.delete(cmdId)
      resolve(result)
    })
  })
}

function saveUpload({ name, mime, b64 }) {
  const rawName = path.basename(String(name || 'file'))
  let suffix = path.extname(rawName).toLowerCase()
  const IMAGE_SUFFIX = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
  const OK_SUFFIX = new Set([...IMAGE_SUFFIX, '.pdf'])
  if (!OK_SUFFIX.has(suffix)) {
    const guessed = {
      'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
      'image/gif': '.gif', 'application/pdf': '.pdf',
    }[(mime || '').split(';')[0].trim().toLowerCase()] || ''
    suffix = guessed
  }
  if (!OK_SUFFIX.has(suffix)) {
    return { ok: false, error: 'type', message: 'Only images (png/jpg/webp/gif) and PDF.' }
  }
  if (b64 && b64.includes(',')) b64 = b64.split(',', 1)[1]
  let data
  try { data = Buffer.from(b64 || '', 'base64') } catch (_) { return { ok: false, error: 'bad_data' } }
  if (!data || data.length === 0) return { ok: false, error: 'empty' }
  if (data.length > 15 * 1024 * 1024) return { ok: false, error: 'too_large', message: 'Max 15 MB per file.' }
  const stem = (path.basename(rawName, path.extname(rawName)).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40)) || 'file'
  const dest = path.join(uploadDir(), `${stem}_${crypto.randomBytes(4).toString('hex')}${suffix}`)
  fs.writeFileSync(dest, data)
  return { ok: true, path: dest, name: path.basename(dest), mime: mime || '', bytes: data.length, kind: IMAGE_SUFFIX.has(suffix) ? 'image' : 'pdf' }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (_) { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function tokenOk(req, incoming) {
  const expected = getOrCreateToken()
  let got = incoming || req.headers['x-hermes-token'] || ''
  if (!got) {
    const url = new URL(req.url, 'http://127.0.0.1')
    got = url.searchParams.get('token') || ''
  }
  if (!got) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(String(got)), Buffer.from(expected))
  } catch (_) { return false }
}

function sendJson(res, code, body, origin) {
  const raw = body === undefined ? Buffer.from('') : Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': raw.length,
    'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, X-Hermes-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' } : {}),
  })
  res.end(raw)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const pathname = url.pathname.replace(/\/$/, '') || '/'
  const origin = req.headers.origin || ''
  const originOk = origin.startsWith('chrome-extension://') || origin.startsWith('http://127.0.0.1') ? origin : ''

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': originOk || '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Hermes-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' })
    res.end()
    return
  }

  if (req.method === 'GET') {
    if (pathname === '/status') {
      sendJson(res, 200, statusPayload(), originOk)
      return
    }
    if (pathname === '/pull') {
      if (!tokenOk(req)) { sendJson(res, 401, { ok: false, error: 'bad_token' }, originOk); return }
      lastPull = Date.now() / 1000
      const wait = Math.min(PULL_MAX_WAIT, Math.max(0, parseFloat(url.searchParams.get('wait') || '20') || 20))
      const start = Date.now()
      while (Date.now() - start < wait * 1000) {
        if (pendingCmd !== null) {
          const cmd = pendingCmd
          pendingCmd = null
          cmdReady = false
          lastPull = Date.now() / 1000
          sendJson(res, 200, cmd, originOk)
          return
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      lastPull = Date.now() / 1000
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
      return
    }
    sendJson(res, 404, { ok: false, error: 'not_found' }, originOk)
    return
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req)

    if (pathname === '/pair') {
      const token = getOrCreateToken()
      const incoming = req.headers['x-hermes-token'] || body.token || ''
      if (paired && incoming && !tokenOk(req, incoming)) {
        sendJson(res, 401, { ok: false, error: 'already_paired' }, originOk)
        return
      }
      paired = true
      lastPull = Date.now() / 1000
      sendJson(res, 200, { ok: true, token, port: PORT, version: VERSION }, originOk)
      return
    }

    if (pathname === '/result') {
      if (!tokenOk(req)) { sendJson(res, 401, { ok: false, error: 'bad_token' }, originOk); return }
      const cmdId = String(body.id || '')
      if (!cmdId) { sendJson(res, 400, { ok: false, error: 'missing_id' }, originOk); return }
      results.set(cmdId, body)
      const ev = resultEvents.get(cmdId)
      if (ev) ev(body)
      sendJson(res, 200, { ok: true }, originOk)
      return
    }

    if (pathname === '/screenshot') {
      if (!tokenOk(req)) { sendJson(res, 401, { ok: false, error: 'bad_token' }, originOk); return }
      let b64 = body.png_base64 || ''
      if (b64.includes(',')) b64 = b64.split(',', 1)[1]
      let raw
      try { raw = Buffer.from(b64, 'base64') } catch (_) { sendJson(res, 400, { ok: false, error: 'bad_png' }, originOk); return }
      if (!raw || raw.length === 0) { sendJson(res, 400, { ok: false, error: 'bad_png' }, originOk); return }
      const name = `chrome_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}_${crypto.randomBytes(3).toString('hex')}.png`
      const dest = path.join(screenshotDir(), name)
      fs.writeFileSync(dest, raw)
      sendJson(res, 200, { ok: true, path: dest, bytes: raw.length }, originOk)
      return
    }

    if (pathname === '/upload') {
      if (!tokenOk(req)) { sendJson(res, 401, { ok: false, error: 'bad_token' }, originOk); return }
      const result = saveUpload({ name: body.name, mime: body.mime, b64: body.data || body.b64 })
      sendJson(res, result.ok ? 200 : 400, result, originOk)
      return
    }

    if (pathname === '/cmd') {
      if (!tokenOk(req)) { sendJson(res, 401, { ok: false, error: 'bad_token' }, originOk); return }
      const timeout = parseFloat(body.timeout) || DEFAULT_CMD_TIMEOUT
      const { timeout: _t, ...payload } = body
      const result = await submitCommand(payload, timeout)
      sendJson(res, 200, result, originOk)
      return
    }

    sendJson(res, 404, { ok: false, error: 'not_found' }, originOk)
    return
  }

  sendJson(res, 404, { ok: false, error: 'not_found' }, originOk)
})

export function startRelay() {
  return new Promise((resolve, reject) => {
    server.listen(PORT, HOST, () => resolve(server))
    server.on('error', reject)
  })
}

export function stopRelay() {
  return new Promise((resolve) => server.close(() => resolve()))
}

export function isRelayRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/status`, (res) => {
      let d = ''
      res.on('data', (c) => d += c)
      res.on('end', () => {
        try { resolve(JSON.parse(d).ok === true) } catch (_) { resolve(false) }
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => { req.destroy(); resolve(false) })
  })
}

export function getToken() { return getOrCreateToken() }
export function getStatus() { return statusPayload() }
