import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { sha256Hex } from '../packages/contracts/src/sha256'

const nodeSha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

describe('portable SHA-256 contract helper', () => {
  test('matches standard vectors for empty, ASCII, UTF-8, and multi-block inputs', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('你好')).toBe('670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e')
    expect(sha256Hex('a'.repeat(1_000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })

  test('matches Node SHA-256 across padding boundaries and UTF-8 replacement semantics', () => {
    for (const length of [55, 56, 63, 64, 65, 1_024]) {
      const input = 'a'.repeat(length)
      expect(sha256Hex(input)).toBe(nodeSha256(input))
    }
    for (const input of ['🙂', 'left\ud800right', '\udfff', 'a🙂b\ud800']) {
      expect(sha256Hex(input)).toBe(nodeSha256(input))
    }
  })

  test('keeps the derived branch digest compatible with the Node implementation', () => {
    const sessionId = 'session-🌿'
    const targetRevision = 42
    const selector = `${sessionId}\0${targetRevision}`
    const expected = `hbar/session-launch/${nodeSha256(selector)}`
    expect(`hbar/session-launch/${sha256Hex(selector)}`).toBe(expected)
  })
})
