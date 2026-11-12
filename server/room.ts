import { randomInt } from 'node:crypto'
import {
  categories,
  type Category,
  type GameState,
  type Player,
  type RoomSnapshot,
} from '../shared/yatzy'
import {
  createGame,
  rollDice,
  chooseCategory,
  totalScore,
  upperBonus,
  getWinners,
} from './games/yatzy/game'
import { calculateScore } from './games/yatzy/scoring'

type Room = {
  code: string
  players: Player[]
  hostId: string
  onlineIds: string[]
  game: GameState | null
  version: number
  message: string
}
const rooms = new Map<string, Room>()
const expiry = new Map<string, ReturnType<typeof setTimeout>>()
function requireRoom(code: string): Room {
  const room = rooms.get(code)
  if (!room) throw new Error('Room not found. It may have expired or the server restarted.')
  return room
}
export function createRoom(player: Player): Room {
  if (rooms.size >= 1000) throw new Error('The server is full. Try again later.')
  let code: string
  do {
    code = randomInt(100000, 1000000).toString()
  } while (rooms.has(code))
  const room: Room = {
    code,
    players: [player],
    hostId: player.id,
    onlineIds: [player.id],
    game: null,
    version: 0,
    message: 'The table is open. Invite your friends.',
  }
  rooms.set(code, room)
  return room
}
export function joinRoom(code: string, player: Player): Room {
  const room = requireRoom(code)
  const existing = room.players.some((p) => p.id === player.id)
  if (!existing) {
    if (room.game) throw new Error('This game has started. Only existing players can rejoin.')
    if (room.players.length >= 6) throw new Error('Room is full')
    room.players.push(player)
  }
  if (!room.onlineIds.includes(player.id)) room.onlineIds.push(player.id)
  clearTimeout(expiry.get(code))
  expiry.delete(code)
  room.version++
  room.message = `${existing ? room.players.find((p) => p.id === player.id)!.name : player.name} joined the table.`
  return room
}
export function leaveRoom(code: string, playerId: string): Room | undefined {
  const room = rooms.get(code)
  if (!room) return
  room.onlineIds = room.onlineIds.filter((id) => id !== playerId)
  if (!room.game) {
    room.players = room.players.filter((p) => p.id !== playerId)
    if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? ''
    if (!room.players.length) rooms.delete(code)
  } else if (!room.onlineIds.length) {
    clearTimeout(expiry.get(code))
    const timer = setTimeout(
      () => {
        rooms.delete(code)
        expiry.delete(code)
      },
      15 * 60 * 1000,
    )
    timer.unref()
    expiry.set(code, timer)
  }
  room.version++
  room.message = 'A player disconnected. Their game seat is saved for reconnection.'
  return room
}
export function snapshot(room: Room): RoomSnapshot {
  const game = room.game
  const totals: Record<string, number> = {}
  const bonuses: Record<string, number> = {}
  const previews = {} as Record<Category, number>
  for (const p of room.players) {
    const card = game?.scorecards[p.id]
    totals[p.id] = card ? totalScore(card) : 0
    bonuses[p.id] = card ? upperBonus(card) : 0
  }
  for (const c of categories)
    previews[c] = game && game.rollsLeft < 3 ? calculateScore(game.dice, c) : 0
  return {
    ...room,
    totals,
    bonuses,
    previews,
    winnerIds: game?.finished ? getWinners(game).map((p) => p.id) : [],
  }
}
export function gameAction(
  code: string,
  playerId: string,
  action: string,
  version: unknown,
  value?: unknown,
): Room {
  const room = requireRoom(code)
  if (!room.onlineIds.includes(playerId)) throw new Error('Join this room before playing.')
  if (version !== room.version) throw new Error('The table changed. Please try again.')
  if (action === 'start' || action === 'rematch') {
    if (room.hostId !== playerId) throw new Error('Only the host can start a game.')
    if (action === 'start' ? room.game !== null : !room.game?.finished)
      throw new Error('A game is already in progress or not ready for rematch.')
    if (room.players.length < 2) throw new Error('Invite at least one friend to start.')
    if (room.onlineIds.length !== room.players.length)
      throw new Error('Wait for every player to reconnect before starting.')
    room.game = createGame(room.players.map((p) => ({ ...p })))
    room.message = 'A fresh scorecard. Good luck!'
  } else {
    const game = room.game
    if (!game || game.finished) throw new Error('There is no active game.')
    const current = game.players[game.currentPlayerIndex]!
    if (current.id !== playerId) throw new Error('Wait for your turn.')
    if (action === 'roll') {
      if (!Array.isArray(value) || value.length !== 5 || value.some((v) => typeof v !== 'boolean'))
        throw new Error('Invalid dice selection.')
      if (game.rollsLeft < 3 && value.every(Boolean))
        throw new Error('Release a die or choose a score.')
      room.game = rollDice(game, value as GameState['held'])
      room.message = `${current.name} rolled the dice.`
    } else if (action === 'score') {
      if (!categories.includes(value as Category)) throw new Error('Invalid category.')
      room.game = chooseCategory(game, value as Category)
      room.message = `${current.name} scored ${room.game.scorecards[current.id]![value as Category]} points.`
    } else throw new Error('Unknown game action.')
  }
  room.version++
  return room
}
