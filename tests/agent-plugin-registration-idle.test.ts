import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { agentPlugin } from '@hbar/agent'
import { definePlugin, runtimePluginIdleCheckpointSchema } from '@hbar/plugin-sdk'
import type { AgentService, RuntimePluginIdleRegistry } from '@hbar/plugin-sdk'

test('the real Agent plugin provides its public service and a readable idle checkpoint together', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-registration-idle-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-registration-idle-'))
    throw new Error('Refusing to remove an unowned Agent registration fixture directory')
  const readers = new Map<string, Parameters<RuntimePluginIdleRegistry['register']>[0]>()
  const observedAgent = definePlugin({
    manifest: agentPlugin.manifest,
    async apply(ctx, config) {
      const api = ctx.hbar.api
      const previous = api.runtimeIdle
      api.runtimeIdle = {
        register(read) {
          if (readers.has('agent.codex')) throw new Error('Duplicate Agent checkpoint registration')
          readers.set('agent.codex', read)
          return () => {
            if (readers.get('agent.codex') === read) readers.delete('agent.codex')
          }
        },
      }
      // Invoke the production apply with the real Kernel API and Cordis Context.
      // Only the optional owner-local checkpoint registry is supplied by this fixture.
      try {
        await agentPlugin.apply(ctx, config)
      } finally {
        if (previous === undefined) delete api.runtimeIdle
        else api.runtimeIdle = previous
      }
    },
  })
  let kernel: Kernel | undefined
  try {
    kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'agent.codex': observedAgent } },
    })
    kernel.beginDrain()
    const workspace = (await kernel.storage.call('workspaces')).at(0)
    if (!workspace) throw new Error('Missing real fixture workspace')
    const parent = await kernel.createSession(workspace.id, 'Agent registration fixture')
    const agents = kernel.plugins.get<AgentService>('agent')
    expect(await agents.list(parent.id)).toEqual({ items: [], nextCursor: null })
    const read = readers.get('agent.codex')
    if (!read) throw new Error('The production Agent plugin did not register its idle checkpoint')
    expect(runtimePluginIdleCheckpointSchema.parse(read())).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    // The checkpoint remains a pure observation; the same public service still works afterwards.
    expect(await agents.list(parent.id)).toEqual({ items: [], nextCursor: null })
  } finally {
    try {
      await kernel?.close()
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  }
})
