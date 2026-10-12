import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { workspaceLocationOf } from '@hbar/contracts/node-address'
import {
  nodeCallAuthoritySchema,
  nodeIdSchema,
  nodeWorkspaceMethods,
  nodeRequestTimeoutMs,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'

const methodSchema = z.custom<NodeWorkspaceMethod>(
  (value) => typeof value === 'string' && Object.hasOwn(nodeWorkspaceMethods, value),
)
const argumentsSchema = z.tuple([
  nodeIdSchema,
  methodSchema,
  z.unknown(),
  z.instanceof(AbortSignal).optional(),
  z.number().int().min(1).max(1_205_000).optional(),
])
export interface RuntimeNodeExecutionBinding {
  readonly node: Pick<RuntimeNodeLinkPort, 'call'>
  readonly scope?: WorkspaceExecutionScope | undefined
  readonly execution?: ExecutionOwnership | undefined
  readonly signal: AbortSignal
  /** A still-owned invocation can settle its exact operation after the original signal aborts. */
  readonly settlement?: boolean
}

/** Only named JSON DTOs reach the node owner; admission and identity remain captured on A. */
export async function invokeRuntimeNodeExecution(
  binding: RuntimeNodeExecutionBinding,
  args: readonly unknown[],
): Promise<unknown> {
  const [nodeId, method, rawInput, requestedSignal, claimedTimeout] = argumentsSchema.parse(args)
  const input = nodeWorkspaceMethods[method].input.parse(rawInput)
  if (claimedTimeout !== undefined && claimedTimeout !== nodeRequestTimeoutMs(method, input))
    throw new HbarError('INVALID_INPUT', 'Node request timeout differs from its validated operation budget')
  const metadata = method === 'node.capabilities' || method === 'fs.canonicalize'
  const scope = binding.scope
  if (!scope) {
    if (!metadata || binding.settlement)
      throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node effects require their original workspace invocation')
  } else {
    const location = workspaceLocationOf(scope.workspace)
    if (location.kind !== 'node' || location.nodeId !== nodeId)
      throw new HbarError('WORKSPACE_SCOPE', 'Node request does not belong to the captured workspace')
    if ('rootId' in input && (input.rootId !== location.rootId || input.expectedRoot !== location.nodePath))
      throw new HbarError('WORKSPACE_SCOPE', 'Node request differs from the exact captured root')
    const authority = scope.authority
    if (!metadata && (!authority || !binding.execution))
      throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node effects require completed tool admission and a Run lease')
    if (authority) {
      if (
        !binding.execution ||
        authority.runId !== binding.execution.runId ||
        authority.sessionId !== binding.execution.sessionId
      )
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Node admission differs from the owned Run')
      const submitted =
        method === 'exec.start'
          ? nodeCallAuthoritySchema.parse(
              Object.fromEntries(
                Object.keys(nodeCallAuthoritySchema.shape).map((key) => [key, Reflect.get(input, key)]),
              ),
            )
          : 'authority' in input
            ? nodeCallAuthoritySchema.parse(input.authority)
            : undefined
      if (submitted && JSON.stringify(submitted) !== JSON.stringify(nodeCallAuthoritySchema.parse(authority)))
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Node request replaced its completed admission')
      if ('operationId' in input && input.operationId !== `${authority.runId}:${authority.callId}`)
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Node request refers to another tool operation')
      if (method === 'sandbox.put') {
        const snapshot = nodeWorkspaceMethods[method].input.parse(input)
        if (
          !authority.sandbox ||
          snapshot.ref.profileId !== authority.sandbox.profileId ||
          snapshot.ref.digest !== authority.sandbox.digest
        )
          throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Node snapshot differs from the original pinned profile')
      }
    }
  }
  if (binding.settlement && method !== 'exec.cancel' && method !== 'exec.receipt')
    throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Settlement can only cancel or read the original process receipt')
  const signal = AbortSignal.any([
    binding.signal,
    ...(requestedSignal ? [requestedSignal] : []),
    ...(!binding.settlement && scope ? [scope.signal] : []),
  ])
  signal.throwIfAborted()
  return nodeWorkspaceMethods[method].output.parse(await binding.node.call(nodeId, method, input, signal))
}
