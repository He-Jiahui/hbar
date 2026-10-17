import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandRegistry, createCommandRouter, type CommandDefinition } from '@hbar/commands'
import {
  HbarClient,
  registerCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import type { ApprovalMode, RunMode } from '@hbar/contracts'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const cases: Array<[string, Record<string, unknown>]> = [
  ['app.openPanel', { panelId: 'files' }],
  ['app.closePanel', { instanceId: 'fixture-panel' }],
  ['app.back', {}],
  ['app.setSidebarVisible', { visible: false }],
  ['app.openSettings', { scope: 'global' }],
  ['app.openStatus', {}],
  ['app.openSettingsEditor', { scope: 'global', path: 'backend.autonomy' }],
  ['app.openWindow', { windowId: 'fixture-window', page: { kind: 'session', params: {} } }],
  ['app.closeWindow', { windowId: 'fixture-window' }],
]
const toolResult = z.object({ text: z.string(), isError: z.boolean().optional() })
const batchResult = z.object({ directory: toolResult, results: z.array(toolResult) })
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 5_000
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Managed client command fixture did not settle')
    await Bun.sleep(5)
  }
}

test('managed Sessions discover explicit clients and execute all public Application surfaces through original Run permissions and receipts', async () => {
  const prefix = 'hbar-managed-session-client-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let control: HbarClient | undefined, client: HbarClient | undefined
  let registration: Awaited<ReturnType<typeof registerCommandClient>> | undefined
  const clientRegistry = new CommandRegistry({ execution: 'client' })
  const platformRegistry = new CommandRegistry({ execution: 'platform' })
  const slow = Promise.withResolvers<void>()
  let entered = false
  let finishPending: (() => Promise<void>) | undefined
  let block = false,
    executions = 0
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profileModule: join(process.cwd(), 'tests/fixtures/client-command-profile.ts'),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const current = runtime,
      listener = host
    const device = await host.auth.createDevice('Managed client command owner')
    const url = `http://127.0.0.1:${host.server.port}`
    control = new HbarClient(url, device.token)
    client = new HbarClient(url, device.token)
    await control.connect()
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('No managed command workspace')
    const session = await createWorkspaceSessionCommandClient(control).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'managed-client-session' },
    )
    const target = { clientId: 'selected-runtime-client', generation: 11 }
    const operations = new Map<string, string>()
    const definitions = new Map<string, CommandDefinition>()
    for (const actual of Object.values(surfaceCommands)) {
      const definition: CommandDefinition = actual
      if (definition.metadata.visibility === 'internal') continue
      definitions.set(definition.metadata.id, definition)
      const registry = definition.metadata.execution === 'platform' ? platformRegistry : clientRegistry
      registry.register(definition, async (raw, context) => {
        executions++
        expect(context.actorId).toBe(device.device.id)
        const operationKey = operations.get(definition.metadata.id)
        if (!operationKey) throw new Error('Missing expected client operation')
        expect(
          await current.storage.call('commandExecutionRead', {
            sessionId: session.id,
            actorId: device.device.id,
            operationKey,
          }),
        ).toMatchObject({ target, owner: { kind: 'client', ...target } })
        if (block) {
          entered = true
          await slow.promise
        }
        const input = z.record(z.string(), z.unknown()).parse(raw)
        const id = definition.metadata.id
        const result =
          id === 'app.openWindow'
            ? { windowId: input.windowId, page: input.page, focused: true }
            : id === 'app.closeWindow'
              ? { windowId: input.windowId, closed: true }
              : id === 'app.closePanel'
                ? { instanceId: input.instanceId, closed: true }
                : id === 'app.back' || id === 'app.setSidebarVisible'
                  ? {
                      page: 'session',
                      pageInstanceId: null,
                      toolInstanceId: null,
                      modalInstanceId: null,
                      sidebarOpen: true,
                    }
                  : {
                      instanceId: 'fixture-panel',
                      panelId: input.panelId ?? 'settings',
                      workspaceId: null,
                      sessionId: null,
                      binding: 'followActive',
                      focused: true,
                    }
        return definition.output.parse(result)
      })
    }
    const routing = createCommandRouter({
      catalogs: () => [clientRegistry.list(), platformRegistry.list()],
      resolve(id) {
        const definition = definitions.get(id)
        if (!definition) return undefined
        const registry = definition.metadata.execution === 'platform' ? platformRegistry : clientRegistry
        return {
          describe: () => registry.describe(id),
          prepare: (value) => registry.prepare(value),
          dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
          dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
        }
      },
    })
    registration = await registerCommandClient(client, { ...target, commands: [...definitions.keys()], routing })
    const runs = createRunCommandClient(control)
    async function submit(
      approval: ApprovalMode,
      values = cases,
      mode: RunMode = 'default',
      generation = target.generation,
    ) {
      const calls = values.map(([commandId, input]) => ({
        commandId,
        commandVersion: 1,
        operationKey: crypto.randomUUID(),
        input,
        target: { ...target, generation },
      }))
      for (const call of calls) operations.set(call.commandId, call.operationKey)
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: session.id,
          modelId: 'local-fixture',
          input: { text: JSON.stringify(calls), images: [], approval, mode },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      return { calls, runId: accepted.operationId }
    }
    async function result(runId: string) {
      await current.waitForIdle()
      const snapshot = await current.kernel.snapshot(session.id)
      expect(snapshot.runs.find((run) => run.id === runId)?.status).toBe('completed')
      const output = snapshot.messages
        .filter((message) => message.runId === runId && message.role === 'assistant')
        .flatMap((message) => message.content)
        .find((part) => part.type === 'text')
      if (!output || output.type !== 'text') throw new Error('No managed client result')
      return batchResult.parse(JSON.parse(output.text))
    }
    const allowed = await submit('allow')
    const completed = await result(allowed.runId)
    expect(JSON.parse(completed.directory.text)).toMatchObject({
      items: [{ ...target, commands: [...definitions.keys()].sort() }],
    })
    expect(completed.results).toHaveLength(cases.length)
    for (const [index, item] of completed.results.entries()) {
      expect({
        id: allowed.calls[index]?.commandId,
        isError: item.isError,
        error: item.isError ? item.text : undefined,
      }).toEqual({ id: allowed.calls[index]?.commandId, isError: false, error: undefined })
      expect(JSON.parse(item.text)).toMatchObject({ status: 'succeeded', physical: 'succeeded', acknowledged: true })
      expect(
        await current.storage.call('commandExecutionRead', {
          sessionId: session.id,
          actorId: device.device.id,
          operationKey: allowed.calls[index]!.operationKey,
        }),
      ).toMatchObject({ runId: allowed.runId, actorId: device.device.id, target, owner: { kind: 'client', ...target } })
    }
    expect(executions).toBe(cases.length)
    for (const [approval, mode, generation] of [
      ['deny', 'default', target.generation],
      ['allow', 'plan', target.generation],
      ['allow', 'default', target.generation + 1],
    ] as const) {
      const denied = await submit(approval, [cases[3]!], mode, generation)
      const outcome = await result(denied.runId)
      expect(outcome.directory.isError ?? false).toBe(false)
      expect(outcome.results[0]?.isError).toBe(true)
      expect(
        await current.storage.call('commandExecutionRead', {
          sessionId: session.id,
          actorId: device.device.id,
          operationKey: denied.calls[0]!.operationKey,
        }),
      ).toBeNull()
    }
    expect(executions).toBe(cases.length)
    block = true
    const reconnecting = await submit('allow', [cases[3]!])
    finishPending = async () => {
      if (client?.connectionStatus() !== 'connected') await client?.connect()
      await until(() =>
        listener.commandClients.list(device.device.id).items.some((item) => item.clientId === target.clientId),
      )
      slow.resolve()
      await listener.sessionCommandExecution?.reconcile(
        session.id,
        reconnecting.runId,
        reconnecting.calls[0]!.operationKey,
      )
      await current.waitForIdle()
    }
    await until(() => entered)
    client.disconnect()
    const identity = {
      sessionId: session.id,
      actorId: device.device.id,
      operationKey: reconnecting.calls[0]!.operationKey,
    }
    await until(async () => !!(await current.storage.call('commandExecutionRead', identity))?.uncertainty)
    expect((await current.storage.call('commandExecutionRead', identity))?.physical).toBeNull()
    expect(current.coordinator.snapshot().resources).toBeGreaterThan(0)
    await client.connect()
    await until(() =>
      listener.commandClients.list(device.device.id).items.some((item) => item.clientId === target.clientId),
    )
    slow.resolve()
    const execution = listener.sessionCommandExecution
    if (!execution) throw new Error('No Session command execution service')
    expect(await execution.reconcile(session.id, reconnecting.runId, identity.operationKey)).toMatchObject({
      physical: { status: 'succeeded', executionStarted: true },
    })
    await result(reconnecting.runId)
    finishPending = undefined
    expect(executions).toBe(cases.length + 1)
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    slow.resolve()
    await finishPending?.()
    await registration?.dispose()
    control?.disconnect()
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    clientRegistry.dispose()
    platformRegistry.dispose()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
