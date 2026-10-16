import type { Category, Dice, DieValue } from '../../../shared/yatzy'

const upperCategories: Partial<Record<Category, DieValue>> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

export function calculateScore(dice: Dice, category: Category) {
  const matchingValue = upperCategories[category]

  let score = 0

  if (matchingValue !== undefined) {
    dice.forEach((value) => {
      if (value === matchingValue) {
        score += value
      }
    })

    return score
  }

  switch (category) {
    case 'onePair': {
      const counts = new Map<DieValue, number>()
      let highestPair = 0

      for (const die of dice) {
        const previousCount = counts.get(die) ?? 0
        const newCount = previousCount + 1

        counts.set(die, newCount)

        if (newCount === 2 && die > highestPair) {
          highestPair = die
        }
      }

      return highestPair * 2
    }

    case 'twoPairs': {
      const counts = new Map<DieValue, number>()
      let highestPair = 0
      let almostHighestPair = 0

      for (const die of dice) {
        const previousCount = counts.get(die) ?? 0
        const newCount = previousCount + 1

        counts.set(die, newCount)

        if (newCount === 2 && die > highestPair) {
          almostHighestPair = highestPair
          highestPair = die
        } else if (newCount === 2 && die > almostHighestPair) {
          almostHighestPair = die
        }
      }

      if (almostHighestPair === 0) {
        return 0
      }
      return highestPair * 2 + almostHighestPair * 2
    }
    case 'threeOfAKind': {
      const counts = new Map<DieValue, number>()

      for (const die of dice) {
        const previousCount = counts.get(die) ?? 0
        const newCount = previousCount + 1

        counts.set(die, newCount)

        if (newCount === 3) {
          return die * 3
        }
      }

      return 0
    }
    case 'fourOfAKind': {
      const counts = new Map<DieValue, number>()

      for (const die of dice) {
        const previousCount = counts.get(die) ?? 0
        const newCount = previousCount + 1

        counts.set(die, newCount)

        if (newCount === 4) {
          return die * 4
        }
      }

      return 0
    }
    case 'smallStraight': {
      const seen = new Set<DieValue>()

      for (const die of dice) {
        if (die === 6 || seen.has(die)) {
          return 0
        }

        seen.add(die)
      }

      return 15
    }
    case 'largeStraight': {
      const seen = new Set<DieValue>()

      for (const die of dice) {
        if (die === 1 || seen.has(die)) {
          return 0
        }

        seen.add(die)
      }

      return 20
    }
    case 'fullHouse': {
      const counts = new Map<DieValue, number>()
      let total = 0
      for (const die of dice) {
        total += die
        const previousCount = counts.get(die) ?? 0
        const newCount = previousCount + 1

        counts.set(die, newCount)

        if (counts.size >= 3) {
          return 0
        }
      }
      if (counts.get(dice[0]) === 2 || counts.get(dice[0]) === 3) {
        return total
      }

      return 0
    }
    case 'chance': {
      dice.forEach((value) => {
        score += value
      })
      return score
    }
    case 'yatzy': {
      for (const die of dice) {
        if (die !== dice[0]) {
          return 0
        }
      }
      return 50
    }
  }

  return score
}
