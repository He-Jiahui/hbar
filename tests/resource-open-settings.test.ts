import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { encodePath, type SchemaPath } from '@hbar/schema-core'

test('resource opening preferences default internally, persist globally and use revision conflict checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-resource-settings-'))
  await mkdir(join(root, 'workspace'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: join(root, 'workspace'),
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const service = new SettingsService(kernel.storage)
    const path: SchemaPath = [{ kind: 'field', name: 'client.resourceWebOpenMode' }]
    const before = await service.get({ kind: 'global' })
    expect(before.resolution.reports[encodePath(path)]?.effectiveValue).toBe('internal')
    const receipt = await service.apply({
      schemaVersion: service.describe().schemaVersion,
      scope: { kind: 'global' },
      changes: [{ op: 'set', path, value: 'system' }],
      baselineRevisions: before.revisions,
      actorId: 'resource-settings',
      idempotencyKey: 'web-system',
    })
    expect(receipt.resolution.reports[encodePath(path)]?.effectiveValue).toBe('system')
    expect(
      (await new SettingsService(kernel.storage).get({ kind: 'global' })).resolution.reports[encodePath(path)]
        ?.effectiveValue,
    ).toBe('system')
    const conflict = await service
      .apply({
        schemaVersion: service.describe().schemaVersion,
        scope: { kind: 'global' },
        changes: [{ op: 'set', path, value: 'internal' }],
        baselineRevisions: before.revisions,
        actorId: 'resource-settings',
        idempotencyKey: 'conflict',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(conflict).toMatchObject({ code: 'REVISION_CONFLICT' })
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
