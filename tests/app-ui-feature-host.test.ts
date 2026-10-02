import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  HbarClient,
  createNotificationCommandClient,
  createPromptTemplateCommandClient,
  createRunBoardCommandClient,
  createScheduleCommandClient,
} from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import { COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { z } from 'zod'

const resources: Array<{
  root: string
  kernel: Kernel
  client?: HbarClient
  host?: Awaited<ReturnType<typeof startServer>>
}> = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-app-ui-feature-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'Feature host test')
  const host = await startServer(kernel, { port: 0 })
  const baseUrl = `http://127.0.0.1:${host.server.port}`
  const response = await fetch(`${baseUrl}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.pairing.code, name: 'feature-host-test' }),
  })
  const auth: unknown = await response.json()
  const { token } = z.object({ token: z.string().min(1) }).parse(auth)
  const client = new HbarClient(baseUrl, token)
  await client.connect()
  const value = { root, kernel, client, host, workspace, session, token }
  resources.push(value)
  return value
}
afterEach(async () => {
  for (const item of resources.splice(0)) {
    item.client?.disconnect()
    await item.host?.close()
    await item.kernel.close()
    await rm(item.root, { recursive: true, force: true })
  }
})

describe('app-ui production feature command pipelines', () => {
  test('feature records survive host restart and same-actor template receipt replay', async () => {
    const value = await fixture()
    const input = {
      workspaceId: value.workspace.id,
      name: 'Restart template',
      description: 'durable',
      body: 'Run {{task}}',
      variables: [{ id: 'task', label: 'Task', required: true }],
    }
    const first = createPromptTemplateCommandClient(value.client)
    const created = await first.execute('promptTemplate.save', input, { idempotencyKey: 'restart-template-1' })
    await value.host.close()
    value.client.disconnect()
    value.host = await startServer(value.kernel, { port: 0 })
    value.client = new HbarClient(`http://127.0.0.1:${value.host.server.port}`, value.token)
    await value.client.connect()
    const second = createPromptTemplateCommandClient(value.client)
    const replay = await second.execute('promptTemplate.save', input, { idempotencyKey: 'restart-template-1' })
    expect(replay.id).toBe(created.id)
    expect((await second.execute('promptTemplate.list', { workspaceId: value.workspace.id })).items).toHaveLength(1)
  })

  test('prompt templates persist through save/list/update/delete and expose receipts', async () => {
    const { client, workspace } = await fixture()
    const commands = createPromptTemplateCommandClient(client)
    const input = {
      workspaceId: workspace.id,
      name: 'Deploy',
      description: 'Deploy a service',
      body: 'Deploy {{service}}',
      variables: [{ id: 'service', label: 'Service', required: true }],
    }
    const created = await commands.execute('promptTemplate.save', input, { idempotencyKey: 'template-create-1' })
    expect(created.revision).toBe(1)
    expect(
      await commands.execute('promptTemplate.receipt', {
        commandId: 'promptTemplate.save',
        input,
        idempotencyKey: 'template-create-1',
      }),
    ).toMatchObject({ id: created.id })
    const concurrent = await Promise.allSettled([
      commands.execute(
        'promptTemplate.save',
        { ...input, name: 'same-key-a' },
        { idempotencyKey: 'template-conflict-1' },
      ),
      commands.execute(
        'promptTemplate.save',
        { ...input, name: 'same-key-b' },
        { idempotencyKey: 'template-conflict-1' },
      ),
    ])
    expect(concurrent.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.filter((item) => item.status === 'rejected')).toHaveLength(1)
    expect((await commands.execute('promptTemplate.list', { workspaceId: workspace.id })).items).toHaveLength(2)
    const updated = await commands.execute(
      'promptTemplate.save',
      { ...input, id: created.id, expectedRevision: created.revision, body: 'Deploy {{service}} now' },
      { idempotencyKey: 'template-update-1' },
    )
    expect(updated.revision).toBe(2)
    await expect(
      commands.execute(
        'promptTemplate.save',
        { ...input, id: created.id, expectedRevision: 0 },
        { idempotencyKey: 'template-stale' },
      ),
    ).rejects.toThrow('revision changed')
    await commands.execute(
      'promptTemplate.delete',
      { workspaceId: workspace.id, id: created.id, expectedRevision: updated.revision },
      { idempotencyKey: 'template-delete-1' },
    )
    expect((await commands.execute('promptTemplate.list', { workspaceId: workspace.id })).items).toHaveLength(1)
  })

  test('schedules persist, preview once and five-field cron in timezone, update CAS and delete', async () => {
    const { client, workspace, session } = await fixture()
    const commands = createScheduleCommandClient(client)
    const preview = await commands.preview({
      spec: { kind: 'cron', expression: '0 9 * * 1-5' },
      timezone: 'America/Los_Angeles',
      from: Date.UTC(2026, 0, 1),
    })
    expect(preview.occurrences).toHaveLength(5)
    expect(preview.timezone).toBe('America/Los_Angeles')
    const once = await commands.create(
      {
        workspaceId: workspace.id,
        name: 'Once',
        input: 'hello',
        modelId: 'local',
        timezone: 'UTC',
        target: { mode: 'existing-session', sessionId: session.id },
        spec: { kind: 'once', at: Date.now() + 86_400_000 },
      },
      { idempotencyKey: 'schedule-once-1' },
    )
    const created = await commands.create(
      {
        workspaceId: workspace.id,
        name: 'Daily',
        input: 'hello',
        modelId: 'local',
        timezone: 'UTC',
        target: { mode: 'new-session' },
        spec: { kind: 'daily', hour: 9, minute: 0 },
      },
      { idempotencyKey: 'schedule-daily-1' },
    )
    expect((await commands.list({ workspaceId: workspace.id })).items.length).toBe(2)
    const updated = await commands.update(
      {
        scheduleId: created.id,
        workspaceId: workspace.id,
        name: 'Daily paused',
        input: 'hello',
        modelId: 'local',
        timezone: 'UTC',
        target: { mode: 'new-session' },
        spec: { kind: 'daily', hour: 10, minute: 0 },
        enabled: false,
        expectedRevision: created.revision,
      },
      { idempotencyKey: 'schedule-update-1' },
    )
    expect(updated.enabled).toBe(false)
    await commands.delete(
      { scheduleId: once.id, expectedRevision: once.revision },
      { idempotencyKey: 'schedule-delete-1' },
    )
    expect(await commands.get({ scheduleId: once.id })).toBeNull()
  })

  test('notifications list, preferences, read marks and idempotent marks use actual storage', async () => {
    const { client, kernel, workspace, session } = await fixture()
    const record = {
      id: 'feature-notification-1',
      sourceEventId: 'feature-event-1',
      kind: 'run.completed' as const,
      title: 'Feature run',
      detail: 'done',
      createdAt: Date.now(),
      readAt: null,
      target: { kind: 'session' as const, workspaceId: workspace.id, sessionId: session.id },
    }
    await kernel.storage.call('insertNotification', record)
    const commands = createNotificationCommandClient(client)
    const first = await commands.page({ after: null, limit: 40, unreadOnly: false })
    expect(first.items.some((item) => item.id === record.id)).toBe(true)
    const preferences = await commands.preferences()
    const changed = { ...preferences, 'run.completed': { inApp: false, desktop: true } }
    expect(
      await client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: crypto.randomUUID(),
        commandId: 'notification.preferences.set',
        commandVersion: 1,
        idempotencyKey: 'prefs-1',
        input: changed,
      }),
    ).toEqual(changed)
    expect((await commands.markRead({ id: record.id, read: true })).readAt).not.toBeNull()
    expect(
      (await commands.page({ after: null, limit: 40, unreadOnly: true })).items.some((item) => item.id === record.id),
    ).toBe(false)
  })

  test('run board returns paged names from durable storage', async () => {
    const { client, kernel, workspace, session } = await fixture()
    await kernel.storage.call(
      'enqueue',
      session.id,
      'feature-run-1',
      { text: 'board test 1', images: [] },
      'feature-test',
    )
    await kernel.storage.call(
      'enqueue',
      session.id,
      'feature-run-2',
      { text: 'board test 2', images: [] },
      'feature-test',
    )
    const commands = createRunBoardCommandClient(client)
    const page = await commands.list({ workspaceId: workspace.id, sessionId: session.id, statuses: [], limit: 1 })
    expect(page.workspaceId).toBe(workspace.id)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.run.sessionId).toBe(session.id)
    expect(page.items[0]?.sessionTitle).toBe('Feature host test')
    expect(page.nextCursor).not.toBeNull()
    await expect(
      commands.list({
        workspaceId: workspace.id,
        sessionId: session.id,
        statuses: [],
        limit: 1,
        cursor: { ...page.nextCursor!, revision: page.revision + 1 },
      }),
    ).rejects.toThrow()
  })
})
