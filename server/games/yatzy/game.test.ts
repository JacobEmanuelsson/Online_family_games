import { describe, expect, it } from 'vitest'
import { createGame, chooseCategory } from './game'

describe('choosing a category', () => {
  it('saves the score and moves to the next player', () => {
    const state = createGame([
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ])

    // Set up a known roll so the result is predictable.
    state.dice = [5, 2, 5, 3, 5]
    state.rollsLeft = 2

    const nextState = chooseCategory(state, 'fives')

    expect(nextState.scorecards['alice']?.fives).toBe(15)
    expect(nextState.currentPlayerIndex).toBe(1)
    expect(nextState.rollsLeft).toBe(3)
    expect(nextState.held).toEqual([false, false, false, false, false])

    // The function should leave the original state unchanged.
    expect(state.scorecards['alice']?.fives).toBeNull()
  })
  it('rejects a category that already contains zero', () => {
    const state = createGame([{ id: 'alice', name: 'Alice' }])

    // No fives: choosing fives should record zero.
    state.dice = [1, 2, 3, 4, 6]
    state.rollsLeft = 2

    const nextState = chooseCategory(state, 'fives')

    expect(nextState.scorecards['alice']?.fives).toBe(0)

    // With one player, the next turn belongs to Alice again.
    nextState.rollsLeft = 2

    expect(() => chooseCategory(nextState, 'fives')).toThrow('Cannot pick the same category')
  })
})
