import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostSupervisor } from '../apps/host/src/supervisor.ts'

let root = ''
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

test('supervisor restarts only the requested exit and pins the discovered port', async () => {
  root = await mkdtemp(join(tmpdir(), 'hbar-supervisor-'))
  const entrypoint = join(root, 'fake-host.ts')
  const connectionFile = join(root, 'connection.json')
  const log = join(root, 'args.jsonl')
  const marker = join(root, 'restarted')
  const events: Array<{ code: number; signal: NodeJS.Signals | null; expectedRestart: boolean }> = []
  await writeFile(
    entrypoint,
    `import { appendFile, writeFile } from 'node:fs/promises'
const args = Bun.argv.slice(2)
await appendFile(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
if (!(await Bun.file(${JSON.stringify(marker)}).exists())) {
  await writeFile(${JSON.stringify(connectionFile)}, JSON.stringify({ url: 'http://127.0.0.1:43123' }))
  await writeFile(${JSON.stringify(marker)}, '1')
  process.exit(75)
}
process.exit(0)
`,
  )
  const supervisor = createHostSupervisor({
    command: [process.execPath, entrypoint],
    hostArgs: ['--port', '0', '--demo'],
    connectionFile,
    stdio: 'ignore',
    onExit: (event) => events.push(event),
  })
  expect(await supervisor.run()).toBe(0)
  const invocations = (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[])
  expect(invocations).toEqual([
    ['--port', '0', '--demo', '--supervised'],
    ['--port', '43123', '--demo', '--supervised'],
  ])
  expect(events).toEqual([
    { code: 75, signal: null, expectedRestart: true },
    { code: 0, signal: null, expectedRestart: false },
  ])
})

test('supervisor returns an ordinary Host exit without restarting it', async () => {
  root = await mkdtemp(join(tmpdir(), 'hbar-supervisor-stop-'))
  const entrypoint = join(root, 'fake-host.ts')
  const connectionFile = join(root, 'connection.json')
  const events: Array<{ code: number; signal: NodeJS.Signals | null; expectedRestart: boolean }> = []
  await writeFile(entrypoint, 'process.exit(23)\n')
  const supervisor = createHostSupervisor({
    command: [process.execPath, entrypoint],
    hostArgs: [],
    connectionFile,
    stdio: 'ignore',
    onExit: (event) => events.push(event),
  })
  expect(await supervisor.run()).toBe(23)
  expect(events).toEqual([{ code: 23, signal: null, expectedRestart: false }])
})

test('supervisor ignores exit observer failures', async () => {
  root = await mkdtemp(join(tmpdir(), 'hbar-supervisor-observer-'))
  const entrypoint = join(root, 'fake-host.ts')
  const connectionFile = join(root, 'connection.json')
  await writeFile(entrypoint, 'process.exit(23)\n')
  const supervisor = createHostSupervisor({
    command: [process.execPath, entrypoint],
    hostArgs: [],
    connectionFile,
    stdio: 'ignore',
    onExit: () => {
      throw new Error('fixture observer failure')
    },
  })
  expect(await supervisor.run()).toBe(23)
})
