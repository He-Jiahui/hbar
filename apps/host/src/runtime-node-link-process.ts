import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  nodeRegistryStateMethods,
  type NodeRegistryStatePort,
  type NodeRegistryOutput,
} from '@hbar/contracts/node-registry'
import { nodeWorkspaceMethods, NODE_LIMITS } from '@hbar/contracts/node'
import { boundedNodeResult } from '@hbar/contracts/node-output'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import {
  NodeRegistryService,
  ConversationNodeConnections,
  NodeObservationService,
  type NodeObservationSource,
} from '@hbar/node-link'
import {
  NODE_LINK_RUNTIME_FINGERPRINT,
  runtimeNodeOpenSchema,
  runtimeNodeFrameSchema,
  runtimeNodeCloseSchema,
  runtimeNodeCallSchema,
  runtimeNodeObservationMethods,
  runtimeNodeManagementMethods,
} from './runtime-node-link-contract'

/** Invitations, identities, node peers and their heartbeats belong to this managed owner, never the stable listener. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  z.strictObject({}).parse(context.configuration)
  let registry: NodeRegistryService | null = null,
    connections: ConversationNodeConnections | null = null
  let live = false,
    requests = 0,
    outputBytes = 0,
    outputs = 0
  let initialized = false,
    disposed = false,
    activating = false,
    drained = false
  let physicalStateCalls = 0
  let outputUnknown = false
  const state: NodeRegistryStatePort = {
    async call(method, input) {
      const entry = nodeRegistryStateMethods[method]
      const parsed = entry.input.parse(input)
      physicalStateCalls++
      let settled = false
      const result: unknown = await context.peer.call<unknown>('nodeLink.registry.' + method, parsed, entry.output, {
        onDispatchSettled: () => {
          if (settled) return
          settled = true
          physicalStateCalls--
        },
      })
      // The method-selected schema validates this correlated generic output.
      return entry.output.parse(result) as NodeRegistryOutput<typeof method>
    },
  }
  const source: NodeObservationSource = {
    node: (nodeId) => state.call('node.get', { nodeId }),
    list: (nodeId, after, limit) =>
      context.peer.call(
        'nodeLink.observation.list',
        { nodeId, limit, ...(after ? { after } : {}) },
        runtimeNodeObservationMethods.list.output,
      ),
    session: (sessionId) =>
      context.peer.call('nodeLink.observation.session', { sessionId }, runtimeNodeObservationMethods.session.output),
    workspace: (workspaceId) =>
      context.peer.call(
        'nodeLink.observation.workspace',
        { workspaceId },
        runtimeNodeObservationMethods.workspace.output,
      ),
    snapshot: (sessionId, before, limit) =>
      context.peer.call(
        'nodeLink.observation.snapshot',
        { sessionId, limit, ...(before === undefined ? {} : { before }) },
        runtimeNodeObservationMethods.snapshot.output,
      ),
    events: (sessionId, after, limit) =>
      context.peer.call(
        'nodeLink.observation.events',
        { sessionId, after, limit },
        runtimeNodeObservationMethods.events.output,
      ),
  }
  const observation = new NodeObservationService(source)
  const owner = (): ConversationNodeConnections => {
    if (!live || context.preparing() || !connections)
      throw new HbarError('NODE_LINK_UNAVAILABLE', 'Node link owner is preparing or draining')
    return connections
  }
  const publish = (
    event:
      | { kind: 'send'; connectionId: string; text: string }
      | { kind: 'close'; connectionId: string; code: number; reason: string },
  ): boolean => {
    const bytes = 'text' in event ? Buffer.byteLength(event.text) : 256
    if (event.kind === 'send' && (outputs >= 64 || outputBytes + bytes > 8 * NODE_LIMITS.frameBytes)) return false
    outputs++
    outputBytes += bytes
    void context.peer
      .notify('nodeLink.transport', event)
      .catch(() => {
        outputUnknown = true
        context.peer.close(new HbarError('NODE_TRANSPORT_FAILED', 'Node transport delivery failed'))
      })
      .finally(() => {
        outputs--
        outputBytes -= bytes
      })
    return true
  }
  const register = <Input, Output>(
    method: string,
    input: z.ZodType<Input>,
    output: z.ZodType<Output>,
    invoke: (value: Input, signal: AbortSignal) => Promise<Output> | Output,
  ) =>
    context.peer.register(
      method,
      procedure(input, output, async (value, invocation) => {
        owner()
        requests++
        try {
          return await invoke(value, invocation.signal)
        } finally {
          requests--
        }
      }),
    )
  register('nodeLink.open', runtimeNodeOpenSchema, z.undefined(), (input) => {
    const current = owner()
    current.open(input.connectionId, input.source, {
      send: (text) => publish({ kind: 'send', connectionId: input.connectionId, text }),
      close: (code, reason) => {
        publish({ kind: 'close', connectionId: input.connectionId, code, reason })
      },
    })
  })
  register('nodeLink.frame', runtimeNodeFrameSchema, z.undefined(), (input) =>
    owner().receive(input.connectionId, input.text),
  )
  register('nodeLink.close', runtimeNodeCloseSchema, z.undefined(), (input) =>
    owner().closeConnection(input.connectionId),
  )
  register('nodeLink.call', runtimeNodeCallSchema, z.unknown(), (input, signal) =>
    owner().call(input.nodeId, input.method, nodeWorkspaceMethods[input.method].input.parse(input.input), signal),
  )
  register(
    'nodeLink.invite',
    runtimeNodeManagementMethods.invite.input,
    runtimeNodeManagementMethods.invite.output,
    async (input) => {
      if (!registry) throw new HbarError('NODE_LINK_UNAVAILABLE', 'Node registry is preparing')
      return registry.invite(input.name)
    },
  )
  register(
    'nodeLink.list',
    runtimeNodeManagementMethods.list.input,
    runtimeNodeManagementMethods.list.output,
    async (input) => {
      const nodes = (await owner().list())
        .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
        .filter((node) => !input.after || node.nodeId > input.after)
      const items = nodes.slice(0, input.limit)
      return runtimeNodeManagementMethods.list.output.parse(
        boundedNodeResult({ items, nextCursor: nodes.length > input.limit ? (items.at(-1)?.nodeId ?? null) : null }),
      )
    },
  )
  register(
    'nodeLink.revoke',
    runtimeNodeManagementMethods.revoke.input,
    runtimeNodeManagementMethods.revoke.output,
    async (input) => {
      if (!registry) throw new HbarError('NODE_LINK_UNAVAILABLE', 'Node registry is preparing')
      return registry.revoke(input.selector)
    },
  )
  const idle = () => {
    const registration = registry?.idleSnapshot()
    const transport = connections?.idleSnapshot()
    const resources =
      outputs +
      outputBytes +
      physicalStateCalls +
      Number(outputUnknown) +
      (registration?.invitations ?? 0) +
      (registration?.pendingInvitations ?? 0) +
      (registration?.consumingInvitations ?? 0) +
      (registration?.rateLimitSources ?? 0) +
      (transport?.connections ?? 0) +
      (transport?.handshakes ?? 0) +
      (transport?.physicalBackground ?? 0) +
      (transport?.physicalRequests ?? 0) +
      Number(transport?.uncertainRemote === true) +
      (transport?.rateLimitSources ?? 0)
    return {
      eligible: initialized && !disposed && !context.preparing() && registry !== null && connections !== null,
      requests,
      runs: 0,
      resources,
    }
  }
  return {
    idle,
    async prepare() {
      return {
        contractFingerprint: NODE_LINK_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: [
          'nodeLink.open',
          'nodeLink.frame',
          'nodeLink.close',
          'nodeLink.call',
          'nodeLink.invite',
          'nodeLink.list',
          'nodeLink.revoke',
        ],
      }
    },
    async activate(role) {
      if (disposed || initialized || activating || drained)
        throw new HbarError('RUNTIME_LIFECYCLE', 'Node link owner cannot reactivate')
      if (role !== 'default') return
      activating = true
      try {
        const opened = await NodeRegistryService.open(state)
        if (disposed || drained) {
          opened.dispose()
          throw new HbarError('RUNTIME_LIFECYCLE', 'Node link activation was retired')
        }
        registry = opened
        connections = new ConversationNodeConnections(registry, {
          observe: (nodeId, method, input, signal) => observation.invoke(nodeId, method, input, signal),
        })
        initialized = true
        live = true
      } finally {
        activating = false
      }
    },
    async drain() {
      drained = true
      live = false
      connections?.dispose()
      const state = idle()
      return { requests: state.requests, runs: state.runs, resources: state.resources }
    },
    async dispose() {
      disposed = true
      live = false
      connections?.dispose()
      registry?.dispose()
    },
  }
}
