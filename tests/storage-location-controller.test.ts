import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createStorageLocationController } from '@hbar/app-runtime/storage-locations'
import type { StorageLocationSnapshot } from '@hbar/contracts/commands/storage-locations'

const roots = {
  dataRoot: 'D:/hbar/data',
  cacheRoot: 'D:/hbar/cache',
  settingsRoot: 'D:/hbar/config',
  sessionsRoot: 'D:/hbar/history',
  skillsRoot: 'D:/hbar/skills',
}
const initial: StorageLocationSnapshot = {
  pointerFile: 'C:/Users/test/hbar/paths.json',
  revision: 'initial',
  active: roots,
  saved: roots,
  restartRequired: false,
  lastWrite: null,
  receipts: [],
}
test('schema metadata determines every editor and refresh preserves an unsaved draft', async () => {
  const controller = createStorageLocationController({
    read: async () => initial,
    save: async () => initial,
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  await controller.read()
  expect(controller.schema.fields.map((field) => field.component)).toEqual(Array.from({ length: 5 }, () => 'TextField'))
  controller.edit('sessionsRoot', 'E:/history')
  await controller.read()
  expect(controller.store.getState().form?.draft.sessionsRoot).toBe('E:/history')
  controller.discard()
  expect(controller.store.getState().form?.dirty).toEqual([])
  controller.dispose()
})
test('single save confirms its captured input while preserving edits made during the request', async () => {
  let resolveSave: (snapshot: StorageLocationSnapshot) => void = () => {
    throw new Error('not started')
  }
  let calls = 0
  const controller = createStorageLocationController({
    read: async () => initial,
    save: async (input) => {
      calls++
      return new Promise((resolve) => {
        resolveSave = (snapshot) =>
          resolve({ ...snapshot, lastWrite: { operationId: input.operationId, fingerprint: 'saved' } })
      })
    },
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  await controller.read()
  controller.edit('sessionsRoot', 'E:/history')
  const saving = controller.save()
  await controller.save()
  controller.edit('sessionsRoot', 'F:/history')
  resolveSave({ ...initial, revision: 'saved', saved: { ...roots, sessionsRoot: 'E:/history' }, restartRequired: true })
  await saving
  expect(calls).toBe(1)
  expect(controller.store.getState().form?.baseline.sessionsRoot).toBe('E:/history')
  expect(controller.store.getState().form?.draft.sessionsRoot).toBe('F:/history')
  expect(controller.store.getState().form?.dirty).toEqual(['sessionsRoot'])
  controller.dispose()
})
test('unknown save is reconciled from its durable operation ID without replay', async () => {
  let snapshot = initial
  let calls = 0
  const controller = createStorageLocationController({
    read: async () => snapshot,
    save: async (input) => {
      calls++
      snapshot = {
        ...initial,
        saved: input.roots,
        revision: 'confirmed',
        restartRequired: true,
        lastWrite: { operationId: input.operationId, fingerprint: 'saved' },
      }
      throw new CommandError('TIMEOUT', 'Reply was lost')
    },
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  await controller.read()
  controller.edit('skillsRoot', 'E:/skills')
  await controller.save()
  expect(controller.store.getState().form?.status).toBe('unknown')
  await controller.save()
  expect(calls).toBe(1)
  await controller.read()
  expect(controller.store.getState().form?.status).toBe('succeeded')
  expect(controller.store.getState().form?.dirty).toEqual([])
  await controller.restart()
  expect(controller.store.getState().restart).toBe('manual')
  controller.dispose()
})
test('conflict and disposed responses never erase edits or update a retired controller', async () => {
  const controller = createStorageLocationController({
    read: async () => initial,
    save: async () => {
      throw new CommandError('STORAGE_CONFLICT', 'Changed')
    },
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  await controller.read()
  controller.edit('skillsRoot', 'E:/skills')
  await controller.save()
  expect(controller.store.getState().form?.status).toBe('failed')
  expect(controller.store.getState().form?.dirty).toEqual(['skillsRoot'])
  controller.dispose()
  const before = controller.store.getState()
  await controller.read()
  expect(controller.store.getState()).toBe(before)
})
