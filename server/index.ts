import { allowedOrigins, clientAddress, fixedWindow } from './security'
import staticFiles from '@fastify/static'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createHash } from 'node:crypto'
import { Server } from 'socket.io'
import { createRoom, joinRoom, leaveRoom, snapshot, gameAction } from './room'

// Exporting the factory lets integration tests run an isolated server on a free port.
export async function buildServer() {
  const app = Fastify({ logger: true })
  const production = process.env.NODE_ENV === 'production'
  const origins = allowedOrigins(production, process.env.PUBLIC_ORIGIN ?? (process.env.RENDER === 'true' ? process.env.RENDER_EXTERNAL_URL : undefined))
  const handshakeAllowed = fixedWindow(60, 60_000)
  const joinAllowed = fixedWindow(20, 60_000)
  const createAllowed = fixedWindow(8, 60_000)
  await app.register(cors, { origin: origins })
  if (production && process.env.RENDER === 'true') {
    await app.register(staticFiles, { root: fileURLToPath(new URL('../dist/', import.meta.url)) })
  }
  app.get('/health', async () => ({ status: 'ok' }))
  const io: Server = new Server(app.server, {
    cors: { origin: origins },
    maxHttpBufferSize: 8192,
    connectTimeout: 10_000,
    allowRequest(req, callback) {
      const origin = req.headers.origin
      // Same-origin polling GETs can omit Origin. Production's proxy supplies the scheme.
      const originOK = origin === undefined
        ? !production || (req.headers['sec-fetch-site'] === 'same-origin' && req.headers.host === new URL(origins[0]!).host)
        : origins.includes(origin)
      const secure = !production || ((process.env.RENDER === 'true' || req.socket.remoteAddress === '127.0.0.1') && req.headers['x-forwarded-proto'] === 'https')
      callback(null, secure && originOK && io.engine.clientsCount < 1000 && handshakeAllowed(clientAddress(req, production)))
    },
  })
  const connections = new Map<string, string>()
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token
    if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))
      return next(new Error('Invalid player session. Reload this page.'))
    // Only the derived ID is broadcast. The secret stays in this tab's session storage.
    socket.data.playerId = createHash('sha256').update(token).digest('hex')
    next()
  })
  io.on('connection', (socket) => {
    const playerId: string = socket.data.playerId
    const address = clientAddress(socket.request, production)
    const eventAllowed = fixedWindow(100, 10_000)
    socket.use((_packet, next) => {
      if (!eventAllowed('socket')) { socket.disconnect(true); return }
      next()
    })
    const previous = connections.get(playerId)
    if (previous) io.sockets.sockets.get(previous)?.disconnect(true)
    connections.set(playerId, socket.id)
    socket.emit('session:ready', { playerId })

    async function enter(action: 'create' | 'join', code: unknown, name: unknown, reply: unknown) {
      if (typeof reply !== 'function') return
      const allowed = action === 'create' ? createAllowed(address) : joinAllowed(address)
      if (!allowed) return reply({ error: 'Too many room attempts. Try again in a minute.' })
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 20)
        return reply({ error: 'Enter a name between 1 and 20 characters.' })
      if (action === 'join' && (typeof code !== 'string' || !/^[0-9]{6}$/.test(code.trim())))
        return reply({ error: 'Enter a six-digit room code.' })
      if (socket.data.joining || socket.data.roomCode)
        return reply({ error: 'You are already seated in a room.' })
      socket.data.joining = true
      try {
        const player = { id: playerId, name: name.trim() }
        const room =
          action === 'create' ? createRoom(player) : joinRoom((code as string).trim(), player)
        socket.data.roomCode = room.code
        await socket.join(room.code)
        if (!socket.connected) {
          leaveRoom(room.code, playerId)
          return
        }
        const data = snapshot(room)
        reply({ ...data, me: playerId })
        io.to(room.code).emit('room:updated', data)
      } catch (error) {
        leaveRoom(socket.data.roomCode, playerId)
        delete socket.data.roomCode
        reply({ error: error instanceof Error ? error.message : 'Could not enter room.' })
      } finally {
        socket.data.joining = false
      }
    }
    socket.on('room:create', (name, reply) => {
      void enter('create', undefined, name, reply)
    })
    socket.on('room:join', (code, name, reply) => {
      void enter('join', code, name, reply)
    })
    for (const action of ['start', 'roll', 'score', 'rematch']) {
      socket.on(`game:${action}`, (payload: unknown, reply: unknown) => {
        if (typeof reply !== 'function') return
        try {
          if (!payload || typeof payload !== 'object') throw new Error('Invalid move.')
          const { version, value } = payload as { version?: unknown; value?: unknown }
          const room = gameAction(socket.data.roomCode, playerId, action, version, value)
          const data = snapshot(room)
          reply(data)
          io.to(room.code).emit('room:updated', data)
        } catch (error) {
          reply({ error: error instanceof Error ? error.message : 'Could not play this move.' })
        }
      })
    }
    socket.on('disconnect', () => {
      if (connections.get(playerId) === socket.id) connections.delete(playerId)
      const room = leaveRoom(socket.data.roomCode, playerId)
      if (room) io.to(room.code).emit('room:updated', snapshot(room))
    })
  })
  app.addHook('onClose', async () => {
    io.close()
  })
  return { app, io }
}
