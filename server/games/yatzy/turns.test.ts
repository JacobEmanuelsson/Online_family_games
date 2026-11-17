import { expect, it } from 'vitest'
import { categories } from '../../../shared/yatzy'
import { createGame, rollDice, chooseCategory, totalScore, upperBonus, getWinners } from './game'
const players = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
]
it.each([
  [2, 62, 0],
  [3, 63, 50],
  [4, 64, 50],
])('with %i ones and %i upper points awards %i bonus', (ones, sum, bonus) => {
  const card = createGame(players).scorecards.a!
  Object.assign(card, { ones, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 30 })
  expect(upperBonus(card)).toBe(bonus)
  expect(totalScore(card)).toBe(sum + bonus + 30)
})
it('clears first-roll holds, keeps selected dice on rerolls and enforces the roll budget', () => {
  const initial = createGame(players)
  const first = rollDice(initial, [true, true, true, true, true])
  expect(first.held).toEqual([false, false, false, false, false])
  const second = rollDice(first, [true, false, true, false, true])
  for (const i of [0, 2, 4]) expect(second.dice[i]).toBe(first.dice[i])
  const third = rollDice(second, second.held)
  expect(third.rollsLeft).toBe(0)
  expect(() => rollDice(third, third.held)).toThrow('No more rolls')
  expect(initial.rollsLeft).toBe(3)
})
it('waits for the last seat, recognizes tied winners and locks the finished game', () => {
  const game = createGame(players)
  for (const card of Object.values(game.scorecards)) {
    for (const category of categories) card[category] = 0
    card.chance = null
  }
  game.rollsLeft = 1
  game.dice = [1, 2, 3, 4, 5]
  const next = chooseCategory(game, 'chance')
  expect(next.finished).toBe(false)
  expect(() => getWinners(next)).toThrow()
  expect(() => chooseCategory(next, 'chance')).toThrow()
  const final = chooseCategory({ ...next, rollsLeft: 1 }, 'chance')
  expect(getWinners(final)).toEqual(players)
  expect(() => rollDice(final, final.held)).toThrow('finished')
  expect(() => chooseCategory(final, 'ones')).toThrow('finished')
})
