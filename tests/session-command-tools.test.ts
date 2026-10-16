import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, type SessionCommandDiscoveryPort, type SessionCommandContext } from '@hbar/kernel'
import { defineCommand, describeCommand, type CommandDescriptor } from '@hbar/commands'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function descriptor(id: string): CommandDescriptor {
  return describeCommand(
    defineCommand(
      {
        id,
        owner: 'discovery.fixture',
        version: 1,
        kind: 'query',
        execution: 'host',
        stateEffect: 'none',
        scope: 'global',
        category: 'x'.repeat(128),
        titleKey: id,
        descriptionKey: id,
        surfaces: ['api'],
      },
      z.strictObject({}),
      z.strictObject({}),
    ),
  )
}

async function fixture(port: SessionCommandDiscoveryPort) {
  const prefix = 'hbar-session-command-boundary-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    sessionCommands: port,
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Discovery fixture has no workspace')
  const session = await kernel.createSession(workspace.id)
  return {
    session,
    kernel,
    async call(name: string, args: Record<string, unknown>) {
      const run = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: `/tool ${name} ${JSON.stringify(args)}`, images: [], mode: 'plan', approval: 'deny' },
        'local-fixture',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      const result = snapshot.messages
        .filter((message) => message.runId === run.id)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (!result || result.type !== 'tool_result') throw new Error('Discovery fixture returned no tool result')
      expect(snapshot.approvals).toHaveLength(0)
      return { run, result }
    },
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('model catalog bounds preserve a usable cursor and derive source identity only from the active Run', async () => {
  const items = Array.from({ length: 200 }, (_, index) =>
    descriptor(`fixture.command${String(index).padStart(3, '0')}${'x'.repeat(100)}`),
  )
  const identities: SessionCommandContext[] = []
  const f = await fixture({
    list: async (_query, context) => {
      identities.push(context)
      return { revision: 1, items }
    },
    describe: async () => descriptor('fixture.description'),
  })
  try {
    const { run, result } = await f.call('hbar_commands_list', { limit: 50 })
    expect(result.isError).toBe(false)
    expect(new TextEncoder().encode(result.text).byteLength).toBeLessThanOrEqual(32_768)
    const page = z
      .strictObject({ revision: z.number(), items: z.array(z.object({ id: z.string() })), nextCursor: z.string() })
      .parse(JSON.parse(result.text) as unknown)
    expect(page.items).toHaveLength(50)
    expect(page.nextCursor).toBe(`fixture.command049${'x'.repeat(100)}`)
    expect(identities[0]?.sessionId).toBe(f.session.id)
    expect(identities[0]?.runId).toBe(run.id)
    expect(identities[0]?.callId).toBeTruthy()
    const forged = await f.call('hbar_commands_list', { sessionId: 'another-session', actorId: 'operator', limit: 50 })
    expect(forged.result.isError).toBe(true)
    const excessive = await f.call('hbar_commands_list', { limit: 51 })
    expect(excessive.result.isError).toBe(true)
    expect(identities).toHaveLength(1)
  } finally {
    await f.close()
  }
})

test('descriptions reject mismatched identity and excessive UTF-8 content without returning truncated JSON', async () => {
  const value = descriptor('fixture.expected')
  let calls = 0
  const f = await fixture({
    list: async () => ({ revision: 1, items: [] }),
    describe: async () => {
      calls++
      return calls === 1 ? descriptor('fixture.other') : { ...value, inputSchema: { description: '界'.repeat(44_000) } }
    },
  })
  try {
    const mismatch = await f.call('hbar_command_describe', { commandId: 'fixture.expected' })
    expect(mismatch.result.isError).toBe(true)
    expect(mismatch.result.text).toContain('belongs to another ID')
    const excessive = await f.call('hbar_command_describe', { commandId: 'fixture.expected' })
    expect(excessive.result.isError).toBe(true)
    expect(excessive.result.text).toContain('exceeds the model tool capacity')
    expect(excessive.result.text).not.toContain('界'.repeat(100))
  } finally {
    await f.close()
  }
})

test('an absent concrete execution binding cannot use the discovery port as a command dispatcher', async () => {
  let reads = 0
  const f = await fixture({
    list: async () => {
      reads++
      return { revision: 1, items: [] }
    },
    describe: async () => {
      reads++
      return descriptor('workspace.list')
    },
  })
  try {
    const { run, result } = await f.call('hbar_command_execute', {
      commandId: 'workspace.list',
      commandVersion: 1,
      operationKey: 'unbound-command',
      input: {},
    })
    expect(result.isError).toBe(true)
    expect(reads).toBe(0)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).some(
        (event) => event.runId === run.id && event.type.startsWith('run.commandExecution.'),
      ),
    ).toBe(false)
  } finally {
    await f.close()
  }
})
