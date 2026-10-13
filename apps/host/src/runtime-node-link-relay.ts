import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS, nodeWorkspaceMethods, nodeRequestTimeoutMs, type NodeWorkspaceMethod } from '@hbar/contracts/node'
import { nodeRegistryStateMethods, type NodeRegistryStatePort } from '@hbar/contracts/node-registry'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { NodeListInput } from '@hbar/contracts/node-management'
import { procedure, type IpcPeer } from '@hbar/runtime'
import type { NodeWireTransport, NodeObservationSource } from '@hbar/node-link'
import {
  runtimeNodeOpenSchema,
  runtimeNodeFrameSchema,
  runtimeNodeCloseSchema,
  runtimeNodeTransportSchema,
  runtimeNodeManagementMethods,
  runtimeNodeObservationMethods,
  type RuntimeNodeLinkPort,
} from './runtime-node-link-contract'

export interface RuntimeNodeLinkEndpoint {
  readonly owner: RuntimeOwner
  readonly peer: IpcPeer
}
interface SocketBinding {
  readonly endpoint: RuntimeNodeLinkEndpoint
  readonly transport: NodeWireTransport
  opening: Promise<void>
  pending: number
}
/** Stable bounded socket adapter. It cannot decode node methods, make pairing decisions or own a network peer. */
export class RuntimeNodeLinkRelay implements RuntimeNodeLinkPort {
  private readonly sockets = new Map<string, SocketBinding>()
  private pending = 0
  constructor(
    private readonly options: {
      current(): RuntimeNodeLinkEndpoint
      authorized(owner: RuntimeOwner): boolean
      state: NodeRegistryStatePort
      observations: NodeObservationSource
    },
  ) {}
  private assert(owner: RuntimeOwner): void {
    if (!this.options.authorized(owner))
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Node link owner authority has expired')
  }
  attach(peer: IpcPeer, owner: RuntimeOwner): () => void {
    const cleanup: Array<() => void> = [
      peer.onEvent('nodeLink.transport', runtimeNodeTransportSchema, (event) => {
        const binding = this.sockets.get(event.connectionId)
        if (!binding || binding.endpoint.owner.incarnation !== owner.incarnation) return
        if (event.kind === 'close') {
          this.sockets.delete(event.connectionId)
          binding.transport.close(event.code, event.reason)
        } else if (!this.options.authorized(owner) || !binding.transport.send(event.text))
          this.closeConnection(event.connectionId)
      }),
    ]
    for (const [method, entry] of Object.entries(nodeRegistryStateMethods)) {
      const registryMethod = z
        .custom<keyof typeof nodeRegistryStateMethods>(
          (value) => typeof value === 'string' && Object.hasOwn(nodeRegistryStateMethods, value),
        )
        .parse(method)
      cleanup.push(
        peer.register(
          'nodeLink.registry.' + method,
          procedure<unknown, unknown>(entry.input, entry.output, async (input) => {
            this.assert(owner)
            return this.options.state.call(registryMethod, nodeRegistryStateMethods[registryMethod].input.parse(input))
          }),
        ),
      )
    }
    const source = this.options.observations
    cleanup.push(
      peer.register(
        'nodeLink.observation.list',
        procedure(
          runtimeNodeObservationMethods.list.input,
          runtimeNodeObservationMethods.list.output,
          async (input) => {
            this.assert(owner)
            return source.list(input.nodeId, input.after, input.limit)
          },
        ),
      ),
      peer.register(
        'nodeLink.observation.session',
        procedure(
          runtimeNodeObservationMethods.session.input,
          runtimeNodeObservationMethods.session.output,
          async (input) => {
            this.assert(owner)
            return source.session(input.sessionId)
          },
        ),
      ),
      peer.register(
        'nodeLink.observation.workspace',
        procedure(
          runtimeNodeObservationMethods.workspace.input,
          runtimeNodeObservationMethods.workspace.output,
          async (input) => {
            this.assert(owner)
            return source.workspace(input.workspaceId)
          },
        ),
      ),
      peer.register(
        'nodeLink.observation.snapshot',
        procedure(
          runtimeNodeObservationMethods.snapshot.input,
          runtimeNodeObservationMethods.snapshot.output,
          async (input) => {
            this.assert(owner)
            return source.snapshot(input.sessionId, input.before, input.limit)
          },
        ),
      ),
      peer.register(
        'nodeLink.observation.events',
        procedure(
          runtimeNodeObservationMethods.events.input,
          runtimeNodeObservationMethods.events.output,
          async (input) => {
            this.assert(owner)
            return source.events(input.sessionId, input.after, input.limit)
          },
        ),
      ),
    )
    return () => {
      for (const remove of cleanup) remove()
      this.exited(owner)
    }
  }
  async open(connectionId: string, source: string, transport: NodeWireTransport): Promise<void> {
    if (this.sockets.has(connectionId) || this.sockets.size >= 1_000)
      throw new HbarError('NODE_BUSY', 'Stable node socket capacity reached')
    const endpoint = this.options.current()
    this.assert(endpoint.owner)
    const input = runtimeNodeOpenSchema.parse({ connectionId, source })
    const binding: SocketBinding = { endpoint, transport, opening: Promise.resolve(), pending: 0 }
    this.sockets.set(connectionId, binding)
    binding.opening = endpoint.peer.call('nodeLink.open', input, z.undefined(), { timeoutMs: 10_000 })
    try {
      await binding.opening
    } catch (error) {
      this.closeConnection(connectionId)
      throw error
    }
  }
  async receive(connectionId: string, text: string): Promise<void> {
    const binding = this.sockets.get(connectionId)
    if (!binding) throw new HbarError('NODE_OFFLINE', 'Node socket has no bound owner')
    if (
      Buffer.byteLength(text) > NODE_LIMITS.frameBytes ||
      binding.pending >= NODE_LIMITS.inflight ||
      this.pending >= 64
    ) {
      this.closeConnection(connectionId)
      throw new HbarError('NODE_BUSY', 'Node frame admission exceeded its bound')
    }
    binding.pending++
    this.pending++
    try {
      await binding.opening
      this.assert(binding.endpoint.owner)
      if (this.sockets.get(connectionId) !== binding) throw new HbarError('NODE_OFFLINE', 'Node socket was superseded')
      await binding.endpoint.peer.call(
        'nodeLink.frame',
        runtimeNodeFrameSchema.parse({ connectionId, text }),
        z.undefined(),
        { timeoutMs: 30_000 },
      )
    } catch (error) {
      this.closeConnection(connectionId)
      throw error
    } finally {
      binding.pending--
      this.pending--
    }
  }
  closeConnection(connectionId: string): void {
    const binding = this.sockets.get(connectionId)
    if (!binding) return
    this.sockets.delete(connectionId)
    try {
      binding.transport.close(4000, 'Node link closed; reconnect to authenticate')
    } finally {
      void binding.endpoint.peer
        .call('nodeLink.close', runtimeNodeCloseSchema.parse({ connectionId }), z.undefined(), { timeoutMs: 5_000 })
        .catch(() => {})
    }
  }
  exited(owner: RuntimeOwner): void {
    for (const [id, binding] of this.sockets) {
      if (binding.endpoint.owner.incarnation !== owner.incarnation) continue
      this.sockets.delete(id)
      try {
        binding.transport.close(4000, 'Node link owner was replaced; authenticate again')
      } catch {
        /* Release every owned socket. */
      }
    }
  }
  async invite(name: string) {
    const endpoint = this.options.current()
    this.assert(endpoint.owner)
    return endpoint.peer.call(
      'nodeLink.invite',
      runtimeNodeManagementMethods.invite.input.parse({ name }),
      runtimeNodeManagementMethods.invite.output,
    )
  }
  async list(input: NodeListInput = {}) {
    const endpoint = this.options.current()
    this.assert(endpoint.owner)
    return endpoint.peer.call(
      'nodeLink.list',
      runtimeNodeManagementMethods.list.input.parse(input),
      runtimeNodeManagementMethods.list.output,
    )
  }
  async revoke(selector: string) {
    const endpoint = this.options.current()
    this.assert(endpoint.owner)
    return endpoint.peer.call(
      'nodeLink.revoke',
      runtimeNodeManagementMethods.revoke.input.parse({ selector }),
      runtimeNodeManagementMethods.revoke.output,
    )
  }
  async call<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal?: AbortSignal,
  ) {
    const endpoint = this.options.current()
    this.assert(endpoint.owner)
    const output = nodeWorkspaceMethods[method].output
    const result: unknown = await endpoint.peer.call<unknown>('nodeLink.call', { nodeId, method, input }, output, {
      ...(signal ? { signal } : {}),
      timeoutMs: nodeRequestTimeoutMs(method, input) + 15_000,
    })
    // The selected node-method schema validates this associated generic output.
    return output.parse(result) as z.output<(typeof nodeWorkspaceMethods)[Method]['output']>
  }
}
