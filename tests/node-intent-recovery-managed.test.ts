import { expect, test } from 'bun:test'
import { appendFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { contentBlockSchema, runSchema } from '@hbar/contracts'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { nodeInviteSchema } from '@hbar/contracts/node-registry'
import { NodeStateStorage } from '@hbar/storage/node-state'

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Remote execution recovery did not converge before its deadline')
    await Bun.sleep(25)
  }
}

const responseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.string(), ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ id: z.string(), ok: z.literal(false), error: z.string() }),
])

function spawnHost(root: string, workspace: string, sourceRoot: string, port: number) {
  const entry = fileURLToPath(new URL('./fixtures/node-intent-recovery-host.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, entry], {
    env: {
      ...process.env,
      HBAR_RECOVERY_WORKSPACE: workspace,
      HBAR_RECOVERY_DATA: join(root, 'a-data'),
      HBAR_RECOVERY_CACHE: join(root, 'a-cache'),
      HBAR_RECOVERY_POINTER: join(root, 'a-pointer.json'),
      HBAR_RECOVERY_SOURCE: sourceRoot,
      HBAR_RECOVERY_TRACE: join(root, 'startup-trace'),
      HBAR_RECOVERY_PORT: String(port),
    },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  })
  const waiting = new Map<string, (response: z.infer<typeof responseSchema>) => void>()
  const startupTrace: string[] = []
  let stderrLog = ''
  const ready = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void readFile(join(root, 'startup-trace'), 'utf8')
        .then((trace) =>
          reject(
            new Error(
              `Managed Host helper did not become ready (${startupTrace.join(', ')}): ${trace}; stderr: ${stderrLog}`,
            ),
          ),
        )
        .catch(reject)
    }, 45_000)
    timeout.unref?.()
    const onLine = (line: string) => {
      let payload: unknown
      try {
        payload = JSON.parse(line) as unknown
      } catch {
        return
      }
      if (typeof payload !== 'object' || payload === null) return
      if ('type' in payload && payload.type === 'debug' && 'state' in payload && typeof payload.state === 'string') {
        startupTrace.push(payload.state)
        void appendFile(join(root, 'startup-trace'), `${payload.state}\n`).catch(reject)
        return
      }
      if ('type' in payload && payload.type === 'ready' && 'port' in payload && typeof payload.port === 'number') {
        clearTimeout(timeout)
        resolve(payload.port)
        return
      }
      const parsed = responseSchema.safeParse(payload)
      if (parsed.success) {
        waiting.get(parsed.data.id)?.(parsed.data)
        waiting.delete(parsed.data.id)
      }
    }
    void (async () => {
      const reader = child.stdout.getReader()
      const decoder = new TextDecoder()
      let pendingText = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        pendingText += decoder.decode(chunk.value, { stream: true })
        const completeLines = pendingText.split('\n')
        pendingText = completeLines.pop() ?? ''
        for (const line of completeLines) onLine(line)
      }
      const code = await child.exited
      reject(new Error(`Managed Host helper closed its output (${code}): ${stderrLog}`))
    })().catch(reject)
    void (async () => {
      const reader = child.stderr.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        const text = decoder.decode(chunk.value, { stream: true })
        stderrLog += text
        void appendFile(join(root, 'helper-stderr.log'), text).catch(reject)
      }
    })().catch(reject)
    void child.exited
      .then(async (code) => {
        clearTimeout(timeout)
        reject(new Error(`Managed Host helper exited before ready (${code}): ${stderrLog}`))
      })
      .catch(reject)
  })
  let nextId = 0
  return {
    child,
    ready,
    async call<T>(method: string, schema: z.ZodType<T>, args?: unknown): Promise<T> {
      const id = String(++nextId)
      const result = new Promise<z.infer<typeof responseSchema>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          waiting.delete(id)
          void readFile(join(root, 'startup-trace'), 'utf8')
            .then((trace) =>
              reject(new Error(`Managed Host ${method} request timed out: ${trace}; stderr: ${stderrLog}`)),
            )
            .catch(reject)
        }, 30_000)
        waiting.set(id, (response) => {
          clearTimeout(timeout)
          resolve(response)
        })
      })
      await child.stdin.write(`${JSON.stringify({ id, method, ...(args === undefined ? {} : { args }) })}\n`)
      const response = await result
      if (!response.ok) throw new Error(response.error)
      return schema.parse(response.value)
    },
  }
}

test.skipIf(process.platform !== 'linux')(
  'managed A process crash waits for B receipts and records EFFECT_UNKNOWN after real grace cleanup',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-node-intent-recovery-managed-'))
    const aWorkspace = join(root, 'a-workspace')
    const bWorkspace = join(root, 'b-workspace')
    const bHome = join(root, 'b-home')
    await mkdir(aWorkspace)
    await mkdir(bWorkspace)
    await mkdir(join(bWorkspace, '.git', 'hooks'), { recursive: true })
    await mkdir(bHome)
    const nodeState = new NodeStateStorage(join(bHome, 'node.sqlite'))
    await nodeState.call('ready', {})
    await nodeState.call(
      'floor.set',
      nodeFloorSchema.parse({
        roots: [{ rootId: 'engine', name: 'Engine', path: bWorkspace, access: 'write' }],
        process: true,
        osConfinement: 'required',
        onLinkLost: { action: 'terminate', graceMs: 1_500 },
      }),
    )
    await nodeState.close()

    const sourceRoot = process.env.HBAR_PRIVATE_SOURCE_ROOT ?? process.cwd()
    let host = spawnHost(root, aWorkspace, sourceRoot, 0)
    let port: number
    let node: ReturnType<typeof Bun.spawn> | undefined
    const counter = join(bWorkspace, 'started-count')
    const childPid = join(bWorkspace, 'command-pid')
    const finished = join(bWorkspace, 'finished')
    const heartbeat = join(bWorkspace, 'heartbeat')
    try {
      port = await host.ready
      const invitation = await host.call('invite', nodeInviteSchema)
      const entry = fileURLToPath(new URL('../apps/cli/src/main.ts', import.meta.url))
      const nodeProcess = Bun.spawn(
        [
          process.execPath,
          entry,
          'serve',
          '--role',
          'workspace',
          '--home',
          bHome,
          '--join',
          `http://127.0.0.1:${port}`,
          '--code',
          invitation.code,
          '--fingerprint',
          invitation.fingerprint,
        ],
        { stdout: 'ignore', stderr: 'pipe', windowsHide: true },
      )
      node = nodeProcess
      await until(async () => {
        if (nodeProcess.exitCode !== null) throw new Error(await new Response(nodeProcess.stderr).text())
        return (await host.call('onlineNode', z.string().nullable())) !== null
      })
      const nodeId = await host.call('onlineNode', z.string().nullable())
      if (!nodeId) throw new Error('The workspace node did not authenticate')
      const session = await host.call(
        'createSession',
        z.strictObject({ workspaceId: z.string(), sessionId: z.string() }),
        { nodeId },
      )
      const program = `const fs=require("node:fs");fs.appendFileSync(${JSON.stringify(counter)},"x"+String.fromCharCode(10));fs.writeFileSync(${JSON.stringify(childPid)},String(process.pid));setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),100);setTimeout(()=>fs.writeFileSync(${JSON.stringify(finished)},"done"),30000)`
      const command = `/usr/bin/node -e ${JSON.stringify(program)}`
      const run = await host.call('submit', runSchema, { sessionId: session.sessionId, command })
      await until(async () => {
        if ((await Bun.file(childPid).exists()) && (await Bun.file(heartbeat).exists())) return true
        const state = await host.call('recovery', z.object({ run: runSchema, events: z.array(z.unknown()) }), {
          sessionId: session.sessionId,
          runId: run.id,
        })
        if (['completed', 'failed', 'interrupted'].includes(state.run.status))
          throw new Error(`The remote shell ended before starting its effect: ${JSON.stringify(state)}`)
        await Bun.sleep(250)
        return false
      })
      const firstHeartbeat = await readFile(heartbeat, 'utf8')
      await Bun.sleep(300)
      expect(await readFile(heartbeat, 'utf8')).not.toBe(firstHeartbeat)

      process.kill(-host.child.pid, 'SIGKILL')
      await host.child.exited
      await until(async () => {
        const lastHeartbeat = await readFile(heartbeat, 'utf8')
        await Bun.sleep(500)
        return (await readFile(heartbeat, 'utf8')) === lastHeartbeat
      }, 20_000)
      expect(await Bun.file(finished).exists()).toBe(false)
      expect((await readFile(counter, 'utf8')).trim().split(/\r?\n/)).toHaveLength(1)

      host = spawnHost(root, aWorkspace, sourceRoot, port)
      await host.ready
      await until(async () => {
        const state = await host.call('recovery', z.object({ run: runSchema, events: z.array(z.unknown()) }), {
          sessionId: session.sessionId,
          runId: run.id,
        })
        return state.run.status === 'interrupted'
      })
      await until(async () => {
        const state = await host.call('recovery', z.object({ run: runSchema, events: z.array(z.unknown()) }), {
          sessionId: session.sessionId,
          runId: run.id,
        })
        return state.events.some((value) => {
          const event = z.object({ runId: z.string().nullable(), type: z.string() }).safeParse(value)
          return event.success && event.data.runId === run.id && event.data.type === 'message.committed'
        })
      })
      const state = await host.call('recovery', z.object({ run: runSchema, events: z.array(z.unknown()) }), {
        sessionId: session.sessionId,
        runId: run.id,
      })
      const unknownResult = state.events
        .flatMap((value) => {
          const event = z.object({ runId: z.string().nullable(), type: z.string(), data: z.unknown() }).safeParse(value)
          if (!event.success || event.data.runId !== run.id || event.data.type !== 'message.committed') return []
          const parsed = z.object({ content: z.array(contentBlockSchema) }).safeParse(event.data.data)
          return parsed.success ? parsed.data.content : []
        })
        .find((block) => block.type === 'tool_result' && block.name === 'shell')
      expect(unknownResult).toMatchObject({
        type: 'tool_result',
        isError: true,
        details: { code: 'EFFECT_UNKNOWN', executionStarted: true },
      })
      expect(state.run.status).toBe('interrupted')
      expect(await readFile(counter, 'utf8')).toBe('x\n')
    } finally {
      if (host.child.exitCode === null) {
        try {
          process.kill(-host.child.pid, 'SIGKILL')
        } catch {
          host.child.kill('SIGKILL')
        }
        await host.child.exited
      }
      if (node && node.exitCode === null) {
        node.kill('SIGKILL')
        await node.exited
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  360_000,
)
