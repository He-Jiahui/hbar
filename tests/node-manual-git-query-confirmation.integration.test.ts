import { expect, test } from 'bun:test'
import { withNodeExecutionLink } from './fixtures/node-execution-link'

// Keep the live-link floor-update boundary alongside the direct NodeState Git-query test.
test('live-link floor update and manual Git query consent stay within the NodeState deadline', async () => {
  await withNodeExecutionLink(async (f) => {
    const snapshotStartedAt = performance.now()
    const snapshot = await f.state.call('floor.snapshot', {})
    const floorSnapshotMs = performance.now() - snapshotStartedAt
    expect(floorSnapshotMs).toBeLessThan(5_000)
    const floorUpdateStartedAt = performance.now()
    await f.node.updatePolicy({ ...f.node.policy, localConfirm: 'process' }, snapshot.revision)
    const floorUpdateMs = performance.now() - floorUpdateStartedAt
    expect(floorUpdateMs).toBeLessThan(5_000)
    console.info('live-link manual-query floor barriers', { floorSnapshotMs, floorUpdateMs })
    const lookup = {
      kind: 'manual-query' as const,
      operationId: 'manual-query:live-link-repro',
      deviceId: 'authenticated-on-A',
      workspaceId: 'workspace-a',
      sessionId: null,
      nodeId: f.node.id,
      rootId: 'engine',
      expectedRoot: f.workspace,
      method: 'git.query.status' as const,
      argumentsDigest: 'a'.repeat(64),
    }
    const startedAt = performance.now()
    const outcome = await f.node.confirmManualGitQuery(lookup).then(
      () => ({ code: 'unexpectedly-started' }),
      (error: unknown) => error,
    )
    const elapsedMs = performance.now() - startedAt
    expect(elapsedMs).toBeLessThan(5_000)
    console.info('live-link manual-query confirmation admission', {
      elapsedMs,
      code: outcome instanceof Error ? (outcome as { code?: unknown }).code : 'unexpectedly-started',
    })
    expect(outcome).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
    const pending = (await f.node.listLocalConfirmations()).entries[0]
    expect(pending?.state).toBe('waiting')
    if (!pending) throw new Error('Expected a B-local manual Git query confirmation')
    const approveStartedAt = performance.now()
    await f.node.resolveLocalConfirmation(
      { deviceId: 'bootstrap-local', role: 'operator' },
      { confirmationId: pending.id, decision: 'approve' },
    )
    const approvalWriteMs = performance.now() - approveStartedAt
    const statusStartedAt = performance.now()
    expect(await f.node.localConfirmationRunStatus(lookup)).toBe('approved')
    const statusRoundTripMs = performance.now() - statusStartedAt
    console.info('live-link manual-query timings', {
      floorSnapshotMs,
      floorUpdateMs,
      confirmationAdmissionMs: elapsedMs,
      approvalWriteMs,
      statusRoundTripMs,
    })
    const nextSnapshot = await f.state.call('floor.snapshot', {})
    await f.node.updatePolicy({ ...f.node.policy, maxTimeoutMs: f.node.policy.maxTimeoutMs - 1 }, nextSnapshot.revision)
    const floorBarrierStartedAt = performance.now()
    expect(await f.node.localConfirmationRunStatus(lookup)).toBe('cancelled')
    const floorBarrierMs = performance.now() - floorBarrierStartedAt
    console.info('live-link manual-query floor revision barrier', { floorBarrierMs })
  })
})
