import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ClientPreferencesState } from '@hbar/app-runtime'
import {
  DEFAULT_WEB_APPEARANCE_PREFERENCES,
  hasWebAppearanceOverrides,
  resolveWebAppearancePreferences,
  sameWebAppearance,
  type PreferenceMutationResult,
  type WebAppearancePreferences,
} from './appearance'

export type AppearanceEditorStatus =
  'idle' | 'saving' | 'saved' | 'volatile' | 'conflict' | 'unknown' | 'checking' | 'restore-error'
type Action = Readonly<{ kind: 'save'; target: WebAppearancePreferences } | { kind: 'reset' }>

export interface AppearanceEditorState {
  readonly baseline: WebAppearancePreferences
  readonly draft: WebAppearancePreferences
  readonly revision: number
  readonly latest: WebAppearancePreferences
  readonly latestRevision: number
  readonly latestValues: Readonly<Record<string, unknown>>
  readonly available: boolean
  readonly restoreError: string | null
  readonly status: AppearanceEditorStatus
  readonly error: string | null
  readonly checked: boolean
  readonly action: Action | null
  readonly persisted: boolean
}

export interface AppearanceEditor {
  readonly store: StoreApi<AppearanceEditorState>
  readonly sync: (preferences: ClientPreferencesState) => void
  readonly change: <Key extends keyof WebAppearancePreferences>(key: Key, value: WebAppearancePreferences[Key]) => void
  readonly save: () => Promise<void>
  readonly reset: () => Promise<void>
  readonly check: () => Promise<void>
  readonly discard: () => void
  readonly continueDraft: () => void
}

export interface AppearanceEditorPort {
  readonly save: (target: WebAppearancePreferences, expectedRevision: number) => Promise<PreferenceMutationResult>
  readonly reset: (expectedRevision: number) => Promise<PreferenceMutationResult>
  readonly refresh: () => Promise<ClientPreferencesState>
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'RESULT_UNKNOWN'
}

function initial(preferences: ClientPreferencesState): AppearanceEditorState {
  const value = resolveWebAppearancePreferences(preferences.values)
  return {
    baseline: value,
    draft: value,
    revision: preferences.revision,
    latest: value,
    latestRevision: preferences.revision,
    latestValues: preferences.values,
    available: preferences.status === 'ready' && !preferences.restoreError,
    restoreError: preferences.restoreError,
    status: preferences.restoreError ? 'restore-error' : 'idle',
    error: preferences.restoreError,
    checked: false,
    action: null,
    persisted: preferences.persisted,
  }
}

/** A device-local, per-runtime draft. Host session settings and their CAS are never modified here. */
export function createWebAppearanceEditor(
  preferences: ClientPreferencesState,
  port: AppearanceEditorPort,
): AppearanceEditor {
  const store = createStore<AppearanceEditorState>(() => initial(preferences))
  const get = store.getState
  const set = store.setState
  const sync = (observed: ClientPreferencesState) => {
    const current = get()
    const latest = resolveWebAppearancePreferences(observed.values)
    const available = observed.status === 'ready' && !observed.restoreError
    const shared = {
      latest,
      latestRevision: observed.revision,
      latestValues: observed.values,
      available,
      restoreError: observed.restoreError,
      persisted: observed.persisted,
    }
    if (!available) {
      set({
        ...current,
        ...shared,
        status: current.status === 'unknown' ? 'unknown' : observed.restoreError ? 'restore-error' : 'idle',
        error: observed.restoreError,
      })
      return
    }
    if (current.status === 'saving' || current.status === 'unknown' || current.status === 'checking') {
      set({ ...current, ...shared })
      return
    }
    if (!sameWebAppearance(current.draft, current.baseline)) {
      if (
        current.status === 'conflict' &&
        current.checked &&
        observed.revision === current.latestRevision &&
        sameWebAppearance(latest, current.latest)
      ) {
        set({ ...current, ...shared })
        return
      }
      set({
        ...current,
        ...shared,
        status: observed.revision !== current.revision ? 'conflict' : current.status,
        error: observed.revision !== current.revision ? 'COMMAND_CONFLICT' : current.error,
        checked: observed.revision !== current.revision ? false : current.checked,
      })
      return
    }
    const unchanged = sameWebAppearance(current.baseline, latest)
    set({
      ...current,
      ...shared,
      baseline: latest,
      draft: latest,
      revision: observed.revision,
      status: unchanged && (current.status === 'saved' || current.status === 'volatile') ? current.status : 'idle',
      error: null,
      checked: false,
      action: null,
    })
  }
  const change: AppearanceEditor['change'] = (key, value) => {
    const current = get()
    if (!current.available || ['saving', 'unknown', 'checking'].includes(current.status)) return
    set({
      ...current,
      draft: { ...current.draft, [key]: value },
      status: current.status === 'conflict' ? 'conflict' : 'idle',
      error: current.status === 'conflict' ? current.error : null,
    })
  }
  const mutate = async (action: Action): Promise<void> => {
    const current = get()
    if (!current.available || ['saving', 'unknown', 'checking', 'conflict'].includes(current.status)) return
    if (action.kind === 'save' && sameWebAppearance(current.draft, current.baseline)) return
    if (action.kind === 'reset' && !hasWebAppearanceOverrides(current.latestValues)) return
    set({ ...current, status: 'saving', error: null, action, checked: false })
    try {
      const result =
        action.kind === 'save' ? await port.save(action.target, current.revision) : await port.reset(current.revision)
      const value = action.kind === 'save' ? action.target : DEFAULT_WEB_APPEARANCE_PREFERENCES
      set({
        ...get(),
        baseline: value,
        draft: value,
        revision: result.revision,
        latest: resolveWebAppearancePreferences(result.values),
        latestRevision: result.revision,
        latestValues: result.values,
        status: result.persisted === true ? 'saved' : 'volatile',
        persisted: result.persisted === true,
        error: null,
        checked: false,
        action: null,
      })
    } catch (reason) {
      const error = code(reason)
      set({ ...get(), status: error === 'COMMAND_CONFLICT' ? 'conflict' : 'unknown', error, checked: false })
    }
  }
  const check = async (): Promise<void> => {
    const current = get()
    if (!['unknown', 'conflict', 'restore-error'].includes(current.status)) return
    set({ ...current, status: 'checking' })
    try {
      const observed = await port.refresh()
      const latest = resolveWebAppearancePreferences(observed.values)
      if (observed.status !== 'ready') {
        set({ ...get(), status: current.action ? 'unknown' : 'restore-error', error: 'PREFERENCES_NOT_READY' })
        return
      }
      if (observed.restoreError) {
        set({ ...get(), status: 'restore-error', restoreError: observed.restoreError, error: observed.restoreError })
        return
      }
      const action = current.action
      const confirmed =
        action?.kind === 'save'
          ? sameWebAppearance(latest, action.target)
          : action?.kind === 'reset' && !hasWebAppearanceOverrides(observed.values)
      const shared = {
        latest,
        latestRevision: observed.revision,
        latestValues: observed.values,
        available: observed.status === 'ready',
        restoreError: null,
        persisted: observed.persisted,
      }
      if (confirmed) {
        set({
          ...get(),
          ...shared,
          baseline: latest,
          draft: latest,
          revision: observed.revision,
          status: observed.persisted ? 'saved' : 'volatile',
          error: null,
          checked: true,
          action: null,
        })
      } else if (!action && sameWebAppearance(current.draft, current.baseline)) {
        set({
          ...get(),
          ...shared,
          baseline: latest,
          draft: latest,
          revision: observed.revision,
          status: 'idle',
          error: null,
          checked: true,
        })
      } else {
        set({ ...get(), ...shared, status: 'conflict', error: 'SAVED_VALUES_DIFFER', checked: true })
      }
    } catch (reason) {
      set({
        ...get(),
        status: current.action ? 'unknown' : current.restoreError ? 'restore-error' : 'conflict',
        error: code(reason),
        checked: false,
      })
    }
  }
  return {
    store,
    sync,
    change,
    save: () => mutate({ kind: 'save', target: get().draft }),
    reset: () => mutate({ kind: 'reset' }),
    check,
    discard: () => {
      const current = get()
      if (
        !current.available ||
        ['saving', 'unknown', 'checking'].includes(current.status) ||
        (current.status === 'conflict' && !current.checked)
      )
        return
      set({
        ...current,
        baseline: current.latest,
        draft: current.latest,
        revision: current.latestRevision,
        status: 'idle',
        error: null,
        checked: false,
        action: null,
      })
    },
    continueDraft: () => {
      const current = get()
      if (!current.available || current.status !== 'conflict' || !current.checked) return
      set({
        ...current,
        baseline: current.latest,
        revision: current.latestRevision,
        status: 'idle',
        error: null,
        checked: false,
        action: null,
      })
    },
  }
}

export function partiallyApplied(state: AppearanceEditorState): { readonly count: number; readonly total: number } {
  if (!state.action || state.action.kind !== 'save' || !state.checked) return { count: 0, total: 0 }
  const keys = ['theme', 'controlSize', 'textSize', 'cornerSize'] as const
  const changed = keys.filter(
    (key) => state.action?.kind === 'save' && state.baseline[key] !== state.action.target[key],
  )
  const count = changed.filter(
    (key) => state.action?.kind === 'save' && state.latest[key] === state.action.target[key],
  ).length
  return { count, total: changed.length }
}
