import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver, ModelRequest } from '@hbar/plugin-sdk'

async function removeOwnedFixture(root: string): Promise<void> {
  const ownedRoot = await realpath(root)
  if (dirname(ownedRoot) !== (await realpath(tmpdir())) || !basename(ownedRoot).startsWith('hbar-summary-thinking-'))
    throw new Error('Refusing to delete an unowned summary-effort fixture')
  await rm(ownedRoot, { recursive: true, force: true })
}

test('automatic compaction uses low effort while the same Run retains its requested xhigh effort', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-summary-thinking-'))
  const primaryRequests: ModelRequest[] = []
  const summaryRequests: ModelRequest[] = []
  let kernel: Kernel | undefined
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Summary effort integration fixture',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Observe independent primary and compaction effort across real Kernel admission',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(context) {
      provide<HarnessDriver>(context, 'driver', {
        supportsCanonicalSteering: true,
        supportsSteeringAdmissionClosure: true,
        async run(input) {
          primaryRequests.push(await input.beforeRequest(input.request, 'before-compaction'))
          await input.commit('assistant', [
            { type: 'tool_call', callId: 'read-history', name: 'read', args: { path: 'history.md' } },
          ])
          await input.commit('tool', [
            {
              type: 'tool_result',
              callId: 'read-history',
              name: 'read',
              text: 'Historical evidence. '.repeat(1000),
              isError: false,
            },
          ])
          await input.stepEnded('before-compaction')
          primaryRequests.push(await input.beforeRequest(input.request, 'after-compaction'))
          await input.commit('assistant', [{ type: 'text', text: 'Continued after the bounded summary.' }])
        },
        async summarize(request) {
          summaryRequests.push(request)
          return {
            text: 'A completed history read is retained; continue verification. This fixture does not measure semantic recall.',
            usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0 },
          }
        },
      })
    },
  })
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'driver.pi': driver } },
    })
    await kernel.changePlugin('budget.codex', true, { autoContinue: false })
    await kernel.saveProvider({
      id: 'summary-thinking',
      name: 'Summary effort fixture',
      protocol: 'mock',
      model: 'summary-thinking',
      baseUrl: 'http://localhost',
      contextWindow: 4096,
      maxOutput: 1024,
      thinkingLevels: ['low', 'xhigh'],
      defaultThinkingLevel: 'xhigh',
    })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Summary effort fixture has no workspace')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(
      session.id,
      'summary-thinking-integration',
      { text: 'Read the history and continue.', images: [], thinking: 'xhigh' },
      'summary-thinking',
    )
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(primaryRequests).toHaveLength(2)
    expect(primaryRequests.map((request) => request.context?.thinking)).toEqual(['xhigh', 'xhigh'])
    expect(primaryRequests.every((request) => request.model.maxOutput === 1024)).toBe(true)
    expect(summaryRequests.length).toBeGreaterThan(0)
    expect(summaryRequests.every((request) => request.context?.thinking === 'low')).toBe(true)
    expect(summaryRequests.every((request) => request.context?.sessionId === session.id)).toBe(true)
    expect(summaryRequests.every((request) => request.context?.runId === run.id)).toBe(true)
    const events = await kernel.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'context.compacted')).toHaveLength(1)
    expect((await kernel.snapshot(session.id)).messages).toHaveLength(4)
    const persistedRun = await kernel.storage.call('run', run.id)
    expect(persistedRun.input.thinking).toBe('xhigh')
  } finally {
    await kernel?.close()
    await removeOwnedFixture(root)
  }
}, 20_000)
