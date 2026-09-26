import { HbarClient, createGoalPlanCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { z } from 'zod'
import { startServer } from '../../apps/host/src/server'

// Test-only historical seed: Goal mutations use the authenticated public API.
// Messages and one settled source=goal Run use the public StoragePort to model
// durable old history, not an actual automatic-continuation scheduler/provider.
const options = z
  .object({ root: z.string().min(1), port: z.coerce.number().int().positive(), origin: z.string().url() })
  .parse({
    root: process.env.HBAR_GOAL_WINDOW_ROOT,
    port: process.env.HBAR_E2E_HOST_PORT,
    origin: process.env.HBAR_GOAL_WINDOW_ORIGIN,
  })
const kernel = await Kernel.create({
  home: `${options.root}/data`,
  workspace: options.root,
  demo: true,
  secrets: new MemorySecrets(),
})
await kernel.changePlugin('goal.codex', true, { autoContinue: false })
const workspace = (await kernel.storage.call('workspaces'))[0]
if (!workspace) throw new Error('Missing fixture workspace')
const session = await kernel.createSession(workspace.id, 'Goal history message-window fixture')
const host = await startServer(kernel, { port: options.port, origins: [options.origin] })
const response = await fetch(`http://127.0.0.1:${options.port}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: host.pairing.code, name: 'Goal history message-window test' }),
})
if (!response.ok) throw new Error('Fixture pairing failed')
const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
const client = new HbarClient(`http://127.0.0.1:${options.port}`, token)
await client.connect()
const goals = createGoalPlanCommandClient(client)
const first = await goals.execute('goal.set', {
  sessionId: session.id,
  objective: 'Historical original objective — 历史原目标',
  status: 'paused',
  tokenBudget: 1000,
})
const firstId = first.goal?.goalId
if (!firstId) throw new Error('Missing original Goal identity')
const messages: { id: string; seq: number; text: string }[] = []
for (let index = 1; index <= 140; index += 1) {
  const text = `Window history message ${String(index).padStart(3, '0')}`
  const saved = await kernel.storage.call(
    'commit',
    session.id,
    `fixture-run-${index}`,
    index % 2 ? 'user' : 'assistant',
    [{ type: 'text', text }],
    `fixture-message-${index}`,
  )
  messages.push({ id: saved.message.id, seq: saved.message.seq, text })
  if (index !== 80) continue
  for (let update = 1; update <= 105; update += 1)
    await goals.execute('goal.set', { sessionId: session.id, expectedGoalId: firstId, tokenBudget: 1000 + update })
  await goals.execute('goal.update', { sessionId: session.id, status: 'complete' })
  const next = await goals.execute('goal.set', {
    sessionId: session.id,
    expectedGoalId: firstId,
    objective: 'Current different objective — 当前不同目标',
    status: 'paused',
  })
  if (!next.goal?.goalId) throw new Error('Missing current Goal identity')
  const continuation = await kernel.storage.call(
    'enqueue',
    session.id,
    'fixture-continuation',
    { text: '', images: [], source: 'goal', continuation: { goalId: next.goal.goalId, intentId: 'fixture-intent' } },
    'local-fixture',
  )
  await kernel.storage.call('claim', session.id)
  const empty = await kernel.storage.call(
    'commit',
    session.id,
    continuation.id,
    'user',
    [{ type: 'text', text: '' }],
    'fixture-empty-input',
  )
  const output = await kernel.storage.call(
    'commit',
    session.id,
    continuation.id,
    'assistant',
    [{ type: 'text', text: 'Durable continuation output — 持久续作输出' }],
    'fixture-continuation-output',
  )
  await kernel.storage.call('setRun', continuation.id, 'completed')
  messages.push(
    { id: empty.message.id, seq: empty.message.seq, text: '' },
    { id: output.message.id, seq: output.message.seq, text: 'Durable continuation output — 持久续作输出' },
  )
}
const latest = await goals.history({ sessionId: session.id, limit: 100 })
const older =
  latest.nextBeforeSeq === null
    ? null
    : await goals.history({
        sessionId: session.id,
        anchorSeq: latest.anchorSeq,
        beforeSeq: latest.nextBeforeSeq,
        limit: 100,
      })
const facts = [...(older?.items ?? []), ...latest.items]
const snapshot = await client.call('session.snapshot', { sessionId: session.id, limit: 60 })
const continuation = snapshot.runs.find((run) => run.input.source === 'goal')
if (!continuation || continuation.input.text !== '') throw new Error('Missing persisted empty-input continuation')
client.disconnect()
process.stdout.write(
  `${JSON.stringify({ token, workspaceId: workspace.id, sessionId: session.id, sessionTitle: session.title, facts, messages, runId: continuation.id, emptyInputId: 'fixture-empty-input', outputId: 'fixture-continuation-output', cursor: snapshot.cursor })}\n`,
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
