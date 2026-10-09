import { createStore } from 'zustand/vanilla'
import { z } from 'zod'
import { RuntimeCommandError, type ResourceReferenceSource } from '@hbar/app-runtime'
import { toolWindowDescriptorSchema } from '@hbar/contracts'
import type { ResourceCandidate, ResourceReference } from '@hbar/contracts/resources'
import type { HbarRuntimeView } from '@hbar/app-react'
import descriptor from './resource-browser-descriptor.json'

export interface NativeResourceBridge {
  invoke(command: string, args: Record<string, unknown>): Promise<unknown>
}
export interface BrowserRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scale?: number
}
const statusSchema = z.object({
  url: z.string(),
  title: z.string(),
  loading: z.boolean(),
  canBack: z.boolean(),
  canForward: z.boolean(),
  visible: z.boolean().default(false),
  failed: z.boolean().default(false),
})
export type ResourceBrowserEntry = z.output<typeof statusSchema> & {
  readonly id: string
  readonly ready: boolean
  readonly error: string | null
}
export interface ResourceTextEntry {
  readonly candidate: ResourceCandidate
  readonly text: string
  readonly line: number | null
  readonly column: number | null
}
function url(value: string): string {
  const target = new URL(value)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
    throw new RuntimeCommandError('INVALID_INPUT', 'Only HTTP and HTTPS browser URLs are supported')
  return target.href
}
export function createResourceBrowserController(runtime: HbarRuntimeView, bridge: NativeResourceBridge | null) {
  const store = createStore<{
    entries: Readonly<Record<string, ResourceBrowserEntry>>
    files: Readonly<Record<string, ResourceTextEntry>>
  }>(() => ({ entries: {}, files: {} }))
  const pending = new Map<string, Promise<void>>()
  const generations = new Map<string, number>()
  const sourceFence = (source: ResourceReferenceSource, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const navigation = runtime.state.navigation.getSnapshot()
    const tabs = runtime.state.workspaceTabs.getSnapshot()
    if (
      navigation.workspaceId !== source.workspaceId ||
      navigation.sessionId !== source.sessionId ||
      (source.sourceTabInstanceKey !== null &&
        !tabs.items.some(
          (item) =>
            item.kind === 'session' &&
            item.instanceKey === source.sourceTabInstanceKey &&
            item.workspaceId === source.workspaceId &&
            item.sessionId === source.sessionId,
        ))
    )
      throw new RuntimeCommandError('TARGET_CHANGED', 'Resource source changed')
  }
  const publish = (id: string, value: Partial<ResourceBrowserEntry>) => {
    const current = store.getState().entries[id]
    if (current) store.setState({ entries: { ...store.getState().entries, [id]: { ...current, ...value } } })
  }
  const close = async (id: string) => {
    generations.set(id, (generations.get(id) ?? 0) + 1)
    store.setState({
      entries: Object.fromEntries(Object.entries(store.getState().entries).filter(([key]) => key !== id)),
    })
    if (bridge) {
      try {
        await bridge.invoke('resource_browser', { id, action: 'close' })
      } catch {
        /* Closed views and runtime shutdown are idempotent. */
      }
    }
  }
  const execute = async (
    id: string,
    action: string,
    args: { url?: string; bounds?: BrowserRect } = {},
  ): Promise<void> => {
    if (!store.getState().entries[id]) return
    const generation = generations.get(id) ?? 0
    if (!bridge) {
      if (args.url) publish(id, { url: url(args.url), loading: false })
      return
    }
    try {
      const result = await bridge.invoke('resource_browser', { id, action, ...args })
      if (generations.get(id) !== generation || !store.getState().entries[id]) {
        if (action === 'create') await bridge.invoke('resource_browser', { id, action: 'close' })
        return
      }
      if (result !== null) publish(id, { ...statusSchema.parse(result), ready: true, error: null })
    } catch (error) {
      if (generations.get(id) !== generation) return
      publish(id, { loading: false, error: 'READ_FAILED' })
      throw error
    }
  }
  const ensure = (id: string, location: string): Promise<void> => {
    const previous = pending.get(id)
    if (previous) return previous
    const target = url(location)
    if (!store.getState().entries[id]) {
      generations.set(id, (generations.get(id) ?? 0) + 1)
      store.setState({
        entries: {
          ...store.getState().entries,
          [id]: {
            id,
            url: target,
            title: new URL(target).hostname,
            loading: Boolean(bridge),
            ready: !bridge,
            canBack: false,
            canForward: false,
            visible: false,
            failed: false,
            error: null,
          },
        },
      })
    }
    if (store.getState().entries[id]?.ready) return Promise.resolve()
    const operation = execute(id, 'create', { url: target }).finally(() => {
      if (pending.get(id) === operation) pending.delete(id)
    })
    pending.set(id, operation)
    return operation
  }
  return {
    store,
    native: bridge !== null,
    ensure,
    close,
    async openBrowser(candidate: ResourceCandidate, source: ResourceReferenceSource, signal?: AbortSignal) {
      const fence = () => sourceFence(source, signal)
      fence()
      const target = url(candidate.location)
      const panels = runtime.state.surfaces.getSnapshot().panels
      const existing = Object.values(panels).find(
        (panel) =>
          panel.panelId === 'browser' &&
          panel.workspaceId === source.workspaceId &&
          panel.sessionId === (source.sourceTabInstanceKey === null ? null : source.sessionId) &&
          (store.getState().entries[String(panel.params.id)]?.url ?? panel.params.url) === target,
      )
      const id = existing && typeof existing.params.id === 'string' ? existing.params.id : crypto.randomUUID()
      const instanceId = existing?.instanceId ?? `resource-browser:${id}`
      const sourceSessionId = source.sourceTabInstanceKey === null ? null : source.sessionId
      const recipe = toolWindowDescriptorSchema.parse(descriptor)
      if (!existing)
        if (Object.keys(store.getState().entries).length >= 8)
          throw new RuntimeCommandError('TAB_LIMIT', 'Browser tab limit reached')
      if (!existing)
        await runtime.commands.execute('app.openPanel', {
          panelId: recipe.id,
          instanceId,
          workspaceId: source.workspaceId,
          ...(sourceSessionId ? { sessionId: sourceSessionId } : {}),
          binding: 'pinned',
          params: { id, url: target, title: candidate.name, descriptor: recipe },
        })
      try {
        await ensure(id, target)
        fence()
        await runtime.commands.execute('workspaceTabs.openWorkbench', {
          panelInstanceId: instanceId,
          workspaceId: source.workspaceId,
          sourceSessionId,
        })
      } catch (error) {
        if (!existing) {
          await close(id)
          await runtime.commands.execute('app.closePanel', { instanceId })
        }
        throw error
      }
    },
    async openSystem(candidate: ResourceCandidate) {
      if (!bridge) {
        if (!/^https?:\/\//.test(candidate.location))
          throw new RuntimeCommandError('PLATFORM_UNAVAILABLE', 'Native file opening is unavailable')
        window.open(candidate.location, '_blank', 'noopener,noreferrer')
        return
      }
      await bridge.invoke('resource_open_system', { target: candidate.location })
    },
    async openText(
      candidate: ResourceCandidate,
      text: string,
      source: ResourceReferenceSource,
      reference: ResourceReference,
      signal?: AbortSignal,
    ) {
      sourceFence(source, signal)
      const instanceId = `resource-file:${candidate.id}:${source.sessionId}`
      const existing = runtime.state.surfaces.getSnapshot().panels[instanceId]
      const previous = store.getState().files[instanceId]
      const sourceSessionId = source.sourceTabInstanceKey === null ? null : source.sessionId
      const recipe = toolWindowDescriptorSchema.parse({
        ...descriptor,
        id: 'resource-file',
        icon: 'file-search',
        title: candidate.name.slice(0, 120),
      })
      try {
        await runtime.commands.execute('app.openPanel', {
          panelId: recipe.id,
          instanceId,
          workspaceId: source.workspaceId,
          ...(sourceSessionId ? { sessionId: sourceSessionId } : {}),
          binding: 'pinned',
          params: { title: candidate.name, descriptor: recipe },
        })
        sourceFence(source, signal)
        store.setState({
          files: {
            ...store.getState().files,
            [instanceId]: {
              candidate,
              text,
              line: reference.kind === 'file' ? (reference.line ?? null) : null,
              column: reference.kind === 'file' ? (reference.column ?? null) : null,
            },
          },
        })
        await runtime.commands.execute('workspaceTabs.openWorkbench', {
          panelInstanceId: instanceId,
          workspaceId: source.workspaceId,
          sourceSessionId,
        })
      } catch (error) {
        const files = { ...store.getState().files }
        if (previous) files[instanceId] = previous
        else delete files[instanceId]
        store.setState({ files })
        if (!existing) await runtime.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)
        throw error
      }
    },
    navigate: (id: string, value: string) => execute(id, 'navigate', { url: url(value) }),
    action: (id: string, action: 'back' | 'forward' | 'reload' | 'status' | 'show' | 'hide') => execute(id, action),
    bounds: (id: string, rect: BrowserRect) => execute(id, 'bounds', { bounds: rect }),
    async releaseRemoved() {
      const panels = runtime.state.surfaces.getSnapshot().panels
      const files = Object.fromEntries(
        Object.entries(store.getState().files).filter(([id]) => panels[id]?.panelId === 'resource-file'),
      )
      if (Object.keys(files).length !== Object.keys(store.getState().files).length) store.setState({ files })
      const owned = new Set(
        Object.values(runtime.state.surfaces.getSnapshot().panels)
          .filter((panel) => panel.panelId === 'browser')
          .map((panel) => String(panel.params.id)),
      )
      for (const id of Object.keys(store.getState().entries)) if (!owned.has(id)) await close(id)
    },
    async closeAll() {
      store.setState({ files: {} })
      for (const id of Object.keys(store.getState().entries)) await close(id)
    },
  }
}
export type ResourceBrowserController = ReturnType<typeof createResourceBrowserController>
