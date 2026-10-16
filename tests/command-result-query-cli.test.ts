import { expect, test } from 'bun:test'
import { parseCli } from '../apps/cli/src/args'
import { isCommandResultQuery, prepareCommandResultQuery } from '../apps/cli/src/command-result-query'

test('CLI receipt identity uses the resolved Session and preserves its original positional operation key', () => {
  const args = parseCli([
    'exec',
    'command.receipt.get',
    'original-operation',
    '--session',
    'Session name',
    '--request-id',
    'read-request',
  ])
  expect(args.requestId).toBe('read-request')
  expect(prepareCommandResultQuery(args, 'resolved-session')).toEqual({
    commandId: 'command.receipt.get',
    input: { sessionId: 'resolved-session', operationKey: 'original-operation' },
  })
})

test('CLI result flags retain the physical channel, byte cursor and original view hash', () => {
  const sha256 = 'a'.repeat(64)
  const args = parseCli([
    'exec',
    'command.result.read',
    '--operation-key',
    'original-operation',
    '--channel',
    'physical',
    '--offset',
    '8',
    '--limit',
    '12',
    '--expected-sha256',
    sha256,
  ])
  expect(prepareCommandResultQuery(args, 'session')).toEqual({
    commandId: 'command.result.read',
    input: {
      sessionId: 'session',
      operationKey: 'original-operation',
      channel: 'physical',
      offset: 8,
      limit: 12,
      expectedSha256: sha256,
    },
  })
})

test('CLI result defaults read the first bounded logical page', () => {
  expect(prepareCommandResultQuery(parseCli(['exec', 'command.result.read', 'original']), 'session')).toEqual({
    commandId: 'command.result.read',
    input: { sessionId: 'session', operationKey: 'original', channel: 'logical', offset: 0, limit: 4096 },
  })
})

test('CLI rejects continued pages without a view hash and invalid page bounds or channels', () => {
  for (const flags of [
    ['--offset', '8'],
    ['--channel', 'automatic'],
    ['--limit', '8193'],
    ['--limit', '3'],
    ['--expected-sha256', 'invalid'],
    ['--offset', '0.5'],
  ])
    expect(() =>
      prepareCommandResultQuery(parseCli(['exec', 'command.result.read', 'original', ...flags]), 'session'),
    ).toThrow()
})

test('CLI receipt summaries reject page-only flags', () => {
  for (const flags of [
    ['--channel', 'physical'],
    ['--offset', '0'],
    ['--limit', '4'],
  ])
    expect(() =>
      prepareCommandResultQuery(parseCli(['exec', 'command.receipt.get', 'original', ...flags]), 'session'),
    ).toThrow()
})

test('CLI requires the bounded original operation identity', () => {
  for (const key of [undefined, 'x'.repeat(161)])
    expect(() =>
      prepareCommandResultQuery(parseCli(['exec', 'command.receipt.get', ...(key ? [key] : [])]), 'session'),
    ).toThrow()
})

test('CLI receipt routing admits only the two public query IDs', () => {
  expect(isCommandResultQuery('command.receipt.get')).toBe(true)
  expect(isCommandResultQuery('command.result.read')).toBe(true)
  expect(isCommandResultQuery('command.getReceipt')).toBe(false)
  expect(isCommandResultQuery(undefined)).toBe(false)
  expect(() => prepareCommandResultQuery(parseCli(['exec', 'file.read', 'file']), 'session')).toThrow()
})
