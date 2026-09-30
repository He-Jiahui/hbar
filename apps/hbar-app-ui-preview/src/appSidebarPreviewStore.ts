import { createStore, type StoreApi } from 'zustand/vanilla'

export interface AppSidebarPreviewRequestTarget {
  readonly actionId: string
  readonly value: string | undefined
}

export interface AppSidebarPreviewSeed {
  readonly ownerId: string
  readonly workspaceIds: readonly string[]
  readonly initialWorkspaceId: string | null
  readonly sectionIds: readonly string[]
  readonly initialSectionId: string | null
  readonly requestTargets: readonly AppSidebarPreviewRequestTarget[]
}

export interface AppSidebarPreviewIntent extends AppSidebarPreviewRequestTarget {
  readonly ownerId: string
}

export interface AppSidebarPreviewStoreState {
  readonly seed: AppSidebarPreviewSeed
  readonly workspaceId: string | null
  readonly sectionId: string | null
  readonly intent: AppSidebarPreviewIntent | null
  readonly selectWorkspace: (ownerId: string, id: string) => boolean
  readonly selectSection: (ownerId: string, id: string) => boolean
  readonly request: (ownerId: string, actionId: string, value?: string) => boolean
  readonly reconcile: (seed: AppSidebarPreviewSeed) => void
}

export type AppSidebarPreviewStoreApi = StoreApi<AppSidebarPreviewStoreState>

function isValidId(id: string): boolean {
  return id.trim().length > 0
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!isValidId(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function uniqueRequestTargets(targets: readonly AppSidebarPreviewRequestTarget[]): AppSidebarPreviewRequestTarget[] {
  const result: AppSidebarPreviewRequestTarget[] = []
  for (const target of targets) {
    if (!isValidId(target.actionId) || (target.value !== undefined && !isValidId(target.value))) continue
    if (result.some((item) => item.actionId === target.actionId && item.value === target.value)) continue
    result.push({ actionId: target.actionId, value: target.value })
  }
  return result
}

function resolveInitialId(ids: readonly string[], requestedId: string | null): string | null {
  if (requestedId !== null && isValidId(requestedId) && ids.includes(requestedId)) return requestedId
  return ids[0] ?? null
}

function normalizeSeed(seed: AppSidebarPreviewSeed): AppSidebarPreviewSeed {
  const ownerIsValid = isValidId(seed.ownerId)
  const workspaceIds = ownerIsValid ? uniqueIds(seed.workspaceIds) : []
  const sectionIds = ownerIsValid ? uniqueIds(seed.sectionIds) : []
  return {
    ownerId: seed.ownerId,
    workspaceIds,
    initialWorkspaceId: resolveInitialId(workspaceIds, seed.initialWorkspaceId),
    sectionIds,
    initialSectionId: resolveInitialId(sectionIds, seed.initialSectionId),
    requestTargets: ownerIsValid ? uniqueRequestTargets(seed.requestTargets) : [],
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function sameSeed(left: AppSidebarPreviewSeed, right: AppSidebarPreviewSeed): boolean {
  return (
    left.ownerId === right.ownerId &&
    sameIds(left.workspaceIds, right.workspaceIds) &&
    left.initialWorkspaceId === right.initialWorkspaceId &&
    sameIds(left.sectionIds, right.sectionIds) &&
    left.initialSectionId === right.initialSectionId &&
    left.requestTargets.length === right.requestTargets.length &&
    left.requestTargets.every(
      (target, index) =>
        target.actionId === right.requestTargets[index]?.actionId &&
        target.value === right.requestTargets[index]?.value,
    )
  )
}

function allowsRequest(seed: AppSidebarPreviewSeed, actionId: string, value: string | undefined): boolean {
  return (
    isValidId(seed.ownerId) &&
    isValidId(actionId) &&
    (value === undefined || isValidId(value)) &&
    seed.requestTargets.some((target) => target.actionId === actionId && target.value === value)
  )
}

function allowsIntent(seed: AppSidebarPreviewSeed, intent: AppSidebarPreviewIntent): boolean {
  return intent.ownerId === seed.ownerId && allowsRequest(seed, intent.actionId, intent.value)
}

/** Owns only App Sidebar workspace/section selection and explicit preview request intent. */
export function createAppSidebarPreviewStore(input: AppSidebarPreviewSeed): AppSidebarPreviewStoreApi {
  const seed = normalizeSeed(input)
  return createStore<AppSidebarPreviewStoreState>((set, get) => ({
    seed,
    workspaceId: seed.initialWorkspaceId,
    sectionId: seed.initialSectionId,
    intent: null,
    selectWorkspace(ownerId, id) {
      const current = get()
      if (
        !isValidId(ownerId) ||
        ownerId !== current.seed.ownerId ||
        !isValidId(id) ||
        !current.seed.workspaceIds.includes(id)
      )
        return false
      if (current.workspaceId !== id) set({ workspaceId: id })
      return true
    },
    selectSection(ownerId, id) {
      const current = get()
      if (
        !isValidId(ownerId) ||
        ownerId !== current.seed.ownerId ||
        !isValidId(id) ||
        !current.seed.sectionIds.includes(id)
      )
        return false
      if (current.sectionId !== id) set({ sectionId: id })
      return true
    },
    request(ownerId, actionId, value) {
      const current = get()
      if (!isValidId(ownerId) || ownerId !== current.seed.ownerId || !allowsRequest(current.seed, actionId, value))
        return false
      if (current.intent?.actionId === actionId && current.intent.value === value && current.intent.ownerId === ownerId)
        return false
      set({ intent: { ownerId, actionId, value } })
      return true
    },
    reconcile(nextInput) {
      const current = get()
      const nextSeed = normalizeSeed(nextInput)
      if (!isValidId(current.seed.ownerId) || nextSeed.ownerId !== current.seed.ownerId) return

      const workspaceId =
        current.workspaceId !== null && nextSeed.workspaceIds.includes(current.workspaceId)
          ? current.workspaceId
          : nextSeed.initialWorkspaceId
      const sectionId =
        current.sectionId !== null && nextSeed.sectionIds.includes(current.sectionId)
          ? current.sectionId
          : nextSeed.initialSectionId
      const intent = current.intent && allowsIntent(nextSeed, current.intent) ? current.intent : null
      if (
        sameSeed(current.seed, nextSeed) &&
        workspaceId === current.workspaceId &&
        sectionId === current.sectionId &&
        intent === current.intent
      )
        return
      set({ seed: nextSeed, workspaceId, sectionId, intent })
    },
  }))
}
