import { expect, it } from 'vitest'
import type { Category, Dice } from '../../../shared/yatzy'
import { calculateScore } from './scoring'
const examples: Record<Category, [Dice, number][]> = {
  ones: [[[1, 2, 1, 6, 1], 3]],
  twos: [[[2, 2, 3, 4, 5], 4]],
  threes: [[[3, 1, 3, 2, 3], 9]],
  fours: [[[4, 5, 6, 4, 2], 8]],
  fives: [[[5, 5, 5, 5, 2], 20]],
  sixes: [
    [[6, 2, 1, 6, 3], 12],
    [[1, 2, 3, 4, 5], 0],
  ],
  onePair: [
    [[6, 4, 4, 6, 1], 12],
    [[1, 2, 3, 4, 5], 0],
  ],
  twoPairs: [
    [[6, 4, 4, 6, 1], 20],
    [[2, 2, 4, 4, 4], 12],
    [[2, 2, 2, 2, 6], 0],
  ],
  threeOfAKind: [
    [[2, 2, 2, 2, 6], 6],
    [[6, 6, 5, 5, 4], 0],
  ],
  fourOfAKind: [
    [[3, 3, 3, 3, 3], 12],
    [[6, 6, 6, 2, 2], 0],
  ],
  smallStraight: [
    [[2, 4, 1, 5, 3], 15],
    [[2, 3, 4, 5, 6], 0],
    [[1, 2, 3, 4, 4], 0],
  ],
  largeStraight: [
    [[6, 3, 4, 2, 5], 20],
    [[1, 2, 3, 4, 5], 0],
    [[2, 3, 4, 6, 6], 0],
  ],
  fullHouse: [
    [[3, 6, 3, 6, 3], 21],
    [[6, 3, 3, 6, 3], 21],
    [[5, 5, 5, 5, 5], 0],
    [[5, 5, 5, 5, 2], 0],
  ],
  chance: [[[6, 3, 5, 1, 4], 19]],
  yatzy: [
    [[2, 2, 2, 2, 2], 50],
    [[6, 6, 6, 6, 1], 0],
  ],
}
for (const category of Object.keys(examples) as Category[]) {
  it.each(examples[category])(category + ' scores %j as %i', (dice, points) =>
    expect(calculateScore(dice, category)).toBe(points),
  )
}
