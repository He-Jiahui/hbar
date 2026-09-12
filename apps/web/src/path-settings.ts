import { create } from 'zustand'
import type { RpcResults } from '@hbar/contracts'
import { useConnection } from './stores'

type PathInfo = RpcResults['system.paths.get']

interface PathSettingsState {
  current: PathInfo | null
  dataRoot: string
  cacheRoot: string
  status: 'idle' | 'loading' | 'validating' | 'saving' | 'saved'
  error: string
  load(): Promise<void>
  setDataRoot(value: string): void
  setCacheRoot(value: string): void
  validate(): Promise<void>
  save(): Promise<void>
  reset(): void
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const usePathSettings = create<PathSettingsState>((set, get) => ({
  current: null,
  dataRoot: '',
  cacheRoot: '',
  status: 'idle',
  error: '',
  async load() {
    const connection = useConnection.getState().client
    const operation = ++pathOperation
    set({ status: 'loading', error: '' })
    if (!connection) {
      if (operation === pathOperation) set({ status: 'idle', error: 'Host is not connected' })
      return
    }
    try {
      const current = await connection.call('system.paths.get', {})
      if (!isCurrentPathOperation(connection, operation)) return
      set({ current, dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'idle' })
    } catch (error) {
      if (isCurrentPathOperation(connection, operation)) set({ status: 'idle', error: failureMessage(error) })
    }
  },
  setDataRoot(dataRoot) {
    pathOperation += 1
    set({ dataRoot, status: 'idle', error: '' })
  },
  setCacheRoot(cacheRoot) {
    pathOperation += 1
    set({ cacheRoot, status: 'idle', error: '' })
  },
  async validate() {
    const { dataRoot, cacheRoot } = get()
    const connection = useConnection.getState().client
    const operation = ++pathOperation
    set({ status: 'validating', error: '' })
    if (!connection) {
      if (operation === pathOperation) set({ status: 'idle', error: 'Host is not connected' })
      return
    }
    try {
      const result = await connection.call('system.paths.validate', { dataRoot, cacheRoot })
      if (!isCurrentPathOperation(connection, operation)) return
      set({ dataRoot: result.dataRoot, cacheRoot: result.cacheRoot, status: 'idle' })
    } catch (error) {
      if (isCurrentPathOperation(connection, operation)) set({ status: 'idle', error: failureMessage(error) })
    }
  },
  async save() {
    const { dataRoot, cacheRoot } = get()
    const connection = useConnection.getState().client
    const operation = ++pathOperation
    set({ status: 'saving', error: '' })
    if (!connection) {
      if (operation === pathOperation) set({ status: 'idle', error: 'Host is not connected' })
      return
    }
    try {
      const current = await connection.call('system.paths.set', { dataRoot, cacheRoot })
      if (!isCurrentPathOperation(connection, operation)) return
      set({ current, dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'saved' })
    } catch (error) {
      if (isCurrentPathOperation(connection, operation)) set({ status: 'idle', error: failureMessage(error) })
    }
  },
  reset() {
    pathOperation += 1
    const current = get().current
    if (current) set({ dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'idle', error: '' })
  },
}))

let pathOperation = 0

function isCurrentPathOperation(connection: ReturnType<typeof useConnection.getState>['client'], operation: number) {
  return operation === pathOperation && useConnection.getState().client === connection
}
