import { expect, test } from 'bun:test'
import { desktopDevWebUrl } from '../scripts/desktop-dev'

test('desktop Vite origins match the listening interface and native capability', () => {
  expect(desktopDevWebUrl(undefined, 5196)).toBe('http://127.0.0.1:5196')
  expect(desktopDevWebUrl('http://127.0.0.1:5196/', 5196)).toBe('http://127.0.0.1:5196')
  expect(desktopDevWebUrl('http://localhost:5196', 5196)).toBe('http://127.0.0.1:5196')
})

test('desktop development refuses cross-origin, credential-bearing and mismatched Vite overrides', () => {
  for (const url of [
    'https://127.0.0.1:5196',
    'http://example.test:5196',
    'http://127.0.0.1',
    'http://127.0.0.1:5196/app',
    'http://127.0.0.1:5196/?token=secret',
    'http://127.0.0.1:5196/#fragment',
    'http://user:secret@127.0.0.1:5196',
  ])
    expect(() => desktopDevWebUrl(url, 5196)).toThrow('loopback HTTP origin')
  expect(() => desktopDevWebUrl('http://127.0.0.1:5197', 5196)).toThrow('does not match')
})
