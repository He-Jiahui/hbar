import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { createAppRuntime, StateReader } from '@hbar/app-runtime'

export type HbarRuntimeView = ReturnType<typeof createAppRuntime>['view']

const RuntimeContext = createContext<HbarRuntimeView | null>(null)

export function HbarRuntimeProvider({
  view,
  children,
}: {
  readonly view: HbarRuntimeView
  readonly children: ReactNode
}) {
  return <RuntimeContext.Provider value={view}>{children}</RuntimeContext.Provider>
}

export function useHbarRuntime(): HbarRuntimeView {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('HbarRuntimeProvider is required')
  return runtime
}

export function useHbarRuntimeState<State>(reader: StateReader<State>): State {
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
}
