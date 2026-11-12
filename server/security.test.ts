import { expect, it } from 'vitest'
import { allowedOrigins, fixedWindow } from './security'

it('requires an exact HTTPS origin in production', () => {
  expect(() => allowedOrigins(true)).toThrow()
  expect(() => allowedOrigins(true, 'http://game.example')).toThrow()
  expect(() => allowedOrigins(true, 'https://game.example/room')).toThrow()
  expect(allowedOrigins(true, 'https://game.example')).toEqual(['https://game.example'])
})
it('limits each address independently and permits retries in the next window', () => {
  const allow = fixedWindow(2, 1000)
  expect([allow('a', 1), allow('a', 2), allow('a', 3)]).toEqual([true, true, false])
  expect(allow('b', 3)).toBe(true)
  expect(allow('a', 1001)).toBe(true)
})
