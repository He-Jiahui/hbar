import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createScheduleCommandClient } from '@hbar/client'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('an authenticated schedule executes Commands without a client and retains its actual author in both managed Session and Run', async () => {
  const prefix = 'hbar-managed-schedule-principal-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Original schedule author')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing scheduled workspace')
    const call = {
      commandId: 'workspace.list',
      commandVersion: 1,
      input: { limit: 10 },
      operationKey: 'scheduled-read',
    }
    const schedule = await createScheduleCommandClient(client).create(
      {
        workspaceId: workspace.id,
        name: '用户的后台定时任务',
        input: `/tool hbar_command_execute ${JSON.stringify(call)}`,
        modelId: 'local-fixture',
        timezone: 'UTC',
        target: { mode: 'new-session' },
        spec: { kind: 'once', at: Date.now() + 1_000 },
      },
      { idempotencyKey: 'scheduled-command' },
    )
    client.disconnect()
    await Bun.sleep(180)
    const deadline = Date.now() + 40_000
    let occurrence
    for (;;) {
      occurrence = (await runtime.storage.call('scheduleOccurrences', schedule.id, null, 10)).items[0]
      if (occurrence?.runId) {
        const run = await runtime.storage.call('run', occurrence.runId)
        if (run.status === 'completed') break
        if (run.status === 'failed') throw new Error(`Scheduled Run failed: ${JSON.stringify(run)}`)
      }
      if (Date.now() > deadline) throw new Error(`Scheduled task did not finish: ${JSON.stringify(occurrence)}`)
      await Bun.sleep(20)
    }
    if (!occurrence.sessionId || !occurrence.runId) throw new Error('Scheduled task lost its execution linkage')
    await runtime.waitForIdle()
    expect(await runtime.storage.call('sessionExecutionPrincipal', occurrence.sessionId)).toMatchObject({
      actorId: device.device.id,
    })
    expect(await runtime.storage.call('runExecutionPrincipal', occurrence.runId)).toMatchObject({
      actorId: device.device.id,
      originRunId: occurrence.runId,
    })
    expect((await runtime.storage.call('session', occurrence.sessionId)).title).toBe(schedule.name)
    const snapshot = await runtime.kernel.snapshot(occurrence.sessionId)
    const result = snapshot.messages
      .filter((message) => message.runId === occurrence.runId)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result')
    if (!result || result.type !== 'tool_result') throw new Error('Scheduled Command returned no durable result')
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toMatchObject({ status: 'succeeded', acknowledged: true })
    expect(
      await runtime.storage.call('commandExecutionRead', {
        sessionId: occurrence.sessionId,
        actorId: device.device.id,
        operationKey: call.operationKey,
      }),
    ).toMatchObject({ runId: occurrence.runId, actorId: device.device.id, physical: { status: 'succeeded' } })
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 90_000)
