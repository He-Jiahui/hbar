import { appendFile } from 'node:fs/promises'
import { z } from 'zod'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../../apps/host/src/process-host-runtime'
import { startServer } from '../../apps/host/src/server'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const workspace = required('HBAR_RECOVERY_WORKSPACE')
const layout = createPathLayout(
  required('HBAR_RECOVERY_DATA'),
  required('HBAR_RECOVERY_CACHE'),
  required('HBAR_RECOVERY_POINTER'),
)
const trace = required('HBAR_RECOVERY_TRACE')
await appendFile(trace, 'runtime-open-start\n')
const runtime = await ProcessHostRuntime.open({
  layout,
  sourceRoot: required('HBAR_RECOVERY_SOURCE'),
  workspace,
  demo: true,
  noLocalExec: true,
  secrets: new MemorySecrets(),
})
await appendFile(trace, 'runtime-opened\n')
const startupProgress = setInterval(() => {
  const snapshot = runtime.snapshot()
  const admission = snapshot.admission
  process.stdout.write(
    `${JSON.stringify({
      type: 'debug',
      state: JSON.stringify({
        phase: admission?.phase,
        reasonCode: admission?.reasonCode,
        attempts: admission?.startup?.attempts,
      }),
    })}\n`,
  )
}, 2_000)
startupProgress.unref?.()
try {
  await runtime.ready(120_000)
} finally {
  clearInterval(startupProgress)
}
await appendFile(trace, 'runtime-created\n')
process.stdout.write(`${JSON.stringify({ type: 'debug', state: 'runtime-created' })}\n`)
const server = await startServer(runtime.kernel, {
  port: Number(required('HBAR_RECOVERY_PORT')),
  runtime,
  controller: runtime.controller,
  nodeLink: runtime.nodeLink,
})
const port = server.server.port
await appendFile(trace, 'server-started\n')
process.stdout.write(`${JSON.stringify({ type: 'debug', state: 'server-started' })}\n`)
process.stdout.write(`${JSON.stringify({ type: 'debug', state: 'server-started' })}\n`)
const send = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)
const requestEnvelopeSchema = z.strictObject({ id: z.string(), method: z.string(), args: z.unknown().optional() })

send({ type: 'ready', port })
async function handleLine(line: string): Promise<boolean> {
  let raw: unknown
  try {
    raw = JSON.parse(line) as unknown
  } catch {
    send({ type: 'error', error: 'invalid request' })
    return true
  }
  const envelope = requestEnvelopeSchema.safeParse(raw)
  if (!envelope.success) {
    send({ type: 'error', error: 'invalid request' })
    return true
  }
  const id = envelope.data.id
  try {
    let value: unknown
    if (envelope.data.method === 'invite') {
      value = await runtime.nodeLink.invite('recovery-builder')
    } else if (envelope.data.method === 'onlineNode') {
      const nodes = await runtime.nodeLink.list({ limit: 10 })
      value = nodes.items.find((node) => node.online)?.nodeId ?? null
    } else if (envelope.data.method === 'createSession') {
      const request = z
        .strictObject({
          id: z.string(),
          method: z.literal('createSession'),
          args: z.strictObject({ nodeId: z.string() }),
        })
        .parse(raw)
      await appendFile(trace, 'create-node-workspace-start\n')
      const target = await runtime.kernel.createNodeWorkspace({ nodeId: request.args.nodeId, rootId: 'engine' })
      await appendFile(trace, 'create-node-workspace-done\n')
      const session = await runtime.storage.call('createSession', target.id)
      await appendFile(trace, 'create-session-done\n')
      await runtime.kernel.setPermissionMode('allow')
      await appendFile(trace, 'permission-mode-done\n')
      value = { workspaceId: target.id, sessionId: session.id }
    } else if (envelope.data.method === 'submit') {
      const request = z
        .strictObject({
          id: z.string(),
          method: z.literal('submit'),
          args: z.strictObject({ sessionId: z.string(), command: z.string() }),
        })
        .parse(raw)
      await appendFile(trace, 'submit-start\n')
      value = await runtime.kernel.submit(
        request.args.sessionId,
        'node-intent-host-crash',
        { text: `/tool shell ${JSON.stringify({ command: request.args.command })}`, images: [] },
        'local-fixture',
      )
      await appendFile(trace, 'submit-done\n')
    } else if (envelope.data.method === 'recovery') {
      const request = z
        .strictObject({
          id: z.string(),
          method: z.literal('recovery'),
          args: z.strictObject({ sessionId: z.string(), runId: z.string() }),
        })
        .parse(raw)
      value = {
        run: await runtime.storage.call('run', request.args.runId),
        events: await runtime.storage.call('events', request.args.sessionId, 0, 4_000),
      }
    } else if (envelope.data.method === 'close') {
      send({ id, ok: true, value: null })
      return false
    } else {
      throw new Error('unsupported method')
    }
    send({ id, ok: true, value })
  } catch (error) {
    send({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
  return true
}
const reader = Bun.stdin.stream().getReader()
const decoder = new TextDecoder()
let pending = ''
let keepRunning = true
while (keepRunning) {
  const chunk = await reader.read()
  if (chunk.done) break
  pending += decoder.decode(chunk.value, { stream: true })
  const completeLines = pending.split('\n')
  pending = completeLines.pop() ?? ''
  for (const line of completeLines) {
    keepRunning = await handleLine(line)
    if (!keepRunning) break
  }
}
await reader.cancel()
await server.close()
await runtime.close()
