import { createStore, type StoreApi } from 'zustand/vanilla'
import type { LumenToolCallsIntent } from '@lumen/app-ui/catalog'

export interface ToolCallsPermissionSeed {
  readonly groupId: string
  readonly itemId: string
  readonly kind: 'request' | 'toggle' | 'status'
  readonly enabled: boolean | undefined
  readonly actionIds: readonly string[]
}

export interface ToolCallsPermissionTarget {
  readonly groupId: string
  readonly itemId: string
}

export interface ToolCallsPermissionValue extends ToolCallsPermissionTarget {
  readonly enabled: boolean
}

export interface ToolCallsPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly traceIds: readonly string[]
  readonly initialOpenTraceIds: readonly string[]
  readonly filterIds: readonly string[]
  readonly initialFilterId: string | null
  readonly retryIds: readonly string[]
  readonly diffIds: readonly string[]
  readonly initialOpenDiffIds: readonly string[]
  readonly resultIds: readonly string[]
  readonly outputTabIds: readonly string[]
  readonly initialOutputTabId: string | null
  readonly permissionItems: readonly ToolCallsPermissionSeed[]
}

export type ToolCallsPreviewNotice = 'local' | 'intent' | null

export interface ToolCallsPreviewStoreState {
  readonly seed: ToolCallsPreviewSeed
  readonly openTraceIds: readonly string[]
  readonly filterId: string | null
  readonly openDiffIds: readonly string[]
  readonly outputTabId: string | null
  readonly openRequestIds: readonly ToolCallsPermissionTarget[]
  readonly permissions: readonly ToolCallsPermissionValue[]
  readonly notice: ToolCallsPreviewNotice
  readonly lastIntent: LumenToolCallsIntent | null
  readonly dispatch: (intent: LumenToolCallsIntent) => boolean
  readonly reconcile: (seed: ToolCallsPreviewSeed) => void
}

export type ToolCallsPreviewStoreApi = StoreApi<ToolCallsPreviewStoreState>

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id.trim() || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function permissionKey(groupId: string, itemId: string): string {
  return JSON.stringify([groupId, itemId])
}

function normalizePermissionItems(items: readonly ToolCallsPermissionSeed[]): ToolCallsPermissionSeed[] {
  const seen = new Set<string>()
  const result: ToolCallsPermissionSeed[] = []
  for (const item of items) {
    if (!item.groupId.trim() || !item.itemId.trim()) continue
    const key = permissionKey(item.groupId, item.itemId)
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      groupId: item.groupId,
      itemId: item.itemId,
      kind: item.kind,
      enabled: item.enabled,
      actionIds: uniqueIds(item.actionIds),
    })
  }
  return result
}

function firstId(ids: readonly string[], preferred: string | null): string | null {
  return preferred !== null && ids.includes(preferred) ? preferred : (ids[0] ?? null)
}

function normalizeSeed(seed: ToolCallsPreviewSeed): ToolCallsPreviewSeed {
  const traceIds = uniqueIds(seed.traceIds)
  const filterIds = uniqueIds(seed.filterIds)
  const retryIds = uniqueIds(seed.retryIds)
  const diffIds = uniqueIds(seed.diffIds)
  const resultIds = uniqueIds(seed.resultIds)
  const outputTabIds = uniqueIds(seed.outputTabIds)
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    traceIds,
    initialOpenTraceIds:
      seed.variant === 1
        ? uniqueIds(seed.initialOpenTraceIds)
            .filter((id) => traceIds.includes(id))
            .slice(0, 1)
        : uniqueIds(seed.initialOpenTraceIds).filter((id) => traceIds.includes(id)),
    filterIds,
    initialFilterId: firstId(filterIds, seed.initialFilterId),
    retryIds,
    diffIds,
    initialOpenDiffIds: uniqueIds(seed.initialOpenDiffIds).filter((id) => diffIds.includes(id)),
    resultIds,
    outputTabIds,
    initialOutputTabId: firstId(outputTabIds, seed.initialOutputTabId),
    permissionItems: normalizePermissionItems(seed.permissionItems),
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function samePermissionTargets(
  left: readonly ToolCallsPermissionTarget[],
  right: readonly ToolCallsPermissionTarget[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item.groupId === right[index]?.groupId && item.itemId === right[index]?.itemId)
  )
}

function samePermissionValues(
  left: readonly ToolCallsPermissionValue[],
  right: readonly ToolCallsPermissionValue[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.groupId === right[index]?.groupId &&
        item.itemId === right[index]?.itemId &&
        item.enabled === right[index]?.enabled,
    )
  )
}

function samePermissionSeeds(
  left: readonly ToolCallsPermissionSeed[],
  right: readonly ToolCallsPermissionSeed[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const next = right[index]
      if (!next) return false
      return (
        item.groupId === next.groupId &&
        item.itemId === next.itemId &&
        item.kind === next.kind &&
        item.enabled === next.enabled &&
        sameIds(item.actionIds, next.actionIds)
      )
    })
  )
}

function sameSeed(left: ToolCallsPreviewSeed, right: ToolCallsPreviewSeed): boolean {
  return (
    left.ownerId === right.ownerId &&
    left.variant === right.variant &&
    sameIds(left.traceIds, right.traceIds) &&
    sameIds(left.initialOpenTraceIds, right.initialOpenTraceIds) &&
    sameIds(left.filterIds, right.filterIds) &&
    left.initialFilterId === right.initialFilterId &&
    sameIds(left.retryIds, right.retryIds) &&
    sameIds(left.diffIds, right.diffIds) &&
    sameIds(left.initialOpenDiffIds, right.initialOpenDiffIds) &&
    sameIds(left.resultIds, right.resultIds) &&
    sameIds(left.outputTabIds, right.outputTabIds) &&
    left.initialOutputTabId === right.initialOutputTabId &&
    samePermissionSeeds(left.permissionItems, right.permissionItems)
  )
}

function findPermission(
  seed: ToolCallsPreviewSeed,
  groupId: string,
  itemId: string,
): ToolCallsPermissionSeed | undefined {
  return seed.permissionItems.find((permission) => permission.groupId === groupId && permission.itemId === itemId)
}

function allowsIntent(seed: ToolCallsPreviewSeed, intent: LumenToolCallsIntent): boolean {
  switch (intent.actionId) {
    case 'toggle-trace-item':
      return seed.variant === 1 && seed.traceIds.includes(intent.itemId)
    case 'filter-tool-activity':
      return seed.variant === 2 && seed.filterIds.includes(intent.optionId)
    case 'retry-tool-activity':
      return seed.variant === 2 && seed.retryIds.includes(intent.itemId)
    case 'stop':
      return seed.variant === 2
    case 'toggle-diff-file':
      return seed.variant === 3 && seed.diffIds.includes(intent.itemId)
    case 'open-search-result':
      return seed.variant === 4 && seed.resultIds.includes(intent.itemId)
    case 'select-command-output':
      return seed.variant === 5 && seed.outputTabIds.includes(intent.optionId)
    case 'copy-command':
      return seed.variant === 5
    case 'permission-request-action': {
      const permission = findPermission(seed, intent.groupId, intent.itemId)
      return seed.variant === 6 && permission?.kind === 'request' && permission.actionIds.includes(intent.optionId)
    }
    case 'toggle-permission': {
      const permission = findPermission(seed, intent.groupId, intent.itemId)
      return (
        seed.variant === 6 &&
        permission?.kind === 'toggle' &&
        typeof permission.enabled === 'boolean' &&
        typeof intent.enabled === 'boolean'
      )
    }
    default: {
      const exhaustive: never = intent
      return exhaustive
    }
  }
}

function initialPermissions(seed: ToolCallsPreviewSeed): ToolCallsPermissionValue[] {
  return seed.permissionItems.flatMap((item) =>
    item.kind === 'toggle' && typeof item.enabled === 'boolean'
      ? [{ groupId: item.groupId, itemId: item.itemId, enabled: item.enabled }]
      : [],
  )
}

function requestTargets(seed: ToolCallsPreviewSeed): ToolCallsPermissionTarget[] {
  return seed.permissionItems
    .filter((item) => item.kind === 'request' && item.actionIds.includes('view'))
    .map(({ groupId, itemId }) => ({ groupId, itemId }))
}

function sameIntent(left: LumenToolCallsIntent | null, right: LumenToolCallsIntent | null): boolean {
  if (left === right) return true
  if (left === null || right === null || left.actionId !== right.actionId) return false
  switch (left.actionId) {
    case 'stop':
    case 'copy-command':
      return true
    case 'toggle-trace-item':
    case 'retry-tool-activity':
    case 'toggle-diff-file':
    case 'open-search-result':
      return right.actionId === left.actionId && right.itemId === left.itemId
    case 'filter-tool-activity':
    case 'select-command-output':
      return right.actionId === left.actionId && right.optionId === left.optionId
    case 'permission-request-action':
      return (
        right.actionId === left.actionId &&
        right.groupId === left.groupId &&
        right.itemId === left.itemId &&
        right.optionId === left.optionId
      )
    case 'toggle-permission':
      return (
        right.actionId === left.actionId &&
        right.groupId === left.groupId &&
        right.itemId === left.itemId &&
        right.enabled === left.enabled
      )
    default: {
      const exhaustive: never = left
      return exhaustive
    }
  }
}

/** Isolated preview-only state; dispatch never executes tools or grants permissions. */
export function createToolCallsPreviewStore(input: ToolCallsPreviewSeed): ToolCallsPreviewStoreApi {
  const seed = normalizeSeed(input)

  return createStore<ToolCallsPreviewStoreState>((set, get) => ({
    seed,
    openTraceIds: seed.initialOpenTraceIds,
    filterId: seed.initialFilterId,
    openDiffIds: seed.initialOpenDiffIds,
    outputTabId: seed.initialOutputTabId,
    openRequestIds: [],
    permissions: initialPermissions(seed),
    notice: null,
    lastIntent: null,
    dispatch: (intent) => {
      const state = get()
      if (!allowsIntent(state.seed, intent)) return false

      switch (intent.actionId) {
        case 'toggle-trace-item': {
          const openTraceIds =
            state.seed.variant === 1
              ? state.openTraceIds.includes(intent.itemId)
                ? []
                : [intent.itemId]
              : state.openTraceIds.includes(intent.itemId)
                ? state.openTraceIds.filter((id) => id !== intent.itemId)
                : [...state.openTraceIds, intent.itemId]
          set({ openTraceIds, notice: 'local', lastIntent: intent })
          return true
        }
        case 'filter-tool-activity':
          set({ filterId: intent.optionId, notice: 'local', lastIntent: intent })
          return true
        case 'retry-tool-activity':
        case 'stop':
        case 'copy-command':
        case 'open-search-result':
          set({ notice: 'intent', lastIntent: intent })
          return true
        case 'toggle-diff-file': {
          const openDiffIds = state.openDiffIds.includes(intent.itemId)
            ? state.openDiffIds.filter((id) => id !== intent.itemId)
            : [...state.openDiffIds, intent.itemId]
          set({ openDiffIds, notice: 'local', lastIntent: intent })
          return true
        }
        case 'select-command-output':
          set({ outputTabId: intent.optionId, notice: 'local', lastIntent: intent })
          return true
        case 'permission-request-action': {
          if (intent.optionId === 'view') {
            const isOpen = state.openRequestIds.some(
              (request) => request.groupId === intent.groupId && request.itemId === intent.itemId,
            )
            const openRequestIds = isOpen
              ? state.openRequestIds.filter(
                  (request) => request.groupId !== intent.groupId || request.itemId !== intent.itemId,
                )
              : [...state.openRequestIds, { groupId: intent.groupId, itemId: intent.itemId }]
            set({ openRequestIds, notice: 'local', lastIntent: intent })
          } else {
            set({ notice: 'intent', lastIntent: intent })
          }
          return true
        }
        case 'toggle-permission': {
          const permissions = state.permissions.map((permission) =>
            permission.groupId === intent.groupId && permission.itemId === intent.itemId
              ? { ...permission, enabled: intent.enabled }
              : permission,
          )
          set({ permissions, notice: 'local', lastIntent: intent })
          return true
        }
        default: {
          const exhaustive: never = intent
          return exhaustive
        }
      }
    },
    reconcile: (nextInput) => {
      const current = get()
      const nextSeed = normalizeSeed(nextInput)
      if (nextSeed.ownerId !== current.seed.ownerId || nextSeed.variant !== current.seed.variant) {
        return
      }

      const priorTraceIds = new Set(current.seed.traceIds)
      const survivingOpenTraceIds = current.openTraceIds.filter((id) => nextSeed.traceIds.includes(id))
      const openTraceIds =
        nextSeed.variant === 1
          ? survivingOpenTraceIds.length > 0
            ? survivingOpenTraceIds.slice(0, 1)
            : current.seed.traceIds.some((id) => nextSeed.traceIds.includes(id))
              ? []
              : nextSeed.initialOpenTraceIds.slice(0, 1)
          : [
              ...survivingOpenTraceIds,
              ...nextSeed.initialOpenTraceIds.filter(
                (id) => !priorTraceIds.has(id) && !current.openTraceIds.includes(id),
              ),
            ]
      const filterId =
        current.filterId !== null && nextSeed.filterIds.includes(current.filterId)
          ? current.filterId
          : nextSeed.initialFilterId

      const priorDiffIds = new Set(current.seed.diffIds)
      const openDiffIds = [
        ...current.openDiffIds.filter((id) => nextSeed.diffIds.includes(id)),
        ...nextSeed.initialOpenDiffIds.filter((id) => !priorDiffIds.has(id) && !current.openDiffIds.includes(id)),
      ]
      const outputTabId =
        current.outputTabId !== null && nextSeed.outputTabIds.includes(current.outputTabId)
          ? current.outputTabId
          : nextSeed.initialOutputTabId

      const nextRequestTargets = requestTargets(nextSeed)
      const nextRequestKeys = new Set(nextRequestTargets.map(({ groupId, itemId }) => permissionKey(groupId, itemId)))
      const openRequestIds = current.openRequestIds.filter((request) =>
        nextRequestKeys.has(permissionKey(request.groupId, request.itemId)),
      )

      const currentPermissions = new Map(
        current.permissions.map((permission) => [permissionKey(permission.groupId, permission.itemId), permission]),
      )
      const priorPermissionSeeds = new Map(
        current.seed.permissionItems.map((permission) => [
          permissionKey(permission.groupId, permission.itemId),
          permission,
        ]),
      )
      const permissions = initialPermissions(nextSeed).map((nextPermission) => {
        const key = permissionKey(nextPermission.groupId, nextPermission.itemId)
        const currentPermission = currentPermissions.get(key)
        const priorSeed = priorPermissionSeeds.get(key)
        const nextSeedPermission = findPermission(nextSeed, nextPermission.groupId, nextPermission.itemId)
        const seedValueUnchanged =
          priorSeed?.kind === 'toggle' &&
          priorSeed.enabled === nextSeedPermission?.enabled &&
          currentPermission !== undefined
        return seedValueUnchanged ? { ...nextPermission, enabled: currentPermission.enabled } : nextPermission
      })

      const lastIntent = current.lastIntent && allowsIntent(nextSeed, current.lastIntent) ? current.lastIntent : null
      const notice = current.notice === 'intent' && lastIntent === null ? null : current.notice
      const unchanged =
        sameSeed(current.seed, nextSeed) &&
        sameIds(current.openTraceIds, openTraceIds) &&
        current.filterId === filterId &&
        sameIds(current.openDiffIds, openDiffIds) &&
        current.outputTabId === outputTabId &&
        samePermissionTargets(current.openRequestIds, openRequestIds) &&
        samePermissionValues(current.permissions, permissions) &&
        current.notice === notice &&
        sameIntent(current.lastIntent, lastIntent)
      if (unchanged) return
      set({
        seed: nextSeed,
        openTraceIds,
        filterId,
        openDiffIds,
        outputTabId,
        openRequestIds,
        permissions,
        notice,
        lastIntent,
      })
    },
  }))
}
