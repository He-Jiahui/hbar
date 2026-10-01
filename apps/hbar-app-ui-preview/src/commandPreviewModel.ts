import { createStore, type StoreApi } from 'zustand/vanilla'
import type { LumenCommandItem } from '@lumen/app-ui'

export type CommandPreviewSurface = 'catalog' | 'search' | 'invite' | 'assistant'

export interface CommandPreviewItem extends LumenCommandItem {
  readonly kind?: string | undefined
}

export interface CommandPreviewTextArgumentSeed {
  readonly id: string
  readonly kind: 'text'
  readonly initialValue: string
}

export interface CommandPreviewChoiceArgumentSeed {
  readonly id: string
  readonly kind: 'choice'
  readonly initialValue: string
  readonly options: readonly { readonly id: string }[]
}

export type CommandPreviewArgumentSeed = CommandPreviewTextArgumentSeed | CommandPreviewChoiceArgumentSeed

export interface CommandPreviewPageSeed {
  readonly id: string
  readonly parentId?: string | undefined
  readonly entryItemId?: string | undefined
  readonly items: readonly CommandPreviewItem[]
  readonly arguments?: readonly CommandPreviewArgumentSeed[] | undefined
}

export interface CommandPreviewScopeSeed {
  readonly id: string
  readonly kind?: string | undefined
}

export interface CommandPreviewRoleSeed {
  readonly id: string
}

export interface CommandPreviewSuggestionSeed {
  readonly id: string
  readonly query: string
}

export interface CommandPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly surface: CommandPreviewSurface
  readonly pages: readonly CommandPreviewPageSeed[]
  readonly initialPageId: string
  readonly scopes: readonly CommandPreviewScopeSeed[]
  readonly allScopeId: string
  readonly roles: readonly CommandPreviewRoleSeed[]
  readonly suggestions: readonly CommandPreviewSuggestionSeed[]
  readonly requestActions: readonly string[]
  readonly initialOpen: boolean
  readonly initialQuery: string
  readonly initialSelectedId?: string | null | undefined
  readonly initialScopeId?: string | undefined
  readonly initialEmail: string
  readonly initialRoleId?: string | undefined
  readonly initialStep: 1 | 2
}

export interface CommandPreviewRequest {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly actionId: string
  readonly value: string
}

export interface CommandPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly surface: CommandPreviewSurface
  readonly pages: readonly CommandPreviewPageSeed[]
  readonly scopes: readonly CommandPreviewScopeSeed[]
  readonly allScopeId: string
  readonly roles: readonly CommandPreviewRoleSeed[]
  readonly suggestions: readonly CommandPreviewSuggestionSeed[]
  readonly requestActions: readonly string[]
  readonly open: boolean
  readonly query: string
  readonly selectedId: string | undefined
  readonly pageId: string
  readonly scopeId: string | undefined
  readonly email: string
  readonly roleId: string | undefined
  readonly currentRoomId: string | undefined
  readonly argumentsByPage: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly step: 1 | 2
  readonly lastRequest: CommandPreviewRequest | undefined
  readonly refresh: (ownerId: string, seed: CommandPreviewSeed) => boolean
  readonly setOpen: (ownerId: string, open: boolean) => boolean
  readonly setQuery: (ownerId: string, value: string) => boolean
  readonly select: (ownerId: string, id: string) => boolean
  readonly move: (ownerId: string, direction: -1 | 1) => string | undefined
  readonly setScope: (ownerId: string, id: string) => boolean
  readonly enterPage: (ownerId: string, itemId: string) => boolean
  readonly backPage: (ownerId: string) => boolean
  readonly setEmail: (ownerId: string, email: string) => boolean
  readonly setRole: (ownerId: string, roleId: string | undefined) => boolean
  readonly setStep: (ownerId: string, step: 1 | 2) => boolean
  readonly setArgument: (ownerId: string, pageId: string, fieldId: string, value: string) => boolean
  readonly requestArguments: (
    ownerId: string,
    pageId: string,
    phase: 'review' | 'confirm',
    payload: Readonly<Record<string, string>>,
  ) => CommandPreviewRequest | undefined
  readonly useSuggestion: (ownerId: string, id: string) => boolean
  readonly requestCommand: (
    ownerId: string,
    request: { readonly actionId: string; readonly targetId: string },
  ) => CommandPreviewRequest | undefined
  readonly requestReview: (
    ownerId: string,
    payload: { readonly email: string; readonly roleId: string },
  ) => CommandPreviewRequest | undefined
  readonly requestConfirm: (
    ownerId: string,
    payload: { readonly email: string; readonly roleId: string },
  ) => CommandPreviewRequest | undefined
  readonly requestAsk: (ownerId: string, query: string) => CommandPreviewRequest | undefined
}

export interface CommandPreviewSelection {
  readonly item: CommandPreviewItem | undefined
  readonly selectedId: string | undefined
  readonly selectionLost: boolean
}

export type CommandPreviewStoreApi = StoreApi<CommandPreviewModelState>

type CommandPreviewItemContext = Pick<
  CommandPreviewModelState,
  'pages' | 'pageId' | 'surface' | 'scopes' | 'scopeId' | 'allScopeId' | 'query'
>

function uniqueById<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  return [...new Map(records.filter((record) => record.id.trim()).map((record) => [record.id, record])).values()]
}

function normalizePages(pages: readonly CommandPreviewPageSeed[]): readonly CommandPreviewPageSeed[] {
  return uniqueById(
    pages.map((page) => ({
      ...page,
      items: uniqueById(page.items),
      ...(page.arguments === undefined
        ? {}
        : {
            arguments: uniqueById(
              page.arguments.map((field) =>
                field.kind === 'choice' ? { ...field, options: uniqueById(field.options) } : field,
              ),
            ),
          }),
    })),
  )
}

function initialArgumentValue(field: CommandPreviewArgumentSeed): string {
  if (field.kind === 'text') return field.initialValue
  if (field.options.some((option) => option.id === field.initialValue)) return field.initialValue
  return field.options[0]?.id ?? ''
}

function isValidArgumentValue(field: CommandPreviewArgumentSeed, value: string): boolean {
  return field.kind === 'text' || field.options.some((option) => option.id === value)
}

function reconcileArgumentsByPage(
  pages: readonly CommandPreviewPageSeed[],
  previous: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return Object.fromEntries(
    pages.map((page) => {
      const priorPage = previous[page.id] ?? {}
      const values = Object.fromEntries(
        (page.arguments ?? []).map((field) => {
          const priorValue = priorPage[field.id]
          const value =
            typeof priorValue === 'string' && isValidArgumentValue(field, priorValue)
              ? priorValue
              : initialArgumentValue(field)
          return [field.id, value]
        }),
      )
      return [page.id, values]
    }),
  )
}

function sameArgumentValues(
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>> | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {})
  const rightValues = right ?? {}
  return (
    leftEntries.length === Object.keys(rightValues).length &&
    leftEntries.every(([id, value]) => rightValues[id] === value)
  )
}

function liveArgumentPayload(
  state: CommandPreviewModelState,
  pageId: string,
  payload: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  if (pageId !== state.pageId) return undefined
  const page = state.pages.find((candidate) => candidate.id === pageId)
  const fields = page?.arguments ?? []
  const values = state.argumentsByPage[pageId]
  if (fields.length === 0 || !values || Object.keys(payload).length !== fields.length) return undefined

  const entries: [string, string][] = []
  for (const field of fields) {
    const current = values[field.id]
    if (
      current === undefined ||
      current.trim().length === 0 ||
      !Object.prototype.hasOwnProperty.call(payload, field.id) ||
      payload[field.id] !== current ||
      !isValidArgumentValue(field, current)
    ) {
      return undefined
    }
    entries.push([field.id, current])
  }
  return Object.fromEntries(entries)
}

function currentPage(context: Pick<CommandPreviewItemContext, 'pages' | 'pageId'>): CommandPreviewPageSeed | undefined {
  return context.pages.find((page) => page.id === context.pageId)
}

function itemMatchesScope(item: CommandPreviewItem, context: CommandPreviewItemContext): boolean {
  if (context.surface !== 'search' || context.scopeId === context.allScopeId) return true
  const scope = context.scopes.find((candidate) => candidate.id === context.scopeId)
  const kind = scope?.kind ?? scope?.id
  return kind !== undefined && item.kind === kind
}

function itemMatchesQuery(item: CommandPreviewItem, query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase()
  return `${item.label} ${item.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
}

export function selectCommandPreviewItems(state: CommandPreviewModelState): readonly CommandPreviewItem[] {
  const page = currentPage(state)
  if (!page) return []
  return page.items.filter((item) => itemMatchesScope(item, state) && itemMatchesQuery(item, state.query))
}

export function selectCommandPreviewSelection(state: CommandPreviewModelState): CommandPreviewSelection {
  const item = selectCommandPreviewItems(state).find((candidate) => candidate.id === state.selectedId)
  return {
    item,
    selectedId: item?.id,
    selectionLost: state.selectedId !== undefined && item === undefined,
  }
}

function selectInitialPage(seed: CommandPreviewSeed, pages: readonly CommandPreviewPageSeed[]): string {
  const specifiedPage = pages.find((page) => page.id === seed.initialPageId)
  if (specifiedPage) return specifiedPage.id
  const rootPage = pages.find((page) => page.parentId === undefined)
  return rootPage?.id ?? pages[0]?.id ?? ''
}

function selectInitialScope(seed: CommandPreviewSeed, scopes: readonly CommandPreviewScopeSeed[]): string | undefined {
  if (seed.initialScopeId === seed.allScopeId) return seed.allScopeId
  if (seed.initialScopeId && scopes.some((scope) => scope.id === seed.initialScopeId)) return seed.initialScopeId
  if (scopes.some((scope) => scope.id === seed.allScopeId)) return seed.allScopeId
  return scopes[0]?.id
}

function hasKnownRole(roles: readonly CommandPreviewRoleSeed[], id: string | undefined): id is string {
  return id !== undefined && id.trim().length > 0 && roles.some((role) => role.id === id)
}

function resolveInitialSelection(seed: CommandPreviewSeed, items: readonly CommandPreviewItem[]): string | undefined {
  if (seed.initialSelectedId === null) return undefined
  const initialId = seed.initialSelectedId
  if (initialId && items.some((item) => item.id === initialId && item.disabled !== true)) return initialId
  return items.find((item) => item.disabled !== true)?.id
}

function createRequest(
  state: CommandPreviewModelState,
  actionId: string,
  value: string,
): CommandPreviewRequest | undefined {
  if (actionId.trim().length === 0 || value.trim().length === 0 || !state.requestActions.includes(actionId))
    return undefined
  if (
    state.lastRequest?.actionId === actionId &&
    state.lastRequest.value === value &&
    state.lastRequest.ownerId === state.ownerId &&
    state.lastRequest.variant === state.variant &&
    state.lastRequest.fixtureId === state.fixtureId
  ) {
    return undefined
  }
  return {
    ownerId: state.ownerId,
    variant: state.variant,
    fixtureId: state.fixtureId,
    actionId,
    value,
  }
}

function ownsState(state: CommandPreviewModelState, ownerId: string): boolean {
  return Boolean(ownerId.trim() && state.ownerId.trim()) && ownerId === state.ownerId
}

function canRequestInviteReview(
  state: CommandPreviewModelState,
  ownerId: string,
  payload: { readonly email: string; readonly roleId: string },
): boolean {
  return (
    ownsState(state, ownerId) &&
    state.surface === 'invite' &&
    payload.email === state.email &&
    payload.email.trim().length > 0 &&
    payload.roleId === state.roleId &&
    hasKnownRole(state.roles, payload.roleId)
  )
}

function makeInitialState(
  seed: CommandPreviewSeed,
): Omit<
  CommandPreviewModelState,
  | 'refresh'
  | 'setOpen'
  | 'setQuery'
  | 'select'
  | 'move'
  | 'setScope'
  | 'enterPage'
  | 'backPage'
  | 'setEmail'
  | 'setRole'
  | 'setStep'
  | 'setArgument'
  | 'requestArguments'
  | 'useSuggestion'
  | 'requestCommand'
  | 'requestReview'
  | 'requestConfirm'
  | 'requestAsk'
> {
  const pages = normalizePages(seed.pages)
  const scopes = uniqueById(seed.scopes)
  const roles = uniqueById(seed.roles)
  const suggestions = uniqueById(seed.suggestions)
  const pageId = selectInitialPage(seed, pages)
  const scopeId = selectInitialScope(seed, scopes)
  const query = seed.initialQuery
  const initialContext = {
    pages,
    pageId,
    surface: seed.surface,
    scopes,
    scopeId,
    allScopeId: seed.allScopeId,
    query,
  } satisfies CommandPreviewItemContext
  const selection = resolveInitialSelection(seed, selectInitialItems(initialContext))
  const roleId = hasKnownRole(roles, seed.initialRoleId) ? seed.initialRoleId : roles[0]?.id

  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    surface: seed.surface,
    pages,
    scopes,
    allScopeId: seed.allScopeId,
    roles,
    suggestions,
    requestActions: uniqueById(seed.requestActions.map((id) => ({ id }))).map((action) => action.id),
    open: seed.initialOpen,
    query,
    selectedId: selection,
    pageId,
    scopeId,
    email: seed.initialEmail,
    roleId,
    currentRoomId: seed.variant === 6 ? pages[0]?.items[0]?.id : undefined,
    argumentsByPage: reconcileArgumentsByPage(pages),
    step: seed.initialStep,
    lastRequest: undefined,
  }
}

function selectInitialItems(context: CommandPreviewItemContext): readonly CommandPreviewItem[] {
  const page = currentPage(context)
  if (!page) return []
  return page.items.filter((item) => itemMatchesScope(item, context) && itemMatchesQuery(item, context.query))
}

export function createCommandPreviewStore(seed: CommandPreviewSeed): CommandPreviewStoreApi {
  const initial = makeInitialState(seed)

  return createStore<CommandPreviewModelState>((set, get) => ({
    ...initial,
    refresh(ownerId, nextSeed) {
      const state = get()
      if (!ownsState(state, ownerId) || ownerId !== nextSeed.ownerId) return false
      if (
        state.variant !== nextSeed.variant ||
        state.fixtureId !== nextSeed.fixtureId ||
        state.surface !== nextSeed.surface
      )
        return false

      const pages = normalizePages(nextSeed.pages)
      const scopes = uniqueById(nextSeed.scopes)
      const roles = uniqueById(nextSeed.roles)
      const suggestions = uniqueById(nextSeed.suggestions)
      const pageId = pages.some((page) => page.id === state.pageId) ? state.pageId : selectInitialPage(nextSeed, pages)
      const scopeId =
        state.scopeId === nextSeed.allScopeId || scopes.some((scope) => scope.id === state.scopeId)
          ? state.scopeId
          : selectInitialScope(nextSeed, scopes)
      const argumentsByPage = reconcileArgumentsByPage(pages, state.argumentsByPage)
      const argumentDraftChanged =
        pageId !== state.pageId || !sameArgumentValues(state.argumentsByPage[state.pageId], argumentsByPage[pageId])
      set({
        pages,
        scopes,
        allScopeId: nextSeed.allScopeId,
        roles,
        suggestions,
        requestActions: uniqueById(nextSeed.requestActions.map((id) => ({ id }))).map((action) => action.id),
        pageId,
        scopeId,
        selectedId: state.selectedId,
        roleId: hasKnownRole(roles, state.roleId) ? state.roleId : undefined,
        currentRoomId: pages.flatMap((page) => page.items).some((item) => item.id === state.currentRoomId)
          ? state.currentRoomId
          : state.variant === 6
            ? pages[0]?.items[0]?.id
            : undefined,
        argumentsByPage,
        ...(argumentDraftChanged ? { step: 1 } : {}),
        lastRequest: undefined,
      })
      return true
    },
    setOpen(ownerId, open) {
      if (!ownsState(get(), ownerId)) return false
      set({ open })
      return true
    },
    setQuery(ownerId, value) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const changed = state.query !== value
      if (!changed && state.selectedId === undefined) return true
      set({ query: value, selectedId: undefined, ...(changed ? { lastRequest: undefined } : {}) })
      return true
    },
    select(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const item = selectCommandPreviewItems(state).find((candidate) => candidate.id === id)
      if (!item || item.disabled === true) return false
      if (state.selectedId === id) return true
      set({ selectedId: id, lastRequest: undefined })
      return true
    },
    move(ownerId, direction) {
      const state = get()
      if (!ownsState(state, ownerId)) return undefined
      const items = selectCommandPreviewItems(state).filter((item) => item.disabled !== true)
      if (items.length === 0) return undefined
      const index = items.findIndex((item) => item.id === state.selectedId)
      const nextIndex =
        index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
      const item = items[nextIndex]
      if (!item) return undefined
      set({ selectedId: item.id, lastRequest: undefined })
      return item.id
    },
    setScope(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (id !== state.allScopeId && !state.scopes.some((scope) => scope.id === id)) return false
      if (state.scopeId === id && state.selectedId === undefined) return true
      set({ scopeId: id, selectedId: undefined, lastRequest: undefined })
      return true
    },
    enterPage(ownerId, itemId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const item = selectCommandPreviewItems(state).find((candidate) => candidate.id === itemId)
      if (!item || item.disabled === true) return false
      const childPage = state.pages.find((page) => page.parentId === state.pageId && page.entryItemId === itemId)
      if (!childPage) return false
      set({
        pageId: childPage.id,
        query: '',
        selectedId: childPage.items.find((item) => !item.disabled)?.id,
        step: 1,
        lastRequest: undefined,
      })
      return true
    },
    backPage(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const parentId = currentPage(state)?.parentId
      if (!parentId || !state.pages.some((page) => page.id === parentId)) return false
      set({ pageId: parentId, query: '', selectedId: undefined, step: 1, lastRequest: undefined })
      return true
    },
    setEmail(ownerId, email) {
      const state = get()
      if (!ownsState(state, ownerId) || state.surface !== 'invite') return false
      if (state.email === email && state.step === 1) return true
      set({ email, step: 1, ...(state.email !== email ? { lastRequest: undefined } : {}) })
      return true
    },
    setRole(ownerId, roleId) {
      const state = get()
      if (!ownsState(state, ownerId) || state.surface !== 'invite') return false
      if (roleId !== undefined && !hasKnownRole(state.roles, roleId)) return false
      if (state.roleId === roleId && state.step === 1) return true
      set({ roleId, step: 1, ...(state.roleId !== roleId ? { lastRequest: undefined } : {}) })
      return true
    },
    setStep(ownerId, step) {
      const state = get()
      const argumentPage = currentPage(state)?.arguments
      if (!ownsState(state, ownerId) || (state.surface !== 'invite' && (argumentPage?.length ?? 0) === 0)) return false
      if (state.step === step) return true
      set({ step, ...(step === 1 ? { lastRequest: undefined } : {}) })
      return true
    },
    setArgument(ownerId, pageId, fieldId, value) {
      const state = get()
      if (!ownsState(state, ownerId) || pageId !== state.pageId) return false
      const field = currentPage(state)?.arguments?.find((candidate) => candidate.id === fieldId)
      if (!field || !isValidArgumentValue(field, value)) return false
      const currentValues = state.argumentsByPage[pageId]
      if (!currentValues) return false
      if (currentValues[fieldId] === value) return true
      set({
        argumentsByPage: {
          ...state.argumentsByPage,
          [pageId]: { ...currentValues, [fieldId]: value },
        },
        step: 1,
        lastRequest: undefined,
      })
      return true
    },
    requestArguments(ownerId, pageId, phase, payload) {
      const state = get()
      if (!ownsState(state, ownerId)) return undefined
      if (state.step !== (phase === 'review' ? 1 : 2)) return undefined
      const values = liveArgumentPayload(state, pageId, payload)
      if (!values) return undefined
      const output = createRequest(state, phase, JSON.stringify({ pageId, arguments: values }))
      if (!output) return undefined
      set({ ...(phase === 'review' ? { step: 2 } : {}), lastRequest: output })
      return output
    },
    useSuggestion(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId) || state.surface !== 'assistant') return false
      const suggestion = state.suggestions.find((candidate) => candidate.id === id)
      if (!suggestion) return false
      const matching = selectCommandPreviewItems({ ...state, query: suggestion.query })
      set({ query: suggestion.query, selectedId: matching.find((item) => !item.disabled)?.id, lastRequest: undefined })
      return true
    },
    requestCommand(ownerId, request) {
      const state = get()
      if (!ownsState(state, ownerId)) return undefined
      const item = selectCommandPreviewItems(state).find((candidate) => candidate.id === request.targetId)
      if (!item || item.disabled === true) return undefined
      if (state.surface === 'search' && state.selectedId !== request.targetId) return undefined
      const output = createRequest(state, request.actionId, request.targetId)
      if (!output) return undefined
      set({
        lastRequest: output,
        ...(state.variant === 6 && request.actionId === 'switch' ? { currentRoomId: request.targetId } : {}),
      })
      return output
    },
    requestReview(ownerId, payload) {
      const state = get()
      if (!canRequestInviteReview(state, ownerId, payload) || state.step !== 1) return undefined
      const output = createRequest(state, 'review', `${payload.email}:${payload.roleId}`)
      if (!output) return undefined
      set({ step: 2, lastRequest: output })
      return output
    },
    requestConfirm(ownerId, payload) {
      const state = get()
      if (!canRequestInviteReview(state, ownerId, payload) || state.step !== 2) return undefined
      const output = createRequest(state, 'confirm', `${payload.email}:${payload.roleId}`)
      if (!output) return undefined
      set({ lastRequest: output })
      return output
    },
    requestAsk(ownerId, query) {
      const state = get()
      if (!ownsState(state, ownerId) || state.surface !== 'assistant') return undefined
      if (query !== state.query || query.trim().length === 0) return undefined
      if (selectCommandPreviewItems(state).length > 0) return undefined
      const output = createRequest(state, 'ask', query)
      if (!output) return undefined
      set({ lastRequest: output })
      return output
    },
  }))
}
