import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'

let root = ''
let dataRoot = ''
let cacheRoot = ''
let project = ''
let hostPid = 0
const cli = resolve('apps/cli/src/main.ts')

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

async function run(args: string[], stdin?: string): Promise<CommandResult> {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: project || process.cwd(),
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout, stderr }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hbar-cli-'))
  dataRoot = join(root, 'data')
  cacheRoot = join(root, 'cache')
  project = join(root, 'project')
  await mkdir(project, { recursive: true })
})

afterAll(async () => {
  try {
    const connection = JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as {
      pid?: number
    }
    hostPid = connection.pid ?? hostPid
  } catch {
    // The help and argument tests do not create a Host.
  }
  if (hostPid) {
    try {
      process.kill(hostPid, 'SIGTERM')
    } catch {
      // The Host may already have exited after a failed integration assertion.
    }
    await Bun.sleep(200)
  }
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

test('help is available without starting a Host', async () => {
  const result = await run(['--help'])
  expect(result.code).toBe(0)
  expect(result.stdout).toContain('hbar [message...]')
  expect(result.stdout).toContain('--headless')
})

test('command catalog opens without a configured model or a selected session', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'hbar-catalog-'))
  const isolatedData = join(isolated, 'data')
  const isolatedCache = join(isolated, 'cache')
  const isolatedProject = join(isolated, 'project')
  await mkdir(isolatedProject, { recursive: true })
  let pid = 0
  try {
    const result = await run([
      '--data-root',
      isolatedData,
      '--cache-root',
      isolatedCache,
      '--project',
      isolatedProject,
      'commands',
      'list',
      '--category',
      'model.budget',
    ])
    expect(result.code).toBe(0)
    expect(
      (JSON.parse(result.stdout) as { items: { metadata: { id: string } }[] }).items.map((item) => item.metadata.id),
    ).toEqual(['session.clearBudget', 'session.getBudget', 'session.setBudget'])
    const connection = await run([
      '--data-root',
      isolatedData,
      '--cache-root',
      isolatedCache,
      '--project',
      isolatedProject,
      'commands',
      'describe',
      'connection.reconnect',
    ])
    expect(connection.code).toBe(0)
    expect(JSON.parse(connection.stdout)).toMatchObject({
      metadata: { id: 'connection.reconnect', execution: 'client', stateEffect: 'application' },
    })
    const missing = await run([
      '--data-root',
      isolatedData,
      '--cache-root',
      isolatedCache,
      '--project',
      isolatedProject,
      'exec',
      'operation.get',
      'missing-operation',
    ])
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).not.toContain('Model not found')
    const db = new Database(join(isolatedData, 'databases', 'hbar.sqlite'))
    try {
      expect((db.query('SELECT count(*) AS total FROM sessions').get() as { total: number }).total).toBe(0)
    } finally {
      db.close()
    }
    pid = (JSON.parse(await readFile(join(isolatedData, 'settings', 'connection.json'), 'utf8')) as { pid: number }).pid
  } finally {
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* Host may have already exited. */
      }
      await Bun.sleep(200)
    }
    await rm(isolated, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('headless JSONL streams parseable records and reuses its Host', async () => {
  const common = [
    '--headless',
    '--demo',
    '--data-root',
    dataRoot,
    '--cache-root',
    cacheRoot,
    '--project',
    project,
    '--output-format',
    'jsonl',
  ]
  const first = await run([...common, '--message', 'first'])
  expect(first.code).toBe(0)
  expect(first.stdout).not.toContain('\u001b')
  const lines = first.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; sessionId?: string })
  expect(lines[0]?.type).toBe('run.started')
  expect(lines.some((line) => line.type === 'run.completed')).toBe(true)
  const sessionId = lines[0]?.sessionId
  expect(sessionId).toBeString()

  const connectionPath = join(dataRoot, 'settings', 'connection.json')
  const connection = JSON.parse(await readFile(connectionPath, 'utf8')) as { pid: number }
  hostPid = connection.pid
  const second = await run([...common, '--session', sessionId!, '--model', 'local-fixture'], 'from stdin')
  expect(second.code).toBe(0)
  const after = JSON.parse(await readFile(connectionPath, 'utf8')) as { pid: number }
  expect(after.pid).toBe(hostPid)
  expect(
    second.stdout
      .trim()
      .split('\n')
      .every((line) => Boolean(JSON.parse(line))),
  ).toBe(true)
})

test('exec budget uses the same Host command, returns a receipt, and reconciles retries', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const sessionId = (JSON.parse(created.stdout) as { id: string }).id
  common.push('--session', sessionId)
  const first = await run([
    ...common,
    'exec',
    'session.setBudget',
    '500',
    '--idempotency-key',
    'cli-budget',
    '--expected-revision',
    'null',
  ])
  expect(first.code).toBe(0)
  const receipt = JSON.parse(first.stdout) as { revision: number; eventId: string; budget: { limit: number } }
  expect(receipt).toMatchObject({ revision: 1, budget: { limit: 500 } })
  const again = await run([
    ...common,
    'exec',
    'session.setBudget',
    '500',
    '--idempotency-key',
    'cli-budget',
    '--expected-revision',
    'null',
  ])
  expect(again.code).toBe(0)
  expect(JSON.parse(again.stdout)).toEqual(receipt)
  const queried = await run([...common, 'exec', 'session.getBudget'])
  expect(queried.code).toBe(0)
  expect(JSON.parse(queried.stdout)).toMatchObject({ limit: 500, revision: 1 })
  const recovered = await run([...common, 'exec', 'receipt', 'cli-budget'])
  expect(recovered.code).toBe(0)
  expect(JSON.parse(recovered.stdout)).toEqual(receipt)
  const conflict = await run([...common, 'exec', 'session.setBudget', '600', '--idempotency-key', 'cli-budget'])
  expect(conflict.code).toBe(9)
  expect(conflict.stderr).toContain('Key was already used')
  const cleared = await run([...common, 'exec', 'session.clearBudget'])
  expect(cleared.code).toBe(0)
  expect(JSON.parse(cleared.stdout)).toEqual({ cleared: true })
  const clearedAgain = await run([...common, 'exec', 'session.clearBudget'])
  expect(clearedAgain.code).toBe(0)
  expect(JSON.parse(clearedAgain.stdout)).toEqual({ cleared: false })
  const afterClear = await run([...common, 'exec', 'session.getBudget'])
  expect(afterClear.code).toBe(0)
  expect(JSON.parse(afterClear.stdout)).toBeNull()
})

test('exec file commands read and compare-and-write workspace files without requiring a session', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const source = join(root, 'replacement.txt')
  await writeFile(join(project, 'command-file.txt'), 'before', 'utf8')
  await writeFile(source, 'after', 'utf8')
  const read = await run([...common, 'exec', 'file.read', 'command-file.txt'])
  expect(read.code).toBe(0)
  const baseline = JSON.parse(read.stdout) as { sha256: string; text: string }
  expect(baseline.text).toBe('before')
  const write = await run([
    ...common,
    'exec',
    'file.write',
    'command-file.txt',
    '--input-file',
    source,
    '--expected-sha256',
    baseline.sha256,
  ])
  expect(write.code).toBe(0)
  expect(JSON.parse(write.stdout)).toMatchObject({ beforeSha256: baseline.sha256, created: false })
  expect(await readFile(join(project, 'command-file.txt'), 'utf8')).toBe('after')
  const stale = await run([
    ...common,
    'exec',
    'file.write',
    'command-file.txt',
    '--text',
    'stale',
    '--expected-sha256',
    baseline.sha256,
  ])
  expect(stale.code).toBe(9)
  expect(stale.stderr).toContain('changed')
  const listed = await run([...common, 'exec', 'file.list', '.'])
  expect(listed.code).toBe(0)
  expect(
    (JSON.parse(listed.stdout) as { items: { path: string }[] }).items.some((item) => item.path === 'command-file.txt'),
  ).toBe(true)
  const uploaded = await run([...common, 'exec', 'attachment.upload', source])
  expect(uploaded.code).toBe(0)
  const artifact = JSON.parse(uploaded.stdout) as { id: string; name: string; size: number }
  expect(artifact).toMatchObject({ name: 'replacement.txt', size: 5 })
  const queried = await run([...common, 'exec', 'attachment.query', artifact.id])
  expect(queried.code).toBe(0)
  expect(JSON.parse(queried.stdout)).toEqual(artifact)
  const catalog = await run([...common, 'commands', 'list', '--category', 'files.tools'])
  expect(catalog.code).toBe(0)
  expect(
    (JSON.parse(catalog.stdout) as { items: { metadata: { id: string } }[] }).items.map((item) => item.metadata.id),
  ).toContain('attachment.upload')
})

test('exec agent commands create and list child sessions through the shared command path', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const parent = JSON.parse(created.stdout) as { id: string }
  const child = await run([
    ...common,
    '--session',
    parent.id,
    'exec',
    'agent.create',
    'CLI child task',
    '--idempotency-key',
    'cli-agent',
    '--model',
    'local-fixture',
    '--token-budget',
    '400',
  ])
  expect(child.code).toBe(0)
  const agent = JSON.parse(child.stdout) as { agentId: string; parentSessionId: string }
  expect(agent.parentSessionId).toBe(parent.id)
  const listed = await run([...common, '--session', parent.id, 'exec', 'agent.list'])
  expect(listed.code).toBe(0)
  expect(JSON.parse(listed.stdout)).toMatchObject({ items: [{ agentId: agent.agentId, tokenBudget: 400 }] })
  const duplicate = await run([
    ...common,
    '--session',
    parent.id,
    'exec',
    'agent.create',
    'CLI child task',
    '--idempotency-key',
    'cli-agent',
    '--model',
    'local-fixture',
    '--token-budget',
    '400',
  ])
  expect(duplicate.code).toBe(0)
  expect((JSON.parse(duplicate.stdout) as { agentId: string }).agentId).toBe(agent.agentId)
})

test('exec browser commands navigate, inspect, and close the selected session page', async () => {
  const page = Bun.serve({
    port: 0,
    fetch: () => new Response('<html><head><title>CLI Browser</title></head><body>command page</body></html>'),
  })
  try {
    const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
    const created = await run([...common, 'session', 'new'])
    expect(created.code).toBe(0)
    const session = JSON.parse(created.stdout) as { id: string }
    const navigated = await run([
      ...common,
      '--session',
      session.id,
      'exec',
      'browser.navigate',
      `http://127.0.0.1:${page.port}/`,
    ])
    expect(navigated.code).toBe(0)
    const target = JSON.parse(navigated.stdout) as { contextId: string; pageId: string; title: string }
    expect(target.title).toBe('CLI Browser')
    const inspected = await run([
      ...common,
      '--session',
      session.id,
      '--browser-context',
      target.contextId,
      '--page',
      target.pageId,
      'exec',
      'browser.snapshot',
    ])
    expect(inspected.code).toBe(0)
    expect((JSON.parse(inspected.stdout) as { text: string }).text).toContain('command page')
    const closed = await run([
      ...common,
      '--session',
      session.id,
      '--browser-context',
      target.contextId,
      '--page',
      target.pageId,
      'exec',
      'browser.close',
    ])
    expect(closed.code).toBe(0)
    expect(JSON.parse(closed.stdout)).toEqual({ closed: true })
  } finally {
    await page.stop(true)
  }
})

test('exec computer status uses the selected session through the shared command path', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const session = JSON.parse(created.stdout) as { id: string }
  const status = await run([...common, '--session', session.id, 'exec', 'computer.status'])
  expect(status.code).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ appId: null })
  expect((JSON.parse(status.stdout) as { platform: string }).platform).toBeString()
})

test('exec Git queries use the workspace service through the shared command path', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const status = await run([...common, 'exec', 'git.status'])
  expect(status.code).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ root: null, dirty: false, entries: [] })
  const history = await run([...common, 'exec', 'git.log', '--limit', '1'])
  expect(history.code).toBe(0)
  expect(JSON.parse(history.stdout)).toEqual([])
})

test('exec workspace and session commands create, retry, rename, list, and export through one catalog', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const base = await run([...common, 'session', 'new'])
  expect(base.code).toBe(0)
  const created = await run([
    ...common,
    'exec',
    'session.create',
    'CLI entity',
    '--idempotency-key',
    'cli-session-create',
  ])
  expect(created.code).toBe(0)
  const session = JSON.parse(created.stdout) as { id: string }
  const duplicate = await run([
    ...common,
    'exec',
    'session.create',
    'CLI entity',
    '--idempotency-key',
    'cli-session-create',
  ])
  expect(duplicate.code).toBe(0)
  expect(JSON.parse(duplicate.stdout)).toEqual(session)
  const renamed = await run([...common, '--session', session.id, 'exec', 'session.rename', 'CLI renamed'])
  expect(renamed.code).toBe(0)
  expect(JSON.parse(renamed.stdout)).toMatchObject({ id: session.id, title: 'CLI renamed' })
  const listed = await run([...common, 'exec', 'session.list', '--title', 'CLI renamed'])
  expect(listed.code).toBe(0)
  expect(JSON.parse(listed.stdout)).toMatchObject({ items: [{ id: session.id }] })
  const exported = await run([...common, '--session', session.id, 'exec', 'session.export', '--limit', '1'])
  expect(exported.code).toBe(0)
  expect(JSON.parse(exported.stdout)).toMatchObject({ events: [{ type: 'session.created' }] })
})

test('exec settings reads, writes, unsets and atomically applies through the Host catalog', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const session = JSON.parse(created.stdout) as { id: string; workspaceId: string }
  const scope = ['--scope', 'session', '--session', session.id]
  const queried = await run([...common, 'exec', 'settings.get', 'provider.model', ...scope])
  expect(queried.code).toBe(0)
  const before = JSON.parse(queried.stdout) as {
    revisions: Record<string, number>
    resolution: { reports: Record<string, { effectiveValue: unknown; localPresence: boolean }> }
  }
  expect(Object.values(before.resolution.reports)[0]).toMatchObject({ effectiveValue: null, localPresence: false })
  const baseline = JSON.stringify(before.revisions)
  const setArgs = [
    ...common,
    'exec',
    'settings.set',
    'provider.model',
    ...scope,
    '--value-json',
    '"local-fixture"',
    '--baseline-json',
    baseline,
    '--idempotency-key',
    'cli-settings-set',
  ]
  const set = await run(setArgs)
  expect(set.code).toBe(0)
  const receipt = JSON.parse(set.stdout) as { commitId: string; revision: number }
  expect(receipt.revision).toBe(1)
  const retried = await run(setArgs)
  expect(retried.code).toBe(0)
  expect(JSON.parse(retried.stdout)).toEqual(receipt)
  const readSet = await run([...common, 'exec', 'settings.get', 'provider.model', ...scope])
  expect(readSet.code).toBe(0)
  expect(Object.values((JSON.parse(readSet.stdout) as typeof before).resolution.reports)[0]).toMatchObject({
    effectiveValue: 'local-fixture',
    localPresence: true,
  })

  const current = JSON.parse(readSet.stdout) as typeof before
  const unset = await run([
    ...common,
    'exec',
    'settings.unset',
    'provider.model',
    ...scope,
    '--baseline-json',
    JSON.stringify(current.revisions),
    '--idempotency-key',
    'cli-settings-unset',
  ])
  expect(unset.code).toBe(0)
  expect(
    Object.values((JSON.parse(unset.stdout) as { resolution: typeof before.resolution }).resolution.reports)[0],
  ).toMatchObject({
    effectiveValue: null,
    localPresence: false,
  })

  const workspaceGet = await run([
    ...common,
    'exec',
    'settings.get',
    '--scope',
    'workspace',
    '--workspace',
    session.workspaceId,
  ])
  expect(workspaceGet.code).toBe(0)
  const workspaceSnapshot = JSON.parse(workspaceGet.stdout) as typeof before
  const applied = await run([
    ...common,
    'exec',
    'settings.apply',
    '--input-json',
    JSON.stringify({
      schemaVersion: 1,
      scope: { kind: 'workspace', targetId: session.workspaceId },
      changes: [
        { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'local-fixture' },
        { op: 'set', path: [{ kind: 'field', name: 'provider.thinkingLevel' }], value: 'high' },
      ],
      baselineRevisions: workspaceSnapshot.revisions,
    }),
    '--idempotency-key',
    'cli-settings-apply',
  ])
  expect(applied.code).toBe(0)
  expect(JSON.parse(applied.stdout)).toMatchObject({
    layerId: `settings:workspace:${session.workspaceId}`,
    revision: 1,
  })
})

test('exec model commands persist session defaults through layered settings', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const models = await run([...common, 'exec', 'model.list'])
  expect(models.code).toBe(0)
  expect((JSON.parse(models.stdout) as { id: string }[]).some((model) => model.id === 'local-fixture')).toBeTrue()
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const sessionId = (JSON.parse(created.stdout) as { id: string }).id
  const target = ['--session', sessionId]
  const queried = await run([...common, 'exec', 'session.getModel', ...target])
  expect(queried.code).toBe(0)
  const before = JSON.parse(queried.stdout) as { revisions: Record<string, number> }
  const baseline = JSON.stringify(before.revisions)
  const setArgs = [
    ...common,
    'exec',
    'session.setModel',
    'local-fixture',
    ...target,
    '--baseline-json',
    baseline,
    '--idempotency-key',
    'cli-model-set',
  ]
  const selected = await run(setArgs)
  expect(selected.code).toBe(0)
  const selection = JSON.parse(selected.stdout) as {
    commitId: string
    revision: number
    revisions: Record<string, number>
    modelId: string
    thinkingLevel: string
  }
  expect(selection).toMatchObject({ modelId: 'local-fixture', thinkingLevel: 'high', revision: 1 })
  const retried = await run(setArgs)
  expect(retried.code).toBe(0)
  expect(JSON.parse(retried.stdout)).toEqual(selection)
  const thinking = await run([
    ...common,
    'exec',
    'session.setThinkingLevel',
    'high',
    ...target,
    '--baseline-json',
    JSON.stringify(selection.revisions),
    '--idempotency-key',
    'cli-thinking-set',
  ])
  expect(thinking.code).toBe(0)
  expect(JSON.parse(thinking.stdout)).toMatchObject({ modelId: 'local-fixture', thinkingLevel: 'high', revision: 2 })
  const readBack = await run([...common, 'exec', 'session.getModel', ...target])
  expect(readBack.code).toBe(0)
  expect(JSON.parse(readBack.stdout)).toMatchObject({
    status: 'configured',
    modelId: 'local-fixture',
    thinkingLevel: 'high',
  })
  const inherited = await run([
    ...common,
    '--headless',
    ...target,
    '--message',
    'use configured thinking',
    '--output-format',
    'jsonl',
  ])
  expect(inherited.code).toBe(0)
  const explicit = await run([
    ...common,
    '--headless',
    ...target,
    '--thinking',
    'off',
    '--message',
    'override configured thinking',
    '--output-format',
    'jsonl',
  ])
  expect(explicit.code).toBe(0)
  const db = new Database(join(dataRoot, 'databases', 'hbar.sqlite'), { readonly: true })
  try {
    const inputs = db.query('SELECT input FROM runs WHERE sessionId=? ORDER BY rowid').all(sessionId) as {
      input: string
    }[]
    expect(inputs.slice(-2).map((row) => (JSON.parse(row.input) as { thinking?: string }).thinking)).toEqual([
      'high',
      'off',
    ])
  } finally {
    db.close()
  }
})

test('exec configuration commands manage permission, mode, and provider facts through the Host catalog', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const sessionId = (JSON.parse(created.stdout) as { id: string }).id
  const target = ['--session', sessionId]

  const permission = await run([...common, ...target, 'exec', 'permission.set', 'allow'])
  expect(permission.code).toBe(0)
  expect(JSON.parse(permission.stdout)).toEqual({ mode: 'allow' })
  expect(JSON.parse((await run([...common, ...target, 'exec', 'permission.get'])).stdout)).toEqual({ mode: 'allow' })

  const mode = await run([...common, ...target, 'exec', 'mode.set', 'plan'])
  expect(mode.code).toBe(0)
  expect(JSON.parse(mode.stdout)).toEqual({ mode: 'plan' })
  expect(JSON.parse((await run([...common, ...target, 'exec', 'mode.get'])).stdout)).toEqual({ mode: 'plan' })

  const provider = {
    provider: {
      id: 'cli-provider',
      name: 'CLI provider',
      protocol: 'openai-responses',
      baseUrl: 'https://example.invalid/v1',
      model: 'cli-model',
    },
  }
  const saved = await run([...common, ...target, 'exec', 'provider.save', '--input-json', JSON.stringify(provider)])
  expect(saved.code).toBe(0)
  expect(JSON.parse(saved.stdout)).toMatchObject({ providerId: 'cli-provider', modelId: 'cli-model' })
  const deleted = await run([...common, ...target, 'exec', 'provider.delete', 'cli-provider'])
  expect(deleted.code).toBe(0)
  expect(JSON.parse(deleted.stdout)).toEqual({ deleted: true })
})

test('exec system commands query diagnostics, validate roots, and manage pairing without a session or model', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const diagnose = await run([...common, 'exec', 'system.diagnose'])
  expect(diagnose.code).toBe(0)
  expect(JSON.parse(diagnose.stdout)).toMatchObject({ host: { demo: true }, streams: 0 })
  const paths = await run([...common, 'exec', 'system.paths.get'])
  expect(paths.code).toBe(0)
  expect(JSON.parse(paths.stdout)).toMatchObject({ dataRoot, cacheRoot, restartRequired: false })
  const validatedData = join(root, 'validated-data')
  const validatedCache = join(root, 'validated-cache')
  const validated = await run([...common, 'exec', 'system.paths.validate', validatedData, validatedCache])
  expect(validated.code).toBe(0)
  expect(JSON.parse(validated.stdout)).toMatchObject({
    dataRoot: validatedData,
    cacheRoot: validatedCache,
    valid: true,
  })
  const devices = await run([...common, 'exec', 'device.list'])
  expect(devices.code).toBe(0)
  expect(JSON.parse(devices.stdout)).toBeArray()
  const pairing = await run([...common, 'exec', 'pairing.create'])
  expect(pairing.code).toBe(0)
  expect((JSON.parse(pairing.stdout) as { code: string }).code).toHaveLength(8)
  const restart = await run([...common, 'exec', 'system.restart'])
  expect(restart.code).toBe(0)
  expect(JSON.parse(restart.stdout)).toEqual({ accepted: false, restartRequired: true })
})

test('exec client connection commands expose status and disconnect without Host-side registration', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const status = await run([...common, 'exec', 'connection.status'])
  expect(status.code).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ status: 'connected', host: { demo: true } })
  const disconnected = await run([...common, 'exec', 'connection.disconnect'])
  expect(disconnected.code).toBe(0)
  expect(JSON.parse(disconnected.stdout)).toEqual({ status: 'disconnected', host: null })
})

test('exec extension commands and legacy aliases use the Host catalog without a session or model', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const list = await run([...common, 'exec', 'plugin.list'])
  expect(list.code).toBe(0)
  expect(JSON.parse(list.stdout)).toBeArray()
  const legacy = await run([...common, 'plugins', 'doctor'])
  expect(legacy.code).toBe(0)
  expect(JSON.parse(legacy.stdout)).toMatchObject({ ok: true })
  const skills = await run([...common, 'skills', 'list'])
  expect(skills.code).toBe(0)
  expect(JSON.parse(skills.stdout)).toBeArray()
})

test('exec questionnaire answers use the selected session command without requiring a model', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const sessionId = (JSON.parse(created.stdout) as { id: string }).id
  const requestId = crypto.randomUUID()
  const result = await run([
    ...common,
    'exec',
    'questionnaire.answer',
    requestId,
    '--session',
    sessionId,
    '--input-json',
    JSON.stringify({ scope: { answers: ['App'] } }),
  ])
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ sessionId, requestId, accepted: false })
})

test('exec goal and plan commands use plugin state without requiring a model', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const createdSession = await run([...common, 'session', 'new'])
  expect(createdSession.code).toBe(0)
  const sessionId = (JSON.parse(createdSession.stdout) as { id: string }).id
  const target = ['--session', sessionId]
  const empty = await run([...common, 'exec', 'goal.get', ...target])
  expect(empty.code).toBe(0)
  expect(JSON.parse(empty.stdout)).toEqual({ goal: null, remainingTokens: null })

  const created = await run([...common, 'exec', 'goal.create', 'CLI goal', ...target, '--token-budget', '1000'])
  expect(created.code).toBe(0)
  const goal = JSON.parse(created.stdout) as { goal: { goalId: string; objective: string; tokenBudget: number } }
  expect(goal.goal).toMatchObject({ objective: 'CLI goal', tokenBudget: 1_000 })
  const changed = await run([
    ...common,
    'exec',
    'goal.set',
    ...target,
    '--input-json',
    JSON.stringify({ objective: 'CLI goal updated', expectedGoalId: goal.goal.goalId }),
  ])
  expect(changed.code).toBe(0)
  expect((JSON.parse(changed.stdout) as typeof goal).goal.objective).toBe('CLI goal updated')

  const planInput = {
    explanation: 'CLI plan',
    plan: [
      { step: 'inspect', status: 'completed' },
      { step: 'ship', status: 'in_progress' },
    ],
  }
  const updated = await run([...common, 'exec', 'plan.update', ...target, '--input-json', JSON.stringify(planInput)])
  expect(updated.code).toBe(0)
  expect(JSON.parse(updated.stdout)).toMatchObject({ sessionId, ...planInput })
  const queried = await run([...common, 'exec', 'plan.get', ...target])
  expect(queried.code).toBe(0)
  expect(JSON.parse(queried.stdout)).toEqual(JSON.parse(updated.stdout))
  const cleared = await run([...common, 'exec', 'plan.clear', ...target])
  expect(cleared.code).toBe(0)
  expect(JSON.parse(cleared.stdout)).toEqual({ cleared: true })
})

test('classified command catalog and Run operations are usable without a GUI', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  common.push('--session', (JSON.parse(created.stdout) as { id: string }).id)
  const catalog = await run([...common, 'commands', 'list', '--category', 'run.approval'])
  expect(catalog.code).toBe(0)
  expect(
    (JSON.parse(catalog.stdout) as { items: { metadata: { id: string } }[] }).items.map((item) => item.metadata.id),
  ).toEqual([
    'approval.resolve',
    'context.compact',
    'operation.cancel',
    'operation.get',
    'permission.get',
    'permission.set',
    'questionnaire.answer',
    'run.retry',
    'run.submit',
  ])
  const description = await run([...common, 'commands', 'describe', 'run.submit'])
  expect(description.code).toBe(0)
  expect(JSON.parse(description.stdout)).toMatchObject({ metadata: { id: 'run.submit', category: 'run.approval' } })
  const clientDescription = await run([...common, 'commands', 'describe', 'app.setSession'])
  expect(clientDescription.code).toBe(0)
  expect(JSON.parse(clientDescription.stdout)).toMatchObject({
    metadata: { id: 'app.setSession', category: 'app.navigation', execution: 'client' },
  })
  const accepted = await run([
    ...common,
    'exec',
    'run.submit',
    '--message',
    'CLI command',
    '--idempotency-key',
    'cli-run',
  ])
  expect(accepted.code).toBe(0)
  const receipt = JSON.parse(accepted.stdout) as { operationId: string; status: string }
  expect(receipt.status).toBe('accepted')
  const duplicate = await run([
    ...common,
    'exec',
    'run.submit',
    '--message',
    'CLI command',
    '--idempotency-key',
    'cli-run',
  ])
  expect(duplicate.code).toBe(0)
  expect(JSON.parse(duplicate.stdout)).toEqual(receipt)
  const recovered = await run([...common, 'exec', 'receipt', 'run.submit', 'cli-run'])
  expect(recovered.code).toBe(0)
  expect(JSON.parse(recovered.stdout)).toEqual(receipt)
  const status = await run([...common, 'exec', 'operation.get', receipt.operationId])
  expect(status.code).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ operationId: receipt.operationId })
  const cancelled = await run([...common, 'exec', 'operation.cancel', receipt.operationId])
  expect(cancelled.code).toBe(0)
  expect(JSON.parse(cancelled.stdout)).toMatchObject({ operationId: receipt.operationId })
  let settled = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const inspected = await run([...common, 'exec', 'operation.get', receipt.operationId])
    expect(inspected.code).toBe(0)
    const operation = JSON.parse(inspected.stdout) as { status: string }
    if (!['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(operation.status)) {
      settled = true
      break
    }
    await Bun.sleep(10)
  }
  expect(settled).toBe(true)
  const retried = await run([...common, 'exec', 'run.retry', receipt.operationId, '--idempotency-key', 'cli-retry'])
  expect(retried.code).toBe(0)
  const retryReceipt = JSON.parse(retried.stdout) as { operationId: string; status: string }
  expect(retryReceipt).toMatchObject({ status: 'accepted' })
  expect(retryReceipt.operationId).not.toBe(receipt.operationId)
  const repeatedRetry = await run([
    ...common,
    'exec',
    'run.retry',
    receipt.operationId,
    '--idempotency-key',
    'cli-retry',
  ])
  expect(repeatedRetry.code).toBe(0)
  expect(JSON.parse(repeatedRetry.stdout)).toEqual(retryReceipt)
  const retryRecovered = await run([...common, 'exec', 'receipt', 'run.retry', 'cli-retry'])
  expect(retryRecovered.code).toBe(0)
  expect(JSON.parse(retryRecovered.stdout)).toEqual(retryReceipt)
  const missing = await run([...common, 'exec', 'run.submit', '--idempotency-key', 'missing'])
  expect(missing.code).toBe(2)
  const missingRetryKey = await run([...common, 'exec', 'run.retry', receipt.operationId])
  expect(missingRetryKey.code).toBe(2)
})

test('named contexts persist app.setSession with revision conflicts and supply later command targets', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const session = JSON.parse(created.stdout) as { id: string; workspaceId: string }
  const selected = await run([
    ...common,
    '--workspace',
    session.workspaceId,
    '--context',
    'review',
    'exec',
    'app.setSession',
    session.id,
  ])
  expect(selected.code).toBe(0)
  expect(JSON.parse(selected.stdout)).toMatchObject({
    revision: 1,
    workspaceId: session.workspaceId,
    sessionId: session.id,
  })
  const budget = await run([
    '--demo',
    '--data-root',
    dataRoot,
    '--cache-root',
    cacheRoot,
    '--context',
    'review',
    'exec',
    'session.getBudget',
  ])
  expect(budget.code).toBe(0)
  expect(JSON.parse(budget.stdout)).toBeNull()
  const updated = await run([
    ...common,
    '--workspace',
    session.workspaceId,
    '--context',
    'review',
    '--context-revision',
    '1',
    'exec',
    'app.setSession',
    session.id,
  ])
  expect(updated.code).toBe(0)
  expect(JSON.parse(updated.stdout)).toMatchObject({ revision: 2 })
  const stale = await run([
    ...common,
    '--workspace',
    session.workspaceId,
    '--context',
    'review',
    '--context-revision',
    '1',
    'exec',
    'app.setSession',
    session.id,
  ])
  expect(stale.code).toBe(9)
  expect(stale.stderr).toContain('changed')
})

test('line REPL accepts direct command IDs and shares the CLI command dispatcher', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  const sessionId = (JSON.parse(created.stdout) as { id: string }).id
  const repl = await run(
    [...common, '--session', sessionId, 'repl'],
    'session.getBudget\ncommands describe session.getBudget\nquit\n',
  )
  expect(repl.code).toBe(0)
  const lines = repl.stdout.trim().split('\n')
  expect(lines[0]).toBe('null')
  expect(JSON.parse(lines.slice(1).join('\n'))).toMatchObject({ metadata: { id: 'session.getBudget' } })
  expect(repl.stderr).toBe('')
})

test('headless approval modes deny, allow, and reject non-interactive ask', async () => {
  const common = [
    '--headless',
    '--demo',
    '--data-root',
    dataRoot,
    '--cache-root',
    cacheRoot,
    '--project',
    project,
    '--output-format',
    'jsonl',
  ]
  const denied = await run([
    ...common,
    '--approval',
    'deny',
    '--message',
    '/tool write_file {"path":"denied.txt","text":"blocked"}',
  ])
  expect(denied.code).toBe(0)
  expect(await Bun.file(join(project, 'denied.txt')).exists()).toBe(false)

  const allowed = await run([
    ...common,
    '--approval',
    'allow',
    '--message',
    '/tool write_file {"path":"allowed.txt","text":"written"}',
  ])
  expect(allowed.code).toBe(0)
  expect(await Bun.file(join(project, 'allowed.txt')).text()).toBe('written')

  const asked = await run([...common, '--approval', 'ask', '--message', 'cannot prompt'])
  expect(asked.code).toBe(3)
  expect(JSON.parse(asked.stdout) as { type: string }).toMatchObject({ type: 'error' })
})
