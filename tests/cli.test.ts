import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
    const connection = JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as { pid?: number }
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

test('headless JSONL streams parseable records and reuses its Host', async () => {
  const common = ['--headless', '--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project, '--output-format', 'jsonl']
  const first = await run([...common, '--message', 'first'])
  expect(first.code).toBe(0)
  expect(first.stdout).not.toContain('\u001b')
  const lines = first.stdout.trim().split('\n').map((line) => JSON.parse(line) as { type: string; sessionId?: string })
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
  expect(second.stdout.trim().split('\n').every((line) => Boolean(JSON.parse(line)))).toBe(true)
})

test('headless approval modes deny, allow, and reject non-interactive ask', async () => {
  const common = ['--headless', '--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', project, '--output-format', 'jsonl']
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
