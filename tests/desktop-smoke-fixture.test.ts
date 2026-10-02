import { describe, expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  redactNativeSmokeDiagnostics,
} from '../scripts/desktop-smoke-fixture'

const valid = { url: 'http://127.0.0.1:43210', token: 'fixture-only', pid: 1234, instanceId: 'fixture-instance' }
const root = join(tmpdir(), 'hbar-native-Ab1234')

describe('native smoke fixture boundaries', () => {
  test('accepts a validated local connection', () => {
    expect(parseNativeSmokeConnection(valid)).toEqual(valid)
  })
  for (const url of [
    'https://127.0.0.1:43210',
    'http://example.com:43210',
    'http://127.0.0.1',
    'http://secret@127.0.0.1:43210',
    'http://127.0.0.1:43210/other',
    'http://127.0.0.1:43210/?token=secret',
    'http://127.0.0.1:43210/#other',
  ])
    test(`rejects a non-origin connection: ${url}`, () => {
      expect(() => parseNativeSmokeConnection({ ...valid, url })).toThrow()
    })
  for (const pid of [0, -1, 1.5, '1234', Number.MAX_SAFE_INTEGER + 1])
    test(`rejects an invalid PID: ${pid}`, () => {
      expect(() => parseNativeSmokeConnection({ ...valid, pid })).toThrow()
    })
  test('rejects incomplete connection metadata', () => {
    expect(() => parseNativeSmokeConnection({ url: valid.url, token: '', pid: 1234 })).toThrow()
  })
  test('permits only a direct temporary fixture directory', () => {
    expect(nativeSmokeFixtureRoot(root)).toBe(resolve(root))
    for (const target of [tmpdir(), process.cwd(), join(root, 'nested'), join(tmpdir(), 'hbar-native-')])
      expect(() => nativeSmokeFixtureRoot(target)).toThrow()
  })
  test('requires exact data-root and supervised ownership before process termination', () => {
    expect(ownsNativeSmokeHost(`bun.exe host.js --supervised --data-root "${root}" --port 0`, root)).toBe(true)
    expect(ownsNativeSmokeHost(`bun.exe host.js --data-root ${root} --supervisor --port 0`, root)).toBe(true)
    expect(ownsNativeSmokeHost(`bun.exe host.js --supervised --data-root "${root}-other" --port 0`, root)).toBe(false)
    expect(ownsNativeSmokeHost(`bun.exe host.js --data-root "${root}" --port 0`, root)).toBe(false)
    expect(ownsNativeSmokeHost(`bun.exe host.js --supervised --other "${root}" --port 0`, root)).toBe(false)
    expect(ownsNativeSmokeHost(`bun.exe host.js --notes "--supervised --data-root ${root} "`, root)).toBe(false)
    expect(ownsNativeSmokeHost(`"C:\\Program Files\\bun.exe" host.js --supervised --data-root "${root}"`, root)).toBe(
      true,
    )
  })
  test('redacts temporary authentication and pairing credentials from diagnostics', () => {
    expect(redactNativeSmokeDiagnostics('fixture-only Pairing code: 123456 (expires)', valid.token)).toBe(
      '[redacted token] Pairing code: [redacted] (expires)',
    )
  })
})
