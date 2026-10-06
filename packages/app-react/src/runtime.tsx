import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { createAppRuntime, StateReader } from '@hbar/app-runtime'

export type HbarRuntimeView = ReturnType<typeof createAppRuntime>['view']

const RuntimeContext = createContext<HbarRuntimeView | null>(null)
type SkillImportSurface = (instanceId: string, connected: boolean) => ReactNode
const SkillImportSurfaceContext = createContext<SkillImportSurface | null>(null)
export function useHbarSkillImportSurface() {
  return useContext(SkillImportSurfaceContext)
}

export function HbarRuntimeProvider({
  view,
  children,
  renderSkillImport,
}: {
  readonly view: HbarRuntimeView
  readonly children: ReactNode
  readonly renderSkillImport?: SkillImportSurface
}) {
  return (
    <RuntimeContext.Provider value={view}>
      <SkillImportSurfaceContext.Provider value={renderSkillImport ?? null}>
        {children}
      </SkillImportSurfaceContext.Provider>
    </RuntimeContext.Provider>
  )
}

export function useHbarRuntime(): HbarRuntimeView {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('HbarRuntimeProvider is required')
  return runtime
}

export function useHbarRuntimeState<State>(reader: StateReader<State>): State {
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
}
