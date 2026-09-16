import { create } from 'zustand'
import { DEVICE_NAME_MAX_LENGTH, PAIRING_CODE_LENGTH } from '@hbar/contracts'
import { connectHost, useConnection } from './stores'

export const usePairing = create(() => ({ code: '', name: 'hbar Web', busy: false, error: '' }))
let pending: { readonly controller: AbortController; readonly promise: Promise<void> } | undefined

useConnection.subscribe((next, previous) => {
  if (next.client === previous.client) return
  pending?.controller.abort()
  pending = undefined
  usePairing.setState({ code: '', busy: false, error: '' })
})

export function editPairing(field: 'code' | 'name', value: string): void {
  if (usePairing.getState().busy) return
  usePairing.setState({
    [field]:
      field === 'code'
        ? value.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH)
        : value.slice(0, DEVICE_NAME_MAX_LENGTH),
    error: '',
  })
}

export function submitPairing(): Promise<void> {
  if (pending) return pending.promise
  const source = useConnection.getState().client
  const draft = usePairing.getState()
  if (
    !source ||
    useConnection.getState().status !== 'pairing' ||
    draft.code.length !== PAIRING_CODE_LENGTH ||
    !draft.name.trim()
  )
    return Promise.resolve()
  const controller = new AbortController()
  const current = () => !controller.signal.aborted && useConnection.getState().client === source
  usePairing.setState({ busy: true, error: '' })
  // Register the request before starting transport so repeated submits coalesce.
  const promise = Promise.resolve().then(async () => {
    if (!current()) return
    try {
      const host = await source.pair(draft.code, draft.name.trim(), controller.signal)
      if (!current()) return
      useConnection.setState({ host, error: '' })
      usePairing.setState({ code: '' })
    } catch (error) {
      if (current()) usePairing.setState({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (current()) usePairing.setState({ busy: false })
      if (pending?.controller === controller) pending = undefined
    }
  })
  pending = { controller, promise }
  return promise
}

export function retryPairingConnection(): void {
  const state = useConnection.getState()
  if (!state.url || state.status === 'connecting') return
  void connectHost(state.url)
}
