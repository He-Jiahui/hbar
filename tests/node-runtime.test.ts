import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { runNode, runNodeCommand } from '@hbar/node'
import { nodeConsoleConnectionSchema, nodeConsoleMethods } from '@hbar/contracts/node-console'
import { nodeProcessEnvironment, createManagedNodeBackend } from '@hbar/node/backend'
import { NodeStateStorage } from '@hbar/storage/node-state'

async function waitFor<T>(check: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const result = await check()
    if (result !== null) return result
    if (Date.now() > deadline) throw new Error('Node did not reach the expected state')
    await Bun.sleep(25)
  }
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
function shellScript(path: string): string {
  const executable = process.execPath.replaceAll("'", "''")
  const target = path.replaceAll("'", "''")
  return process.platform === 'win32' ? `& '${executable}' '${target}'` : `'${executable}' '${target}'`
}
const authority = {
  sessionId: 'session',
  runId: 'run',
  callId: 'call',
  sandbox: null,
  admission: { kind: 'allow' as const },
}
test('node operator CLI persists an independent floor and uses the authenticated live console', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-runtime-'))
  const home = join(root, 'node'),
    workspace = join(root, 'workspace')
  await mkdir(workspace)
  let runtime: Awaited<ReturnType<typeof runNode>> | undefined
  try {
    await runNodeCommand(['share', workspace, '--id', 'engine', '--access', 'write', '--home', home], () => {})
    runtime = await runNode(['--home', home], { registerSignals: false })
    const missing = await fetch(runtime.control.url, { method: 'POST', body: '{}' })
    expect(missing.status).toBe(401)
    const forbidden = await fetch(runtime.control.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + runtime.control.token },
      body: JSON.stringify({ method: 'models.secret', input: {} }),
    })
    expect(forbidden.status).toBe(400)
    let status: unknown
    await runNodeCommand(['status', '--home', home], (value) => {
      status = value
    })
    const parsedStatus = nodeConsoleMethods['node.status'].output.parse(status)
    expect(parsedStatus).toMatchObject({
      capabilities: { roots: [{ rootId: 'engine' }] },
      linked: false,
    })
    expect(parsedStatus.capabilities.sandbox).toEqual(runtime.node.capabilities().sandbox)
    await runNodeCommand(['pause', '--home', home], () => {})
    expect(runtime.node.isPaused).toBe(true)
    await runNodeCommand(['resume', '--home', home], () => {})
    expect(runtime.node.isPaused).toBe(false)
    const denial = await runtime.node.start({
      ...authority,
      rootId: 'engine',
      cwd: '.',
      command: 'echo denied',
      timeoutMs: 2_000,
      operationId: 'run:denied',
    })
    expect(denial).toMatchObject({
      state: 'settled',
      result: { details: { executionStarted: false, code: 'NODE_CONFINEMENT_UNAVAILABLE' } },
    })
    await runtime.close()
    runtime = undefined
    expect(await Bun.file(join(home, 'control.json')).exists()).toBe(false)
    expect(await Bun.file(join(home, 'host.sqlite')).exists()).toBe(false)
    let floor: unknown
    await runNodeCommand(['policy', 'show', '--home', home], (value) => {
      floor = value
    })
    expect(floor).toMatchObject({ roots: [{ rootId: 'engine' }], osConfinement: 'required' })
  } finally {
    await runtime?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test.skipIf(process.platform === 'win32')(
  'a real managed execution owner reaps inherited descendants before settling a result',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-node-process-'))
    const home = join(root, 'node'),
      workspace = join(root, 'workspace')
    await mkdir(workspace)
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    let leaf = 0
    const streamed: string[] = []
    try {
      const script = join(workspace, 'spawn.ts'),
        pidFile = join(workspace, 'pid')
      await writeFile(
        script,
        `import { writeFileSync } from 'node:fs'; const leaf = Bun.spawn([process.execPath, '-e', 'setInterval(()=>{},1000)'], {stdout:'inherit',stderr:'inherit',windowsHide:true}); writeFileSync(${JSON.stringify(pidFile)},String(leaf.pid)); console.log('node-command-ok'); process.exit(0)`,
      )
      backend = await createManagedNodeBackend({ dataRoot: home })
      const result = await backend.exec(workspace, shellScript(script), AbortSignal.timeout(15_000), {
        timeoutMs: 5_000,
        environment: {},
        environmentAllowlist: [],
        protectedPaths: [],
        confinement: null,
        onOutput: (text) => streamed.push(text),
      })
      expect(result.isError).toBe(false)
      expect(result.text).toContain('node-command-ok')
      expect(streamed.join('')).toContain('node-command-ok')
      leaf = Number(await readFile(pidFile, 'utf8'))
      expect(alive(leaf)).toBe(false)
    } finally {
      await backend?.dispose?.()
      if (leaf && alive(leaf)) process.kill(leaf, 'SIGKILL')
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

test('CLI workspace role starts without the interactive application and crash recovery never replays started work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-cli-'))
  const home = join(root, 'node')
  const entry = fileURLToPath(new URL('../apps/cli/src/main.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, entry, 'serve', '--role', 'workspace', '--home', home], {
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  let state: NodeStateStorage | undefined
  try {
    const connection = await waitFor(async () => {
      try {
        return nodeConsoleConnectionSchema.parse(JSON.parse(await readFile(join(home, 'control.json'), 'utf8')))
      } catch {
        if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text())
        return null
      }
    })
    const response = await fetch(connection.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + connection.token },
      body: JSON.stringify({ method: 'node.status', input: {} }),
    })
    expect(response.ok).toBe(true)
    expect(await response.json()).toMatchObject({ result: { capabilities: { roots: [] } } })
    child.kill('SIGKILL')
    await child.exited
    state = new NodeStateStorage(join(home, 'node.sqlite'))
    await state.call('ready', {})
    await state.call('operation.accept', {
      operationId: 'run:orphan',
      argumentsDigest: 'a'.repeat(64),
      kind: 'exec',
      authority,
    })
    await state.call('operation.start', { operationId: 'run:orphan' })
    await state.close()
    state = new NodeStateStorage(join(home, 'node.sqlite'))
    await state.call('ready', {})
    expect(await state.call('operation.get', { operationId: 'run:orphan' })).toMatchObject({
      receipt: { state: 'lost', reason: 'restart' },
    })
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    await child.exited
    await state?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test.skipIf(process.platform === 'win32')(
  'cancelling a managed command confirms descendant exit before returning cancellation',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-node-cancel-'))
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    let leaf = 0
    try {
      const pidFile = join(root, 'pid'),
        script = join(root, 'long.ts')
      await writeFile(
        script,
        `import { writeFileSync } from 'node:fs'; const leaf = Bun.spawn([process.execPath, '-e', 'setInterval(()=>{},1000)'], {windowsHide:true,stdout:'ignore',stderr:'ignore'}); writeFileSync(${JSON.stringify(pidFile)},String(leaf.pid)); setInterval(()=>{},1000)`,
      )
      backend = await createManagedNodeBackend({ dataRoot: join(root, 'node') })
      const controller = new AbortController()
      const execution = backend
        .exec(root, shellScript(script), controller.signal, {
          timeoutMs: 30_000,
          environment: {},
          environmentAllowlist: [],
          protectedPaths: [],
          confinement: null,
        })
        .then(
          () => null,
          (error: unknown) => error,
        )
      leaf = await waitFor(async () => {
        try {
          return Number(await readFile(pidFile, 'utf8'))
        } catch {
          return null
        }
      })
      expect(alive(leaf)).toBe(true)
      controller.abort()
      expect(await execution).toMatchObject({ code: 'CANCELLED' })
      expect(alive(leaf)).toBe(false)
    } finally {
      await backend?.dispose?.()
      if (leaf && alive(leaf)) process.kill(leaf, 'SIGKILL')
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

test('node environment inherits only the B allowlist and safe snapshot values', () => {
  process.env.HBAR_NODE_TEST_SECRET = 'private'
  process.env.HBAR_NODE_TEST_PUBLIC = 'allowed'
  try {
    const result = nodeProcessEnvironment(['HBAR_NODE_TEST_PUBLIC'], { APP_ENV: 'snapshot' })
    expect(result.HBAR_NODE_TEST_SECRET).toBeUndefined()
    expect(result.HBAR_NODE_TEST_PUBLIC).toBe('allowed')
    expect(result.APP_ENV).toBe('snapshot')
    expect(Object.keys(result).some((name) => name.toLowerCase() === 'path')).toBe(false)
    const pathAllowed = nodeProcessEnvironment(['PATH'], {})
    expect(Object.keys(pathAllowed).some((name) => name.toLowerCase() === 'path')).toBe(true)
    expect(() => nodeProcessEnvironment([], { NODE_OPTIONS: '--require attacker' })).toThrow('Unsafe')
  } finally {
    delete process.env.HBAR_NODE_TEST_SECRET
    delete process.env.HBAR_NODE_TEST_PUBLIC
  }
})

test('node CLI parameters reject incompatible or unknown floor fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-policy-'))
  try {
    await expect(runNodeCommand(['policy', 'set', 'network=perhaps', '--home', root], () => {})).rejects.toBeInstanceOf(
      z.ZodError,
    )
    await expect(runNodeCommand(['policy', 'set', 'secret=1', '--home', root], () => {})).rejects.toThrow('named floor')
    await expect(
      runNode(['--home', root, '--listen', '0.0.0.0:4318'], { registerSignals: false }),
    ).rejects.toMatchObject({ code: 'NODE_CONTROL_TLS_REQUIRED' })
    expect(await Bun.file(resolve(root, 'node.lock')).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
