import { expect, test } from 'bun:test'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { WorkflowState } from '@hbar/contracts/workflow'
import {
  planWorkflowPendingRecovery,
  type WorkflowPendingRecoveryPort,
} from '../apps/host/src/runtime-workflow-pending-recovery'

const pending = { runId: 'old-run', callId: 'old-call', toolName: 'shell' }
const workflow: Pick<WorkflowState, 'workflowId' | 'sessionId' | 'revision' | 'status' | 'pendingMutations'> = {
  workflowId: 'workflow',
  sessionId: 'session',
  revision: 106,
  status: 'verifying',
  pendingMutations: [pending],
}
const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
const lease: ExecutionOwnership = {
  leaseId: 'old-lease',
  runId: 'old-run',
  sessionId: 'session',
  owner: { unitId: 'kernel', generation: 1, incarnation: 'old-incarnation' },
  fence: 1,
  acquiredAt: 1,
  versions: { kernel: version, driver: version, plugins: [], hooks: [] },
}
function port(overrides: Partial<WorkflowPendingRecoveryPort> = {}): WorkflowPendingRecoveryPort {
  return {
    readRun: async () => ({ id: 'old-run', sessionId: 'session', status: 'interrupted' }),
    readOwnership: async () => ({ lease, state: 'released' }),
    assertQuiescentAuthority() {},
    ...overrides,
  }
}
async function failure(source: WorkflowPendingRecoveryPort): Promise<unknown> {
  try {
    await planWorkflowPendingRecovery(workflow, source)
  } catch (error) {
    return error
  }
  throw new Error('Recovery unexpectedly accepted unsafe facts')
}
test('recovery plans only released terminal identities and leaves original unknown facts untouched', async () => {
  let checks = 0
  const before = structuredClone(workflow)
  const plan = await planWorkflowPendingRecovery(
    workflow,
    port({
      assertQuiescentAuthority() {
        checks++
      },
    }),
  )
  expect(plan).toMatchObject({ expectedRevision: 106, mutations: [pending], releasedOwnership: [lease] })
  expect(workflow).toEqual(before)
  expect(checks).toBe(2)
  expect(await planWorkflowPendingRecovery({ ...workflow, pendingMutations: [] }, port())).toBeNull()
})
for (const state of ['active', 'revoked']) {
  test(`recovery rejects ${state} ownership even for an interrupted Run`, async () => {
    expect(await failure(port({ readOwnership: async () => ({ lease, state }) }))).toMatchObject({
      code: 'WORKFLOW_RECOVERY_OWNED',
    })
  })
}
test('recovery rejects absent receipts, live Run, and mismatched durable identities', async () => {
  expect(await failure(port({ readOwnership: async () => null }))).toMatchObject({ code: 'WORKFLOW_RECOVERY_OWNED' })
  expect(
    await failure(port({ readRun: async () => ({ id: 'old-run', sessionId: 'session', status: 'running' }) })),
  ).toMatchObject({ code: 'WORKFLOW_RECOVERY_ACTIVE' })
  expect(
    await failure(port({ readRun: async () => ({ id: 'old-run', sessionId: 'other', status: 'interrupted' }) })),
  ).toMatchObject({ code: 'WORKFLOW_RECOVERY_IDENTITY' })
  expect(
    await failure(
      port({ readOwnership: async () => ({ lease: { ...lease, sessionId: 'other' }, state: 'released' }) }),
    ),
  ).toMatchObject({ code: 'WORKFLOW_RECOVERY_OWNED' })
})
test('authority is rechecked after awaited receipts, never accepted as a caller boolean', async () => {
  let active = false
  const error = await failure(
    port({
      readOwnership: async () => {
        active = true
        return { lease, state: 'released' }
      },
      assertQuiescentAuthority() {
        if (active) throw new Error('AUTHORITY_LOST')
      },
    }),
  )
  expect(error).toMatchObject({ message: 'AUTHORITY_LOST' })
})
