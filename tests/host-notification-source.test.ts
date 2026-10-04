import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createNotificationCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import { HbarClient } from '@hbar/client'

const resources: Array<{
  root: string
  kernel: Kernel
  host: Awaited<ReturnType<typeof startServer>>
  client: HbarClient
}> = []
afterEach(async () => {
  for (const item of resources.splice(0)) {
    item.client.disconnect()
    await item.host.close()
    await item.kernel.close()
    await rm(item.root, { recursive: true, force: true })
  }
})

test('run settled notification is durable, deduplicated and readable after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-notification-source-'))
  let kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'notification source')
  let host = await startServer(kernel, { port: 0 })
  let client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'notification test')
  const resource = { root, kernel, host, client }
  resources.push(resource)
  const run = await kernel.storage.call(
    'enqueue',
    session.id,
    'notification-test-run',
    { text: 'complete', images: [] },
    'local-fixture',
  )
  const settled = await kernel.storage.call('setRun', run.id, 'completed')
  const commands = createNotificationCommandClient(client)
  const page = await commands.page({ limit: 20, unreadOnly: false })
  const record = page.items.find(
    (item) => item.kind === 'run.completed' && item.target.kind === 'session' && item.target.sessionId === session.id,
  )
  expect(record).toBeDefined()
  expect(record?.sourceEventId).toBe(settled.eventId)
  expect(record?.target).toMatchObject({ runId: run.id })
  const before = page.items.length
  const duplicate = await kernel.storage.call('insertNotification', record!)
  expect(duplicate.inserted).toBe(false)
  expect((await commands.page({ limit: 20, unreadOnly: false })).items).toHaveLength(before)
  const failedRun = await kernel.storage.call(
    'enqueue',
    session.id,
    'notification-test-failed',
    { text: 'failed', images: [] },
    'local-fixture',
  )
  const failedEvent = await kernel.storage.call('setRun', failedRun.id, 'failed', 'fixture failure')
  const approvalEvent = await kernel.storage.call('createApproval', {
    id: 'approval-notification-test',
    sessionId: session.id,
    runId: failedRun.id,
    callId: 'call-1',
    tool: 'write_file',
    args: {},
    status: 'pending',
    createdAt: Date.now(),
  })
  const after = await commands.page({ limit: 50, unreadOnly: false })
  expect(after.items.some((item) => item.kind === 'run.failed' && item.sourceEventId === failedEvent.eventId)).toBe(
    true,
  )
  expect(
    after.items.some((item) => item.kind === 'approval.pending' && item.sourceEventId === approvalEvent.eventId),
  ).toBe(true)
  const prefs = await commands.preferences()
  expect(prefs['run.failed'].inApp).toBe(true)
  await commands.setPreferences({ ...prefs, 'run.failed': { inApp: false, desktop: false } })
  expect((await commands.preferences())['run.failed'].inApp).toBe(false)
  if (!record) throw new Error('Missing committed notification')
  await commands.markRead({ id: record.id, read: true })
  client.disconnect()
  await host.close()
  await kernel.close()
  kernel = await Kernel.create({ home: join(root, 'home'), workspace: root, demo: true, secrets: new MemorySecrets() })
  resource.kernel = kernel
  host = await startServer(kernel, { port: 0 })
  resource.host = host
  client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resource.client = client
  await client.pair(host.pairing.code, 'restarted notification test')
  const restored = createNotificationCommandClient(client)
  const restoredPage = await restored.page({ limit: 50 })
  expect(restoredPage.items).toHaveLength(after.items.length)
  expect(restoredPage.items.find((item) => item.id === record.id)?.readAt).not.toBeNull()
  expect((await restored.preferences())['run.failed'].inApp).toBe(false)
  expect((await kernel.storage.call('notificationBySourceEvent', settled.eventId))?.id).toBe(record.id)
})
