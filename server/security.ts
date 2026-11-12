import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'

// One bounded map per limit. Expired windows are cleared together.
export function fixedWindow(max: number, duration: number) {
  const counts = new Map<string, number>()
  let expires = 0
  return (key: string, now = Date.now()) => {
    if (now >= expires) {
      counts.clear()
      expires = now + duration
    }
    const count = counts.get(key) ?? 0
    if (count >= max || (count === 0 && counts.size >= 8192)) return false
    counts.set(key, count + 1)
    return true
  }
}

export function allowedOrigins(production: boolean, configured?: string) {
  if (!production) return ['http://localhost:5173', 'http://127.0.0.1:5173']
  if (!configured) throw new Error('Set PUBLIC_ORIGIN to the public HTTPS origin.')
  const url = new URL(configured)
  if (url.protocol !== 'https:' || url.origin !== configured)
    throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin without a path.')
  return [url.origin]
}

export function clientAddress(req: IncomingMessage, production: boolean) {
  const peer = req.socket.remoteAddress ?? 'unknown'
  if (production && process.env.RENDER === 'true') {
    const forwarded = req.headers['x-forwarded-for']
    const last = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : undefined
    return last && isIP(last) ? last : peer
  }
  const address = req.headers['x-real-ip']
  // The production proxy overwrites this header and the server binds to IPv4 loopback.
  if (production && peer === '127.0.0.1' && typeof address === 'string' && isIP(address)) return address
  return peer
}
