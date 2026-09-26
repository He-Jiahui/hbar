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

export interface AppearanceEditorBinding {
  readonly endpointId: string
  readonly generation: number
  readonly hostId: string | null
}

export interface AppearanceEditorBindingInput {
  readonly binding: AppearanceEditorBinding
  readonly preferences: ClientPreferencesState
  readonly port: AppearanceEditorPort
}

export interface AppearanceEditorState {
  readonly baseline: WebAppearancePreferences
  readonly draft: WebAppearancePreferences
  readonly revision: number
  readonly latest: WebAppearancePreferences
  readonly latestRevision: number
  readonly latestValues: Readonly<Record<string, unknown>>
  readonly available: boolean
  readonly editable: boolean
  readonly writable: boolean
  readonly binding: AppearanceEditorBinding | null
  readonly restoreError: string | null
  readonly status: AppearanceEditorStatus
  readonly error: string | null
  readonly checked: boolean
  readonly action: Action | null
  readonly persisted: boolean
}

export interface AppearanceEditor {
  readonly store: StoreApi<AppearanceEditorState>
  readonly sync: (preferences: ClientPreferencesState, binding?: AppearanceEditorBinding) => void
  readonly bind: (input: AppearanceEditorBindingInput) => boolean
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

function sameBinding(left: AppearanceEditorBinding, right: AppearanceEditorBinding | undefined): boolean {
  return Boolean(
    right &&
    left.endpointId === right.endpointId &&
    left.generation === right.generation &&
    left.hostId === right.hostId,
  )
}

function initial(preferences: ClientPreferencesState, binding?: AppearanceEditorBinding): AppearanceEditorState {
  const value = resolveWebAppearancePreferences(preferences.values)
  const pending = binding?.hostId === null
  const available = !pending && preferences.status === 'ready' && !preferences.restoreError
  return {
    baseline: value,
    draft: value,
    revision: preferences.revision,
    latest: value,
    latestRevision: preferences.revision,
    latestValues: preferences.values,
    available,
    editable: pending || available,
    writable: available,
    binding: binding ? Object.freeze({ ...binding }) : null,
    restoreError: pending ? null : preferences.restoreError,
    status: !pending && preferences.restoreError ? 'restore-error' : 'idle',
    error: pending ? null : preferences.restoreError,
    checked: false,
    action: null,
    persisted: !pending && preferences.persisted,
  }
}

/** A device-local draft; only the initial same-endpoint binding may attach a confirmed preference port. */
export function createWebAppearanceEditor(
  preferences: ClientPreferencesState,
  port: AppearanceEditorPort,
  binding?: AppearanceEditorBinding,
): AppearanceEditor {
  const store = createStore<AppearanceEditorState>(() => initial(preferences, binding))
  const get = store.getState
  const set = (next: AppearanceEditorState) => {
    const pending = next.binding?.hostId === null
    store.setState({
      ...next,
      editable: pending || (awaitingConfirmedBaseline && !next.restoreError) || next.available,
      writable: !pending && next.available,
    })
  }
  let boundPort = port
  let bindingEpoch = 0
  let awaitingConfirmedBaseline = false
  const sync = (observed: ClientPreferencesState, sourceBinding?: AppearanceEditorBinding) => {
    const current = get()
    // An explicit owner never accepts a detached or old runtime reader. Pending
    // values are bootstrap only, not authoritative preferences under pending:*.
    if (current.binding && (!sameBinding(current.binding, sourceBinding) || current.binding.hostId === null)) return
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
        status: ['saving', 'unknown', 'checking'].includes(current.status)
          ? current.status
          : observed.restoreError
            ? 'restore-error'
            : 'idle',
        error: observed.restoreError,
      })
      return
    }
    if (current.status === 'saving' || current.status === 'unknown' || current.status === 'checking') {
      set({ ...current, ...shared })
      return
    }
    if (awaitingConfirmedBaseline) {
      awaitingConfirmedBaseline = false
      const dirty = !sameWebAppearance(current.draft, current.baseline)
      if (dirty && !sameWebAppearance(current.baseline, latest)) {
        set({ ...current, ...shared, status: 'conflict', error: 'COMMAND_CONFLICT', checked: false })
      } else {
        set({
          ...current,
          ...shared,
          baseline: latest,
          draft: dirty ? current.draft : latest,
          revision: observed.revision,
          status: 'idle',
          error: null,
          checked: false,
          action: null,
        })
      }
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
    if (!current.editable || ['saving', 'unknown', 'checking'].includes(current.status)) return
    set({
      ...current,
      draft: { ...current.draft, [key]: value },
      status: current.status === 'conflict' ? 'conflict' : 'idle',
      error: current.status === 'conflict' ? current.error : null,
    })
  }
  const mutate = async (action: Action): Promise<void> => {
    const current = get()
    if (!current.writable || ['saving', 'unknown', 'checking', 'conflict'].includes(current.status)) return
    if (action.kind === 'save' && sameWebAppearance(current.draft, current.baseline)) return
    if (action.kind === 'reset' && !hasWebAppearanceOverrides(current.latestValues)) return
    set({ ...current, status: 'saving', error: null, action, checked: false })
    const requestPort = boundPort
    const requestEpoch = bindingEpoch
    try {
      const result =
        action.kind === 'save'
          ? await requestPort.save(action.target, current.revision)
          : await requestPort.reset(current.revision)
      if (requestEpoch !== bindingEpoch) return
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
      if (requestEpoch !== bindingEpoch) return
      const error = code(reason)
      set({ ...get(), status: error === 'COMMAND_CONFLICT' ? 'conflict' : 'unknown', error, checked: false })
    }
  }
  const check = async (): Promise<void> => {
    const current = get()
    if (current.binding?.hostId === null) return
    if (!['unknown', 'conflict', 'restore-error'].includes(current.status)) return
    set({ ...current, status: 'checking' })
    const requestPort = boundPort
    const requestEpoch = bindingEpoch
    try {
      const observed = await requestPort.refresh()
      if (requestEpoch !== bindingEpoch) return
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
      const safeInitialRebase = awaitingConfirmedBaseline && sameWebAppearance(current.baseline, latest)
      awaitingConfirmedBaseline = false
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
      } else if (!action && (sameWebAppearance(current.draft, current.baseline) || safeInitialRebase)) {
        set({
          ...get(),
          ...shared,
          baseline: latest,
          draft: safeInitialRebase ? get().draft : latest,
          revision: observed.revision,
          status: 'idle',
          error: null,
          checked: true,
        })
      } else {
        set({ ...get(), ...shared, status: 'conflict', error: 'SAVED_VALUES_DIFFER', checked: true })
      }
    } catch (reason) {
      if (requestEpoch !== bindingEpoch) return
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
    bind: (input) => {
      const current = get()
      const source = current.binding
      const target = input.binding
      if (
        !source ||
        target.endpointId.length === 0 ||
        !Number.isSafeInteger(target.generation) ||
        target.generation < 0 ||
        source.endpointId !== target.endpointId ||
        source.generation !== target.generation
      )
        return false
      if (sameBinding(source, target)) {
        if (boundPort !== input.port) return false
        sync(input.preferences, target)
        return true
      }
      if (
        source.hostId !== null ||
        target.hostId === null ||
        target.hostId.length === 0 ||
        current.action !== null ||
        ['saving', 'unknown', 'checking'].includes(current.status)
      )
        return false
      boundPort = input.port
      bindingEpoch++
      awaitingConfirmedBaseline = true
      set({ ...current, binding: Object.freeze({ ...target }), available: false, persisted: false })
      sync(input.preferences, target)
      return true
    },
    change,
    save: () => mutate({ kind: 'save', target: get().draft }),
    reset: () => mutate({ kind: 'reset' }),
    check,
    discard: () => {
      const current = get()
      if (
        !current.editable ||
        (current.binding?.hostId !== null && !current.available) ||
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
