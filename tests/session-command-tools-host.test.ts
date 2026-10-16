import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { HbarClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { createPathLayout } from '@hbar/storage'
import { commandDescriptorSchema } from '@hbar/commands'
import { SESSION_COMMAND_STATE_QUERY_IDS } from '@hbar/kernel/session-command-port'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const pageSchema = z.strictObject({
  revision: z.number(),
  items: z.array(z.object({ id: z.string(), execution: z.enum(['host', 'client', 'platform']) })),
  nextCursor: z.string().optional(),
})

test('independent real managed sessions discover command mode and read schemas in Plan/deny without a UI or mutations', async () => {
  const prefix = 'hbar-session-command-tools-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const firstDevice = await host.auth.createDevice('First command operator')
  const secondDevice = await host.auth.createDevice('Second command operator')
  const firstClient = new HbarClient(`http://127.0.0.1:${host.server.port}`, firstDevice.token)
  const secondClient = new HbarClient(`http://127.0.0.1:${host.server.port}`, secondDevice.token)
  try {
    await Promise.all([firstClient.connect(), secondClient.connect()])
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Command-tool fixture has no workspace')
    const first = await createWorkspaceSessionCommandClient(firstClient).execute(
      'session.create',
      { workspaceId: workspace.id, title: 'First command reader' },
      { idempotencyKey: 'first-reader' },
    )
    const second = await createWorkspaceSessionCommandClient(secondClient).execute(
      'session.create',
      { workspaceId: workspace.id, title: 'Second command reader' },
      { idempotencyKey: 'second-reader' },
    )
    expect((await runtime.storage.call('sessionExecutionPrincipal', first.id))?.actorId).toBe(firstDevice.device.id)
    expect((await runtime.storage.call('sessionExecutionPrincipal', second.id))?.actorId).toBe(secondDevice.device.id)
    async function call(sessionId: string, name: string, args: Record<string, unknown>, expectedError = false) {
      const client = sessionId === first.id ? firstClient : secondClient
      const accepted = await createRunCommandClient(client).execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: `/tool ${name} ${JSON.stringify(args)}`,
            images: [],
            approval: 'deny',
            mode: 'plan',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const run = await runtime.storage.call('run', accepted.operationId)
      await runtime.waitForIdle()
      const snapshot = await runtime.kernel.snapshot(sessionId)
      expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
      expect(snapshot.approvals).toHaveLength(0)
      const principal = await runtime.storage.call('runExecutionPrincipal', run.id)
      expect(principal?.actorId).toBe(sessionId === first.id ? firstDevice.device.id : secondDevice.device.id)
      expect(principal?.originRunId).toBe(run.id)
      const result = snapshot.messages
        .filter((message) => message.runId === run.id)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (!result || result.type !== 'tool_result') throw new Error('Managed command tool returned no result')
      expect(result.isError).toBe(expectedError)
      return result.text
    }
    const seen: string[] = []
    const domains = new Set<string>()
    let after: string | undefined
    do {
      const page = pageSchema.parse(
        JSON.parse(await call(first.id, 'hbar_commands_list', { limit: 50, ...(after ? { after } : {}) })) as unknown,
      )
      for (const item of page.items) {
        seen.push(item.id)
        domains.add(item.execution)
      }
      after = page.nextCursor
      expect(seen.length).toBeLessThan(10_000)
    } while (after)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual([...seen].sort())
    expect(seen).toContain('file.write')
    expect(seen).toContain('app.openPanel')
    expect([...domains].sort()).toEqual(['client', 'host', 'platform'])
    const description = commandDescriptorSchema.parse(
      JSON.parse(await call(second.id, 'hbar_command_describe', { commandId: 'file.write' })) as unknown,
    )
    expect(description.metadata.stateEffect).toBe('persistent')
    expect(description.inputSchema).toHaveProperty('properties.path')
    const local = commandDescriptorSchema.parse(
      JSON.parse(await call(second.id, 'hbar_command_describe', { commandId: 'app.openPanel' })) as unknown,
    )
    expect(local.metadata.execution).toBe('client')
    const operationKey = 'model-workspace-list'
    for (const commandId of SESSION_COMMAND_STATE_QUERY_IDS) {
      const result = z
        .object({ commandId: z.literal(commandId), status: z.literal('succeeded'), result: z.unknown() })
        .parse(
          JSON.parse(
            await call(second.id, 'hbar_command_execute', {
              commandId,
              commandVersion: 1,
              operationKey: `inspect-state-${commandId}`,
              input: {},
            }),
          ) as unknown,
        )
      expect(result.status).toBe('succeeded')
      if (commandId === 'goal.get') expect(result.result).toMatchObject({ goal: null })
      if (commandId === 'plan.get' || commandId === 'session.getBudget') expect(result.result).toBeNull()
      if (commandId === 'mode.get') expect(result.result).toEqual({ mode: 'plan' })
    }
    const execute = { commandId: 'workspace.list', commandVersion: 1, operationKey, input: {} }
    const commandResult = z.object({
      operationKey: z.literal(operationKey),
      commandId: z.literal('workspace.list'),
      status: z.literal('succeeded'),
      physical: z.literal('succeeded'),
      acknowledged: z.literal(true),
      result: z.object({ items: z.array(z.object({ id: z.string() })) }),
    })
    const firstResult = commandResult.parse(
      JSON.parse(await call(first.id, 'hbar_command_execute', execute)) as unknown,
    )
    expect(firstResult.result.items.map((item) => item.id)).toContain(workspace.id)
    const receipt = await runtime.storage.call('commandExecutionRead', {
      sessionId: first.id,
      actorId: firstDevice.device.id,
      operationKey,
    })
    expect(receipt?.actorId).toBe(firstDevice.device.id)
    expect(receipt?.owner).toMatchObject({ kind: 'runtime', owner: { unitId: 'kernel' } })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    const repeated = await call(first.id, 'hbar_command_execute', execute)
    expect(commandResult.parse(JSON.parse(repeated) as unknown)).toEqual(firstResult)
    expect(
      (
        await runtime.storage.call('commandExecutionRead', {
          sessionId: first.id,
          actorId: firstDevice.device.id,
          operationKey,
        })
      )?.revision,
    ).toBe(receipt?.revision)
    commandResult.parse(JSON.parse(await call(second.id, 'hbar_command_execute', execute)) as unknown)
    expect(
      (
        await runtime.storage.call('commandExecutionRead', {
          sessionId: second.id,
          actorId: secondDevice.device.id,
          operationKey,
        })
      )?.actorId,
    ).toBe(secondDevice.device.id)
    const decisionList = await call(second.id, 'hbar_command_execute', {
      commandId: 'decision.list',
      commandVersion: 1,
      operationKey: 'inspect-decisions',
      input: { sessionId: second.id, kind: 'questionnaire' },
    })
    expect(
      z
        .object({ status: z.literal('succeeded'), result: z.object({ items: z.array(z.unknown()).length(0) }) })
        .parse(JSON.parse(decisionList) as unknown).status,
    ).toBe('succeeded')
    const missingDecision = await call(
      second.id,
      'hbar_command_execute',
      {
        commandId: 'decision.get',
        commandVersion: 1,
        operationKey: 'inspect-missing-decision',
        input: { sessionId: second.id, kind: 'questionnaire', id: 'missing' },
      },
      true,
    )
    expect(
      z
        .object({ status: z.literal('failed'), error: z.object({ code: z.literal('COMMAND_NOT_FOUND') }) })
        .parse(JSON.parse(missingDecision) as unknown).status,
    ).toBe('failed')
    expect(
      await call(
        second.id,
        'hbar_command_execute',
        { commandId: 'decision.resolve', commandVersion: 1, operationKey: 'no-implicit-delegation', input: {} },
        true,
      ),
    ).toContain('concrete admission rule')
    expect(
      await call(
        first.id,
        'hbar_command_execute',
        { ...execute, commandId: 'system.restart', operationKey: 'blocked-write' },
        true,
      ),
    ).toContain('concrete admission rule')
    expect(
      await runtime.storage.call('commandExecutionRead', {
        sessionId: first.id,
        actorId: firstDevice.device.id,
        operationKey: 'blocked-write',
      }),
    ).toBeNull()
    expect(
      await call(first.id, 'hbar_command_execute', { ...execute, actorId: secondDevice.device.id }, true),
    ).toContain('actorId')
    expect(runtime.coordinator.snapshot().physicalTools).toBe(0)
    expect(runtime.coordinator.snapshot().resources).toBe(0)
    expect((await runtime.kernel.plugins.get('goal').get(first.id)).goal).toBeNull()
    expect((await runtime.kernel.plugins.get('goal').get(second.id)).goal).toBeNull()
  } finally {
    firstClient.disconnect()
    secondClient.disconnect()
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
