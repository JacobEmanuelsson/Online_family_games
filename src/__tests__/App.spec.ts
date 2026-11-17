import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '../App.vue'
import { createGame } from '../../server/games/yatzy/game'
import { categories, type RoomSnapshot } from '../../shared/yatzy'
const players = [
  { id: 'me', name: 'Alice' },
  { id: 'other', name: 'Bob' },
]
function roomData(): RoomSnapshot & { me: string } {
  return {
    code: '123456',
    players,
    hostId: 'me',
    onlineIds: ['me', 'other'],
    game: null,
    version: 1,
    message: 'Ready',
    totals: { me: 0, other: 0 },
    bonuses: { me: 0, other: 0 },
    previews: Object.fromEntries(categories.map((c) => [c, 0])) as RoomSnapshot['previews'],
    winnerIds: [],
    me: 'me',
  }
}

const mock = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {}
  const socket: any = {
    id: 'me',
    on: vi.fn((event, callback) => {
      handlers[event] = callback
    }),
    connect: vi.fn(() => handlers.connect?.()),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    timeout: vi.fn(() => socket),
    emit: vi.fn(),
  }
  return { handlers, socket }
})
vi.mock('socket.io-client', () => ({ io: () => mock.socket }))
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  for (const key of Object.keys(mock.handlers)) delete mock.handlers[key]
})
afterEach(() => wrapper?.unmount())

describe('room lobby', () => {
  it('creates a room, shows players and generates its invite URL', async () => {
    wrapper = mount(App)
    await wrapper.get('#player-name').setValue('Alice')
    await wrapper.get('form').trigger('submit')
    const [event, name, reply] = mock.socket.emit.mock.calls[0]
    expect([event, name]).toEqual(['room:create', 'Alice'])
    reply(null, roomData())
    await flushPromises()
    expect(wrapper.text()).toContain('Alice (you)')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Invite friends'))!
      .trigger('click')
    expect(wrapper.get<HTMLInputElement>('#share-link').element.value).toContain('?room=123456')
    mock.handlers['room:updated']?.({
      ...roomData(),
      code: '123456',
      players: [
        { id: 'me', name: 'Alice' },
        { id: 'other', name: 'Bob' },
      ],
    })
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(2)
  })
  it('pre-fills an invite but asks a new visitor for their name', async () => {
    history.replaceState(null, '', '/?room=123456')
    wrapper = mount(App)
    await flushPromises()
    expect(mock.socket.emit).not.toHaveBeenCalled()
    expect(wrapper.get<HTMLInputElement>('#join-code').element.value).toBe('123456')
    await wrapper.get('#player-name').setValue('Bob')
    await wrapper.get('form').trigger('submit')
    expect(mock.socket.emit.mock.calls[0].slice(0, 3)).toEqual(['room:join', '123456', 'Bob'])
  })
  it('automatically joins an invite with a saved name and shows server errors', async () => {
    localStorage.setItem('yatzy.playerName', 'Bob')
    history.replaceState(null, '', '/?room=654321')
    wrapper = mount(App)
    const [event, code, name, reply] = mock.socket.emit.mock.calls[0]
    expect([event, code, name]).toEqual(['room:join', '654321', 'Bob'])
    reply(null, { error: 'Room not found' })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Room not found')
    expect(wrapper.find('form').exists()).toBe(true)
  })
  it('does not automatically join a malformed invite', async () => {
    localStorage.setItem('yatzy.playerName', 'Bob')
    history.replaceState(null, '', '/?room=bad')
    wrapper = mount(App)
    await flushPromises()
    expect(mock.socket.emit).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('valid six-digit')
  })
})

it('starts, holds dice, confirms zero scores, and displays results with a rematch', async () => {
  wrapper = mount(App)
  await wrapper.get('#player-name').setValue('Alice')
  await wrapper.get('form').trigger('submit')
  let state = roomData()
  mock.socket.emit.mock.calls.at(-1)!.at(-1)(null, state)
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text().includes(text))!
  await button('Start game').trigger('click')
  expect(mock.socket.emit.mock.calls.at(-1)![0]).toBe('game:start')
  state = { ...state, game: createGame(players), version: 2 }
  mock.socket.emit.mock.calls.at(-1)!.at(-1)(null, state)
  await flushPromises()
  await button('Roll the dice').trigger('click')
  expect(mock.socket.emit.mock.calls.at(-1)!.slice(0, 2)).toEqual([
    'game:roll',
    { version: 2, value: [false, false, false, false, false] },
  ])
  state = { ...state, game: { ...state.game!, dice: [1, 2, 3, 4, 5], rollsLeft: 2 }, version: 3 }
  mock.socket.emit.mock.calls.at(-1)!.at(-1)(null, state)
  await flushPromises()
  await wrapper.get('[aria-label="Die 1: 1, not held"]').trigger('click')
  const rollsBeforeReview = mock.socket.emit.mock.calls.length
  await button('Roll again').trigger('click')
  expect(wrapper.text()).toContain('Keep: 1 · Reroll: 2, 3, 4, 5')
  await button('Change dice').trigger('click')
  expect(mock.socket.emit.mock.calls.length).toBe(rollsBeforeReview)
  await button('Roll again').trigger('click')
  await wrapper.get('.zero-confirm input').setValue(true)
  expect(localStorage.getItem('yatzy.confirmRerolls')).toBe('false')
  await button('Confirm reroll').trigger('click')
  expect(mock.socket.emit.mock.calls.at(-1)![1].value).toEqual([true, false, false, false, false])
  mock.socket.emit.mock.calls.at(-1)!.at(-1)(null, { ...state, version: 4 })
  await flushPromises()
  const before = mock.socket.emit.mock.calls.length
  await wrapper.get('[aria-label="Score 0 for Yatzy"]').trigger('click')
  expect(mock.socket.emit.mock.calls.length).toBe(before)
  expect(wrapper.text()).toContain('Take zero for Yatzy?')
  await button('Take zero').trigger('click')
  expect(mock.socket.emit.mock.calls.at(-1)!.slice(0, 2)).toEqual([
    'game:score',
    { version: 4, value: 'yatzy' },
  ])
  mock.socket.emit.mock.calls.at(-1)!.at(-1)(null, {
    ...state,
    version: 5,
    game: { ...state.game!, finished: true },
    winnerIds: ['me', 'other'],
    totals: { me: 100, other: 100 },
  })
  await flushPromises()
  expect(wrapper.get('[data-testid="results"]').text()).toContain('A SHARED VICTORY')
  expect(wrapper.get('[data-testid="results"]').text()).toContain('Alice & Bob')
  await button('Play again').trigger('click')
  expect(mock.socket.emit.mock.calls.at(-1)![0]).toBe('game:rematch')
})
it('shows empty and populated global standings', async () => {
  wrapper = mount(App)
  mock.handlers['leaderboard:updated']!([])
  await flushPromises()
  expect(wrapper.get('.global-scores').text()).toContain('Finish a game')
  mock.handlers['leaderboard:updated']!([
    { name: 'Bob', points: 194 },
    { name: 'Alice', points: 162 },
  ])
  await flushPromises()
  expect(wrapper.findAll('.global-scores li').map((row) => row.text())).toEqual([
    'Bob194 pts',
    'Alice162 pts',
  ])
})
it('loads the saved reroll preference and allows enabling it again', async () => {
  localStorage.setItem('yatzy.confirmRerolls', 'false')
  wrapper = mount(App)
  await flushPromises()
  const pref = wrapper.get<HTMLInputElement>('.rules input[type=checkbox]')
  expect(pref.element.checked).toBe(false)
  await pref.setValue(true)
  expect(localStorage.getItem('yatzy.confirmRerolls')).toBe('true')
})
