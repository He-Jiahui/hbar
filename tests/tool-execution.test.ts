import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { toolBatchProgressSchema, toolExecutionSchema, toolProgressSchema, type ToolExecution } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ToolContext } from '@hbar/plugin-sdk'
import { createToolExecutionReporter } from '../packages/kernel/src/tool-execution'

test('execution contracts reject fabricated percentages, contradictory counts and backwards wall time', () => {
  for (const input of [
    { completed: 2, total: 1 },
    { completed: 0, total: 0 },
    { completed: NaN, total: 1 },
  ])
    expect(toolProgressSchema.safeParse(input).success).toBe(false)
  expect(toolExecutionSchema.safeParse({ startedAt: 2, endedAt: 1, elapsedMs: 1 }).success).toBe(false)
  expect(
    toolBatchProgressSchema.safeParse({ total: 3, settled: 1, running: 1, pending: 0, skipped: 0, unknown: 0 }).success,
  ).toBe(false)
})

test('monotonic timing, bounded progress bursts, latest final progress and closed callback lifetime', async () => {
  const published: ToolExecution[] = []
  const reporter = createToolExecutionReporter(Date.now(), (execution) => {
    published.push(execution)
    return Promise.resolve()
  })
  await reporter.start()
  for (let completed = 0; completed <= 100; completed++) await reporter.report({ completed, total: 100 })
  expect(published.length).toBeLessThanOrEqual(3)
  const final = await reporter.finish()
  expect(final.progress).toEqual({ completed: 100, total: 100 })
  expect(final.elapsedMs).toBeGreaterThanOrEqual(0)
  expect(final.endedAt).toBeGreaterThanOrEqual(final.startedAt)
  await expect(reporter.report({ completed: 100, total: 100 })).rejects.toMatchObject({ code: 'TOOL_PROGRESS_CLOSED' })
})

test('progress cannot move backwards or silently change its denominator', async () => {
  const reporter = createToolExecutionReporter(Date.now(), () => Promise.resolve())
  await reporter.report({ completed: 1, total: 3 })
  await expect(reporter.report({ completed: 0, total: 3 })).rejects.toMatchObject({ code: 'INVALID_TOOL_PROGRESS' })
  await expect(reporter.report({ completed: 2, total: 4 })).rejects.toMatchObject({ code: 'INVALID_TOOL_PROGRESS' })
  await reporter.finish()
})

test('the last coalesced progress is published within the bounded interval even if no further report arrives', async () => {
  const published: ToolExecution[] = []
  const reporter = createToolExecutionReporter(Date.now(), (execution) => {
    published.push(execution)
    return Promise.resolve()
  })
  await reporter.report({ completed: 1, total: 4 })
  await reporter.report({ completed: 2, total: 4 })
  await Bun.sleep(300)
  expect(published.at(-1)?.progress).toEqual({ completed: 2, total: 4 })
  expect(published.at(-1)?.endedAt).toBeUndefined()
  await reporter.finish()
  const settledCount = published.length
  await Bun.sleep(300)
  expect(published).toHaveLength(settledCount)
})

test('real Host publishes timing/progress, restores active facts, freezes results and rejects plugin-spoofed timing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-tool-execution-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let captured: ToolContext['reportProgress']
  let dispose: () => void | Promise<void> = () => {}
  let disposeBatch: () => void | Promise<void> = () => {}
  try {
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    dispose = kernel.tools.register({
      name: 'timing_fixture',
      description: 'Controlled timing fixture',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, context) {
        captured = context.reportProgress
        await context.reportProgress?.({ completed: 1, total: 4 })
        await gate
        await context.reportProgress?.({ completed: 2, total: 4 })
        return { text: 'proof', execution: { startedAt: 1, endedAt: 1, elapsedMs: 999_999 } }
      },
    })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    await kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: '/tool timing_fixture {}', images: [], approval: 'allow' },
      'local-fixture',
    )
    const deadline = performance.now() + 5000
    while (!captured && performance.now() < deadline) await Bun.sleep(5)
    expect(captured).toBeDefined()
    const active = await kernel.snapshot(session.id)
    expect(active.toolEvents?.some((event) => event.type === 'tool.execution')).toBe(true)
    await Bun.sleep(20)
    release()
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    const result = snapshot.messages.flatMap((message) => message.content).find((block) => block.type === 'tool_result')
    if (result?.type !== 'tool_result') throw new Error('Missing tool result')
    expect(result.execution?.startedAt).toBeGreaterThan(1)
    expect(result.execution?.elapsedMs).toBeGreaterThanOrEqual(20)
    expect(result.execution?.elapsedMs).toBeLessThan(999_999)
    expect(result.execution?.progress).toEqual({ completed: 2, total: 4 })
    expect(result.execution?.endedAt).toBeDefined()
    expect((await kernel.snapshot(session.id)).messages).toEqual(snapshot.messages)
    if (!captured) throw new Error('Progress port missing')
    await expect(captured({ completed: 3, total: 4 })).rejects.toBeDefined()
    disposeBatch = kernel.tools.register({
      name: 'timing_batch_fixture',
      description: 'Controlled batch fixture',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, context) {
        const results = await context.executeSequence?.([
          { name: 'timing_fixture', arguments: {} },
          { name: 'read_file', arguments: { path: 'does-not-exist.txt' } },
          { name: 'timing_fixture', arguments: {} },
        ])
        return { text: JSON.stringify(results), isError: true }
      },
    })
    await kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: '/tool timing_batch_fixture {}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const batchSnapshot = await kernel.snapshot(session.id)
    const batchResult = batchSnapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'timing_batch_fixture')
    expect(batchResult).toMatchObject({
      batch: { total: 3, settled: 2, running: 0, pending: 0, skipped: 1, unknown: 0 },
    })
    const progress = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.type === 'tool.sequence_progress',
    )
    expect(progress[0]?.data).toMatchObject({ progress: { total: 3, settled: 0, running: 0, pending: 3 } })
    expect(
      progress.some(
        (event) => toolBatchProgressSchema.safeParse((event.data as { progress: unknown }).progress).success,
      ),
    ).toBe(true)
  } finally {
    release()
    await kernel.waitForIdle()
    await dispose()
    await disposeBatch()
    await kernel.close()
    const resolved = await realpath(root)
    if (dirname(resolved) === (await realpath(tmpdir())) && basename(resolved).startsWith('hbar-tool-execution-'))
      await rm(resolved, { recursive: true })
  }
})
