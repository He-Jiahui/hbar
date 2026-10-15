import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { describeCommand, type CommandDescriptor } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { systemCommands } from '@hbar/contracts/commands/system'
import { SessionCommandAuthorization } from '../apps/host/src/session-command-authorization'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const invocation = (descriptor: CommandDescriptor, input: unknown) => ({
  protocol: 1,
  requestId: 'fixture',
  commandId: descriptor.metadata.id,
  commandVersion: descriptor.metadata.version,
  input,
})
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected command authorization rejection')
}

test('command authorization uses the canonical actor and current device scope, role and revocation', async () => {
  const prefix = 'hbar-session-command-auth-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'allowed')
    const forbidden = await storage.call('createWorkspace', join(root, 'other'), 'forbidden')
    const device = {
      id: 'operator-a',
      name: 'Operator A',
      createdAt: 1,
      lastSeenAt: 1,
      role: 'operator' as const,
      workspaceIds: [workspace.id],
    }
    await storage.call('putDevice', device, 'operator-token-hash')
    const session = await storage.call('createSessionCommand', {
      workspaceId: workspace.id,
      actorId: device.id,
      idempotencyKey: 'create',
    })
    const run = await storage.call('enqueue', session.id, 'automatic', { text: 'task', images: [] }, 'fixture')
    const authorization = new SessionCommandAuthorization(storage)
    const read = describeCommand(fileCommands['file.read'])
    const write = describeCommand(fileCommands['file.write'])
    expect(
      (
        await authorization.authorize(
          session.id,
          run.id,
          write,
          invocation(write, { workspaceId: workspace.id, path: 'proof.txt', text: 'proof', expectedSha256: null }),
        )
      ).principal.actorId,
    ).toBe(device.id)
    expect(
      await failure(
        authorization.authorize(
          session.id,
          run.id,
          read,
          invocation(read, { workspaceId: forbidden.id, path: 'private.txt' }),
        ),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await failure(
        authorization.authorize(session.id, run.id, read, { ...invocation(read, {}), actorId: 'global-operator' }),
      ),
    ).toMatchObject({ name: 'ZodError' })
    expect(await failure(authorization.authorize(session.id, run.id, write, invocation(read, {})))).toMatchObject({
      code: 'COMMAND_DESCRIPTOR_MISMATCH',
    })
    await storage.call('revokeDevice', device.id)
    expect(await failure(authorization.source(session.id, run.id))).toMatchObject({ code: 'COMMAND_PRINCIPAL_REVOKED' })
    await storage.call('putDevice', { ...device, role: 'observer' }, 'new-observer-token-hash')
    expect(
      (
        await authorization.authorize(
          session.id,
          run.id,
          read,
          invocation(read, { workspaceId: workspace.id, path: 'proof.txt' }),
        )
      ).device.role,
    ).toBe('observer')
    expect(
      await failure(
        authorization.authorize(session.id, run.id, write, invocation(write, { workspaceId: workspace.id })),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    await storage.call('revokeDevice', device.id)
    await storage.call('putDevice', { ...device, workspaceIds: [forbidden.id] }, 'moved-scope-token-hash')
    expect(await failure(authorization.source(session.id, run.id))).toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('unbound ordinary histories and mismatched source sessions cannot receive an implicit global operator', async () => {
  const prefix = 'hbar-session-command-auth-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    const other = await storage.call('createSession', workspace.id)
    const run = await storage.call('enqueue', session.id, 'unbound', { text: 'legacy task', images: [] }, 'fixture')
    const authorization = new SessionCommandAuthorization(storage)
    const query = describeCommand(systemCommands['system.paths.get'])
    expect(await failure(authorization.authorize(session.id, run.id, query, invocation(query, {})))).toMatchObject({
      code: 'COMMAND_PRINCIPAL_REQUIRED',
    })
    expect(await failure(authorization.source(other.id, run.id))).toMatchObject({ code: 'EXECUTION_PRINCIPAL_SOURCE' })
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})
