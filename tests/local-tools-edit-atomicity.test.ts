import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { LocalExecution, localExecutionPlugin } from '@hbar/local-tools'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { ExecutionProvider, HarnessDriver, ToolResult } from '@hbar/plugin-sdk'
import type { WorkspaceDirectoryService } from '@hbar/plugin-sdk/workspace-directories'

test('four admitted edit_file calls sharing one read version have one winner and three edit conflicts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-edit-atomicity-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-edit-atomicity-'))
    throw new Error('Refusing non-owned edit atomicity fixture cleanup')
  const baseline = 'claim=unclaimed\n'
  const path = 'shared-claim.txt'
  await writeFile(join(root, path), baseline, 'utf8')
  const local = new LocalExecution()
  const observedReads: string[] = []
  const expectedRevisions: (string | undefined)[] = []
  const results: ToolResult[] = []
  let release = () => {}
  let rejectBarrier: (error: Error) => void = () => {}
  let barrierTimer: ReturnType<typeof setTimeout> | undefined
  const allRead = new Promise<void>((resolveBarrier, reject) => {
    release = resolveBarrier
    rejectBarrier = reject
  })
  const execution: ExecutionProvider = {
    list: (...args) => local.list(...args),
    readBytes: (...args) => local.readBytes(...args),
    exec: (...args) => local.exec(...args),
    async read(workspace, requested) {
      // Only delay the public tool read. LocalExecution's read/check/write and
      // its real file mutation queue are deliberately left intact.
      const text = await local.read(workspace, requested)
      if (requested === path && observedReads.length < 4) {
        observedReads.push(text)
        barrierTimer ??= setTimeout(() => rejectBarrier(new Error('Four tool reads did not arrive')), 5_000)
        if (observedReads.length === 4) {
          clearTimeout(barrierTimer)
          release()
        }
        await allRead
      }
      return text
    },
    write(workspace, requested, text, options) {
      expectedRevisions.push(options?.expectedRevision)
      return local.write(workspace, requested, text, options)
    },
  }
  const gatedExecutionPlugin = definePlugin({
    manifest: localExecutionPlugin().manifest,
    apply(ctx) {
      provide<ExecutionProvider>(ctx, 'execution', execution)
      provide<WorkspaceDirectoryService>(ctx, 'workspace-directories', {
        resolve: (workspace, directory) => local.resolveDirectory(workspace, directory),
      })
    },
  })
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Concurrent edit fixture driver',
      description: 'Calls real admitted tools without a model transport',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          await input.beforeRequest(input.request, `edit-request-${input.run.id}`)
          results.push(
            await input.execute(
              'edit_file',
              { path, oldText: 'unclaimed', newText: input.run.input.text },
              `edit-${input.run.id}`,
            ),
          )
          await input.commit('assistant', [{ type: 'text', text: 'contender settled' }])
          await input.stepEnded('edit-request-' + input.run.id)
        },
        summarize: async () => ({ text: 'edit fixture summary', usage: emptyUsage() }),
      })
    },
  })
  let kernel: Kernel | undefined
  try {
    const activeKernel = await Kernel.create({
      home: join(root, '.hbar-data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'execution.local': gatedExecutionPlugin, 'driver.pi': driver } },
    })
    kernel = activeKernel
    await activeKernel.setPermissionMode('allow')
    const workspace = (await activeKernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing fixture workspace')
    const sessions = await Promise.all(
      Array.from({ length: 4 }, (_, index) => activeKernel.createSession(workspace.id, `contender ${index}`)),
    )
    await Promise.all(
      sessions.map((session, index) =>
        activeKernel.submit(
          session.id,
          `claim-${index}`,
          {
            text: `actor-${index}`,
            images: [],
          },
          'local-fixture',
        ),
      ),
    )
    await activeKernel.waitForIdle()
    const snapshots = await Promise.all(sessions.map((session) => activeKernel.snapshot(session.id)))
    for (const snapshot of snapshots) {
      const durableResults = snapshot.messages.flatMap((message) =>
        message.content.filter((block) => block.type === 'tool_result' && block.name === 'edit_file'),
      )
      expect(durableResults).toHaveLength(1)
    }
    expect(observedReads).toEqual(Array.from({ length: 4 }, () => baseline))
    expect(results).toHaveLength(4)
    const winners = results.filter((result) => !result.isError)
    const conflicts = results.filter((result) => result.isError)
    expect(winners).toHaveLength(1)
    expect(conflicts).toHaveLength(3)
    for (const conflict of conflicts) {
      expect(conflict.hostFailure).toMatchObject({ code: 'EDIT_CONFLICT', executionStarted: true })
      expect(conflict.outcome).toEqual({ kind: 'failed', executionStarted: true })
      expect(conflict.fileChanges).toBeUndefined()
    }
    const expectedRevision = createHash('sha256').update(baseline, 'utf8').digest('hex')
    expect(expectedRevisions).toEqual(Array.from({ length: 4 }, () => expectedRevision))
    const winner = winners[0]
    if (!winner) throw new Error('Missing winner')
    const finalText = await readFile(join(root, path), 'utf8')
    expect(finalText).toMatch(/^claim=actor-[0-3]\n$/)
    expect(winner.fileChanges).toEqual([{ path, before: baseline, after: finalText }])
    expect(winner.outcome).toEqual({ kind: 'succeeded', executionStarted: true })
  } finally {
    if (barrierTimer) clearTimeout(barrierTimer)
    release()
    await kernel?.close()
    local.dispose()
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
