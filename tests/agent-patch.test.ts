import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createAgentCommandClient } from '@hbar/client'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
}

async function fixture(usePatchDriver = true) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-patch-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'first.txt'), 'parent first\n')
  await writeFile(join(root, 'src', 'second.txt'), 'parent second\n')
  await git(root, 'init')
  await git(root, 'config', 'user.name', 'hbar test')
  await git(root, 'config', 'user.email', 'hbar@example.invalid')
  await git(root, 'add', 'src')
  await git(root, 'commit', '-m', 'fixture')
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Patch fixture driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Writes deterministic files inside the child workspace',
      scope: 'host' as const,
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          await writeFile(join(input.workspace.path, 'src', 'first.txt'), 'child first\n')
          await writeFile(join(input.workspace.path, 'src', 'second.txt'), 'child second\n')
          await input.commit('assistant', [{ type: 'text', text: 'Implemented both scoped files.' }])
        },
        summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
      })
    },
  })
  const home = join(root, '.hbar-data')
  const open = () =>
    Kernel.create({
      home,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      ...(usePatchDriver ? { profile: { replacements: { 'driver.pi': driver } } } : {}),
    })
  let kernel = await open()
  let workspace = (await kernel.storage.call('workspaces')).find((entry) => entry.path === root)!
  let parent = await kernel.createSession(workspace.id, 'parent')
  let host = await startServer(kernel, { port: 0 })
  let client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'agent patch test')
  let commands = createAgentCommandClient(client)
  const close = async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  }
  cleanups.push(async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  })
  const reopen = async () => {
    await close()
    kernel = await open()
    workspace = await kernel.storage.call('workspace', workspace.id)
    parent = await kernel.storage.call('session', parent.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'agent patch restart test')
    commands = createAgentCommandClient(client)
  }
  return {
    root,
    get kernel() {
      return kernel
    },
    get parent() {
      return parent
    },
    get commands() {
      return commands
    },
    reopen,
  }
}

async function createPatchAgent(resource: Awaited<ReturnType<typeof fixture>>, key: string) {
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: 'Update the two scoped fixture files',
      modelId: 'local-fixture',
      approval: 'deny',
      patchTask: {
        itemId: 'implementation',
        planRevision: 3,
        scope: { readPaths: ['src'], writePaths: ['src'], tools: [] },
        acceptanceChecks: [],
      },
    },
    { idempotencyKey: key },
  )
  await resource.kernel.waitForIdle()
  return resource.commands.execute('agent.result.get', {
    parentSessionId: resource.parent.id,
    agentId: record.agentId,
  })
}

test('isolated agents expose a durable patch and only change the parent after explicit apply', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-ready')
  expect(ready).toMatchObject({
    isolated: true,
    status: 'completed',
    resultSummary: 'Implemented both scoped files.',
    patch: { status: 'ready', planRevision: 3, files: [{ operation: 'update' }, { operation: 'update' }] },
  })
  const isolatedSession = await resource.kernel.storage.call('session', ready.sessionId)
  expect((await resource.kernel.storage.call('workspace', isolatedSession.workspaceId)).path).toStartWith(
    join(resource.root, '.hbar-worktrees'),
  )
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')

  await resource.reopen()
  const recovered = await resource.commands.execute('agent.result.get', {
    parentSessionId: resource.parent.id,
    agentId: ready.agentId,
  })
  expect(recovered.patch).toMatchObject({ patchId: ready.patch?.patchId, status: 'ready' })
  const applied = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-ready' },
  )
  expect(applied.patch?.status).toBe('applied')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('child first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('child second\n')
})

test('a parent conflict rejects the whole patch without partially writing other files', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-conflict')
  await writeFile(join(resource.root, 'src', 'second.txt'), 'parent changed concurrently\n')
  const conflict = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-conflict' },
  )
  expect(conflict.patch?.status).toBe('conflict')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('parent changed concurrently\n')
})

test('patch apply rejects isolated content that no longer matches the captured artifact hash', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-integrity')
  const isolatedSession = await resource.kernel.storage.call('session', ready.sessionId)
  const isolatedWorkspace = await resource.kernel.storage.call('workspace', isolatedSession.workspaceId)
  await writeFile(join(isolatedWorkspace.path, 'src', 'first.txt'), 'tampered after capture\n')
  const rejected = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-tampered' },
  )
  expect(rejected.patch?.status).toBe('rejected')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('parent second\n')
  await expect(stat(isolatedWorkspace.path)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('isolated patch agents reject process tools that cannot be confined to declared file paths', async () => {
  const resource = await fixture(false)
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: '/tool shell {"command":"echo should-not-run"}',
      modelId: 'local-fixture',
      approval: 'allow',
      patchTask: {
        itemId: 'implementation',
        planRevision: 3,
        scope: { readPaths: ['src'], writePaths: ['src'], tools: ['shell'] },
        acceptanceChecks: [],
      },
    },
    { idempotencyKey: 'isolated-process-denied' },
  )
  await resource.kernel.waitForIdle()
  const snapshot = await resource.kernel.snapshot(record.sessionId)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) =>
          block.type === 'tool_result' &&
          block.isError &&
          block.text.includes('cannot be confined to the delegated file scope'),
      ),
  ).toBeTrue()
  expect(
    await resource.commands.execute('agent.result.get', {
      parentSessionId: resource.parent.id,
      agentId: record.agentId,
    }),
  ).toMatchObject({ patch: null })
})
