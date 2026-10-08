import { expect, test } from 'bun:test'
import type { Run } from '@hbar/contracts'
import { latestSessionContextTerminalRunId } from '../packages/app-react/src/session-project-context-model'

const run = (id: string, status: Run['status'], createdAt: number, endedAt: number | null) => ({
  id,
  status,
  createdAt,
  endedAt,
})
test('Git context observes the newest completion in either snapshot order and ignores active runs', () => {
  expect(latestSessionContextTerminalRunId([])).toBeNull()
  const runs = [
    run('active', 'running', 100, null),
    run('newest', 'completed', 20, 30),
    run('older', 'completed', 1, 10),
  ]
  expect(latestSessionContextTerminalRunId(runs)).toBe('newest')
  expect(latestSessionContextTerminalRunId([...runs].reverse())).toBe('newest')
  expect(
    latestSessionContextTerminalRunId([
      run('queued', 'queued', 100, null),
      run('approval', 'waiting_approval', 200, null),
    ]),
  ).toBeNull()
})
test('an earlier created run that finishes later triggers context refresh after the observed newer run', () => {
  const newer = run('newer-created', 'completed', 20, 30)
  const finishing = run('earlier-created', 'completed', 1, 40)
  expect(latestSessionContextTerminalRunId([newer, finishing])).toBe(finishing.id)
  expect(latestSessionContextTerminalRunId([finishing, newer])).toBe(finishing.id)
})
test('failed, cancelled, interrupted and guided completions retain their original IDs without inventing a time', () => {
  for (const status of ['failed', 'cancelled', 'interrupted', 'guided'] as const) {
    const latest = run(`original-${status}`, status, 20, 30)
    expect(latestSessionContextTerminalRunId([run('old', 'completed', 1, 10), latest])).toBe(latest.id)
  }
  expect(
    latestSessionContextTerminalRunId([run('original', 'completed', 20, null), run('old', 'completed', 1, null)]),
  ).toBe('original')
})
