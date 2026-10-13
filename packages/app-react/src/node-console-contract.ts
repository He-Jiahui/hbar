import type { StoreApi } from 'zustand/vanilla'
import { nodeConsoleMethods } from '@hbar/contracts/node-console'
import type { z } from 'zod'

type NodeStatus = z.output<(typeof nodeConsoleMethods)['node.status']['output']>
type NodeFloor = z.output<(typeof nodeConsoleMethods)['node.policy.get']['output']>
type NodePolicySnapshot = z.output<(typeof nodeConsoleMethods)['node.policy.snapshot']['output']>
type NodeAuditEntry = z.output<(typeof nodeConsoleMethods)['node.audit']['output']>[number]
type NodeObservedSession = z.output<(typeof nodeConsoleMethods)['observe.sessions.list']['output']>['items'][number]
type NodeObservedSnapshot = z.output<(typeof nodeConsoleMethods)['observe.sessions.snapshot']['output']>

export interface NodeConsoleState {
  readonly consoleId: string
  readonly role: 'operator' | 'observer' | null
  readonly roleVerified: boolean
  readonly busy: boolean
  readonly status: NodeStatus | null
  readonly floor: NodeFloor | null
  readonly policyDraft: NodeFloor | null
  readonly policyRevision: NodePolicySnapshot['revision'] | null
  readonly policyDraftRevision: NodePolicySnapshot['revision'] | null
  readonly audit: readonly NodeAuditEntry[]
  readonly auditAfter: number
  readonly auditHasMore: boolean
  readonly sessions: readonly NodeObservedSession[]
  readonly sessionCursor: string | null
  readonly selectedSessionId: string | null
  readonly snapshot: NodeObservedSnapshot | null
  readonly connectionError: string | null
  readonly policyError: string | null
  readonly actionError: string | null
  readonly auditError: string | null
  readonly observationError: string | null
  readonly loadingAudit: boolean
  readonly loadingSessions: boolean
  readonly loadingSnapshot: boolean
  readonly loadingMoreSessions: boolean
  readonly pendingOperationId: string | null
  readonly pausing: boolean
  readonly revision: number
}

export interface NodeConsoleModel {
  readonly store: StoreApi<NodeConsoleState>
  readonly start: () => void
  readonly stop: () => void
  readonly refresh: () => Promise<void>
  readonly loadPolicy: () => Promise<void>
  readonly setPolicyDraft: (draft: NodeFloor) => void
  readonly updatePolicy: (floor: NodeFloor) => Promise<void>
  readonly setPaused: (paused: boolean) => Promise<void>
  readonly terminate: (operationId: string) => Promise<void>
  readonly loadAudit: (append?: boolean) => Promise<void>
  readonly loadSessions: (append?: boolean) => Promise<void>
  readonly selectSession: (sessionId: string) => Promise<void>
  readonly dispose: () => void
}

export interface NodeConsoleEntryState {
  readonly phase: 'loading' | 'unpaired' | 'pairing' | 'ready' | 'failed'
  readonly deviceName: string
  readonly pairingCode: string
  readonly device: { readonly deviceId: string; readonly role: 'operator' | 'observer' } | null
  readonly consoleModel: NodeConsoleModel | null
  readonly errorCode: string | null
  readonly errorKind: 'pairing' | 'credentials' | 'storage' | null
}

export interface NodeConsoleEntryModel {
  readonly store: StoreApi<NodeConsoleEntryState>
  readonly setDeviceName: (value: string) => void
  readonly setPairingCode: (value: string) => void
  readonly pair: () => Promise<void>
  readonly retryLoad: () => Promise<void>
  /** Removes this browser's B key only; it does not revoke the server-side device. */
  readonly forgetDevice: () => Promise<void>
  readonly dispose: () => void
}
