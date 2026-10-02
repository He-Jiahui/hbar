import { describe, expect, test } from 'bun:test'
import { createState } from '../packages/app-runtime/src/state'
import { createUsageBudget } from '../packages/app-runtime/src/usage-budget'
import type { SessionBudget } from '@hbar/contracts'
import type { CommandExecutor } from '@hbar/commands'

function fixture() {
  let budget: SessionBudget | null = null
  let calls = 0
  const target = createState<{ sessionId: string } | null>({ sessionId: 'session-a' }, () => undefined)
  const commands = {
    async execute(id: string, input: unknown) {
      calls += 1
      if (id === 'session.getBudget') return budget
      const value = input as { sessionId: string; tokens: number; expectedRevision?: number | null }
      if (value.expectedRevision !== (budget?.revision ?? null)) throw new Error('REVISION_CONFLICT')
      budget = { sessionId: value.sessionId, budgetId: 'budget-1', limit: value.tokens, phase: 'active', usedTokens: 0, remainingTokens: value.tokens, revision: (budget?.revision ?? 0) + 1, createdAt: 1, updatedAt: 2 }
      return { status: 'succeeded', commandId: 'session.setBudget', commandVersion: 1, requestId: 'request-1', idempotencyKey: 'usage-budget:session-a:' + value.tokens + ':' + (value.expectedRevision ?? 'none'), eventId: 'event-1', revision: budget.revision, committedAt: 2, budget, accountingVersion: 1 }
    },
  } as unknown as CommandExecutor
  return { target, commands, get budget() { return budget }, get calls() { return calls } }
}

describe('usage budget runtime', () => {
  test('keeps writes on the captured session and applies CAS revision', async () => {
    const f = fixture(); const runtime = createUsageBudget({ commands: f.commands, target: f.target.reader })
    runtime.setDraftLimit('500'); await runtime.save(); expect(f.budget?.limit).toBe(500)
    f.target.replace({ sessionId: 'session-b' }); runtime.setDraftLimit('700'); await runtime.save()
    expect(f.budget?.sessionId).toBe('session-b'); expect(f.budget?.limit).toBe(700); expect(runtime.state.getSnapshot().targetSessionId).toBe('session-b'); runtime.dispose()
  })
  test('does not issue duplicate writes while submitting', async () => {
    const f = fixture(); let release!: () => void
    const original = f.commands.execute.bind(f.commands)
    const commands = { execute: async (id: string, input: unknown, options?: unknown) => { if (id === 'session.setBudget') await new Promise<void>((resolve) => { release = resolve }); return original(id, input, options) } } as unknown as CommandExecutor
    const runtime = createUsageBudget({ commands, target: f.target.reader }); runtime.setDraftLimit('300'); const first = runtime.save(); const second = runtime.save(); await Promise.resolve(); expect(f.calls).toBe(0); release(); await Promise.all([first, second]); expect(f.calls).toBe(1); runtime.dispose()
  })
})


test('holds unknown receipt for explicit reconciliation without replaying the command', async () => {
  const f = fixture(); let writes = 0; let receipt: unknown = null
  const commands = { execute: async (id: string, input: unknown, options?: unknown) => { if (id === 'session.setBudget') { writes += 1; throw { code: 'RESULT_UNKNOWN', message: 'ack lost' } } return f.commands.execute(id, input, options) } } as unknown as CommandExecutor
  const runtime = createUsageBudget({ commands, target: f.target.reader, getReceipt: async () => receipt })
  runtime.setDraftLimit('250'); await runtime.save(); expect(runtime.state.getSnapshot().status).toBe('unknown'); expect(writes).toBe(1)
  await runtime.reconcile(); expect(writes).toBe(1); expect(runtime.state.getSnapshot().status).toBe('unknown')
  runtime.dispose()
})
