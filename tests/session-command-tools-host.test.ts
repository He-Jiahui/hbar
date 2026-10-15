import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { commandDescriptorSchema } from '@hbar/commands'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const pageSchema = z.strictObject({
  revision: z.number(),
  items: z.array(z.object({ id: z.string(), execution: z.enum(['host', 'client', 'platform']) })),
  nextCursor: z.string().optional(),
})

test('independent real managed sessions discover command mode and read schemas in Plan/deny without a UI or mutations', async () => {
  const prefix = 'hbar-session-command-tools-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  try {
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Command-tool fixture has no workspace')
    const first = await runtime.storage.call('createSession', workspace.id, 'First command reader')
    const second = await runtime.storage.call('createSession', workspace.id, 'Second command reader')
    async function call(sessionId: string, name: string, args: Record<string, unknown>) {
      const run = await runtime.kernel.submit(
        sessionId,
        crypto.randomUUID(),
        {
          text: `/tool ${name} ${JSON.stringify(args)}`,
          images: [],
          approval: 'deny',
          mode: 'plan',
        },
        'local-fixture',
      )
      await runtime.waitForIdle()
      const snapshot = await runtime.kernel.snapshot(sessionId)
      expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
      expect(snapshot.approvals).toHaveLength(0)
      const result = snapshot.messages
        .filter((message) => message.runId === run.id)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (!result || result.type !== 'tool_result') throw new Error('Managed command tool returned no result')
      expect(result.isError).toBe(false)
      return result.text
    }
    const seen: string[] = []
    const domains = new Set<string>()
    let after: string | undefined
    do {
      const page = pageSchema.parse(
        JSON.parse(await call(first.id, 'hbar_commands_list', { limit: 50, ...(after ? { after } : {}) })) as unknown,
      )
      for (const item of page.items) {
        seen.push(item.id)
        domains.add(item.execution)
      }
      after = page.nextCursor
      expect(seen.length).toBeLessThan(10_000)
    } while (after)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual([...seen].sort())
    expect(seen).toContain('file.write')
    expect(seen).toContain('app.openPanel')
    expect([...domains].sort()).toEqual(['client', 'host', 'platform'])
    const description = commandDescriptorSchema.parse(
      JSON.parse(await call(second.id, 'hbar_command_describe', { commandId: 'file.write' })) as unknown,
    )
    expect(description.metadata.stateEffect).toBe('persistent')
    expect(description.inputSchema).toHaveProperty('properties.path')
    const local = commandDescriptorSchema.parse(
      JSON.parse(await call(second.id, 'hbar_command_describe', { commandId: 'app.openPanel' })) as unknown,
    )
    expect(local.metadata.execution).toBe('client')
    expect((await runtime.kernel.plugins.get('goal').get(first.id)).goal).toBeNull()
    expect((await runtime.kernel.plugins.get('goal').get(second.id)).goal).toBeNull()
  } finally {
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
