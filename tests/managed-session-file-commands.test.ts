import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { sessionLaunchTargetSetReceiptSchema } from '@hbar/contracts/commands/session-launch-target'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function git(cwd: string, args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Fixture Git failed: ${stderr || stdout}`)
}

test('real managed sessions execute admitted file commands in their own checkout and preserve the original write receipt', async () => {
  const prefix = 'hbar-managed-session-files-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'baseline.txt'), 'base checkout')
  await git(repository, ['add', 'baseline.txt'])
  await git(repository, ['commit', '-q', '-m', 'fixture'])
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: repository,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const device = await host.auth.createDevice('Source file command operator')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  try {
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Source file fixture has no workspace')
    const sessions = createWorkspaceSessionCommandClient(client)
    const shared = await sessions.execute('session.create', { workspaceId: workspace.id }, { idempotencyKey: 'shared' })
    const isolated = await sessions.execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'isolated' },
    )
    const target = sessionLaunchTargetSetReceiptSchema.parse(
      await client.call('command.execute', {
        protocol: 1,
        requestId: crypto.randomUUID(),
        commandId: 'sessionLaunchTarget.set',
        commandVersion: 3,
        idempotencyKey: 'source-command-fixture-target',
        input: {
          sessionId: isolated.id,
          expectedRevision: 0,
          selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'codex/source-command-proof' } },
        },
      }),
    )
    expect(target.revision).toBe(1)
    let after: string | undefined
    do {
      const page = await client.call('command.catalog', { limit: 200, ...(after ? { after } : {}) })
      expect(page.items.some((item) => item.metadata.visibility === 'internal')).toBe(false)
      after = page.nextCursor
    } while (after)
    async function call(
      sessionId: string,
      commandId: string,
      input: Record<string, unknown>,
      operationKey: string = crypto.randomUUID(),
      approval: 'allow' | 'deny' = 'deny',
      mode: 'plan' | 'default' = 'plan',
      expectedError = false,
    ) {
      const accepted = await createRunCommandClient(client).execute(
        'run.submit',
        {
          sessionId,
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
      await runtime.waitForIdle()
      const snapshot = await runtime.kernel.snapshot(sessionId)
      expect(snapshot.runs.find((run) => run.id === accepted.operationId)?.status).toBe('completed')
      expect(snapshot.approvals).toHaveLength(0)
      const result = snapshot.messages
        .filter((message) => message.runId === accepted.operationId)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (!result || result.type !== 'tool_result') throw new Error('Source command returned no tool result')
      expect(result.isError).toBe(expectedError)
      return { text: result.text, runId: accepted.operationId, operationKey }
    }
    const read = z.object({
      status: z.literal('succeeded'),
      physical: z.literal('succeeded'),
      acknowledged: z.literal(true),
      result: z.object({ text: z.string() }),
    })
    expect(
      read.parse(
        JSON.parse((await call(shared.id, 'file.read', { workspaceId: workspace.id, path: 'baseline.txt' })).text),
      ).result.text,
    ).toBe('base checkout')
    const blockedInput = {
      workspaceId: workspace.id,
      path: 'blocked.txt',
      text: 'must not write',
      expectedSha256: null,
    }
    await call(shared.id, 'file.write', blockedInput, 'denied-write', 'deny', 'default', true)
    await call(shared.id, 'file.write', blockedInput, 'plan-write', 'allow', 'plan', true)
    expect(await Bun.file(join(repository, 'blocked.txt')).exists()).toBe(false)
    for (const operationKey of ['denied-write', 'plan-write'])
      expect(
        await runtime.storage.call('commandExecutionRead', {
          sessionId: shared.id,
          actorId: device.device.id,
          operationKey,
        }),
      ).toBeNull()
    // First materialize the isolated Run target, then diverge its file from the base checkout.
    await call(isolated.id, 'file.read', { workspaceId: workspace.id, path: 'baseline.txt' })
    const binding = (await runtime.storage.call('sessionLaunchTargetRuntime', isolated.id)).binding
    if (!binding) throw new Error('The isolated source Run did not bind its checkout')
    expect(binding.targetPath).not.toBe(repository)
    await writeFile(join(binding.targetPath, 'baseline.txt'), 'isolated checkout')
    expect(
      read.parse(
        JSON.parse((await call(isolated.id, 'file.read', { workspaceId: workspace.id, path: 'baseline.txt' })).text),
      ).result.text,
    ).toBe('isolated checkout')
    const fileInput = {
      workspaceId: workspace.id,
      path: 'proof.txt',
      text: 'source attributed write',
      expectedSha256: null,
    }
    const created = await call(isolated.id, 'file.write', fileInput, 'create-once', 'allow', 'default')
    expect(
      z
        .object({ status: z.literal('succeeded'), result: z.object({ created: z.literal(true) }) })
        .parse(JSON.parse(created.text)).result.created,
    ).toBe(true)
    expect(await readFile(join(binding.targetPath, 'proof.txt'), 'utf8')).toBe(fileInput.text)
    expect(await Bun.file(join(repository, 'proof.txt')).exists()).toBe(false)
    const receipt = await runtime.storage.call('commandExecutionRead', {
      sessionId: isolated.id,
      actorId: device.device.id,
      operationKey: 'create-once',
    })
    expect(receipt?.owner).toMatchObject({ kind: 'runtime', owner: { unitId: 'controller' } })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    await writeFile(join(binding.targetPath, 'proof.txt'), 'later external edit')
    const repeated = await call(isolated.id, 'file.write', fileInput, 'create-once', 'allow', 'default')
    expect(repeated.text).toBe(created.text)
    expect(
      (await runtime.storage.call('runFileChanges', isolated.id, repeated.runId, undefined, 50)).items,
    ).toHaveLength(0)
    expect(await readFile(join(binding.targetPath, 'proof.txt'), 'utf8')).toBe('later external edit')
    const listed = z
      .object({ result: z.object({ items: z.array(z.object({ path: z.string() })) }) })
      .parse(JSON.parse((await call(isolated.id, 'file.list', { workspaceId: workspace.id })).text))
    expect(listed.result.items.map((item) => item.path)).toContain('proof.txt')
    const found = z
      .object({ result: z.object({ paths: z.array(z.string()) }) })
      .parse(JSON.parse((await call(isolated.id, 'file.find', { workspaceId: workspace.id, query: 'proof' })).text))
    expect(found.result.paths).toContain('proof.txt')
    const changes = await runtime.storage.call('runFileChanges', isolated.id, created.runId, undefined, 50)
    expect(changes.items.map((item) => item.path)).toContain('proof.txt')
    expect(runtime.coordinator.snapshot().resources).toBe(0)
    expect(runtime.coordinator.snapshot().physicalTools).toBe(0)
    expect((await runtime.kernel.plugins.get('goal').get(isolated.id)).goal).toBeNull()
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
