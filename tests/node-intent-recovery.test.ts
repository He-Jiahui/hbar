import { describe, expect, test } from 'bun:test'
import { reconcileNodeToolIntent } from '../packages/kernel/src/node-intent-recovery'
import type { NodeReceipt } from '@hbar/contracts/node'
import type { ToolResult } from '@hbar/plugin-sdk'
import type { NodeToolIntentRecoveryIdentity } from '../packages/kernel/src/node-intent-recovery'

const identity = {
  workspaceId: 'workspace-A',
  sessionId: 'session-A',
  runId: 'run-A',
  callId: 'call-A',
  operationId: 'run-A:call-A',
  name: 'workspace.exec',
  args: { command: 'true' },
  nodeId: 'node-A',
  rootId: 'root-A',
  nodePath: '/workspace',
  kind: 'process',
  authority: {
    sessionId: 'session-A',
    runId: 'run-A',
    callId: 'call-A',
    sandbox: null,
    admission: { kind: 'allow' },
  },
} as const

function receipt(state: NodeReceipt['state']): NodeReceipt {
  switch (state) {
    case 'absent':
      return { state }
    case 'accepted':
      return { state, acceptedAt: 1 }
    case 'started':
      return { state, acceptedAt: 1, startedAt: 2 }
    case 'settled':
      return {
        state,
        acceptedAt: 1,
        startedAt: 2,
        settledAt: 3,
        result: {
          text: 'done',
          isError: false,
          details: { code: 0, exitCode: 0, truncated: false, executionStarted: true, backend: 'none' },
        },
      }
    case 'lost':
      return { state, acceptedAt: 1, startedAt: 2, reason: 'restart' }
  }
}

function harness(found: NodeReceipt) {
  const calls: string[] = []
  const ports = {
    assertCurrentScope: async (request: NodeToolIntentRecoveryIdentity) => {
      expect(request).toEqual(identity)
      calls.push('scope')
    },
    readReceipt: async (operationId: string) => {
      expect(operationId).toBe(identity.operationId)
      calls.push('receipt')
      return found
    },
    commitSettled: async (_request: NodeToolIntentRecoveryIdentity, result: ToolResult) => {
      calls.push(`commit:${result.text}`)
    },
    settleNeverAccepted: async (request: NodeToolIntentRecoveryIdentity) => {
      expect(request).toEqual(identity)
      calls.push('settle-not-started')
    },
  }
  return { calls, ports }
}

describe('reconcileNodeToolIntent', () => {
  test('commits B settled result directly under the original A intent', async () => {
    const h = harness(receipt('settled'))
    const outcome = await reconcileNodeToolIntent(identity, h.ports)
    expect(outcome).toMatchObject({ state: 'settled', result: { text: 'done', isError: false } })
    expect(h.calls).toEqual(['scope', 'receipt', 'scope', 'commit:done'])
  })

  test('keeps accepted and started receipts waiting without replay', async () => {
    for (const state of ['accepted', 'started'] as const) {
      const h = harness(receipt(state))
      expect(await reconcileNodeToolIntent(identity, h.ports)).toEqual({ state: 'waiting' })
      expect(h.calls).toEqual(['scope', 'receipt', 'scope'])
    }
  })

  test('marks lost started work EFFECT_UNKNOWN and never retries it', async () => {
    const h = harness(receipt('lost'))
    const outcome = await reconcileNodeToolIntent(identity, h.ports)
    expect(outcome).toMatchObject({
      state: 'unknown',
      result: { hostFailure: { code: 'EFFECT_UNKNOWN', executionStarted: true } },
    })
    expect(h.calls).toEqual(['scope', 'receipt', 'scope'])
  })

  test('settles known-not-started only after a validated online absent receipt; retry requires fresh admission', async () => {
    const h = harness(receipt('absent'))
    expect(await reconcileNodeToolIntent(identity, h.ports)).toEqual({
      state: 'never-accepted',
      executionStarted: false,
    })
    expect(h.calls).toEqual(['scope', 'receipt', 'scope', 'settle-not-started'])
  })

  test('connection failure cannot be interpreted as absent or authorize replay', async () => {
    const h = harness(receipt('absent'))
    h.ports.readReceipt = async () => {
      throw new Error('B unavailable')
    }
    await expect(reconcileNodeToolIntent(identity, h.ports)).rejects.toThrow('B unavailable')
    expect(h.calls).toEqual(['scope'])
  })

  test('scope is rechecked before applying any receipt consequence', async () => {
    const h = harness(receipt('absent'))
    let checks = 0
    h.ports.assertCurrentScope = async () => {
      if (++checks === 2) throw new Error('Node root changed')
    }
    await expect(reconcileNodeToolIntent(identity, h.ports)).rejects.toThrow('Node root changed')
    expect(h.calls).not.toContain('settle-not-started')
    expect(h.calls).not.toContain('commit:done')
  })
})
