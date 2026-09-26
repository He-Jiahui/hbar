import { Kernel, MemorySecrets } from '@hbar/kernel'
import { z } from 'zod'
import { startServer } from '../../apps/host/src/server'
import {
  authored,
  calls,
  otherRunText,
  otherSessionText,
  thinking,
} from '../../tests/fixtures/tool-result-copy-fixtures'

// Test-only durable transcript seed, not actual execution of any displayed tool.
// Browser reads the resulting real Host snapshots. No Run/provider/tool is started.
const options = z.object({ root: z.string().min(1), port: z.coerce.number().int().positive(), origin: z.url() }).parse({
  root: process.env.HBAR_COPY_FIXTURE_ROOT,
  port: process.env.HBAR_E2E_HOST_PORT,
  origin: process.env.HBAR_COPY_FIXTURE_ORIGIN,
})
const kernel = await Kernel.create({
  home: `${options.root}/data`,
  workspace: options.root,
  demo: true,
  secrets: new MemorySecrets(),
})
await kernel.changePlugin('goal.codex', true, { autoContinue: false })
const workspace = (await kernel.storage.call('workspaces'))[0]
if (!workspace) throw new Error('Missing owned fixture workspace')
const a = await kernel.createSession(workspace.id, 'Tool copy A — 原始输出所属会话')
const b = await kernel.createSession(workspace.id, 'Tool copy B — 另一个目标')
const aMessageId = 'copy-fixture-message-a'
await kernel.storage.call(
  'commit',
  a.id,
  'copy-fixture-run-a',
  'assistant',
  [
    { type: 'text', text: authored },
    { type: 'thinking', text: thinking },
    ...calls.map((call) => ({ type: 'tool_call' as const, callId: call.callId, name: call.name, args: call.args })),
  ],
  aMessageId,
)
await kernel.storage.call(
  'commit',
  a.id,
  'copy-fixture-run-a',
  'tool',
  calls.map((call) => ({
    type: 'tool_result' as const,
    callId: call.callId,
    name: call.name,
    text: call.text,
    isError: call.isError,
  })),
  'copy-fixture-results-a',
)
await kernel.storage.call(
  'commit',
  a.id,
  'copy-fixture-other-run',
  'assistant',
  [{ type: 'tool_call', callId: 'shared-call-id', name: 'read_file', args: { path: 'other-run.md' } }],
  'copy-fixture-message-other-run',
)
await kernel.storage.call(
  'commit',
  a.id,
  'copy-fixture-other-run',
  'tool',
  [{ type: 'tool_result', callId: 'shared-call-id', name: 'read_file', text: otherRunText, isError: false }],
  'copy-fixture-results-other-run',
)
await kernel.storage.call(
  'commit',
  b.id,
  'copy-fixture-run-b',
  'assistant',
  [{ type: 'tool_call', callId: 'shared-call-id', name: 'read_file', args: { path: 'fixture-B.md' } }],
  'copy-fixture-message-b',
)
await kernel.storage.call(
  'commit',
  b.id,
  'copy-fixture-run-b',
  'tool',
  [{ type: 'tool_result', callId: 'shared-call-id', name: 'read_file', text: otherSessionText, isError: false }],
  'copy-fixture-results-b',
)
const host = await startServer(kernel, { port: options.port, origins: [options.origin] })
const response = await fetch(`http://127.0.0.1:${options.port}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: host.pairing.code, name: 'Tool output clipboard test' }),
})
if (!response.ok) throw new Error('Fixture pairing failed')
const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
process.stdout.write(
  `${JSON.stringify({ token, workspaceId: workspace.id, workspaceName: workspace.name, sessionId: a.id, sessionTitle: a.title, otherSessionId: b.id, otherSessionTitle: b.title, aMessageId })}\n`,
)
let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
process.on('SIGINT', () => {
  void close().catch(() => process.exit(1))
})
process.on('SIGTERM', () => {
  void close().catch(() => process.exit(1))
})
await new Promise<void>(() => {})
