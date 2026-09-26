import { afterEach, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { DecisionService } from '@hbar/plugin-sdk'
import { LayaDecisionRuntime, ManagedLayaBackend, layaConfigSchema } from '../plugins/decision-laya/src/index'

const resources: { root: string; runtime?: LayaDecisionRuntime; kernel?: Kernel }[] = []
afterEach(async () => {
  for (const item of resources.splice(0)) {
    await item.runtime?.dispose()
    await item.kernel?.close()
    await rm(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
const request = {
  state: 'Tests failed',
  questions: {
    action: {
      type: 'choice' as const,
      instructions: 'Choose the next action',
      criteria: { ship: 'Ship immediately', inspect: 'Inspect failed checks' },
    },
  },
}
const signal = () => new AbortController().signal

async function fixture(requestTimeoutMs = 2_000, device = 'auto') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-laya-process-'))
  const model = join(root, 'models', 'multilingual')
  await mkdir(model, { recursive: true })
  await writeFile(join(root, 'python'), 'fixture interpreter')
  await writeFile(join(model, 'model.safetensors'), 'fixture weights')
  await writeFile(join(model, 'rl_agent_config.json'), '{}')
  await writeFile(
    join(root, 'installation.json'),
    JSON.stringify({
      version: 1,
      runtimeVersion: '0.3.20',
      python: 'python',
      models: {
        multilingual: { directory: 'models/multilingual', repo: 'convaiinnovations/laya', revision: 'b'.repeat(40) },
      },
    }),
  )
  const config = layaConfigSchema.parse({ runtimeDirectory: root, startupTimeoutMs: 15_000, requestTimeoutMs, device })
  const children: ChildProcessWithoutNullStreams[] = []
  let descendantPid: number | undefined
  const backend = new ManagedLayaBackend(config, (_command, _args, options) => {
    const child = spawn(process.execPath, [resolve('tests/fixtures/laya-inference-process.ts')], options)
    children.push(child)
    child.stdout.on('data', (data: Buffer) => {
      const match = /"descendantPid":(\d+)/.exec(data.toString('utf8'))
      if (match?.[1]) descendantPid = Number(match[1])
    })
    return child
  })
  const runtime = new LayaDecisionRuntime(config, backend)
  resources.push({ root, runtime })
  return { root, runtime, children, descendant: () => descendantPid }
}

test('disposal terminates a managed descendant as well as its launcher', async () => {
  const { runtime, descendant } = await fixture(2_000, 'cpu')
  expect((await runtime.evaluate(request, signal())).status).toBe('evaluated')
  const pid = descendant()
  if (pid === undefined) throw new Error('Descendant fixture did not start')
  try {
    await runtime.dispose()
    const deadline = performance.now() + 2_000
    let alive = true
    while (alive && performance.now() < deadline) {
      try {
        process.kill(pid, 0)
      } catch {
        alive = false
      }
      if (alive) await new Promise<void>((done) => setTimeout(done, 10))
    }
    expect(alive).toBe(false)
  } finally {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* Already ended. */
    }
  }
}, 20_000)

test('managed Laya reuses one authenticated local process and exposes truncation before disposing it', async () => {
  const { runtime, children } = await fixture()
  const [first, second] = await Promise.all([
    runtime.evaluate(request, signal()),
    runtime.evaluate({ ...request, state: 'truncated' }, signal()),
  ])
  expect(first.status).toBe('evaluated')
  expect(second.metadata).toMatchObject({
    inputTruncated: true,
    questionsTruncated: ['action'],
    modelRevision: 'b'.repeat(40),
  })
  expect(children).toHaveLength(1)
  await runtime.dispose()
  expect(children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true)
}, 20_000)

test('process crashes, malformed and oversized responses fail explicitly and a later call can recover', async () => {
  const { runtime, children } = await fixture()
  for (const [state, code] of [
    ['malformed', 'INVALID_RESPONSE'],
    ['oversize', 'INVALID_RESPONSE'],
    ['crash', 'PROCESS_EXIT'],
  ] as const)
    expect(await runtime.evaluate({ ...request, state }, signal())).toMatchObject({ status: 'unavailable', code })
  expect((await runtime.evaluate(request, signal())).status).toBe('evaluated')
  expect(children).toHaveLength(2)
}, 20_000)

test('request timeout terminates its process before a later evaluation starts a replacement', async () => {
  const { runtime, children } = await fixture(100)
  expect(await runtime.evaluate({ ...request, state: 'hang' }, signal())).toMatchObject({ code: 'REQUEST_TIMEOUT' })
  expect(children[0]?.exitCode !== null || children[0]?.signalCode !== null).toBe(true)
  expect((await runtime.evaluate(request, signal())).status).toBe('evaluated')
  expect(children).toHaveLength(2)
}, 20_000)

test('incomplete installations fail before launch and can recover after the missing model is restored', async () => {
  const { root, runtime, children } = await fixture()
  await rm(join(root, 'models', 'multilingual', 'model.safetensors'))
  expect(await runtime.evaluate(request, signal())).toMatchObject({ code: 'MISSING_MODEL' })
  expect(children).toHaveLength(0)
  await writeFile(join(root, 'models', 'multilingual', 'model.safetensors'), 'fixture weights')
  expect((await runtime.evaluate(request, signal())).status).toBe('evaluated')
  expect(children).toHaveLength(1)
}, 20_000)

test('the source plugin installs through the managed package path, records evaluations and releases its service and tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-laya-plugin-'))
  const project = join(root, 'project')
  await mkdir(project)
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: project,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.installPlugin(resolve('plugins/decision-laya'))
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Workspace fixture missing')
  const session = await kernel.storage.call('createSession', workspace.id, 'Decision audit')
  const result = await kernel.plugins
    .get<DecisionService>('decision')
    .evaluate(request, signal(), { sessionId: session.id })
  expect(result).toMatchObject({ status: 'unavailable', code: 'NOT_CONFIGURED' })
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.some((event) => event.type === 'decision.evaluated')).toBe(true)
  expect(kernel.tools.get('decision_evaluate')).toBeDefined()
  const run = await kernel.submit(
    session.id,
    'decision-tool-run',
    {
      text: '/tool decision_evaluate ' + JSON.stringify(request),
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const runEvents = await kernel.storage.call('events', session.id, 0)
  expect(
    runEvents.some((event) => event.type === 'decision.evaluated' && event.runId === run.id),
    JSON.stringify((await kernel.snapshot(session.id)).messages),
  ).toBe(true)
  expect(
    (await kernel.snapshot(session.id)).messages.some((message) =>
      message.content.some((block) => block.type === 'tool_result' && block.name === 'decision_evaluate'),
    ),
  ).toBe(true)
  await kernel.changePlugin('@hbar/decision-laya', false)
  expect(kernel.tools.get('decision_evaluate')).toBeUndefined()
  expect(() => kernel.plugins.get<DecisionService>('decision')).toThrow('Service unavailable')
}, 20_000)
