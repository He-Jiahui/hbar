import type { NodeReceipt } from '@hbar/contracts/node'
import type { NodeCallAuthority } from '@hbar/contracts/node'
import type { ToolResult } from '@hbar/plugin-sdk'

/** A durable A-side intent paired with the exact operation ID allocated before dispatch. */
export interface NodeToolIntentRecoveryIdentity {
  readonly workspaceId: string
  readonly sessionId: string
  readonly runId: string
  readonly callId: string
  readonly operationId: string
  readonly name: string
  readonly args: unknown
  readonly nodeId: string
  readonly rootId: string
  readonly nodePath: string
  readonly kind: 'process' | 'file'
  /** The exact pinned admission persisted with the original toolStart transaction. */
  readonly authority: NodeCallAuthority
}

export type NodeToolIntentRecoveryResult =
  | { readonly state: 'settled'; readonly result: ToolResult }
  | { readonly state: 'waiting' }
  | { readonly state: 'unknown'; readonly result: ToolResult }
  | { readonly state: 'never-accepted'; readonly executionStarted: false }

/**
 * Reconcile one durable A intent against B's exact receipt. Callbacks must validate the
 * current Run, node, root, and captured admission each time; this function deliberately
 * cannot infer B's absence from a failed connection or an unvalidated response.
 */
export async function reconcileNodeToolIntent(
  identity: NodeToolIntentRecoveryIdentity,
  ports: {
    readonly assertCurrentScope: (identity: NodeToolIntentRecoveryIdentity) => Promise<void>
    /** Resolves only after B is authenticated and the exact receipt response validates. */
    readonly readReceipt: (operationId: string) => Promise<NodeReceipt>
    /** Persist B's exact result as A's original tool result and settle its intent. */
    readonly commitSettled: (identity: NodeToolIntentRecoveryIdentity, result: ToolResult) => Promise<void>
    /** Settle the original intent as known-not-started; any retry must pass normal admission again. */
    readonly settleNeverAccepted: (identity: NodeToolIntentRecoveryIdentity) => Promise<void>
  },
): Promise<NodeToolIntentRecoveryResult> {
  await ports.assertCurrentScope(identity)
  const receipt = await ports.readReceipt(identity.operationId)
  await ports.assertCurrentScope(identity)
  switch (receipt.state) {
    case 'settled': {
      const result: ToolResult = {
        text: receipt.result.text,
        isError: receipt.result.isError,
        details: receipt.result.details,
      }
      await ports.commitSettled(identity, result)
      return { state: 'settled', result }
    }
    case 'accepted':
    case 'started':
      return { state: 'waiting' }
    case 'lost':
      return {
        state: 'unknown',
        result: {
          text: 'The remote process may have produced effects before its receipt was lost. Inspect state before retrying.',
          isError: true,
          details: { code: 'EFFECT_UNKNOWN', executionStarted: true, reason: receipt.reason },
          hostFailure: { code: 'EFFECT_UNKNOWN', executionStarted: true },
        },
      }
    case 'absent':
      // Absence is actionable only because readReceipt resolved from the live, verified B.
      await ports.settleNeverAccepted(identity)
      return { state: 'never-accepted', executionStarted: false }
  }
}
