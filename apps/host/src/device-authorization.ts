import { z } from 'zod'
import type { CommandDescriptor } from '@hbar/commands'
import { HbarError, type Device, type RpcMethod, type WireNotification } from '@hbar/contracts'
import { deviceAccessOf } from '@hbar/contracts/device'
import { invocationSchema } from '@hbar/commands/protocol'
import { workspaceListInputSchema, type WorkspacePage } from '@hbar/contracts/directory'
import type { StoragePort } from '@hbar/storage'

const observerMethods = new Set([
  'command.catalog',
  'command.describe',
  'command.execute',
  'system.hello',
  'system.bootstrap',
  'workspace.list',
  'workspace.get',
  'session.get',
  'session.list',
  'session.snapshot',
  'session.follow',
  'session.unfollow',
  'session.summaries',
])
const scopedGlobals = new Set([
  'workspace.list',
  'command.catalog',
  'command.describe',
  'system.hello',
  'system.bootstrap',
])
function denied(): never {
  throw new HbarError('FORBIDDEN', 'This device cannot access that operation or workspace')
}
const record = z.record(z.string(), z.unknown())

/** Authentication grants identity; this service checks role and entity scope at every request. */
export class DeviceAuthorization {
  constructor(
    private readonly storage: StoragePort,
    private readonly describe: (id: string) => CommandDescriptor | undefined,
  ) {}

  restricted(device: Device | undefined): boolean {
    return !!device && (device.role === 'observer' || device.workspaceIds != null)
  }
  async assertWorkspace(device: Device, workspaceId: string): Promise<void> {
    const access = deviceAccessOf(device)
    if (access.workspaceIds !== null && !access.workspaceIds.includes(workspaceId)) denied()
  }
  async assertSession(device: Device, sessionId: string): Promise<void> {
    const session = await this.storage.call('findSession', sessionId)
    if (!session) denied()
    await this.assertWorkspace(device, session.workspaceId)
  }
  async assertTargets(device: Device, input: unknown, required: boolean): Promise<void> {
    const access = deviceAccessOf(device)
    if (access.workspaceIds === null) return
    const value = record.parse(input ?? {})
    let targets = 0
    for (const key of ['workspaceId'])
      if (typeof value[key] === 'string') {
        await this.assertWorkspace(device, value[key])
        targets++
      }
    for (const key of ['sessionId', 'senderSessionId', 'targetSessionId'])
      if (typeof value[key] === 'string') {
        await this.assertSession(device, value[key])
        targets++
      }
    if (Array.isArray(value.sessionIds))
      for (const id of z.array(z.string()).max(200).parse(value.sessionIds)) {
        await this.assertSession(device, id)
        targets++
      }
    for (const key of ['runId', 'operationId'])
      if (typeof value[key] === 'string') {
        const run = await this.storage.call('run', value[key])
        await this.assertSession(device, run.sessionId)
        targets++
      }
    if (value.sessionTarget !== undefined) await this.assertTargets(device, value.sessionTarget, false)
    if (value.scope !== undefined) {
      const scope = z.object({ kind: z.string(), targetId: z.string().optional() }).parse(value.scope)
      if (scope.kind === 'workspace' && scope.targetId) {
        await this.assertWorkspace(device, scope.targetId)
        targets++
      } else if (scope.kind === 'session' && scope.targetId) {
        await this.assertSession(device, scope.targetId)
        targets++
      } else denied()
    }
    if (required && targets === 0) denied()
  }
  async authorize(device: Device, method: RpcMethod, params: unknown): Promise<void> {
    const access = deviceAccessOf(device)
    if (access.role === 'observer' && !observerMethods.has(method)) denied()
    let id: string = method
    let input = params
    if (method === 'command.execute') {
      const invocation = invocationSchema.parse(params)
      id = invocation.commandId
      input = invocation.input
      const descriptor = this.describe(id)
      if (!descriptor) denied()
      if (
        access.role === 'observer' &&
        (descriptor.metadata.kind !== 'query' || descriptor.metadata.stateEffect !== 'none')
      )
        denied()
    }
    if (access.workspaceIds !== null && !scopedGlobals.has(id)) await this.assertTargets(device, input, true)
  }
  async workspacePage(device: Device, input: unknown): Promise<WorkspacePage | null> {
    const access = deviceAccessOf(device)
    if (access.workspaceIds === null) return null
    const page = workspaceListInputSchema.parse(input)
    const items: WorkspacePage['items'] = []
    for (const id of [...access.workspaceIds].sort()) {
      if (page.after && id <= page.after) continue
      const workspace = await this.storage.call('findWorkspace', id)
      if (workspace) items.push(workspace)
      if (items.length > page.limit) break
    }
    const more = items.length > page.limit
    const kept = items.slice(0, page.limit)
    return { items: kept, nextCursor: more ? (kept.at(-1)?.id ?? null) : null }
  }
  /** Scoped/observer devices only receive session facts for subscriptions already authorized above. */
  notification(device: Device | undefined, follows: ReadonlySet<string>, event: WireNotification): boolean {
    if (!this.restricted(device)) return true
    if (event.method === 'host.changed') return true
    return (
      event.params !== null &&
      typeof event.params === 'object' &&
      'sessionId' in event.params &&
      typeof event.params.sessionId === 'string' &&
      follows.has(event.params.sessionId) &&
      !['task.notification', 'notifications.created', 'settings.changed'].includes(event.method)
    )
  }

  revokeMovedSubscription(device: Device | undefined, follows: Set<string>, event: WireNotification): void {
    if (!device?.workspaceIds || event.method !== 'session.event' || event.params.type !== 'session.moved') return
    const move = z.object({ session: z.object({ workspaceId: z.string() }) }).safeParse(event.params.data)
    if (!move.success || !device.workspaceIds.includes(move.data.session.workspaceId))
      follows.delete(event.params.sessionId)
  }
}
