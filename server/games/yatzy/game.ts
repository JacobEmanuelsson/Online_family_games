import { categories } from '../../../shared/yatzy'
import type { DieValue, GameState, Player, Scorecard, Dice, Category } from '../../../shared/yatzy'
import { calculateScore } from './scoring'

function createEmptyScorecard(): Scorecard {
  const scorecard = {} as Scorecard

  for (const category of categories) {
    scorecard[category] = null
  }

  return scorecard
}

export function createGame(players: Player[]): GameState {
  if (players.length === 0) {
    throw new Error('A game needs at least one player')
  }

  const scorecards: Record<string, Scorecard> = {}

  for (const player of players) {
    scorecards[player.id] = createEmptyScorecard()
  }

  return {
    players,
    scorecards,
    currentPlayerIndex: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    finished: false,
  }
}

export function rollDice(state: GameState, held: GameState['held']): GameState {
  if (state.finished) {
    throw new Error('The game is finished')
  }
  if (state.rollsLeft === 0) {
    throw new Error('No more rolls')
  }

  const isFirstRoll = state.rollsLeft === 3
  const newHeld: GameState['held'] = isFirstRoll ? [false, false, false, false, false] : held

  const newDice = state.dice.map((die, i) =>
    newHeld[i] ? die : ((Math.floor(Math.random() * 6) + 1) as DieValue),
  ) as Dice

  return {
    ...state,
    dice: newDice,
    held: newHeld,
    rollsLeft: state.rollsLeft - 1,
  }
}

export function chooseCategory(state: GameState, category: Category): GameState {
  if (state.finished) {
    throw new Error('The game is finished')
  }

  if (state.rollsLeft === 3) {
    throw new Error('Player needs to roll atleast once')
  }

  const currentPlayer = state.players[state.currentPlayerIndex]

  if (!currentPlayer) {
    throw new Error('Current player was not found')
  }

  const scoreCard = state.scorecards[currentPlayer.id]

  if (!scoreCard) {
    throw new Error('Current player has no scorecard')
  }

  if (scoreCard[category] !== null) {
    throw new Error('Cannot pick the same category')
  }

  const points = calculateScore(state.dice, category)
  const newScorecard = { ...scoreCard, [category]: points }
  const newScorecards = { ...state.scorecards, [currentPlayer.id]: newScorecard }

  const finished = Object.values(newScorecards).every((card) => !Object.values(card).includes(null))
  return {
    ...state,
    scorecards: newScorecards,
    finished,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    held: [false, false, false, false, false],
    rollsLeft: 3,
  }
}

export function upperBonus(scorecard: Scorecard): number {
  let total = 0

  for (const category of categories.slice(0, 6)) {
    total += scorecard[category] ?? 0
  }

  if (total >= 63) {
    return 50
  }
  return 0
}

export function totalScore(scorecard: Scorecard): number {
  let total = 0

  for (const category of categories) {
    total += scorecard[category] ?? 0
  }

  return total + upperBonus(scorecard)
}

export function getWinners(state: GameState): Player[] {
  if (!state.finished) {
    throw new Error('Game is not finished')
  }

  let highestScore = -1
  let winners: Player[] = []

  for (const player of state.players) {
    const scorecard = state.scorecards[player.id]

    if (!scorecard) {
      throw new Error('Player has no scorecard')
    }

    const score = totalScore(scorecard)

    if (score > highestScore) {
      highestScore = score
      winners = [player]
    } else if (score === highestScore) {
      winners.push(player)
    }
  }

  return winners
}
