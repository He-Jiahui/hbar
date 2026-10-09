import { Database } from 'bun:sqlite'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { realpath, utimes, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { chatDatabaseOperationSchema } from '@hbar/contracts/commands/chat-database'
import { startServer } from '../apps/host/src/server'

const root = await realpath(z.string().min(1).parse(process.env.HBAR_E2E_DATA_ROOT))
if (
  dirname(root).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
  !basename(root).startsWith('hbar-chat-browser-')
)
  throw new Error('Chat database fixture requires its owned temporary root')
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.HBAR_E2E_HOST_PORT)
const kernel = await Kernel.create({
  home: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
})
const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === root)
if (!workspace) throw new Error('Missing fixture workspace')
const current = await kernel.createSession(workspace.id, 'Database monitor chat — 当前聊天')
const deletion = process.env.HBAR_E2E_CHAT_DELETION === '1'
if (deletion) {
  const other = await kernel.createSession(workspace.id, 'Kept chat — 其他聊天')
  for (const session of [current, other]) {
    await kernel.storage.call('commit', session.id, `fixture-${session.id}`, 'user', [
      { type: 'text', text: `Actual saved history in ${session.title}` },
    ])
  }
}
for (let index = 0; index < (deletion ? 0 : 65); index++) {
  const session = await kernel.createSession(
    workspace.id,
    `Archived ${String(index + 1).padStart(3, '0')} — ${'很长的历史聊天名称与英文说明 Long archived conversation title '.repeat(2)}`,
  )
  await kernel.storage.call('commit', session.id, `fixture-${index}`, 'user', [
    { type: 'text', text: `Real history ${index} ${'测试 history '.repeat(150)}` },
  ])
  await kernel.storage.call('updateSession', session.id, { archived: true })
}
while (!(await kernel.storage.call('chatDatabaseUsageBackfill', 250)).complete) {
  /* bounded projections */
}
const db = new Database(kernel.options.layout.database, { strict: true })
db.query(
  'UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId IN (SELECT id FROM sessions WHERE archived=1 OR ?=1)',
).run(Date.now() - 100 * 86_400_000, deletion ? 1 : 0)
db.exec(
  'CREATE TABLE browser_vacuum_fixture(bytes BLOB); INSERT INTO browser_vacuum_fixture VALUES(randomblob(2097152)); DELETE FROM browser_vacuum_fixture; PRAGMA wal_checkpoint(TRUNCATE);',
)
db.close()
await writeFile(join(kernel.options.layout.cache.markdown, 'expired.html'), 'rebuildable fixture cache'.repeat(100))
await utimes(join(kernel.options.layout.cache.markdown, 'expired.html'), 0, 0)
// Historical receipts are test-only records, while all statistics and cleanup execute on real storage.
for (let index = 0; index < (deletion ? 0 : 52); index++) {
  const time = Date.now() - 2 * 86_400_000 - index * 1000
  const operation = chatDatabaseOperationSchema.parse({
    schemaVersion: 1,
    operationId: `browser-history-${index}`,
    type: 'preview',
    kind: 'sessions',
    scope: { kind: 'global' },
    trigger: 'manual',
    status: 'completed',
    stage: 'finished',
    version: 1,
    createdAt: time,
    updatedAt: time,
    completedAt: time,
    previewId: null,
    expiresAt: time,
    policyRevisions: {},
    candidateCount: 0,
    totalCount: 0,
    processedCount: 0,
    deletedCount: 0,
    estimatedBytes: 0,
    reclaimedBytes: 0,
    reusableDatabaseBytes: 0,
    remainingBytes: null,
    targetBytes: null,
    skipped: [],
    cancellationRequested: false,
    error: null,
  })
  await kernel.storage.call('chatDatabaseOperationAccept', {
    actorId: 'fixture',
    idempotencyKey: operation.operationId,
    request: JSON.stringify(operation),
    operation,
  })
}
const origin = process.env.HBAR_E2E_WEB_ORIGIN
const host = await startServer(kernel, { port, ...(origin ? { origins: [origin] } : {}) })
const device = await host.auth.createDevice('Chat database browser fixture')
process.stdout.write(
  `${JSON.stringify({
    token: device.token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    sessionId: current.id,
    sessionTitle: current.title,
  })}\n`,
)
let closing = false
const close = async () => {
  if (closing) return
  closing = true
  try {
    await host.close()
    await kernel.close()
    process.exit(0)
  } catch {
    process.stderr.write('Owned chat database fixture cleanup failed\n')
    process.exit(1)
  }
}
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())
await new Promise<void>(() => {})
