// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
vi.mock('node:crypto', () => ({ randomInt: vi.fn() }))
import { randomInt } from 'node:crypto'
import { createRoom, joinRoom, leaveRoom } from './room'

describe('rooms', () => {
  it('retries code collisions without replacing an existing room', () => {
    vi.mocked(randomInt)
      .mockReturnValueOnce(123456 as never)
      .mockReturnValueOnce(123456 as never)
      .mockReturnValueOnce(654321 as never)
    const first = createRoom({ id: 'a', name: 'Alice' })
    const second = createRoom({ id: 'b', name: 'Bob' })
    expect(first.code).toBe('123456')
    expect(second.code).toBe('654321')
    expect(joinRoom(first.code, { id: 'c', name: 'Clara' }).players).toHaveLength(2)
  })
  it('limits seats, permits idempotent joins and frees disconnected seats', () => {
    vi.mocked(randomInt).mockReturnValueOnce(222222 as never)
    const room = createRoom({ id: 'host', name: 'Host' })
    for (let i = 0; i < 5; i++) joinRoom(room.code, { id: String(i), name: 'Guest' })
    expect(joinRoom(room.code, { id: 'host', name: 'Host' }).players).toHaveLength(6)
    expect(() => joinRoom(room.code, { id: 'extra', name: 'Extra' })).toThrow('Room is full')
    leaveRoom(room.code, '0')
    expect(joinRoom(room.code, { id: 'extra', name: 'Extra' }).players).toHaveLength(6)
    for (const player of [...room.players]) leaveRoom(room.code, player.id)
    expect(() => joinRoom(room.code, { id: 'new', name: 'New' })).toThrow('Room not found')
  })
})
