import { HbarClient, createBudgetCommandClient, createModelCommandClient } from '@hbar/client'
import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const root = process.env.HBAR_E2E_DATA_ROOT
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const sessionCount = Math.max(1, Math.min(101, Number(process.env.HBAR_E2E_SESSION_COUNT ?? '1')))
const historyCount = Math.max(0, Math.min(1_000, Number(process.env.HBAR_E2E_HISTORY_COUNT ?? '0')))
const webOrigin = process.env.HBAR_E2E_WEB_ORIGIN
if (!root || !Number.isInteger(port)) throw new Error('E2E Host root and port are required')

await writeFile(`${root}/browser-e2e.md`, '# Browser file\n', 'utf8')
for (const arguments_ of [
  ['init'],
  ['config', 'user.email', 'browser-e2e@hbar.invalid'],
  ['config', 'user.name', 'hbar browser fixture'],
  ['add', 'browser-e2e.md'],
  ['commit', '-m', 'browser fixture'],
])
  execFileSync('git', arguments_, { cwd: root, stdio: 'ignore', windowsHide: true })

const kernel = await Kernel.create({ home: `${root}/data`, workspace: root, demo: true, secrets: new MemorySecrets() })
if (process.env.HBAR_E2E_GOAL_AUTO_CONTINUE === '0')
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
const workspace = (await kernel.storage.call('workspaces'))[0]!
let session = await kernel.createSession(workspace.id, sessionCount === 1 ? undefined : 'Session 001')
for (let index = 2; index <= sessionCount; index += 1)
  session = await kernel.createSession(workspace.id, `Session ${String(index).padStart(3, '0')}`)
for (let index = 1; index <= historyCount; index += 1)
  await kernel.storage.call(
    'commit',
    session.id,
    `history-run-${index}`,
    index % 2 === 0 ? 'assistant' : 'user',
    [{ type: 'text', text: `History message ${index}` }],
    `history-${index}`,
  )
const host = await startServer(kernel, { port, ...(webOrigin ? { origins: [webOrigin] } : {}) })
const response = await fetch(`http://127.0.0.1:${port}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: host.pairing.code, name: 'Web session E2E fixture' }),
})
if (!response.ok) throw new Error(`E2E Host pairing failed: ${response.status}`)
const { token } = (await response.json()) as { token: string }
const client = new HbarClient(`http://127.0.0.1:${port}`, token)
await client.connect()
const models = createModelCommandClient(client)
const configuration = await models.execute('session.getModel', { sessionId: session.id })
await models.execute(
  'session.setModel',
  { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: configuration.revisions },
  { idempotencyKey: 'web-e2e-model' },
)
await createBudgetCommandClient(client).execute(
  'session.setBudget',
  { sessionId: session.id, tokens: 100_000 },
  { idempotencyKey: 'web-e2e-budget' },
)
client.disconnect()
process.stdout.write(
  `${JSON.stringify({
    token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    sessionId: session.id,
    sessionTitle: session.title,
  })}\n`,
)

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())
await new Promise(() => {})
