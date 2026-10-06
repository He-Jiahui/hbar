import { createStore } from 'zustand/vanilla'
import {
  beginSubmit,
  compileForm,
  createComponentRegistry,
  createForm,
  rebaseForm,
  resetField,
  setField,
  settleSubmit,
  type FormState,
  type Submission,
} from '@hbar/schema-core'
import {
  storageLocationDataSchema,
  storageLocationFormDescription,
  storageRootsSchema,
  type StorageLocationApply,
  type StorageLocationSnapshot,
} from '@hbar/contracts/commands/storage-locations'

export interface StorageLocationPort {
  read(signal: AbortSignal): Promise<StorageLocationSnapshot>
  save(input: StorageLocationApply, signal: AbortSignal): Promise<StorageLocationSnapshot>
  restart(signal: AbortSignal): Promise<{ accepted: boolean; restartRequired: boolean }>
}
const components = createComponentRegistry()
components.register('TextField', ['string'])
export const storageLocationForm = compileForm(storageLocationDataSchema, storageLocationFormDescription, components)
export interface StorageLocationState {
  readonly snapshot: StorageLocationSnapshot | null
  readonly form: FormState | null
  readonly loading: boolean
  readonly error: string | null
  readonly restart: 'idle' | 'pending' | 'accepted' | 'manual'
}
function code(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN_RESULT'
}
export function createStorageLocationController(port: StorageLocationPort) {
  const store = createStore<StorageLocationState>(() => ({
    snapshot: null,
    form: null,
    loading: false,
    error: null,
    restart: 'idle',
  }))
  const lifetime = new AbortController()
  let leases = 0
  let leaseEpoch = 0
  let reading = false
  let saving = false
  let pending: { input: StorageLocationApply; submission: Submission } | null = null
  const settle = (snapshot: StorageLocationSnapshot) => {
    let form = store.getState().form
    if (
      form &&
      pending &&
      (snapshot.lastWrite?.operationId === pending.input.operationId ||
        snapshot.receipts.some((receipt) => receipt.operationId === pending?.input.operationId))
    ) {
      form = settleSubmit(storageLocationForm, form, pending.submission, 'succeeded')
      pending = null
    }
    store.setState({
      snapshot,
      form: form
        ? rebaseForm(storageLocationForm, form, snapshot.saved)
        : createForm(storageLocationForm, snapshot.saved),
      error: null,
    })
  }
  const read = async () => {
    if (reading || saving || lifetime.signal.aborted) return
    reading = true
    store.setState({ loading: true, error: null })
    try {
      const snapshot = await port.read(lifetime.signal)
      if (!lifetime.signal.aborted) settle(snapshot)
    } catch (error) {
      if (!lifetime.signal.aborted) store.setState({ error: code(error) })
    } finally {
      reading = false
      if (!lifetime.signal.aborted) store.setState({ loading: false })
    }
  }
  const save = async () => {
    const state = store.getState()
    if (
      saving ||
      reading ||
      lifetime.signal.aborted ||
      !state.form ||
      !state.snapshot ||
      pending ||
      !state.form.dirty.length ||
      state.form.issues.length
    )
      return
    const { state: form, submission } = beginSubmit(storageLocationForm, state.form)
    const input: StorageLocationApply = {
      roots: storageRootsSchema.parse(submission.input),
      expectedRevision: state.snapshot.revision,
      operationId: crypto.randomUUID(),
    }
    pending = { input, submission }
    saving = true
    store.setState({ form, error: null })
    try {
      const snapshot = await port.save(input, lifetime.signal)
      if (!lifetime.signal.aborted) settle(snapshot)
    } catch (error) {
      if (lifetime.signal.aborted) return
      const reason = code(error)
      const known =
        reason.startsWith('STORAGE_') ||
        reason === 'BUSY' ||
        reason === 'INVALID_INPUT' ||
        reason === 'IDEMPOTENCY_CONFLICT'
      store.setState({
        form: settleSubmit(
          storageLocationForm,
          store.getState().form!,
          submission,
          known ? 'failed' : 'unknown',
          reason,
        ),
        error: reason,
      })
      if (known) pending = null
    } finally {
      saving = false
    }
  }
  return {
    acquire() {
      leases++
      leaseEpoch++
      return () => {
        const epoch = ++leaseEpoch
        leases--
        queueMicrotask(() => {
          if (leases === 0 && epoch === leaseEpoch) lifetime.abort()
        })
      }
    },
    store,
    schema: storageLocationForm,
    read,
    save,
    async retryOriginal() {
      const previous = pending
      if (!previous || saving || reading || lifetime.signal.aborted || store.getState().form?.status !== 'unknown')
        return
      saving = true
      try {
        const snapshot = await port.save(previous.input, lifetime.signal)
        if (!lifetime.signal.aborted) settle(snapshot)
      } catch (error) {
        if (lifetime.signal.aborted) return
        const reason = code(error)
        const known =
          reason.startsWith('STORAGE_') ||
          reason === 'BUSY' ||
          reason === 'INVALID_INPUT' ||
          reason === 'IDEMPOTENCY_CONFLICT'
        const form = store.getState().form
        if (form)
          store.setState({
            form: settleSubmit(storageLocationForm, form, previous.submission, known ? 'failed' : 'unknown', reason),
            error: reason,
          })
        if (known) pending = null
      } finally {
        saving = false
      }
    },
    edit(name: string, value: string) {
      const state = store.getState()
      if (state.form && !lifetime.signal.aborted)
        store.setState({ form: setField(storageLocationForm, state.form, name, value) })
    },
    reset(name: string) {
      const state = store.getState()
      if (state.form && !lifetime.signal.aborted)
        store.setState({ form: resetField(storageLocationForm, state.form, name) })
    },
    discard() {
      const state = store.getState()
      if (state.snapshot && !saving && !pending)
        store.setState({ form: createForm(storageLocationForm, state.snapshot.saved), error: null })
    },
    async restart() {
      if (saving || lifetime.signal.aborted || store.getState().restart === 'pending') return
      store.setState({ restart: 'pending', error: null })
      try {
        const result = await port.restart(lifetime.signal)
        if (!lifetime.signal.aborted) store.setState({ restart: result.accepted ? 'accepted' : 'manual' })
      } catch (error) {
        if (!lifetime.signal.aborted) store.setState({ restart: 'manual', error: code(error) })
      }
    },
    dispose() {
      lifetime.abort()
    },
  }
}
export type StorageLocationController = ReturnType<typeof createStorageLocationController>
