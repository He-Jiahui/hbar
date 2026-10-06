import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createStorageLocationController } from '@hbar/app-runtime/storage-locations'
import type { StorageLocationSnapshot } from '@hbar/contracts/commands/storage-locations'

test('an unaccepted unknown save retries the same intent and keeps its draft', async () => {
  const roots = {
    dataRoot: 'D:/data',
    cacheRoot: 'D:/cache',
    settingsRoot: 'D:/config',
    sessionsRoot: 'D:/history',
    skillsRoot: 'D:/skills',
  }
  const snapshot: StorageLocationSnapshot = {
    pointerFile: 'C:/User/hbar/paths.json',
    active: roots,
    saved: roots,
    revision: 'initial',
    restartRequired: false,
    lastWrite: null,
    receipts: [],
  }
  const ids: string[] = []
  const controller = createStorageLocationController({
    read: async () => snapshot,
    save: async (input) => {
      ids.push(input.operationId)
      if (ids.length === 1) throw new CommandError('TIMEOUT', 'Unknown')
      return {
        ...snapshot,
        saved: input.roots,
        revision: 'saved',
        restartRequired: true,
        lastWrite: { operationId: input.operationId, fingerprint: 'saved' },
      }
    },
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  await controller.read()
  controller.edit('skillsRoot', 'E:/skills')
  await controller.save()
  await controller.read()
  expect(controller.store.getState().form?.status).toBe('unknown')
  await controller.retryOriginal()
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
  expect(controller.store.getState().form?.status).toBe('succeeded')
  controller.dispose()
})
