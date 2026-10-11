import { expect, test } from 'bun:test'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { ManagedProcess } from '@hbar/runtime'
import { hostRuntimeProcessCommand } from '../apps/host/src/runtime-package'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'

const port = createRuntimeProcessTreePort()
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Owned process tree did not settle')
    await Bun.sleep(10)
  }
}

test('native ownership rejects the Host itself before creating a process group', async () => {
  const error = await port.attach(process.pid, AbortSignal.timeout(1_000)).catch((error: unknown) => error)
  expect(error).toMatchObject({ code: 'RUNTIME_PROCESS_TREE_UNCONFIRMED' })
})

test('native ownership refuses release while descendants are live and terminates the entire tree', async () => {
  let leaf = 0
  const child = Bun.spawn(
    [process.execPath, fileURLToPath(new URL('./fixtures/runtime-native-tree.ts', import.meta.url))],
    {
      env: { ...process.env, ...port.environment },
      stdio: ['ignore', 'ignore', 'inherit'],
      windowsHide: true,
      serialization: 'json',
      ipc(message: unknown) {
        leaf = z.strictObject({ pid: z.number().int().positive() }).parse(message).pid
      },
    },
  )
  const tree = await port.attach(child.pid, AbortSignal.timeout(5_000))
  try {
    child.send('launch')
    await until(() => leaf > 0)
    expect(alive(leaf)).toBe(true)
    const unjoined = await tree.join(30).catch((error: unknown) => error)
    expect(unjoined).toMatchObject({ code: 'RUNTIME_PROCESS_TREE_UNCONFIRMED' })
    expect(() => tree.close()).toThrow('exit is unconfirmed')
    expect(alive(leaf)).toBe(true)
    if (process.platform === 'win32') {
      // Terminate only the Bun PID; the detached native child is still owned by the stable Job.
      process.kill(child.pid, 'SIGKILL')
      await child.exited
      const afterOwnerExit = await tree.join(30).catch((error: unknown) => error)
      expect(afterOwnerExit).toMatchObject({ code: 'RUNTIME_PROCESS_TREE_UNCONFIRMED' })
      expect(alive(leaf)).toBe(true)
    }
    tree.terminate()
    await tree.join(5_000)
    tree.close()
    await child.exited
    await until(() => !alive(leaf))
    tree.terminate()
    tree.close()
  } finally {
    tree.terminate()
    await tree.join(5_000)
    tree.close()
    await child.exited
  }
}, 15_000)

test('actual managed faults and stuck disposal terminate descendants before physical ownership is released', async () => {
  const released: number[] = []
  let leaf = 0,
    faults = 0
  const unit = new ManagedProcess({
    descriptor: {
      id: 'native.fixture',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 23,
    },
    artifactId: 'c'.repeat(64),
    modulePath: fileURLToPath(new URL('./fixtures/runtime-service.ts', import.meta.url)),
    parent: { unitId: 'base', generation: 1, incarnation: 'owned-native-root' },
    generation: 1,
    command: hostRuntimeProcessCommand(),
    processTree: port,
    configuration: { hangDispose: true },
    heartbeatMs: 200,
    startupMs: 10_000,
    shutdownMs: 500,
    retryDelaysMs: [50, 100, 200],
    jitter: 0,
    onFault: async () => {
      faults++
    },
    onExit: async () => {
      expect(alive(leaf)).toBe(false)
      released.push(leaf)
    },
  })
  try {
    await unit.prepare()
    await unit.activate()
    leaf = await unit.call('fixture.spawn', undefined, z.number().int().positive())
    expect(alive(leaf)).toBe(true)
    const incarnation = unit.owner().incarnation
    const crash = await unit.call('fixture.crash', undefined, z.undefined()).catch((error: unknown) => error)
    expect(crash).toMatchObject({ code: 'IPC_DISCONNECTED' })
    await until(() => unit.snapshot().phase === 'serving' && unit.owner().incarnation !== incarnation)
    expect(faults).toBe(1)
    expect(released).toEqual([leaf])
    expect(alive(leaf)).toBe(false)
    leaf = await unit.call('fixture.spawn', undefined, z.number().int().positive())
    const start = Date.now()
    await unit.dispose()
    expect(Date.now() - start).toBeLessThan(1_500)
    expect(alive(leaf)).toBe(false)
    await Bun.sleep(250)
    expect(unit.snapshot()).toMatchObject({ phase: 'disposed', pid: null, nextAttemptAt: null })
    expect(faults).toBe(1)
    expect(released).toHaveLength(2)
  } finally {
    await unit.dispose()
  }
}, 20_000)

test.skipIf(process.platform !== 'win32')(
  'killing the stable holder closes its Job and leaves no owned process or detached leaf behind',
  async () => {
    let owner = 0,
      leaf = 0,
      ready = false
    const child = Bun.spawn(
      [process.execPath, fileURLToPath(new URL('./fixtures/runtime-native-holder.ts', import.meta.url))],
      {
        stdio: ['ignore', 'ignore', 'inherit'],
        windowsHide: true,
        serialization: 'json',
        ipc(value: unknown) {
          const result = z
            .union([
              z.strictObject({ ready: z.literal(true) }),
              z.strictObject({ owner: z.number().int().positive(), leaf: z.number().int().positive() }),
            ])
            .parse(value)
          if ('ready' in result) ready = true
          else {
            owner = result.owner
            leaf = result.leaf
          }
        },
      },
    )
    try {
      await until(() => ready)
      child.send('launch')
      await until(() => leaf > 0)
      expect(alive(owner)).toBe(true)
      expect(alive(leaf)).toBe(true)
      process.kill(child.pid, 'SIGKILL')
      await child.exited
      await until(() => !alive(owner) && !alive(leaf))
      expect(alive(owner)).toBe(false)
      expect(alive(leaf)).toBe(false)
    } finally {
      if (child.exitCode === null) {
        child.send('close')
        await child.exited
      }
    }
  },
  15_000,
)
