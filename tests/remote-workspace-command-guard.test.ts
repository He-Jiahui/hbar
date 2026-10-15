import { expect, test } from 'bun:test'
import { createCommandExpectation, describeCommand, prepareCommandInvocation } from '@hbar/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { createRemoteWorkspaceCommands } from '../apps/host/src/node-commands'

async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected remote workspace refusal')
}

test('remote workspace creation validates the admitted root and definition before discovering a node', async () => {
  let discoveries = 0
  const owner = createRemoteWorkspaceCommands(async (input) => {
    discoveries++
    return { id: 'created', path: 'C:/fixture', name: input.name ?? 'Created', createdAt: 1 }
  })
  const invocation = prepareCommandInvocation(workspaceSessionCommands, {
    protocol: 1,
    commandId: 'workspace.create',
    commandVersion: 1,
    requestId: 'remote-create',
    input: { node: 'node-1', rootId: 'source-root', name: '  Admitted  ' },
  })
  const expected = createCommandExpectation({
    invocation,
    descriptor: describeCommand(workspaceSessionCommands['workspace.create']),
  })
  try {
    expect(
      await failure(
        owner.dispatchPrepared(
          { ...invocation, input: { node: 'node-1', rootId: 'another-root' } },
          'operator',
          expected,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(
      await failure(
        owner.dispatchPrepared(invocation, 'operator', {
          ...expected,
          descriptor: { ...expected.descriptor, metadata: { ...expected.descriptor.metadata, owner: 'replacement' } },
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(
      await failure(owner.dispatchPrepared(invocation, 'operator', expected, { signal: AbortSignal.abort() })),
    ).toMatchObject({ code: 'CANCELLED' })
    expect(discoveries).toBe(0)
    const ticket = owner.dispatchPreparedTracked(invocation, 'operator', expected)
    const result = await ticket.result
    expect(result).toMatchObject({ name: 'Admitted' })
    expect(await ticket.settled).toEqual({ status: 'succeeded', executionStarted: true, result })
    expect(discoveries).toBe(1)
  } finally {
    owner.dispose()
  }
})
