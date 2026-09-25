import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarClient, createInteractionCommandClient, createInteractionRecoveryClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { SessionSnapshot } from '@hbar/contracts'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { startServer } from '../apps/host/src/server'
import { createInteractions } from '../packages/app-runtime/src/interactions'
import { interactionRecoveryCommands } from '../packages/app-runtime/src/interaction-recovery'
import { createState } from '../packages/app-runtime/src/state'
import type { SessionTimelineState } from '../packages/app-runtime/src/types'

function timeline(snapshot: SessionSnapshot): SessionTimelineState {
  return {
    ...snapshot,
    sessionId: snapshot.session.id,
    status: 'ready',
    olderStatus: 'idle',
    olderError: null,
    streams: {},
    events: [],
    plan: null,
    error: null,
  }
}

async function waitFor<Value>(read: () => Promise<Value | undefined>): Promise<Value> {
  for (let index = 0; index < 100; index += 1) {
    const value = await read()
    if (value !== undefined) return value
    await Bun.sleep(5)
  }
  throw new Error('Timed out waiting for a real Host interaction')
}

for (const outcome of ['allowed', 'denied', 'cancelled', 'answered'] as const) {
  test(`real Host missed ${outcome} outcome is recovered after disconnect by one read and no repeated decision`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-decision-recovery-'))
    const kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const server = await startServer(kernel, { port: 0 })
    const client = new HbarClient(`http://127.0.0.1:${server.server.port}`)
    const local = new CommandRegistry()
    let interactions: ReturnType<typeof createInteractions> | undefined
    let state: ReturnType<typeof createState<SessionTimelineState>> | undefined
    try {
      await client.pair(server.pairing.code, 'interaction recovery verification')
      const workspace = (await kernel.storage.call('workspaces'))[0]!
      const session = await kernel.createSession(workspace.id, `Recovery ${outcome}`)
      await kernel.submit(
        session.id,
        crypto.randomUUID(),
        outcome === 'answered'
          ? {
              mode: 'plan',
              images: [],
              text: '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Choose scope","options":[{"label":"Inline","description":"Next to the tool"},{"label":"Run","description":"Run area"}]}]}',
            }
          : { images: [], approval: 'ask', text: '/tool write_file {"path":"recovery.txt","text":"verified"}' },
        'local-fixture',
      )
      const pending = await waitFor(async () => {
        const current = await client.call('session.snapshot', { sessionId: session.id })
        return (outcome === 'answered' ? current.userInputs.length : current.approvals.length) ? current : undefined
      })
      state = createState(timeline(pending), () => {})
      const remote = createInteractionCommandClient(client)
      let writes = 0
      let reads = 0
      const recovery = createInteractionRecoveryClient(client)
      interactions = createInteractions(
        local,
        {
          async execute(name, input, options) {
            writes += 1
            if (outcome === 'cancelled') await client.call('run.cancel', { runId: pending.approvals[0]!.runId })
            else if (name === 'approval.resolve')
              await remote.execute(name, interactionCommands[name].input.parse(input), options)
            else if (name === 'questionnaire.answer')
              await remote.execute(name, interactionCommands[name].input.parse(input), options)
            else throw new Error('Unexpected interaction command')
            client.disconnect()
            throw new CommandError('CONNECTION_CLOSED', 'Delivery succeeded but the runtime did not receive the reply')
          },
        },
        state.reader,
        () => {},
        () => false,
        {
          async follow(sessionId, cursor) {
            reads += 1
            return recovery.follow(sessionId, cursor)
          },
        },
      )
      const question = pending.userInputs[0]
      const approval = pending.approvals[0]
      const name = outcome === 'answered' ? 'questionnaire.answer' : 'approval.resolve'
      const input = question
        ? { sessionId: session.id, requestId: question.requestId, answers: { scope: { answers: ['Inline'] } } }
        : { sessionId: session.id, approvalId: approval!.id, decision: outcome === 'denied' ? 'denied' : 'allowed' }
      await expect(interactions.execute(name, input)).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
      await kernel.waitForIdle()
      const actionId = question ? `questionnaire:${question.requestId}` : `approval:${approval!.id}`
      expect(interactions.reader.getSnapshot()[actionId]).toMatchObject({
        status: 'unknown',
        startCursor: pending.cursor,
      })
      expect(state.reader.getSnapshot().events).toEqual([])
      await client.connect()
      const snapshot = await client.call('session.snapshot', { sessionId: session.id })
      expect(snapshot.approvals).toEqual([])
      expect(snapshot.userInputs).toEqual([])
      // Reproduce the pending-only snapshot hole: no history event or result has reached this runtime.
      state.replace({ ...state.reader.getSnapshot(), approvals: [], userInputs: [] })
      const commands = createCommandClient(interactionRecoveryCommands, local)
      expect(await commands.execute('interaction.reconcile', { sessionId: session.id, actionId })).toEqual({
        confirmed: true,
      })
      expect(interactions.reader.getSnapshot()[actionId]?.resolution).toEqual(
        outcome === 'answered' ? { kind: 'questionnaire', status: 'answered' } : { kind: 'approval', status: outcome },
      )
      await expect(interactions.execute(name, input)).rejects.toMatchObject({ code: 'BUSY' })
      expect(writes).toBe(1)
      expect(reads).toBe(1)
      expect(await Bun.file(join(root, 'recovery.txt')).exists()).toBe(outcome === 'allowed')
      const facts = await recovery.follow(session.id, pending.cursor)
      expect(
        facts.events.filter((event) => event.type === (question ? 'user_input.resolved' : 'approval.resolved')),
      ).toHaveLength(1)
    } finally {
      interactions?.dispose()
      state?.dispose()
      local.dispose()
      client.disconnect()
      await server.close()
      await kernel.close()
      await rm(root, { recursive: true, force: true })
    }
  })
}
