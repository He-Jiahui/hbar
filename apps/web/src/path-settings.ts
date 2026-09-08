import { create } from 'zustand'
import type { RpcResults } from '@hbar/contracts'
import { client } from './stores'

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
    set({ status: 'loading', error: '' })
    try {
      const current = await client().call('system.paths.get', {})
      set({ current, dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'idle' })
    } catch (error) {
      set({ status: 'idle', error: failureMessage(error) })
    }
  },
  setDataRoot(dataRoot) {
    set({ dataRoot, status: 'idle', error: '' })
  },
  setCacheRoot(cacheRoot) {
    set({ cacheRoot, status: 'idle', error: '' })
  },
  async validate() {
    const { dataRoot, cacheRoot } = get()
    set({ status: 'validating', error: '' })
    try {
      const result = await client().call('system.paths.validate', { dataRoot, cacheRoot })
      set({ dataRoot: result.dataRoot, cacheRoot: result.cacheRoot, status: 'idle' })
    } catch (error) {
      set({ status: 'idle', error: failureMessage(error) })
    }
  },
  async save() {
    const { dataRoot, cacheRoot } = get()
    set({ status: 'saving', error: '' })
    try {
      const current = await client().call('system.paths.set', { dataRoot, cacheRoot })
      set({ current, dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'saved' })
    } catch (error) {
      set({ status: 'idle', error: failureMessage(error) })
    }
  },
  reset() {
    const current = get().current
    if (current) set({ dataRoot: current.dataRoot, cacheRoot: current.cacheRoot, status: 'idle', error: '' })
  },
}))
