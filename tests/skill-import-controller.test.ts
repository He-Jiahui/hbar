import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createSkillImportController, type SkillImportPort } from '@hbar/app-runtime/skill-import'
import type { SkillImportJob, SkillImportPreview } from '@hbar/contracts/commands/skill-import'
const preview: SkillImportPreview = {
  request: { source: 'claude' },
  sourceRoots: ['C:/Users/test/.claude/skills'],
  destination: 'D:/skills',
  revision: 'source-revision',
  candidates: [
    {
      id: 'example',
      name: '例子😀',
      sourcePath: 'C:/skills/example',
      status: 'ready',
      warnings: [],
      files: 2,
      bytes: 100,
    },
  ],
  truncated: false,
}
const completed = (operationId: string): SkillImportJob => ({
  operationId,
  request: preview.request,
  destination: preview.destination,
  status: 'succeeded',
  items: [{ id: 'example', status: 'imported', warnings: [] }],
  error: null,
})
function port(overrides: Partial<SkillImportPort> = {}): SkillImportPort {
  return {
    preview: async () => preview,
    start: async (input) => completed(input.operationId),
    get: async () => null,
    latest: async () => null,
    cancel: async () => null,
    ...overrides,
  }
}
test('preview binds source, source edits discard obsolete preview, and conversion confirms a single captured intent', async () => {
  let calls = 0
  const controller = createSkillImportController(
    port({
      start: async (input) => {
        calls++
        return completed(input.operationId)
      },
    }),
  )
  await controller.preview()
  controller.setSource('codex')
  expect(controller.store.getState().preview).toBeNull()
  controller.setSource('claude')
  await controller.preview()
  await Promise.all([controller.start(), controller.start()])
  expect(calls).toBe(1)
  expect(controller.store.getState().status).toBe('settled')
  expect(controller.store.getState().job?.items[0]?.status).toBe('imported')
  expect(controller.store.getState().preview).toBeNull()
  controller.dispose()
})
test('source changes invalidate delayed discovery while preserving the current input', async () => {
  let deliver: (value: SkillImportPreview) => void = () => {
    throw new Error('not started')
  }
  const controller = createSkillImportController(
    port({
      preview: async () =>
        new Promise((resolve) => {
          deliver = resolve
        }),
    }),
  )
  const reading = controller.preview()
  controller.setSourceRoot('E:/different-source')
  deliver(preview)
  await reading
  expect(controller.store.getState().sourceRoot).toBe('E:/different-source')
  expect(controller.store.getState().preview).toBeNull()
  controller.dispose()
})
test('unknown acceptance is recovered by operation ID without starting another copy', async () => {
  let saved: SkillImportJob | null = null
  let starts = 0
  const controller = createSkillImportController(
    port({
      start: async (input) => {
        starts++
        saved = completed(input.operationId)
        throw new CommandError('TIMEOUT', 'Lost reply')
      },
      get: async () => saved,
    }),
  )
  await controller.preview()
  await controller.start()
  expect(controller.store.getState().status).toBe('unknown')
  await controller.start()
  expect(starts).toBe(1)
  await controller.checkResult()
  expect(controller.store.getState().status).toBe('settled')
  controller.dispose()
})
test('retry uses the original ID and cancellation can stop an unaccepted request', async () => {
  const ids: string[] = []
  const controller = createSkillImportController(
    port({
      start: async (input) => {
        ids.push(input.operationId)
        if (ids.length === 1) throw new CommandError('TIMEOUT', 'Unknown')
        return completed(input.operationId)
      },
    }),
  )
  await controller.preview()
  await controller.start()
  await controller.retryOriginal()
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
  controller.dispose()
  const cancelled = createSkillImportController(
    port({
      start: async () => {
        throw new CommandError('TIMEOUT', 'Unknown')
      },
    }),
  )
  await cancelled.preview()
  await cancelled.start()
  await cancelled.cancel()
  expect(cancelled.store.getState().status).toBe('idle')
  expect(cancelled.store.getState().error).toBe('SKILL_IMPORT_CANCELLED_BEFORE_START')
  cancelled.dispose()
})
test('an older latest-job reply cannot replace a newly accepted operation', async () => {
  let deliver: (value: SkillImportJob) => void = () => {
    throw new Error('not started')
  }
  const controller = createSkillImportController(
    port({
      latest: async () =>
        new Promise((resolve) => {
          deliver = resolve
        }),
    }),
  )
  const previous = controller.checkResult()
  await controller.preview()
  await controller.start()
  const operationId = controller.store.getState().job?.operationId
  deliver(completed('obsolete'))
  await previous
  expect(controller.store.getState().job?.operationId).toBe(operationId)
  controller.dispose()
})
test('StrictMode lease replay keeps the controller usable and release stops late results', async () => {
  const controller = createSkillImportController(port())
  const first = controller.acquire()
  first()
  const second = controller.acquire()
  await Promise.resolve()
  await controller.preview()
  expect(controller.store.getState().preview).not.toBeNull()
  second()
  await Promise.resolve()
  const before = controller.store.getState()
  await controller.preview()
  expect(controller.store.getState()).toBe(before)
})
