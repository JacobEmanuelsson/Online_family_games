import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

// A real process exit releases native SQLite handles on Windows.
it('recovers the highest five results after restart and counts each seat once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yatzy-scores-'))
  const config = { url: pathToFileURL(join(dir, 'scores.db')).href }
  const start = "import { openLeaderboard } from './server/leaderboard.ts'; const board = await openLeaderboard(" + JSON.stringify(config) + ");"
  function run(code: string) {
    const child = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e',start + code], {encoding:'utf8'})
    expect(child.status, child.stderr).toBe(0)
    return child.stdout
  }
  try {
    run(`
      import {createGame} from './server/games/yatzy/game.ts'
      import {categories} from './shared/yatzy.ts'
      for(let match=1;match<=3;match++){
        const game=createGame([{id:'a',name:'Alice'},{id:'b',name:'Bob'}])
        for(const card of Object.values(game.scorecards)){
          for(const category of categories) card[category]=0
          card.chance=match*5
        }
        game.finished=true
        await board.record(String(match),String(match),game)
        await board.record(String(match),String(match),game)
      }
      board.close()
    `)
    const scores = JSON.parse(run('console.log(JSON.stringify(board.top())); board.close()'))
    expect(scores).toEqual([15,15,10,10,5].map((points,i)=>({name:i%2?'Bob':'Alice',points})))
  } finally {
    await rm(dir,{recursive:true,force:true})
  }
}, 15000)
