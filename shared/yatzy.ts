export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export type Dice = [DieValue, DieValue, DieValue, DieValue, DieValue]

export const categories = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'onePair',
  'twoPairs',
  'threeOfAKind',
  'fourOfAKind',
  'smallStraight',
  'largeStraight',
  'fullHouse',
  'chance',
  'yatzy',
] as const

export type Category = (typeof categories)[number]

export type Scorecard = Record<Category, number | null>

export type Player = {
  id: string
  name: string
}

export type GameState = {
  players: Player[]
  scorecards: Record<string, Scorecard>
  currentPlayerIndex: number
  dice: Dice
  held: [boolean, boolean, boolean, boolean, boolean]
  rollsLeft: number
  finished: boolean
}
