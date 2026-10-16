import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/controller'
import { definePlugin, provide, type BudgetService, type GoalService, type HarnessDriver } from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

for (const policy of ['unconfigured', 'enabled', 'disabled'] as const)
  test(`${policy} backend control has one owner of ordinary completion and preserves budget accounting`, async () => {
    const prefix = 'hbar-backend-normal-completion-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    let kernel: Kernel | undefined
    const driver = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Ordinary completion fixture',
        description: 'Complete normally with measured usage',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        permissions: [],
        provides: { driver: '1.0.0' },
      },
      apply(ctx) {
        provide<HarnessDriver>(ctx, 'driver', {
          async run(input) {
            const stepId = crypto.randomUUID()
            await input.beforeRequest(input.request, stepId)
            await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
            await input.commit('assistant', [{ type: 'text', text: 'The ordinary task is complete.' }])
            await input.stepEnded(stepId)
          },
          summarize: async () => ({ text: '', usage: emptyUsage() }),
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
      await kernel.changePlugin('budget.codex', true, { autoContinue: true, maxContinuations: 1 })
      if (policy !== 'unconfigured') {
        const settings = new SettingsService(kernel.storage, undefined, () => kernel?.changed('settings'))
        const before = await settings.get({ kind: 'global' })
        await settings.apply({
          schemaVersion: before.schemaVersion,
          scope: before.scope,
          baselineRevisions: before.revisions,
          actorId: 'completion-fixture',
          idempotencyKey: crypto.randomUUID(),
          changes: [
            { op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: policy === 'enabled' },
          ],
        })
      }
      const workspace = (await kernel.storage.call('workspaces'))[0]
      if (!workspace) throw new Error('Missing completion fixture workspace')
      const session = await kernel.createSession(workspace.id)
      await kernel.plugins.get<BudgetService>('budget').set(session.id, 100)
      const original = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: 'Complete the ordinary task', images: [], mode: 'default', approval: 'deny' },
        'local-fixture',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      const expected = policy === 'unconfigured' ? 2 : 1
      expect(snapshot.runs).toHaveLength(expected)
      expect(snapshot.runs.every((run) => run.status === 'completed')).toBe(true)
      expect(snapshot.runs.some((run) => run.id === original.id)).toBe(true)
      expect((await kernel.plugins.get<BudgetService>('budget').get(session.id))?.usedTokens).toBe(expected)
      expect((await kernel.plugins.get<GoalService>('goal').get(session.id)).goal).toBeNull()
    } finally {
      await kernel?.close()
      await removeOwnedTestDirectory(root, prefix)
    }
  }, 15_000)
