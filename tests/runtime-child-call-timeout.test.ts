import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IpcPeer, procedure, runtimeReadySchema } from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

const timeoutDiagnostic = z.strictObject({
  event: z.literal('runtime.child_call_timeout'),
  code: z.literal('IPC_TIMEOUT'),
  unitId: z.string(),
  generation: z.number().int().positive(),
  incarnation: z.string(),
  childPid: z.number().int().positive(),
  remoteUnitId: z.string(),
  callId: z.uuid(),
  method: z.literal('fixture.hold'),
  elapsedMs: z.number().nonnegative(),
  timeoutMs: z.literal(80),
  started: z.literal(true),
  pending: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative(),
  incomingQueued: z.number().int().nonnegative(),
})

test('real runtime child retains one safe call timeout before its existing exit76 policy', async () => {
  const owner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  const remote: RuntimeOwner = { unitId: 'fixture', generation: 3, incarnation: crypto.randomUUID() }
  let peer: IpcPeer | undefined
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.resolve('@hbar/runtime/entry'))], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    windowsHide: true,
    serialization: 'json',
    env: {
      ...process.env,
      HBAR_RUNTIME_SELF: JSON.stringify(remote),
      HBAR_RUNTIME_PARENT: JSON.stringify(owner),
      HBAR_RUNTIME_MODULE: fileURLToPath(new URL('./fixtures/runtime-child-timeout-service.ts', import.meta.url)),
      HBAR_RUNTIME_PREPARATION: 'candidate',
    },
    ipc(value: unknown) {
      peer?.receive(value)
    },
  })
  peer = new IpcPeer({ owner, remote, transport: { send: (frame) => child.send(frame) } })
  const active = peer
  active.register(
    'fixture.hold',
    procedure(z.unknown(), z.string(), async (_input, call) => {
      if (!call.signal.aborted)
        await new Promise<void>((resolve) => {
          const done = () => {
            call.signal.removeEventListener('abort', done)
            resolve()
          }
          call.signal.addEventListener('abort', done, { once: true })
          void held.then(done)
        })
      return 'TIMEOUT_RETURN_CANARY'
    }),
  )
  const stderr = new Response(child.stderr).text()
  void child.exited.then(() => active.close()).catch(() => active.close())
  try {
    await active.call(
      'runtime.prepare',
      {
        descriptor: {
          id: 'fixture',
          kind: 'plugin',
          isolation: 'process',
          dependencies: [],
          required: true,
          reloadable: true,
          contractFingerprint: 'a'.repeat(64),
          storageSchema: 1,
        },
        configuration: {},
      },
      runtimeReadySchema,
      { timeoutMs: 2_000 },
    )
    await active.call('runtime.activate', { role: 'default' }, z.undefined(), { timeoutMs: 2_000 })
    let deadline: ReturnType<typeof setTimeout> | undefined
    let exitCode: number
    try {
      exitCode = await Promise.race([
        child.exited,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('Child timeout exit was not observed')), 3_000)
        }),
      ])
    } finally {
      clearTimeout(deadline)
    }
    expect(exitCode).toBe(76)
    const output = await stderr
    const prefix = '[hbar runtime timeout] '
    const lines = output.split(/\r?\n/).filter((line) => line.startsWith(prefix))
    expect(lines).toHaveLength(1)
    const line = lines[0]
    if (!line) throw new Error('Child call timeout evidence is missing')
    const decoded: unknown = JSON.parse(line.slice(prefix.length))
    const diagnostic = timeoutDiagnostic.parse(decoded)
    expect(diagnostic).toMatchObject({
      unitId: remote.unitId,
      generation: remote.generation,
      incarnation: remote.incarnation,
      childPid: child.pid,
      remoteUnitId: owner.unitId,
    })
    expect(diagnostic.elapsedMs).toBeGreaterThanOrEqual(50)
    expect(diagnostic.pending).toBeGreaterThanOrEqual(1)
    expect(diagnostic.inFlight).toBeGreaterThanOrEqual(1)
    expect(diagnostic.inFlight).toBeLessThanOrEqual(32)
    expect(output).not.toContain('TIMEOUT_INPUT_CANARY')
    expect(output).not.toContain('TIMEOUT_RETURN_CANARY')
    expect(output).not.toContain('TIMEOUT_REQUEST_ID_CANARY')
    expect(
      Object.keys(diagnostic).some((key) => ['input', 'result', 'message', 'stack', 'requestId'].includes(key)),
    ).toBe(false)
  } finally {
    release()
    active.close()
    if (child.exitCode === null) child.kill()
    await child.exited
    await stderr
  }
}, 10_000)
