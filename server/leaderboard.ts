import { createClient, type Config, type ResultSet } from '@libsql/client'
import type { GameState, HighScore } from '../shared/yatzy'
import { totalScore } from './games/yatzy/game'

const ranking = 'SELECT name, points FROM results ORDER BY points DESC, rowid ASC LIMIT 5'
function entries(result: ResultSet): HighScore[] {
  return result.rows.map(row => ({ name: String(row.name), points: Number(row.points) }))
}

export async function openLeaderboard(config: Config) {
  const db = createClient(config)
  await db.batch([
    'CREATE TABLE IF NOT EXISTS results (match_id TEXT NOT NULL, room_code TEXT NOT NULL, seat INTEGER NOT NULL, name TEXT NOT NULL, points INTEGER NOT NULL CHECK(points >= 0), finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(match_id, seat))',
    'CREATE INDEX IF NOT EXISTS results_by_points ON results(points DESC)',
  ], 'write')
  let top = entries(await db.execute(ranking))
  let previous = Promise.resolve()
  return {
    top: () => top,
    close: () => db.close(),
    record(matchId: string, code: string, game: GameState) {
      if (!game.finished) throw new Error('Only finished matches can be recorded.')
      const inserts = game.players.map((player, seat) => ({
        sql: 'INSERT INTO results(match_id, room_code, seat, name, points) VALUES (?, ?, ?, ?, ?) ON CONFLICT(match_id,seat) DO NOTHING',
        args: [matchId, code, seat, player.name, totalScore(game.scorecards[player.id]!)],
      }))
      // Commit the entire match and read its ranking in the same transaction.
      // Publish snapshots in commit order even when several rooms finish together.
      const saved = previous.then(async () => {
        const results = await db.batch([...inserts, ranking], 'write')
        top = entries(results[results.length - 1]!)
      })
      previous = saved.catch(() => {})
      return saved
    },
  }
}
