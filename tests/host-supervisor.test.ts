import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostSupervisor, STORAGE_FAILURE_RESTART_EXIT_CODE, type HostSupervisorExit } from '../apps/host/src/supervisor'
import { RecoveryPolicy } from '../apps/host/src/recovery-policy'

const owned: Array<ReturnType<typeof createHostSupervisor>> = []
const roots: string[] = []
afterEach(async () => {
  for (const supervisor of owned.splice(0)) await supervisor.stop()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-supervisor-'))
  roots.push(root)
  const entrypoint = join(root, 'host.ts')
  const log = join(root, 'launches.jsonl')
  await writeFile(
    entrypoint,
    `import { appendFile } from 'node:fs/promises'
await appendFile(${JSON.stringify(log)}, JSON.stringify({ args: Bun.argv.slice(2), time: Date.now() }) + '\\n')
${source}`,
  )
  return { root, log, entrypoint, connectionFile: join(root, 'connection.json') }
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Supervisor did not reach the expected state')
    await Bun.sleep(5)
  }
}

test('requested restart pins the IPC-discovered port and explicit stop prevents resurrection', async () => {
  const f = await fixture(`process.send?.({ type: 'host.ready', port: 43123 })
if (!Bun.argv.includes('43123')) setTimeout(() => process.exit(75), 20)
else setTimeout(() => process.exit(0), 20)`)
  const events: HostSupervisorExit[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: ['--port', '0', '--demo'],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    onExit(event) {
      events.push(event)
      if (events.length === 2) void supervisor.stop().catch(() => {})
    },
  })
  owned.push(supervisor)
  expect(await supervisor.run()).toBe(0)
  const invocations = (await readFile(f.log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { args: string[] })
  expect(invocations.map((item) => item.args)).toEqual([
    ['--port', '0', '--demo', '--supervised'],
    ['--port', '43123', '--demo', '--supervised'],
  ])
  expect(events.map((event) => [event.code, event.expectedRestart, event.reason])).toEqual([
    [75, true, 'exit'],
    [0, false, 'exit'],
  ])
  expect(supervisor.snapshot().phase).toBe('stopped')
})

test('unexpected exits retry past the fast budget even without a connection file', async () => {
  const f = await fixture('process.exit(23)')
  const events: HostSupervisorExit[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: [],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    fastDelaysMs: [20, 40, 80],
    slowDelayMs: 120,
    jitter: 0,
    onExit(event) {
      events.push(event)
      if (events.length === 5) void supervisor.stop().catch(() => {})
    },
  })
  owned.push(supervisor)
  expect(await supervisor.run()).toBe(0)
  const times = (await readFile(f.log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => (JSON.parse(line) as { time: number }).time)
  expect(times).toHaveLength(5)
  for (const [index, minimum] of [20, 40, 80, 120].entries())
    expect(times[index + 1]! - times[index]!).toBeGreaterThanOrEqual(minimum)
  expect(events.every((event) => event.code === 23)).toBe(true)
})

test('exit observer failures cannot disable recovery', async () => {
  const f = await fixture('process.exit(23)')
  let calls = 0
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: [],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    fastDelaysMs: [10, 10, 10],
    jitter: 0,
    onExit() {
      if (++calls === 2) void supervisor.stop().catch(() => {})
      throw new Error('observer fixture')
    },
  })
  owned.push(supervisor)
  expect(await supervisor.run()).toBe(0)
  expect(calls).toBe(2)
})

test('an event-loop stall loses heartbeats and is replaced by a healthy owner', async () => {
  const f = await fixture(`process.send?.({ type: 'host.ready', port: 43123 })
process.on('message', message => { if (message?.type === 'host.shutdown') process.exit(0) })
if (!Bun.argv.includes('43123')) setTimeout(() => { while (true) {} }, 10)
else setInterval(() => process.send?.({ type: 'host.heartbeat' }), 10)`)
  const events: HostSupervisorExit[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: [],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    heartbeatMs: 50,
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 200,
    fastDelaysMs: [10, 10, 10],
    jitter: 0,
    onExit: (event) => {
      events.push(event)
    },
  })
  owned.push(supervisor)
  const running = supervisor.run()
  await until(() => events.length === 1 && supervisor.snapshot().phase === 'serving')
  expect(events[0]?.reason).toBe('heartbeat_timeout')
  const pid = supervisor.snapshot().pid
  expect(pid).toBeNumber()
  await supervisor.stop()
  expect(await running).toBe(0)
  expect((await readFile(f.log, 'utf8')).trim().split('\n')).toHaveLength(2)
})

test('startup has a deadline and stopping cancels a long recovery delay', async () => {
  const f = await fixture('setInterval(() => {}, 1000)')
  const events: HostSupervisorExit[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: [],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    startupTimeoutMs: 200,
    heartbeatMs: 20,
    fastDelaysMs: [5_000, 5_000, 5_000],
    onExit: (event) => {
      events.push(event)
    },
  })
  owned.push(supervisor)
  const running = supervisor.run()
  await until(() => supervisor.snapshot().phase === 'recovering')
  expect(events[0]?.reason).toBe('startup_timeout')
  expect(supervisor.snapshot().nextAttemptAt).toBeNumber()
  const started = Date.now()
  await supervisor.stop()
  expect(await running).toBe(0)
  expect(Date.now() - started).toBeLessThan(1_000)
})

test('a stuck shutdown is killed within its deadline and never restarted', async () => {
  const f = await fixture(`process.send?.({ type: 'host.ready', port: 43123 })
setInterval(() => process.send?.({ type: 'host.heartbeat' }), 10)
process.on('message', () => {})`)
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint],
    hostArgs: [],
    connectionFile: f.connectionFile,
    stdio: 'ignore',
    heartbeatMs: 100,
    shutdownTimeoutMs: 50,
  })
  owned.push(supervisor)
  const running = supervisor.run()
  await until(() => supervisor.snapshot().phase === 'serving')
  const started = Date.now()
  await supervisor.stop()
  expect(await running).toBe(0)
  expect(Date.now() - started).toBeLessThan(1_500)
  await Bun.sleep(100)
  expect((await readFile(f.log, 'utf8')).trim().split('\n')).toHaveLength(1)
})

test('healthy time resets fast recovery, while repeated failures retain low frequency retries', () => {
  const policy = new RecoveryPolicy({ jitter: 0 })
  expect([0, 1, 2, 3, 4].map((now) => policy.failed(now).delayMs)).toEqual([250, 1_000, 4_000, 30_000, 30_000])
  policy.healthy(10)
  expect(policy.failed(60_009).delayMs).toBe(30_000)
  policy.healthy(100_000)
  expect(policy.failed(160_000)).toEqual({ failures: 1, delayMs: 250, nextAttemptAt: 160_250 })
})

test('storage exits enter low frequency recovery and explicit stop cancels the next attempt', async () => {
  const f = await fixture('process.exit(' + STORAGE_FAILURE_RESTART_EXIT_CODE + ')')
  const events: HostSupervisorExit[] = []
  const supervisor = createHostSupervisor({
    command: [process.execPath, f.entrypoint], hostArgs: [], connectionFile: f.connectionFile,
    stdio: 'ignore', fastDelaysMs: [1, 2, 4], slowDelayMs: 500, jitter: 0,
    onExit: event => { events.push(event) },
  })
  owned.push(supervisor)
  const running = supervisor.run()
  await until(() => events.length === 4 && supervisor.snapshot().phase === 'recovering')
  expect(events.every(event => event.code === STORAGE_FAILURE_RESTART_EXIT_CODE && !event.expectedRestart)).toBe(true)
  expect(supervisor.snapshot().failures).toBe(4)
  expect(supervisor.snapshot().nextAttemptAt! - Date.now()).toBeGreaterThan(300)
  await supervisor.stop()
  expect(await running).toBe(0)
  await Bun.sleep(550)
  expect(events).toHaveLength(4)
})
