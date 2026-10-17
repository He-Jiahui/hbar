import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
  createWorkflowCommandClient,
} from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import type { ApprovalMode } from '@hbar/contracts'
import { z } from 'zod'
import { gitCommands } from '@hbar/contracts/commands/git'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function git(cwd: string, ...args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Fixture Git failed: ${stderr}`)
  return stdout.trim()
}

test('authenticated managed Sessions execute real Git commands within native policy and their original workspace', async () => {
  const prefix = 'hbar-managed-command-git-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    await git(root, 'init')
    await git(root, 'config', 'user.name', 'hbar command fixture')
    await git(root, 'config', 'user.email', 'fixture@example.invalid')
    await Bun.write(join(root, 'proof.txt'), 'initial\n')
    await git(root, 'add', 'proof.txt')
    await git(root, 'commit', '-m', 'Initial fixture')
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Git command owner')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]!
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'git-command-session' },
    )
    const current = runtime
    const runs = createRunCommandClient(client)
    async function call(
      commandId: string,
      input: Record<string, unknown>,
      approval: ApprovalMode = 'deny',
      mode: 'plan' | 'default' = 'plan',
    ) {
      const operationKey = crypto.randomUUID()
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: session.id,
          modelId: 'local-fixture',
          input: {
            text: `/tool hbar_command_execute ${JSON.stringify({ commandId, commandVersion: 1, operationKey, input })}`,
            images: [],
            approval,
            mode,
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await current.waitForIdle()
      const snapshot = await current.kernel.snapshot(session.id)
      const result = snapshot.messages
        .filter((message) => message.runId === accepted.operationId)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (!result || result.type !== 'tool_result') throw new Error('Managed Git command produced no tool result')
      return { result, operationKey, runId: accepted.operationId }
    }
    for (const commandId of [
      'git.info',
      'git.status',
      'git.diff',
      'git.log',
      'git.stats',
      'git.diffToRemote',
      'git.branch',
      'git.worktree',
    ]) {
      const { result, operationKey, runId } = await call(commandId, {})
      expect({ commandId, error: result.isError, text: result.isError ? result.text : undefined }).toEqual({
        commandId,
        error: false,
        text: undefined,
      })
      expect(JSON.parse(result.text)).toMatchObject({
        commandId,
        status: 'succeeded',
        physical: 'succeeded',
        acknowledged: true,
      })
      const receipt = await current.storage.call('commandExecutionRead', {
        sessionId: session.id,
        actorId: device.device.id,
        operationKey,
      })
      expect(receipt).toMatchObject({ actorId: device.device.id, runId, physical: { status: 'succeeded' } })
    }
    const denied = await call('git.branch', { operation: 'create', name: 'denied-task-branch' }, 'deny', 'default')
    expect(denied.result.isError).toBe(true)
    expect(await git(root, 'branch', '--list', 'denied-task-branch')).toBe('')
    expect(
      await current.storage.call('commandExecutionRead', {
        sessionId: session.id,
        actorId: device.device.id,
        operationKey: denied.operationKey,
      }),
    ).toBeNull()
    const created = await call('git.branch', { operation: 'create', name: 'admitted-task-branch' }, 'allow', 'default')
    expect(created.result.isError).toBe(false)
    expect(await git(root, 'branch', '--list', 'admitted-task-branch')).toContain('admitted-task-branch')
    await Bun.write(join(root, 'proof.txt'), 'committed by the original task\n')
    const committed = await call(
      'git.commit',
      { message: 'Task command commit', paths: ['proof.txt'], stage: true },
      'allow',
      'default',
    )
    expect({
      error: committed.result.isError,
      text: committed.result.isError ? committed.result.text : undefined,
    }).toEqual({ error: false, text: undefined })
    expect(await git(root, 'log', '-1', '--format=%s')).toBe('Task command commit')
    const commit = z.object({ result: gitCommands['git.commit'].output }).parse(JSON.parse(committed.result.text))
    expect(commit.result.provenance).toMatchObject({ source: 'auto', sessionId: session.id, runId: committed.runId })
    const worktree = await call(
      'git.worktree',
      {
        operation: 'add',
        path: 'task-checkout',
        branch: 'admitted-worktree-branch',
        createBranch: true,
      },
      'allow',
      'default',
    )
    expect({
      error: worktree.result.isError,
      text: worktree.result.isError ? worktree.result.text : undefined,
    }).toEqual({ error: false, text: undefined })
    expect(await git(root, 'worktree', 'list', '--porcelain')).toContain('task-checkout')
    const removed = await call('git.worktree', { operation: 'remove', path: 'task-checkout' }, 'allow', 'default')
    expect(removed.result.isError).toBe(false)
    expect(await git(root, 'worktree', 'list', '--porcelain')).not.toContain('task-checkout')
    await createWorkflowCommandClient(client).execute(
      'workflow.start',
      {
        sessionId: session.id,
        objective: 'Inspect command scope',
        items: [
          {
            id: 'scope',
            title: 'Inspect scope',
            scope: { readPaths: ['.'], writePaths: ['.'], tools: ['hbar_command_execute'] },
            acceptanceChecks: [{ id: 'review', description: 'Review scope', verifier: { kind: 'user' } }],
          },
        ],
      },
      { idempotencyKey: 'git-command-workflow' },
    )
    const scoped = await call(
      'git.branch',
      { operation: 'create', name: 'outside-workflow-branch' },
      'allow',
      'default',
    )
    expect(scoped.result.isError).toBe(true)
    expect(scoped.result.text).toContain('git_branch')
    expect(await git(root, 'branch', '--list', 'outside-workflow-branch')).toBe('')
    const events = await current.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'tool.started' && event.runId === denied.runId)).toHaveLength(0)
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
