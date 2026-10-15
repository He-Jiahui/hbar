import { expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient } from '@hbar/client'
import { createCommandExpectation } from '@hbar/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import { directoryCommands } from '@hbar/contracts/commands'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { fileCommands } from '@hbar/contracts/commands/files'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected guarded command rejection')
}

test('a real managed Controller validates command input without creating a receipt or writing a file', async () => {
  const prefix = 'hbar-command-preparation-host-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const operator = await host.auth.createDevice('command preparation fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, operator.token)
  try {
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Managed preparation fixture has no workspace')
    const session = await runtime.storage.call('createSession', workspace.id, 'Command preparation')
    const invocation = {
      protocol: 1 as const,
      requestId: 'managed-preparation-budget',
      commandId: 'session.setBudget',
      commandVersion: 1,
      idempotencyKey: 'managed-preparation-budget',
      input: { sessionId: session.id, tokens: 1000 },
    }
    const prepared = await host.commands.prepare(invocation)
    expect(prepared.invocation).toEqual({
      ...invocation,
      input: budgetCommands['session.setBudget'].input.parse(invocation.input),
    })
    expect(prepared.descriptor.metadata.id).toBe('session.setBudget')
    const controllerOwner = runtime.controller.application?.resolveCommand?.('session.setBudget')
    if (!controllerOwner?.dispatchPrepared) throw new Error('Managed Controller has no guarded owner port')
    const expected = createCommandExpectation(prepared)
    expect(
      await failure(
        controllerOwner.dispatchPrepared(
          {
            ...prepared.invocation,
            input: { ...invocation.input, tokens: 2000 },
          },
          operator.device.id,
          expected,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(
      await failure(
        controllerOwner.dispatchPrepared(prepared.invocation, operator.device.id, {
          ...expected,
          descriptor: { ...expected.descriptor, metadata: { ...expected.descriptor.metadata, timeoutMs: 1 } },
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(
      await client.call('command.getReceipt', {
        commandId: 'session.setBudget',
        sessionId: session.id,
        idempotencyKey: invocation.idempotencyKey,
      }),
    ).toBeNull()
    const executed = budgetCommands['session.setBudget'].output.parse(
      await host.commands.executePrepared(prepared.invocation, operator.device.id, expected),
    )
    expect(
      await client.call('command.getReceipt', {
        commandId: 'session.setBudget',
        sessionId: session.id,
        idempotencyKey: invocation.idempotencyKey,
      }),
    ).toEqual(executed)
    expect(await host.commands.executePrepared(prepared.invocation, operator.device.id, expected)).toEqual(executed)
    const write = {
      protocol: 1 as const,
      requestId: 'managed-preparation-write',
      commandId: 'file.write',
      commandVersion: 1,
      idempotencyKey: 'managed-preparation-write',
      input: {
        workspaceId: workspace.id,
        path: 'prepared.txt',
        text: 'Owner-validated execution',
        expectedSha256: null,
      },
    }
    const preparedWrite = await host.commands.prepare(write)
    expect(await Bun.file(join(root, 'prepared.txt')).exists()).toBe(false)
    expect(preparedWrite.invocation.input).toEqual(fileCommands['file.write'].input.parse(write.input))
    const written = fileCommands['file.write'].output.parse(
      await host.commands.executePrepared(
        preparedWrite.invocation,
        operator.device.id,
        createCommandExpectation(preparedWrite),
      ),
    )
    expect(await readFile(join(root, 'prepared.txt'), 'utf8')).toBe(write.input.text)
    const converged = fileCommands['file.write'].output.parse(
      await client.call('command.execute', preparedWrite.invocation),
    )
    expect(converged.afterSha256).toBe(written.afterSha256)
    expect(converged.created).toBe(false)
    const directory = await host.commands.prepare({
      protocol: 1,
      requestId: 'managed-preparation-directory',
      commandId: 'workspace.list',
      commandVersion: 1,
      input: {},
    })
    expect(directory.invocation.input).toHaveProperty('limit')
    const directoryResult = directoryCommands['workspace.list'].output.parse(
      await host.commands.executePrepared(
        directory.invocation,
        operator.device.id,
        createCommandExpectation(directory),
      ),
    )
    expect(directoryResult.items.map((item) => item.id)).toContain(workspace.id)
    const stable = await host.commands.prepare({
      protocol: 1,
      requestId: 'managed-preparation-paths',
      commandId: 'system.paths.get',
      commandVersion: 1,
      input: {},
    })
    expect(stable.descriptor.metadata.id).toBe('system.paths.get')
    expect(
      await host.commands.executePrepared(stable.invocation, operator.device.id, createCommandExpectation(stable)),
    ).toMatchObject({ dataRoot: join(root, 'data') })
    expect(
      await failure(
        host.commands.executePrepared(stable.invocation, operator.device.id, createCommandExpectation(stable), {
          signal: AbortSignal.abort(),
        }),
      ),
    ).toMatchObject({ code: 'CANCELLED' })
    const maintenance = await host.commands.prepare({
      protocol: 1,
      requestId: 'managed-guarded-maintenance',
      commandId: 'chatDatabase.statistics',
      commandVersion: 1,
      input: { scope: { kind: 'global' } },
    })
    chatDatabaseCommands['chatDatabase.statistics'].output.parse(
      await host.commands.executePrepared(
        maintenance.invocation,
        operator.device.id,
        createCommandExpectation(maintenance),
      ),
    )
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
