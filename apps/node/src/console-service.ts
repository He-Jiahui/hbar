import { createHash, randomInt, randomUUID } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { NODE_PROTOCOL_VERSION, nodeObservationMethods } from '@hbar/contracts/node'
import { nodeInfoSchema, type NodeInfo } from '@hbar/contracts/node-info'
import {
  nodeConsoleDeviceViewSchema,
  nodeConsoleMethods,
  nodeConsolePairResultSchema,
  type NodeConsoleMethod,
} from '@hbar/contracts/node-console'
import type { NodeStatePort, nodeConsoleDeviceSchema } from '@hbar/contracts/node-state'
import type { NodeLinkStatus } from '@hbar/contracts/node-link-state'
import {
  nodeFingerprint,
  nodeIdFromPublicKey,
  type NodeIdentity,
  type WorkspaceNodeService,
  validateNodeRoots,
} from '@hbar/node-core'
import { z } from 'zod'

export interface NodeConsolePrincipal {
  readonly kind: 'bootstrap' | 'device'
  readonly deviceId: string | null
  readonly role: 'operator' | 'observer'
  readonly roots: readonly string[]
}

export interface NodeConsoleObservationPort {
  observe(
    method: 'observe.sessions.list',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.list']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>>
  observe(
    method: 'observe.sessions.snapshot',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.snapshot']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.snapshot']['output']>>
  observe(
    method: 'observe.sessions.follow',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.follow']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.follow']['output']>>
}

type StoredConsoleDevice = z.infer<typeof nodeConsoleDeviceSchema>
interface ObserverCursor {
  readonly deviceId: string
  readonly rootsKey: string
  readonly upstreamCursor: string
  readonly expiresAt: number
}
const observerCursorTtlMs = 5 * 60_000
const observerCursorCapacity = 4_096
const observerPageScanLimit = 500
const bootstrapPrincipal: NodeConsolePrincipal = {
  kind: 'bootstrap',
  deviceId: null,
  role: 'operator',
  roots: [],
}

function deviceView(device: StoredConsoleDevice) {
  return nodeConsoleDeviceViewSchema.parse({
    deviceId: device.deviceId,
    name: device.name,
    role: device.role,
    roots: device.roots,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
  })
}

function nodeConsolePairResult(device: StoredConsoleDevice) {
  return nodeConsolePairResultSchema.parse({ device: deviceView(device) })
}

function requireOperator(principal: NodeConsolePrincipal): void {
  if (principal.role !== 'operator') throw new HbarError('FORBIDDEN', 'B console operator role is required')
}

function requireObservation(principal: NodeConsolePrincipal): void {
  if (principal.role !== 'operator' && principal.role !== 'observer')
    throw new HbarError('FORBIDDEN', 'B console observation role is required')
}

export class NodeConsoleService {
  private readonly observerCursors = new Map<string, ObserverCursor>()

  constructor(
    private readonly state: NodeStatePort,
    private readonly identity: NodeIdentity,
    private readonly dataRoot: string,
    private readonly node?: WorkspaceNodeService,
    private readonly link?: { readonly linked: boolean; readonly connection: NodeLinkStatus; unlink(): Promise<void> },
    private readonly observation?: NodeConsoleObservationPort,
  ) {}

  info(): NodeInfo {
    return nodeInfoSchema.parse({
      role: 'workspace',
      protocol: NODE_PROTOCOL_VERSION,
      nodeId: nodeIdFromPublicKey(this.identity.publicKey),
      fingerprint: nodeFingerprint(this.identity.publicKey),
      rpcPath: '/rpc',
      consolePath: '/node-console',
    })
  }

  async deviceForAuthentication(deviceId: string): Promise<StoredConsoleDevice | null> {
    const device = await this.state.call('console.device.get', { deviceId })
    return device && device.revokedAt === null ? device : null
  }

  async touchDevice(deviceId: string): Promise<void> {
    const device = await this.state.call('console.device.touch', { deviceId, lastSeenAt: Date.now() })
    if (!device) throw new HbarError('NODE_REVOKED', 'B console device was revoked')
  }

  private async assertActiveDevice(principal: NodeConsolePrincipal): Promise<void> {
    if (principal.kind !== 'device') return
    const current = principal.deviceId ? await this.deviceForAuthentication(principal.deviceId) : null
    if (!current || current.role !== principal.role || current.roots.join('\0') !== principal.roots.join('\0'))
      throw new HbarError('NODE_REVOKED', 'B console device authority is no longer active')
  }

  private async activeObserverRoots(principal: NodeConsolePrincipal): Promise<ReadonlySet<string>> {
    const floor = this.node?.policy ?? (await this.state.call('floor.get', {})) ?? { roots: [] }
    const liveRoots = new Set(floor.roots.map((root) => root.rootId))
    return new Set(principal.roots.filter((rootId) => liveRoots.has(rootId)))
  }

  private observerRootsKey(principal: NodeConsolePrincipal): string {
    return [...principal.roots].sort().join('\0')
  }

  private observerCursor(principal: NodeConsolePrincipal, token: string): string {
    const entry = this.observerCursors.get(token)
    this.observerCursors.delete(token)
    if (
      !entry ||
      entry.expiresAt <= Date.now() ||
      principal.kind !== 'device' ||
      entry.deviceId !== principal.deviceId ||
      entry.rootsKey !== this.observerRootsKey(principal)
    )
      throw new HbarError('FORBIDDEN', 'Observer page cursor is invalid for this device scope')
    this.observerCursors.set(token, entry)
    return entry.upstreamCursor
  }

  private issueObserverCursor(principal: NodeConsolePrincipal, upstreamCursor: string): string {
    const now = Date.now()
    for (const [token, entry] of this.observerCursors) if (entry.expiresAt <= now) this.observerCursors.delete(token)
    if (this.observerCursors.size >= observerCursorCapacity)
      throw new HbarError('NODE_BUSY', 'Observer page cursor capacity reached')
    const token = randomUUID()
    this.observerCursors.set(token, {
      deviceId: principal.deviceId ?? '',
      rootsKey: this.observerRootsKey(principal),
      upstreamCursor,
      expiresAt: now + observerCursorTtlMs,
    })
    return token
  }

  private async listObserverSessions(
    principal: NodeConsolePrincipal,
    request: z.output<(typeof nodeObservationMethods)['observe.sessions.list']['input']>,
    signal: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>> {
    if (!this.observation) throw new HbarError('NODE_OFFLINE', 'Conversation observation link is offline')
    let upstreamCursor = request.cursor ? this.observerCursor(principal, request.cursor) : undefined
    const rootsAtStart = await this.activeObserverRoots(principal)
    const items: z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>['items'] = []
    const visited = new Set<string>()
    let scanned = 0
    let nextCursor: string | null = upstreamCursor ?? null
    let pages = 0
    while (items.length < request.limit && scanned < observerPageScanLimit && pages < observerPageScanLimit) {
      const page = nodeObservationMethods['observe.sessions.list'].output.parse(
        await this.observation.observe(
          'observe.sessions.list',
          { limit: Math.max(1, request.limit - items.length), ...(upstreamCursor ? { cursor: upstreamCursor } : {}) },
          signal,
        ),
      )
      pages++
      scanned += page.items.length
      for (const session of page.items) {
        if (rootsAtStart.has(session.rootId)) items.push(session)
        if (items.length >= request.limit) break
      }
      nextCursor = page.nextCursor
      if (items.length >= request.limit || nextCursor === null || scanned >= observerPageScanLimit) break
      if (visited.has(nextCursor))
        throw new HbarError('NODE_OBSERVATION_INVALID', 'Conversation page cursor did not advance')
      visited.add(nextCursor)
      upstreamCursor = nextCursor
    }
    const activeRoots = await this.activeObserverRoots(principal)
    await this.assertActiveDevice(principal)
    const visible = items.filter((session) => activeRoots.has(session.rootId))
    return nodeObservationMethods['observe.sessions.list'].output.parse({
      items: visible,
      nextCursor: nextCursor === null ? null : this.issueObserverCursor(principal, nextCursor),
    })
  }

  async completePairing(input: { code: string; name: string; publicKey: string; sourceKey: string }): Promise<unknown> {
    const now = Date.now()
    const attempt = await this.state.call('console.pairing.attempt', { sourceKey: input.sourceKey, now })
    if (!attempt.allowed) throw new HbarError('RATE_LIMIT', 'B console pairing attempts are limited')
    const device = await this.state.call('console.pairing.consume', {
      codeDigest: createHash('sha256').update(input.code).digest('hex'),
      deviceId: randomUUID(),
      publicKey: input.publicKey,
      name: input.name,
      now,
    })
    return nodeConsolePairResult(device)
  }

  async pair(input: unknown, principal: NodeConsolePrincipal = bootstrapPrincipal): Promise<unknown> {
    requireOperator(principal)
    const value = nodeConsoleMethods['node.pairing.create'].input.parse(input)
    const floor = this.node?.policy ?? (await this.state.call('floor.get', {})) ?? { roots: [] }
    const knownRoots = new Set(floor.roots.map((root) => root.rootId))
    if (value.role === 'observer' && (!value.roots.length || value.roots.some((root) => !knownRoots.has(root))))
      throw new HbarError('INVALID_INPUT', 'Observer pairing needs one or more currently shared roots')
    if (value.role === 'operator' && value.roots.length)
      throw new HbarError('INVALID_INPUT', 'Operator devices have node-wide scope; omit root restrictions')
    const code = String(randomInt(0, 100_000_000)).padStart(8, '0')
    const createdAt = Date.now()
    const invite = await this.state.call('console.pairing.create', {
      inviteId: randomUUID(),
      codeDigest: createHash('sha256').update(code).digest('hex'),
      role: value.role,
      roots: value.roots,
      createdAt,
    })
    return nodeConsoleMethods['node.pairing.create'].output.parse({
      inviteId: invite.inviteId,
      code,
      expiresAt: invite.expiresAt,
    })
  }

  async invoke(
    method: NodeConsoleMethod,
    input: unknown,
    principal: NodeConsolePrincipal = bootstrapPrincipal,
    signal: AbortSignal = AbortSignal.timeout(10_000),
  ): Promise<unknown> {
    await this.assertActiveDevice(principal)
    const value = nodeConsoleMethods[method].input.parse(input)
    let result: unknown
    switch (method) {
      case 'node.status': {
        requireOperator(principal)
        if (!this.node) throw new HbarError('NODE_OFFLINE', 'Start the workspace node to inspect live status')
        result = {
          capabilities: this.node.capabilities(),
          fingerprint: nodeFingerprint(this.identity.publicKey),
          paused: this.node.isPaused,
          running: this.node.running,
          linked: this.link?.linked ?? !!(await this.state.call('config.get', { key: 'link' })),
          connection: this.link?.connection ?? { phase: 'unlinked', reasonCode: null, nextAttemptAt: null },
        }
        break
      }
      case 'node.policy.get':
        requireOperator(principal)
        result = this.node?.policy ?? (await this.state.call('floor.get', {})) ?? { roots: [] }
        break
      case 'node.policy.set': {
        requireOperator(principal)
        const floor = nodeConsoleMethods['node.policy.set'].input.parse(value)
        result = this.node
          ? await this.node.setPolicy(floor)
          : await this.state.call('floor.set', await validateNodeRoots(floor, this.dataRoot, true))
        break
      }
      case 'node.pause': {
        requireOperator(principal)
        const { paused } = nodeConsoleMethods['node.pause'].input.parse(value)
        if (this.node) await this.node.pause(paused)
        else await this.state.call('config.set', { key: 'paused', value: paused })
        result = { accepted: true }
        break
      }
      case 'node.kill': {
        requireOperator(principal)
        if (!this.node) throw new HbarError('NODE_OFFLINE', 'No live node process to cancel')
        const request = nodeConsoleMethods['node.kill'].input.parse(value)
        const keys = request.all ? this.node.running : [request.operationId ?? '']
        result = await Promise.all(keys.map((operationId) => this.node?.cancel(operationId)))
        break
      }
      case 'node.audit':
        requireOperator(principal)
        result = await this.state.call('audit.list', nodeConsoleMethods['node.audit'].input.parse(value))
        break
      case 'node.unlink':
        requireOperator(principal)
        if (this.link) await this.link.unlink()
        else await this.state.call('config.set', { key: 'link', value: null })
        result = { accepted: true }
        break
      case 'node.pairing.create':
        result = await this.pair(value, principal)
        break
      case 'node.devices.list': {
        requireOperator(principal)
        result = (await this.state.call('console.devices.list', {})).map(deviceView)
        break
      }
      case 'node.device.revoke': {
        requireOperator(principal)
        const request = nodeConsoleMethods['node.device.revoke'].input.parse(value)
        const revoked = await this.state.call('console.device.revoke', {
          deviceId: request.deviceId,
          revokedAt: Date.now(),
        })
        result = revoked ? deviceView(revoked) : null
        break
      }
      case 'observe.sessions.list': {
        requireObservation(principal)
        if (!this.observation) throw new HbarError('NODE_OFFLINE', 'Conversation observation link is offline')
        const request = nodeConsoleMethods[method].input.parse(value)
        if (principal.role === 'operator') {
          result = await this.observation.observe(method, request, signal)
          await this.assertActiveDevice(principal)
        } else result = await this.listObserverSessions(principal, request, signal)
        break
      }
      case 'observe.sessions.snapshot': {
        requireObservation(principal)
        if (!this.observation) throw new HbarError('NODE_OFFLINE', 'Conversation observation link is offline')
        const request = nodeConsoleMethods[method].input.parse(value)
        const snapshot = nodeConsoleMethods[method].output.parse(
          await this.observation.observe(method, request, signal),
        )
        const roots = principal.role === 'observer' ? await this.activeObserverRoots(principal) : null
        if (roots && !roots.has(snapshot.session.rootId))
          throw new HbarError('FORBIDDEN', 'Conversation is outside this B device root scope')
        await this.assertActiveDevice(principal)
        result = snapshot
        break
      }
      case 'observe.sessions.follow': {
        requireObservation(principal)
        if (!this.observation) throw new HbarError('NODE_OFFLINE', 'Conversation observation link is offline')
        const request = nodeConsoleMethods[method].input.parse(value)
        if (principal.role === 'observer') {
          const before = nodeConsoleMethods['observe.sessions.snapshot'].output.parse(
            await this.observation.observe(
              'observe.sessions.snapshot',
              { sessionId: request.sessionId, limit: 1 },
              signal,
            ),
          )
          const rootsBefore = await this.activeObserverRoots(principal)
          if (!rootsBefore.has(before.session.rootId))
            throw new HbarError('FORBIDDEN', 'Conversation is outside this B device root scope')
          const followed = await this.observation.observe(method, request, signal)
          const after = nodeConsoleMethods['observe.sessions.snapshot'].output.parse(
            await this.observation.observe(
              'observe.sessions.snapshot',
              { sessionId: request.sessionId, limit: 1 },
              signal,
            ),
          )
          const rootsAfter = await this.activeObserverRoots(principal)
          if (
            before.session.workspaceId !== after.session.workspaceId ||
            before.session.rootId !== after.session.rootId ||
            !rootsAfter.has(after.session.rootId)
          )
            throw new HbarError('NODE_OBSERVATION_CHANGED', 'Conversation moved outside its previous root binding')
          await this.assertActiveDevice(principal)
          result = followed
          break
        }
        result = await this.observation.observe(method, request, signal)
        await this.assertActiveDevice(principal)
        break
      }
    }
    return nodeConsoleMethods[method].output.parse(result)
  }
}
