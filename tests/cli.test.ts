import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
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
    ).toEqual(['session.getBudget', 'session.setBudget'])
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
    '"gpt-test"',
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
    effectiveValue: 'gpt-test',
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
        { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'workspace-model' },
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

test('classified command catalog and Run operations are usable without a GUI', async () => {
  const common = ['--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project]
  const created = await run([...common, 'session', 'new'])
  expect(created.code).toBe(0)
  common.push('--session', (JSON.parse(created.stdout) as { id: string }).id)
  const catalog = await run([...common, 'commands', 'list', '--category', 'run.approval'])
  expect(catalog.code).toBe(0)
  expect(
    (JSON.parse(catalog.stdout) as { items: { metadata: { id: string } }[] }).items.map((item) => item.metadata.id),
  ).toEqual(['approval.resolve', 'operation.cancel', 'operation.get', 'questionnaire.answer', 'run.submit'])
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
  const missing = await run([...common, 'exec', 'run.submit', '--idempotency-key', 'missing'])
  expect(missing.code).toBe(2)
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
