import { createStore } from 'zustand/vanilla'
import type { LumenAppShellScopeContent, LumenScopeKind } from '@lumen/app-ui'
import { scopeDatabaseFixture, scopeStatusFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-scope-fixtures'

export function createAppShellScopePreviewStore() {
  return createStore<{
    readonly selections: Readonly<Record<LumenScopeKind, string>>
    readonly query: string
    readonly select: (kind: LumenScopeKind, id: string) => void
    readonly search: (query: string) => void
  }>((set) => ({
    selections: { organisation: 'northwind', project: 'payments-api', environment: 'production' },
    query: '',
    select: (kind, id) => set((state) => ({ selections: { ...state.selections, [kind]: id } })),
    search: (query) => set({ query }),
  }))
}
export function projectAppShellScopePreview(
  state: ReturnType<ReturnType<typeof createAppShellScopePreviewStore>['getState']>,
  content: LumenAppShellScopeContent,
  mode: string | null = null,
): LumenAppShellScopeContent {
  const picker = (kind: LumenScopeKind) => ({
    ...content.pickers[kind],
    selectedId: content.pickers[kind].options.some((option) => option.id === state.selections[kind])
      ? state.selections[kind]
      : null,
  })
  const project = picker('project'),
    environment = picker('environment')
  return {
    ...content,
    pickers: { organisation: picker('organisation'), project, environment },
    query: state.query,
    databases:
      !project.selectedId || !environment.selectedId
        ? []
        : mode === 'empty' || mode === 'one' || mode === 'boundary' || mode === 'overflow'
          ? content.databases
          : scopeDatabaseFixture(project.selectedId, environment.selectedId, mode === 'localized'),
    status: scopeStatusFixture(environment.selectedId ?? '', mode === 'localized'),
    onScope: (kind, id) => {
      if (content.pickers[kind].options.some((option) => option.id === id)) {
        state.select(kind, id)
        content.onScope(kind, id)
      }
    },
    onQuery: (value) => {
      state.search(value)
      content.onQuery(value)
    },
  }
}
