import { describe, expect, test } from 'bun:test'
import { findFreePort, parsePort } from '../scripts/dev-ports'

describe('development port allocation', () => {
  test('allocates distinct local ports for concurrent instances', async () => {
    const ports = await Promise.all([findFreePort(), findFreePort()])
    expect(ports[0]).not.toBe(ports[1])
    for (const port of ports) expect(port).toBeGreaterThan(0)
  })

  test('validates explicit port overrides', () => {
    expect(parsePort(undefined, 5173)).toBe(5173)
    expect(parsePort('62000', 5173)).toBe(62000)
    expect(() => parsePort('0', 5173)).toThrow('Invalid port: 0')
  })
})
