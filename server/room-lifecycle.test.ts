// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { categories } from '../shared/yatzy'
import { createRoom, joinRoom, leaveRoom, gameAction } from './room'
it('transfers start privileges when the lobby host leaves', async () => {
  const room = createRoom({ id: 'a', name: 'Alice' })
  joinRoom(room.code, { id: 'b', name: 'Bob' })
  leaveRoom(room.code, 'a')
  joinRoom(room.code, { id: 'c', name: 'Cara' })
  expect(room.hostId).toBe('b')
  await expect(
    gameAction(room.code, 'c', 'start', room.version, undefined, vi.fn()),
  ).rejects.toThrow('host')
  await gameAction(room.code, 'b', 'start', room.version, undefined, vi.fn())
  expect(room.game?.players.map((p) => p.id)).toEqual(['b', 'c'])
})
it('retries the same final score after a failed save without duplicating the match', async () => {
  const room = createRoom({ id: 'a', name: 'Alice' })
  joinRoom(room.code, { id: 'b', name: 'Bob' })
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  await gameAction(room.code, 'a', 'start', room.version, undefined, save)
  const game = room.game!
  for (const card of Object.values(game.scorecards))
    for (const category of categories) card[category] = 0
  game.scorecards.a!.chance = null
  game.rollsLeft = 1
  game.dice = [6, 5, 4, 3, 2]
  const version = room.version
  const score = (category: string) => gameAction(room.code, 'a', 'score', version, category, save)
  await expect(score('chance')).rejects.toThrow('save')
  expect(room.version).toBe(version)
  expect(game.scorecards.a!.chance).toBeNull()
  await expect(score('yatzy')).rejects.toThrow('last category')
  await score('chance')
  expect(room.game?.finished).toBe(true)
  expect(room.game?.scorecards.a!.chance).toBe(20)
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0])
  await expect(score('chance')).rejects.toThrow()
  expect(save).toHaveBeenCalledTimes(2)
})
