// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import { buildServer } from './index'
import { categories, type RoomSnapshot } from '../shared/yatzy'

const clients: Socket[] = []
let server: Awaited<ReturnType<typeof buildServer>>
afterEach(async () => {
  clients.forEach((s) => s.disconnect())
  await server?.app.close()
})
function request(socket: Socket, event: string, ...args: unknown[]): Promise<any> {
  return new Promise((resolve, reject) =>
    socket
      .timeout(2000)
      .emit(event, ...args, (err: Error | null, data: unknown) =>
        err ? reject(err) : resolve(data),
      ),
  )
}
it('plays a complete multiplayer match, recovers a seat, and starts a rematch', async () => {
  server = await buildServer()
  const address = await server.app.listen({ port: 0, host: '127.0.0.1' })
  async function connect(token = randomUUID()) {
    const socket = io(address, { auth: { token }, transports: ['websocket'], forceNew: true })
    clients.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    return socket
  }
  const token = randomUUID()
  const host = await connect(token)
  const guest = await connect()
  let state = await request(host, 'room:create', 'Alice')
  const hostId = state.me
  expect((await request(host, 'game:start', { version: state.version })).error).toContain(
    'at least one',
  )
  state = await request(guest, 'room:join', state.code, 'Bob')
  const guestId = state.me
  expect((await request(guest, 'game:start', { version: state.version })).error).toContain(
    'Only the host',
  )
  state = await request(host, 'game:start', { version: state.version })
  expect(state.game.players).toHaveLength(2)
  expect(
    (
      await request(guest, 'game:roll', {
        version: state.version,
        value: [false, false, false, false, false],
      })
    ).error,
  ).toContain('turn')
  expect(
    (await request(host, 'game:score', { version: state.version, value: 'chance' })).error,
  ).toContain('roll')
  expect(
    (await request(host, 'game:roll', { version: state.version, value: [false] })).error,
  ).toContain('selection')
  state = await request(host, 'game:roll', {
    version: state.version,
    value: [false, false, false, false, false],
  })
  const firstDie = state.game.dice[0]
  const stale = state.version
  state = await request(host, 'game:roll', {
    version: state.version,
    value: [true, false, false, false, false],
  })
  expect(state.game.dice[0]).toBe(firstDie)
  expect(
    (
      await request(host, 'game:roll', {
        version: stale,
        value: [false, false, false, false, false],
      })
    ).error,
  ).toContain('changed')
  state = await request(host, 'game:roll', {
    version: state.version,
    value: [true, false, false, false, false],
  })
  expect(state.game.rollsLeft).toBe(0)
  expect(
    (
      await request(host, 'game:roll', {
        version: state.version,
        value: [false, false, false, false, false],
      })
    ).error,
  ).toContain('No more rolls')
  const disconnected = new Promise<RoomSnapshot>((resolve) => guest.once('room:updated', resolve))
  host.disconnect()
  state = await disconnected
  expect(state.onlineIds).not.toContain(hostId)
  const returned = await connect(token)
  state = await request(returned, 'room:join', state.code, 'Alice')
  expect(state.me).toBe(hostId)
  expect(state.game.rollsLeft).toBe(0)
  expect(state.game.dice[0]).toBe(firstDie)
  const extra = await connect()
  expect((await request(extra, 'room:join', state.code, 'Clara')).error).toContain('started')
  for (const category of categories) {
    for (const socket of [returned, guest]) {
      if (state.game.rollsLeft === 3)
        state = await request(socket, 'game:roll', {
          version: state.version,
          value: [false, false, false, false, false],
        })
      const id = state.game.players[state.game.currentPlayerIndex].id
      const expected = state.previews[category]
      state = await request(socket, 'game:score', { version: state.version, value: category })
      expect(state.error).toBeUndefined()
      expect(state.game.scorecards[id][category]).toBe(expected)
    }
  }
  expect(state.game.finished).toBe(true)
  expect(state.winnerIds.length).toBeGreaterThan(0)
  for (const id of [hostId, guestId]) {
    expect(Object.values(state.game.scorecards[id])).not.toContain(null)
    expect(state.totals[id]).toBe(
      Object.values(state.game.scorecards[id]).reduce((sum: number, n) => sum + Number(n), 0) +
        state.bonuses[id],
    )
  }
  expect((await request(guest, 'game:rematch', { version: state.version })).error).toContain('host')
  state = await request(returned, 'game:rematch', { version: state.version })
  expect(state.game.finished).toBe(false)
  expect(state.totals[hostId]).toBe(0)
  expect(state.game.rollsLeft).toBe(3)
}, 15000)
