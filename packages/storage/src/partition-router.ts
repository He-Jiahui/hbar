import type { StorageCall } from './types'
import type { PartitionManifest } from './partition-manifest'
import type { PartitionLocatorReader } from './partition-locator'
import type { LocatorResolution, SessionLocator } from './partition-locator-schema'
import { locatorEntityIdSchema } from './partition-locator-schema'
import { partitionRouteCatalog } from './partition-route-catalog'

type SessionReadMethod = {
  [K in keyof typeof partitionRouteCatalog]: (typeof partitionRouteCatalog)[K]['route'] extends 'session-read'
    ? K
    : never
}[keyof typeof partitionRouteCatalog]
type SessionReadCall = Extract<StorageCall, { method: SessionReadMethod }>

// A separate selector allowlist keeps runtime catalog corruption fail-closed.
// Its mapped type also makes an intentionally enabled new method require a selector.
const sessionReadSelectors = {
  session: true,
  findSession: true,
  sessionSummary: true,
  snapshot: true,
  events: true,
  context: true,
  runByRequest: true,
  runFileChanges: true,
  runFileChangeDiff: true,
  runFileChangeVersions: true,
  readEventPage: true,
  run: true,
  runtimeExecutionRead: true,
  runtimeRecoveryRead: true,
  recoveryInputMessage: true,
  approval: true,
  runtimeRecoveryChain: true,
} satisfies { readonly [K in SessionReadMethod]: true }

function hasSessionReadSelector(call: StorageCall): call is SessionReadCall {
  return Object.hasOwn(sessionReadSelectors, call.method)
}

export interface PartitionRoutingContext {
  readonly manifest: PartitionManifest
  readonly locators: PartitionLocatorReader
}
export type PartitionRouteDecision =
  | { readonly status: 'resolved'; readonly session: SessionLocator; readonly call: StorageCall }
  | {
      readonly status:
        | 'unsupported'
        | 'coordinator-required'
        | 'lifecycle-reserved'
        | 'missing'
        | 'recovering'
        | 'tombstoned'
        | 'wrong-generation'
    }

/** Pure selection only: never executes a method, opens a database or falls back to legacy/global. */
export function resolvePartitionRoute(call: StorageCall, context: PartitionRoutingContext): PartitionRouteDecision {
  // Check the live catalog explicitly, including JavaScript callers bypassing TS.
  if (!Object.hasOwn(partitionRouteCatalog, call.method)) throw new Error('PARTITION_ROUTE_UNKNOWN_METHOD')
  const definition = partitionRouteCatalog[call.method]
  if (definition.route !== 'session-read') return { status: definition.route }
  if (!hasSessionReadSelector(call)) throw new Error('PARTITION_ROUTE_SELECTOR_MISSING')
  if (context.manifest.activeGeneration !== context.locators.generation) return { status: 'wrong-generation' }
  let resolution: LocatorResolution
  switch (call.method) {
    case 'session':
    case 'findSession':
    case 'sessionSummary':
    case 'snapshot':
    case 'events':
    case 'context':
    case 'runByRequest':
    case 'runFileChanges':
    case 'runFileChangeDiff':
    case 'runFileChangeVersions':
      resolution = context.locators.resolveSession(locatorEntityIdSchema.parse(call.args[0]))
      break
    case 'readEventPage':
      resolution = context.locators.resolveSession(locatorEntityIdSchema.parse(call.args[0].sessionId))
      break
    case 'run':
    case 'runtimeExecutionRead':
    case 'runtimeRecoveryRead':
    case 'recoveryInputMessage':
      resolution = context.locators.resolveEntity('run', locatorEntityIdSchema.parse(call.args[0]))
      break
    case 'approval':
      resolution = context.locators.resolveEntity('approval', locatorEntityIdSchema.parse(call.args[0]))
      break
    case 'runtimeRecoveryChain':
      resolution = context.locators.resolveEntity('recoveryChain', locatorEntityIdSchema.parse(call.args[0]))
      break
    default:
      // An accidentally enabled catalog method cannot acquire an implicit global route.
      throw new Error('PARTITION_ROUTE_SELECTOR_MISSING')
  }
  if (resolution.status !== 'active') return resolution
  const session = resolution.session
  if (session.address.generation !== context.manifest.activeGeneration) return { status: 'wrong-generation' }
  // Multi-ID reads must agree too; neither a caller's Session nor authority may
  // smuggle a different Run into the selected owner database.
  if (
    call.method === 'runFileChanges' ||
    call.method === 'runFileChangeDiff' ||
    call.method === 'runFileChangeVersions'
  ) {
    const runOwner = context.locators.resolveEntity('run', locatorEntityIdSchema.parse(call.args[1]))
    if (runOwner.status !== 'active') return runOwner
    if (
      runOwner.session.sessionId !== session.sessionId ||
      JSON.stringify(runOwner.session.address) !== JSON.stringify(session.address)
    )
      throw new Error('PARTITION_ROUTE_IDENTITY_CONFLICT')
  }
  if (call.authority) {
    if (call.authority.sessionId !== session.sessionId) throw new Error('PARTITION_ROUTE_AUTHORITY_MISMATCH')
    const leaseOwner = context.locators.resolveEntity('run', call.authority.runId)
    if (
      leaseOwner.status !== 'active' ||
      leaseOwner.session.sessionId !== session.sessionId ||
      JSON.stringify(leaseOwner.session.address) !== JSON.stringify(session.address)
    )
      throw new Error('PARTITION_ROUTE_AUTHORITY_MISMATCH')
  }
  // A future asynchronous locator implementation must use a revision-pinned read.
  // This synchronous interface cannot yield between selection and confirmation.
  const confirmed = context.locators.resolveSession(session.sessionId)
  if (
    confirmed.status !== 'active' ||
    confirmed.session.revision !== session.revision ||
    JSON.stringify(confirmed.session.address) !== JSON.stringify(session.address)
  )
    return { status: 'recovering' }
  return { status: 'resolved', session, call }
}
