<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { io } from 'socket.io-client'
import Die from './components/Die.vue'
import { categories, type Category, type GameState, type HighScore, type RoomSnapshot } from '../shared/yatzy'

const highScores = ref<HighScore[] | null>(null)
const connected = ref(false)
const playerName = ref('')
const room = ref<RoomSnapshot | null>(null)
const me = ref('')
const joinCode = ref('')
const mode = ref<'create' | 'join'>('create')
const errorMessage = ref('')
const busy = ref(false)
const copied = ref(false)
const held = ref<GameState['held']>([false, false, false, false, false])
const reviewRoll = ref(false)
const confirmRerolls = ref(true)
function setConfirmation(enabled: boolean) {
  confirmRerolls.value = enabled
  try { localStorage.setItem('yatzy.confirmRerolls', String(enabled)) } catch { /* Session only. */ }
}
function requestRoll() {
  if (game.value?.rollsLeft === 3 || !confirmRerolls.value) act('roll', [...held.value])
  else reviewRoll.value = true
}
function confirmRoll() {
  reviewRoll.value = false
  act('roll', [...held.value])
}
const zeroCategory = ref<Category | null>(null)
const showInvite = ref(false)
let autoJoin = false
let requestNumber = 0
let copyTimer: ReturnType<typeof setTimeout> | undefined
const socket = io({ autoConnect: false })
type Response = (RoomSnapshot & { me?: string }) | { error: string }
const labels: Record<Category, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  onePair: 'One pair',
  twoPairs: 'Two pairs',
  threeOfAKind: 'Three of a kind',
  fourOfAKind: 'Four of a kind',
  smallStraight: 'Small straight',
  largeStraight: 'Large straight',
  fullHouse: 'Full house',
  chance: 'Chance',
  yatzy: 'Yatzy',
}
const hints: Record<Category, string> = {
  ones: 'Sum of ones',
  twos: 'Sum of twos',
  threes: 'Sum of threes',
  fours: 'Sum of fours',
  fives: 'Sum of fives',
  sixes: 'Sum of sixes',
  onePair: 'Highest pair',
  twoPairs: 'Two distinct pairs',
  threeOfAKind: 'Sum of three matching dice',
  fourOfAKind: 'Sum of four matching dice',
  smallStraight: '1, 2, 3, 4, 5 = 15',
  largeStraight: '2, 3, 4, 5, 6 = 20',
  fullHouse: 'A distinct triple and pair',
  chance: 'Sum of all five dice',
  yatzy: 'Five matching dice = 50',
}
const game = computed(() => room.value?.game)
const current = computed(() => game.value?.players[game.value.currentPlayerIndex])
const host = computed(() => room.value?.hostId === me.value)
const myTurn = computed(
  () => connected.value && !game.value?.finished && current.value?.id === me.value,
)
const canScore = computed(
  () => myTurn.value && !!game.value && game.value.rollsLeft < 3 && !busy.value,
)
const round = computed(() => {
  const card = game.value && current.value ? game.value.scorecards[current.value.id] : null
  return card ? Math.min(15, Object.values(card).filter((v) => v !== null).length + 1) : 1
})
const ranking = computed(() =>
  [...(room.value?.players ?? [])].sort(
    (a, b) => (room.value?.totals[b.id] ?? 0) - (room.value?.totals[a.id] ?? 0),
  ),
)
const winnerNames = computed(() =>
  room.value?.players
    .filter((p) => room.value?.winnerIds.includes(p.id))
    .map((p) => p.name)
    .join(' & '),
)
const everyoneOnline = computed(() => room.value?.onlineIds.length === room.value?.players.length)
const shareLink = computed(() => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', room.value?.code ?? '')
  return url.toString()
})
function selectMode(value: 'create' | 'join') {
  mode.value = value
  errorMessage.value = ''
}
function upperTotal(id: string) {
  const card = game.value?.scorecards[id]
  return card ? categories.slice(0, 6).reduce((n, c) => n + (card[c] ?? 0), 0) : 0
}
function acceptRoom(data: RoomSnapshot) {
  if (room.value?.code === data.code && room.value.version > data.version) return
  const old = room.value?.game
  const next = data.game
  if (
    !old ||
    !next ||
    old.currentPlayerIndex !== next.currentPlayerIndex ||
    old.rollsLeft !== next.rollsLeft ||
    old.finished !== next.finished
  ) {
    reviewRoll.value = false
    held.value = next ? [...next.held] : [false, false, false, false, false]
    zeroCategory.value = null
  }
  room.value = data
  joinCode.value = data.code
  const url = new URL(window.location.href)
  url.searchParams.set('room', data.code)
  history.replaceState(null, '', url)
  try {
    localStorage.setItem('yatzy.playerName', playerName.value.trim())
  } catch {
    /* Optional preference. */
  }
}
function responseHandler(request: number) {
  return (error: Error | null, data: Response) => {
    if (request !== requestNumber) return
    busy.value = false
    if (error) {
      errorMessage.value = 'No response from the server. Check the table before trying again.'
      return
    }
    if ('error' in data) {
      errorMessage.value = data.error
      return
    }
    if (data.me) me.value = data.me
    errorMessage.value = ''
    acceptRoom(data)
  }
}
function enterRoom() {
  if (!connected.value || busy.value || room.value) return
  const name = playerName.value.trim()
  const code = joinCode.value.trim()
  if (!name || name.length > 20) {
    errorMessage.value = 'Enter a name between 1 and 20 characters.'
    return
  }
  if (mode.value === 'join' && !/^[0-9]{6}$/.test(code)) {
    errorMessage.value = 'Enter a six-digit room code.'
    return
  }
  errorMessage.value = ''
  busy.value = true
  const reply = responseHandler(++requestNumber)
  if (mode.value === 'create') socket.timeout(5000).emit('room:create', name, reply)
  else socket.timeout(5000).emit('room:join', code, name, reply)
}
function act(action: 'start' | 'roll' | 'score' | 'rematch', value?: unknown) {
  if (!room.value || !connected.value || busy.value) return
  busy.value = true
  errorMessage.value = ''
  socket
    .timeout(5000)
    .emit(
      `game:${action}`,
      { version: room.value.version, value },
      responseHandler(++requestNumber),
    )
}
function toggleDie(index: number) {
  if (canScore.value && !zeroCategory.value) held.value[index] = !held.value[index]
}
function choose(category: Category) {
  reviewRoll.value = false
  if (!canScore.value) return
  if (room.value?.previews[category] === 0) zeroCategory.value = category
  else act('score', category)
}
async function copyLink() {
  showInvite.value = true
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch {
    errorMessage.value = 'Select and copy the invite link below.'
  }
}
socket.on('leaderboard:updated', (scores: HighScore[]) => { highScores.value = scores })
socket.on('session:ready', ({ playerId }: { playerId: string }) => {
  me.value = playerId
})
socket.on('room:updated', (data: RoomSnapshot) => {
  if (data.players.some((p) => p.id === me.value)) acceptRoom(data)
})
socket.on('connect', () => {
  connected.value = true
  if (autoJoin) {
    autoJoin = false
    room.value = null
    enterRoom()
  }
})
socket.on('disconnect', (reason: string) => {
  reviewRoll.value = false
  connected.value = false
  busy.value = false
  requestNumber++
  if (room.value) {
    joinCode.value = room.value.code
    mode.value = 'join'
    autoJoin = true
  }
  if (reason === 'io server disconnect')
    errorMessage.value = 'This player session was opened in another tab. Reload to reconnect.'
})
socket.on('connect_error', () => {
  errorMessage.value = 'Cannot reach the game server. Make sure it is running.'
})
onMounted(() => {
  try { confirmRerolls.value = localStorage.getItem('yatzy.confirmRerolls') !== 'false' } catch { /* Keep default. */ }
  let token: string | null = null
  try {
    token = sessionStorage.getItem('yatzy.session')
  } catch {
    /* Use an in-memory session. */
  }
  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) token = crypto.randomUUID()
  try {
    sessionStorage.setItem('yatzy.session', token)
    playerName.value = localStorage.getItem('yatzy.playerName') || ''
  } catch {
    /* Optional storage. */
  }
  socket.auth = { token }
  const invite = new URLSearchParams(location.search).get('room')
  if (invite !== null) {
    mode.value = 'join'
    joinCode.value = invite
    if (!/^[0-9]{6}$/.test(invite))
      errorMessage.value = 'This invite link does not contain a valid six-digit room code.'
    else autoJoin = !!playerName.value.trim() && playerName.value.trim().length <= 20
  }
  socket.connect()
})
onUnmounted(() => {
  requestNumber++
  clearTimeout(copyTimer)
  socket.removeAllListeners()
  socket.disconnect()
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Yatzy Club home"
        ><span class="brand-mark">Y</span>yatzy<span>club</span></a
      ><span class="tagline">A little luck. Good company.</span>
      <details class="rules">
        <summary>How to play</summary>
        <div>
          <label class="reroll-pref"><input type="checkbox" :checked="confirmRerolls" @change="setConfirmation(($event.target as HTMLInputElement).checked)" /> Confirm before rerolling</label>
          <h3>A quick refresher</h3>
          <p>
            Roll up to three times per turn. Tap dice to hold them. Choose an unused category to
            finish your turn.
          </p>
          <p>
            Reach 63 in ones through sixes for a 50-point bonus. Yatzy scores 50. Full house
            requires a distinct pair and triple. Two pairs must be distinct.
          </p>
          <p>
            After 15 turns each, the highest total wins. Ties share the victory. No extra Yatzy
            bonuses.
          </p>
        </div>
      </details>
    </header>
    <main>
      <template v-if="!room">
        <section class="welcome">
          <span class="eyebrow">YOUR NEXT GAME NIGHT</span>
          <h1>Five dice.<br /><em>Good times ahead.</em></h1>
          <p>
            A familiar game, a shared table. Bring your people<br class="desktop" />
            together for a little friendly competition.
          </p>
          <div class="welcome-tags">
            <span>2-6 players</span><span>Private rooms</span><span>No account needed</span>
          </div>
        </section>
        <section class="entry-card">
          <div class="tabs">
            <button
              type="button"
              :aria-pressed="mode === 'create'"
              :disabled="busy"
              @click="selectMode('create')"
            >
              Create room</button
            ><button
              type="button"
              :aria-pressed="mode === 'join'"
              :disabled="busy"
              @click="selectMode('join')"
            >
              Join friends
            </button>
          </div>
          <h2>{{ mode === 'create' ? 'Pull up a chair.' : 'Your seat is waiting.' }}</h2>
          <p class="muted">
            {{
              mode === 'create'
                ? 'Start a private table and invite your friends.'
                : 'Enter your name and the room code to join.'
            }}
          </p>
          <form @submit.prevent="enterRoom">
            <label for="player-name">Your name</label
            ><input
              id="player-name"
              v-model="playerName"
              maxlength="20"
              autocomplete="nickname"
              :disabled="busy"
              placeholder="What should we call you?"
              required
            /><template v-if="mode === 'join'"
              ><label for="join-code">Room code</label
              ><input
                id="join-code"
                v-model="joinCode"
                inputmode="numeric"
                pattern="[0-9]{6}"
                maxlength="6"
                placeholder="123456"
                :disabled="busy"
                required /></template
            ><button class="primary full" :disabled="!connected || busy">
              {{
                busy
                  ? 'Finding your seat...'
                  : mode === 'create'
                    ? 'Create a private table'
                    : 'Join room'
              }}
              <span aria-hidden="true">&rarr;</span>
            </button>
          </form>
          <p class="connection" role="status">
            <i :class="{ online: connected }" />{{
              connected ? 'Connected. Ready when you are.' : 'Connecting to server...'
            }}
          </p>
        </section>
      </template>
      <template v-else>
        <div class="room-title">
          <div>
            <span class="eyebrow"
              >YOUR PRIVATE TABLE <span class="code-badge">{{ room.code }}</span></span
            >
            <h1>
              {{
                !game
                  ? 'Everyone has a seat.'
                  : game.finished
                    ? 'One for the scorebooks.'
                    : 'Let the good times roll.'
              }}
            </h1>
          </div>
          <button class="secondary" @click="copyLink">
            {{ copied ? 'Link copied!' : 'Invite friends' }} <span aria-hidden="true">&nearr;</span>
          </button>
        </div>
        <div v-if="showInvite" class="invite">
          <label for="share-link">Invite link</label
          ><input id="share-link" :value="shareLink" readonly /><button
            class="text-button"
            @click="showInvite = false"
          >
            Close
          </button>
        </div>
        <div class="meta-line">
          <span
            ><i :class="{ online: connected }" />{{
              !connected
                ? 'Reconnecting - your game is saved on the server'
                : !game
                  ? 'Lobby open'
                  : game.finished
                    ? 'Game complete'
                    : `Round ${round} of 15`
            }}</span
          ><span>SCANDINAVIAN YATZY</span>
        </div>
        <ul class="players">
          <li
            v-for="(player, index) in room.players"
            :key="player.id"
            class="player"
            :class="{ active: !game?.finished && current?.id === player.id }"
          >
            <span class="avatar" :class="`avatar-${index}`">{{
              player.name.slice(0, 1).toUpperCase()
            }}</span>
            <div>
              <strong>{{ player.name }}{{ player.id === me ? ' (you)' : '' }}</strong
              ><small>{{
                !room.onlineIds.includes(player.id)
                  ? 'Disconnected'
                  : player.id === room.hostId
                    ? 'Host'
                    : 'At the table'
              }}</small>
            </div>
            <span class="player-score">{{ room.totals[player.id] ?? 0 }}<small>PTS</small></span>
          </li>
        </ul>
        <section v-if="!game" class="lobby">
          <div class="lobby-dice">
            <Die v-for="(v, i) in [3, 5, 6]" :key="i" :value="v" :index="i" disabled />
          </div>
          <span class="eyebrow">BETTER TOGETHER</span>
          <h2>
            {{
              room.players.length < 2 ? 'Invite someone to the table.' : 'Ready for the first roll?'
            }}
          </h2>
          <p>
            Share the six-digit code or invite link.<br />Once everyone is here, the host starts the
            game.
          </p>
          <div class="lobby-actions">
            <button class="secondary" @click="copyLink">Copy invite link</button
            ><button
              v-if="host"
              class="primary"
              :disabled="busy || !connected || room.players.length < 2 || !everyoneOnline"
              @click="act('start')"
            >
              Start game <span aria-hidden="true">&rarr;</span>
            </button>
            <p v-else class="muted">Waiting for the host to start...</p>
          </div>
          <small>{{ room.players.length }} of 6 seats filled. At least 2 players to start.</small>
        </section>
        <div v-else class="game-layout">
          <section v-if="game.finished" class="results panel" data-testid="results">
            <div class="trophy" aria-hidden="true">&#9733;</div>
            <span class="eyebrow">{{
              room.winnerIds.length > 1 ? 'A SHARED VICTORY' : 'THE TABLE CHAMPION'
            }}</span>
            <h2>{{ winnerNames }}</h2>
            <p class="muted">{{ room.totals[room.winnerIds[0] ?? ''] }} points. Well played.</p>
            <ol class="rankings">
              <li v-for="(player, index) in ranking" :key="player.id">
                <span class="rank">{{ index + 1 }}</span
                ><span
                  >{{ player.name
                  }}<small>{{
                    room.winnerIds.includes(player.id) ? 'Winner' : 'Thanks for playing'
                  }}</small></span
                ><strong>{{ room.totals[player.id] }}</strong>
              </li>
            </ol>
            <button
              v-if="host"
              class="primary full"
              :disabled="busy || !connected || !everyoneOnline"
              @click="act('rematch')"
            >
              Play again <span aria-hidden="true">&rarr;</span>
            </button>
            <p v-else class="muted">The host can start a rematch.</p>
            <small v-if="!everyoneOnline">Waiting for everyone to reconnect.</small>
          </section>
          <section v-else class="table-panel">
            <div class="table-heading">
              <span class="eyebrow">{{
                myTurn ? 'YOUR TURN' : `${current?.name.toUpperCase()}'S TURN`
              }}</span
              ><span>{{ 3 - game.rollsLeft }} / 3 rolls</span>
            </div>
            <h2>
              {{
                game.rollsLeft === 3
                  ? 'A little luck starts here.'
                  : myTurn
                    ? 'Keep the good ones.'
                    : 'Watch the dice fall.'
              }}
            </h2>
            <p>
              {{
                myTurn
                  ? game.rollsLeft === 3
                    ? 'Roll all five dice to begin.'
                    : 'Tap dice to hold them. Then reroll or choose a score.'
                  : 'Your friends are playing. The table updates live.'
              }}
            </p>
            <p v-if="current && !room.onlineIds.includes(current.id)" class="offline-notice">
              {{ current.name }} is disconnected. Waiting for them to return.
            </p>
            <div class="dice-tray" :class="{ rolling: busy && myTurn }">
              <Die
                v-for="(value, index) in game.dice"
                :key="index"
                :value="value"
                :index="index"
                :held="game.rollsLeft < 3 && (myTurn ? held[index] : game.held[index])"
                :disabled="!canScore || !!zeroCategory"
                @toggle="toggleDie(index)"
              />
            </div>
            <button
              v-if="!reviewRoll" class="roll-button"
              :disabled="
                !myTurn ||
                busy ||
                game.rollsLeft === 0 ||
                (game.rollsLeft < 3 && held.every(Boolean)) ||
                !!zeroCategory
              "
              @click="requestRoll"
            >
              {{
                busy
                  ? 'Updating...'
                  : game.rollsLeft === 3
                    ? 'Roll the dice'
                    : game.rollsLeft === 0
                      ? 'Choose a score'
                      : 'Roll again'
              }}
              <span aria-hidden="true">&rarr;</span>
            </button>
            <div v-else class="zero-confirm" role="group" aria-label="Review dice before rerolling" @keydown.esc="reviewRoll = false">
              <strong>Check your dice</strong>
              <p>Keep: {{ game.dice.filter((_, i) => held[i]).join(', ') || 'none' }} · Reroll: {{ game.dice.filter((_, i) => !held[i]).join(', ') }}</p>
              <button @click="reviewRoll = false">Change dice</button>
              <button @click="confirmRoll">Confirm reroll</button>
              <label class="reroll-pref"><input type="checkbox" :checked="!confirmRerolls" @change="setConfirmation(!($event.target as HTMLInputElement).checked)" /> Don’t ask again</label>
            </div>
            <p class="rolls-left">
              {{ game.rollsLeft }} {{ game.rollsLeft === 1 ? 'roll' : 'rolls' }} remaining
            </p>
            <div v-if="zeroCategory" class="zero-confirm" role="alert">
              <strong>Take zero for {{ labels[zeroCategory] }}?</strong>
              <p>This fills the category and ends your turn.</p>
              <button @click="zeroCategory = null">Keep thinking</button
              ><button :disabled="busy" @click="act('score', zeroCategory)">Take zero</button>
            </div>
            <div class="table-note">FIVE DICE. FIFTEEN CHANCES. YOUR CALL.</div>
            <p class="activity" aria-live="polite">{{ room.message }}</p>
          </section>
          <section class="score-panel panel">
            <div class="score-heading">
              <h2>The scorecard</h2>
              <span>15 CATEGORIES</span>
            </div>
            <div class="score-scroll" tabindex="0" aria-label="Scrollable scorecard">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Combination</th>
                    <th
                      v-for="player in room.players"
                      :key="player.id"
                      scope="col"
                      :class="{ mine: player.id === me }"
                    >
                      {{ player.name }}<small v-if="player.id === me">YOU</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(category, index) in categories"
                    :key="category"
                    :class="{ divider: index === 6, yatzy: category === 'yatzy' }"
                  >
                    <th scope="row" :title="hints[category]">
                      <span class="category-mark">{{
                        index < 6 ? index + 1 : category === 'yatzy' ? '*' : '+'
                      }}</span
                      >{{ labels[category] }}
                    </th>
                    <td
                      v-for="player in room.players"
                      :key="player.id"
                      :class="{ mine: player.id === me }"
                    >
                      <strong v-if="game.scorecards[player.id]?.[category] !== null">{{
                        game.scorecards[player.id]?.[category]
                      }}</strong
                      ><button
                        v-else-if="canScore && player.id === me"
                        class="score-choice"
                        :aria-label="`Score ${room.previews[category]} for ${labels[category]}`"
                        :title="hints[category]"
                        :disabled="!!zeroCategory"
                        @click="choose(category)"
                      >
                        {{ room.previews[category] }} <span>+</span></button
                      ><span v-else class="empty">&mdash;</span>
                    </td>
                  </tr>
                  <tr class="bonus-row">
                    <th scope="row">Upper bonus <small>63+ earns 50</small></th>
                    <td v-for="p in room.players" :key="p.id">
                      {{ room.bonuses[p.id] || `${upperTotal(p.id)}/63` }}
                    </td>
                  </tr>
                  <tr class="total-row">
                    <th scope="row">Total</th>
                    <td v-for="p in room.players" :key="p.id">{{ room.totals[p.id] }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="score-help">
              {{
                game.finished
                  ? 'The final tally. Until next time.'
                  : canScore
                    ? 'Choose a highlighted score to finish your turn.'
                    : 'Every roll counts. Make yours a good one.'
              }}
            </p>
          </section>
        </div>
      </template>
      <div v-if="errorMessage" class="error" role="alert">
        {{ errorMessage
        }}<button aria-label="Dismiss error" @click="errorMessage = ''">&times;</button>
      </div>
      <section class="global-scores panel" aria-labelledby="high-scores">
        <h2 id="high-scores">Top 5 scores</h2>
        <p class="muted">Highest individual scores from completed games across all rooms.</p>
        <p v-if="!highScores" role="status">Waiting for the scoreboard…</p>
        <p v-else-if="!highScores.length">Finish a game to set the first score.</p>
        <ol v-else>
          <li v-for="(entry,i) in highScores" :key="i"><span>{{ entry.name }}</span><strong>{{ entry.points }} pts</strong></li>
        </ol>
      </section>
    </main>
    <footer>
      <span>yatzy club</span><span>Less scrolling. More rolling.</span
      ><span>Made for game night.</span>
    </footer>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #f6f6ef;
  color: #233e34;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
}
button,
input {
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.48;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible,
a:focus-visible {
  outline: 3px solid #87aa67;
  outline-offset: 4px;
}
button {
  transition: background 0.15s;
}
a {
  color: inherit;
  text-decoration: none;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1,
h2 {
  letter-spacing: -1px;
}
h1 {
  font-size: 34px;
  line-height: 1.2;
  font-weight: 650;
}
h2 {
  font-size: 23px;
  font-weight: 650;
}
p {
  line-height: 1.7;
}
.muted {
  color: #7b877b;
  font-size: 13px;
}
.site-header {
  max-width: 1200px;
  height: 88px;
  margin: auto;
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 0 28px;
  border-bottom: 1px solid #dfe4d8;
}
.brand {
  display: flex;
  align-items: center;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: -1px;
  gap: 5px;
}
.brand > span:last-child {
  font-weight: 400;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border-radius: 9px;
  background: #315b46;
  color: #eff3dc;
  font-size: 23px;
  margin-right: 6px;
  transform: rotate(-7deg);
}
.tagline {
  margin-left: auto;
  font-size: 11px;
  color: #8b9484;
}
.rules {
  position: relative;
  font-size: 12px;
}
.rules summary {
  cursor: pointer;
}
.rules > div {
  position: absolute;
  right: 0;
  width: min(330px, 80vw);
  z-index: 10;
  background: #fffef8;
  border: 1px solid #dde2d5;
  box-shadow: 0 12px 30px #26372b18;
  padding: 22px;
  border-radius: 12px;
  top: 30px;
}
.rules p {
  margin-top: 10px;
  color: #72806c;
}
main {
  max-width: 1140px;
  margin: 0 auto;
  padding: 38px 28px 45px;
  min-height: calc(100vh - 165px);
}
.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.7px;
  color: #7a8b68;
}
.welcome {
  text-align: center;
  padding: 16px 0 30px;
}
.welcome h1 {
  font-size: 49px;
  margin: 18px 0;
  letter-spacing: -2px;
}
.welcome em {
  color: #7f9568;
  font-style: normal;
}
.welcome p {
  color: #7d8876;
}
.welcome-tags {
  display: flex;
  justify-content: center;
  gap: 22px;
  font-size: 10px;
  color: #87917e;
  margin-top: 22px;
}
.entry-card {
  max-width: 440px;
  margin: auto;
  border: 1px solid #dde3d5;
  border-radius: 16px;
  background: #fffef9;
  padding: 28px;
}
.tabs {
  display: flex;
  background: #eff2e8;
  padding: 4px;
  border-radius: 8px;
  margin-bottom: 24px;
}
.tabs button {
  flex: 1;
  padding: 10px;
  background: none;
  border: 0;
  border-radius: 6px;
  color: #78876b;
  font-size: 12px;
}
.tabs button[aria-pressed='true'] {
  background: #fffef9;
  box-shadow: 0 1px 5px #35482c12;
  color: #294a37;
}
.entry-card > p {
  margin: 10px 0 20px;
}
label {
  display: block;
  margin: 17px 0 8px;
  font-size: 11px;
  font-weight: 600;
}
input {
  width: 100%;
  min-width: 0;
  border: 1px solid #d6ddcb;
  border-radius: 7px;
  background: #fffef9;
  padding: 12px;
  color: #34503b;
}
input::placeholder {
  color: #a0aa94;
  font-size: 12px;
}
.primary,
.secondary {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 13px 20px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.primary {
  color: #fff;
  background: #315e45;
}
.primary:hover:not(:disabled) {
  background: #254c35;
}
.secondary {
  border-color: #d5dfc9;
  color: #4b6341;
  background: #fffef9;
}
.secondary:hover {
  background: #eaf0e0;
}
.full {
  width: 100%;
  margin-top: 18px;
  justify-content: space-between;
}
.connection {
  text-align: center;
  font-size: 10px;
  color: #92a084;
  margin: 17px 0 0 !important;
}
i {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #bd9c65;
  border-radius: 50%;
  margin-right: 7px;
}
i.online {
  background: #819d65;
}
.room-title {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  margin-bottom: 25px;
}
.room-title h1 {
  margin-top: 13px;
}
.code-badge {
  background: #e9eddf;
  padding: 5px 8px;
  border-radius: 5px;
  letter-spacing: 2px;
  margin-left: 8px;
  color: #536d45;
  font-size: 11px;
}
.meta-line {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #dfe4d7;
  padding-bottom: 16px;
  color: #8a957f;
  font-size: 10px;
}
.meta-line > span:last-child {
  letter-spacing: 1.5px;
  font-size: 8px;
}
.invite {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: #ebf0e2;
  margin-bottom: 20px;
  border-radius: 9px;
}
.invite label {
  margin: 0;
  white-space: nowrap;
}
.text-button {
  border: 0;
  background: none;
  color: #5e7651;
}
.players {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0;
  margin: 24px 0;
  list-style: none;
}
.player {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: 1;
  min-width: 150px;
  padding: 14px;
  border-radius: 10px;
  background: #fffef9;
  border: 1px solid #e0e4d8;
}
.player.active {
  background: #edf2e2;
  border-color: #9fb67c;
}
.avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e2ebd4;
  color: #6c8157;
  font-weight: 700;
}
.avatar-1,
.avatar-4 {
  background: #e8e3ef;
  color: #8d7ca2;
}
.avatar-2,
.avatar-5 {
  background: #f0e4d3;
  color: #a28a5e;
}
.avatar-3 {
  background: #dce8ed;
  color: #648a9b;
}
.player strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.player small {
  display: block;
  color: #929d86;
  font-size: 9px;
  margin-top: 4px;
}
.player-score {
  margin-left: auto;
  font-size: 22px;
  text-align: right;
}
.player-score small {
  font-size: 7px;
  letter-spacing: 1px;
}
.lobby {
  text-align: center;
  border: 1px solid #dce4d2;
  border-radius: 15px;
  background: #edf1e5;
  padding: 45px 20px;
}
.lobby-dice {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 10px;
}
.lobby-dice > div:nth-child(2) {
  transform: rotate(8deg) translateY(-10px);
}
.lobby h2 {
  margin: 15px 0 12px;
}
.lobby p {
  color: #829173;
  font-size: 12px;
}
.lobby-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 26px 0;
}
.lobby > small {
  color: #92a183;
  font-size: 10px;
}
.game-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.panel {
  border: 1px solid #dce2d3;
  border-radius: 14px;
  background: #fffef9;
  overflow: hidden;
}
.table-panel {
  background: #254e42;
  border-radius: 14px;
  color: #f1f4de;
  text-align: center;
  overflow: hidden;
  background-image: radial-gradient(ellipse at 50% 50%, #39644f 0%, transparent 75%);
}
.table-heading {
  display: flex;
  justify-content: space-between;
  padding: 24px;
  font-size: 10px;
  color: #a4ba93;
}
.table-heading .eyebrow {
  color: #c1d79f;
}
.table-panel h2 {
  font-size: 25px;
  margin: 28px 20px 12px;
  letter-spacing: -0.8px;
}
.table-panel > p {
  font-size: 11px;
  color: #a3b99c;
  padding: 0 20px;
}
.dice-tray {
  display: flex;
  justify-content: center;
  gap: 13px;
  padding: 44px 18px 27px;
}
.roll-button {
  background: #dbebb1;
  color: #304c2c;
  border: 0;
  padding: 15px 28px;
  border-radius: 8px;
  font-weight: 650;
  display: inline-flex;
  gap: 28px;
  align-items: center;
}
.roll-button:hover:not(:disabled) {
  background: #e9f4c8;
}
.rolls-left {
  margin-top: 12px !important;
  font-size: 10px !important;
}
.table-note {
  border-top: 1px dashed #56765c;
  padding-top: 25px;
  margin: 35px 25px 28px;
  font-size: 8px;
  letter-spacing: 1.3px;
  color: #9fb48b;
}
.activity {
  background: #1e443a;
  padding: 16px !important;
  font-size: 10px !important;
}
.offline-notice {
  background: #3d5c48;
  padding: 12px !important;
  margin: 15px;
  border-radius: 8px;
  color: #e1d7ad !important;
}
.zero-confirm {
  margin: 20px;
  padding: 17px;
  border: 1px solid #a5b58a;
  border-radius: 9px;
  background: #1d4136;
  font-size: 12px;
}
.zero-confirm p {
  margin: 7px 0;
  color: #bbccaa;
}
.zero-confirm button {
  margin: 5px;
  padding: 9px;
  border: 1px solid #a0b18b;
  border-radius: 5px;
  background: #dce9ba;
  color: #29472f;
}
.score-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
}
.score-heading h2 {
  font-size: 19px;
}
.score-heading > span {
  color: #9aa58a;
  font-size: 8px;
  letter-spacing: 1px;
}
.score-scroll {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  white-space: nowrap;
}
thead th {
  padding: 12px 10px;
  background: #f1f3e9;
  color: #7c8c6e;
  font-size: 10px;
  font-weight: 500;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
}
thead th:first-child {
  text-align: left;
  padding-left: 20px;
  font-size: 9px;
}
th small {
  display: block;
  font-size: 7px;
  margin-top: 3px;
  color: #91a277;
}
tbody th {
  font-weight: 400;
  text-align: left;
  padding: 8px 15px 8px 20px;
  color: #617451;
}
td {
  padding: 7px 10px;
  text-align: center;
  height: 36px;
}
tbody th,
td {
  border-bottom: 1px solid #edf0e4;
}
.mine {
  background: #f5f8ed;
}
.category-mark {
  display: inline-grid;
  place-items: center;
  width: 19px;
  height: 19px;
  margin-right: 8px;
  border-radius: 5px;
  font-size: 10px;
  color: #8b9b76;
  background: #f0f3e8;
}
.empty {
  color: #c6cfb9;
}
.divider th,
.divider td {
  border-top: 2px solid #dfe6d4;
}
.score-choice {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 48px;
  padding: 4px 7px;
  font-size: 11px;
  background: #e7f0d7;
  color: #627e40;
  border: 1px solid #d1dfb8;
  border-radius: 5px;
}
.score-choice:hover {
  background: #d5e8b6;
}
.score-choice span {
  color: #9fb780;
}
.bonus-row {
  background: #f2f4e9;
}
.bonus-row td {
  color: #829569;
  font-size: 10px;
}
.bonus-row small {
  display: inline;
  margin-left: 6px;
  font-size: 8px;
}
.total-row {
  background: #e6edda;
}
.total-row td {
  font-weight: 700;
  font-size: 18px;
  padding: 13px 10px;
}
.total-row th {
  font-weight: 700;
}
.score-help {
  font-size: 9px;
  color: #9aa58a;
  padding: 15px;
  text-align: center;
}
.yatzy .category-mark {
  background: #f3ecd5;
  color: #af9450;
}
.results {
  padding: 30px;
  text-align: center;
}
.trophy {
  font-size: 60px;
  color: #b5a061;
  line-height: 1.3;
  margin: 5px 0 15px;
}
.results h2 {
  margin: 15px 0 10px;
  font-size: 31px;
  overflow-wrap: anywhere;
}
.rankings {
  list-style: none;
  padding: 0;
  margin: 26px 0;
}
.rankings li {
  display: flex;
  align-items: center;
  text-align: left;
  padding: 15px 0;
  gap: 14px;
  border-bottom: 1px solid #e8ecde;
}
.rank {
  color: #a1ae8d;
  font-size: 12px;
}
.rankings small {
  display: block;
  color: #96a185;
  font-size: 9px;
  margin-top: 4px;
}
.rankings strong {
  margin-left: auto;
  font-size: 22px;
}
.results > small {
  display: block;
  color: #9a8763;
  margin-top: 12px;
}
.error {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: #fff1e7;
  color: #965b3a;
  border: 1px solid #e5c8b4;
  padding: 14px 20px;
  border-radius: 9px;
  margin-top: 20px;
}
.error button {
  background: none;
  border: 0;
  color: inherit;
  font-size: 22px;
}
footer {
  max-width: 1140px;
  margin: auto;
  padding: 24px 28px;
  border-top: 1px solid #dfe4d7;
  display: flex;
  justify-content: space-between;
  color: #98a08e;
  font-size: 10px;
}
footer > span:first-child {
  font-weight: 650;
  color: #7f8d70;
}
.rolling .die:not(.held) {
  animation: shake 0.2s infinite alternate;
}
@keyframes shake {
  to {
    transform: rotate(8deg) translateY(-4px);
  }
}
@media (max-width: 1000px) {
  .dice-tray {
    gap: 9px;
  }
  .die-wrap {
    max-width: 60px;
  }
}
@media (max-width: 760px) {
  .game-layout {
    grid-template-columns: 1fr;
  }
  .site-header {
    height: 73px;
    padding: 0 20px;
  }
  .tagline {
    display: none;
  }
  .rules {
    margin-left: auto;
  }
  main {
    padding: 25px 16px;
  }
  .room-title {
    flex-wrap: wrap;
    gap: 18px;
  }
  .room-title h1 {
    font-size: 28px;
  }
  .players {
    gap: 8px;
  }
  .player {
    min-width: 135px;
    padding: 11px;
  }
  .player strong {
    font-size: 11px;
  }
  .welcome h1 {
    font-size: 39px;
  }
  .entry-card {
    padding: 22px;
  }
  .meta-line {
    gap: 10px;
  }
  .meta-line > span:last-child {
    font-size: 7px;
  }
  .invite {
    flex-wrap: wrap;
  }
  .invite input {
    order: 3;
  }
  .table-panel h2 {
    margin-top: 15px;
  }
  .dice-tray {
    gap: 10px;
  }
  .die-wrap {
    max-width: 76px;
  }
  footer > span:last-child {
    display: none;
  }
  .welcome-tags {
    gap: 14px;
    font-size: 9px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
.global-scores { margin: 24px auto 0; padding: 24px; max-width: 660px; }
.global-scores ol { padding-left: 2rem; }
.global-scores li { padding: .6rem; border-bottom: 1px solid #dee5d8; }
.global-scores li strong { float: right; }
.reroll-pref { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12px; }
.reroll-pref input { width: auto; }
</style>
