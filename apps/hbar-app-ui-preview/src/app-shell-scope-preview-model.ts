import { createStore } from 'zustand/vanilla'
import type { LumenAppShellScopeContent, LumenScopeKind } from '@lumen/app-ui/catalog'
import { scopeDatabaseFixture, scopeStatusFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-scope-fixtures'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

export function createAppShellScopePreviewStore() {
  return createStore<{
    readonly selections: Readonly<Record<LumenScopeKind, string>>
    readonly query: string
    readonly select: (kind: LumenScopeKind, id: string) => void
    readonly search: (query: string) => void
  }>((set) => ({
    selections: { organisation: 'northwind', project: 'payments-api', environment: 'production' },
    query: '',
    select: (kind, id) => {
      if (isValidId(id)) set((state) => ({ selections: { ...state.selections, [kind]: id } }))
    },
    search: (query) => set({ query }),
  }))
}
export function projectAppShellScopePreview(
  state: ReturnType<ReturnType<typeof createAppShellScopePreviewStore>['getState']>,
  content: LumenAppShellScopeContent,
  mode: string | null = null,
): LumenAppShellScopeContent {
  const picker = (kind: LumenScopeKind) => {
    const source = content.pickers[kind]
    const options = stableValidItems(source.options)
    return {
      ...source,
      options,
      selectedId: options.some((option) => option.id === state.selections[kind]) ? state.selections[kind] : null,
    }
  }
  const project = picker('project'),
    environment = picker('environment')
  const navigation = stableValidItems(content.navigation).map((item) => ({
    ...item,
    ...(item.children ? { children: stableValidItems(item.children) } : {}),
  }))
  const environmentNavigation = stableValidItems(content.environmentNavigation).map((item) => ({
    ...item,
    ...(item.children ? { children: stableValidItems(item.children) } : {}),
  }))
  const navigationIds = new Set([
    ...navigation.flatMap((item) => [item.id, ...(item.children?.map((child) => child.id) ?? [])]),
    ...environmentNavigation.flatMap((item) => [item.id, ...(item.children?.map((child) => child.id) ?? [])]),
  ])
  const accountItems = stableValidItems(content.account.items)
  const accountIds = new Set(accountItems.map((item) => item.id))
  const databases = stableValidItems(
    !project.selectedId || !environment.selectedId
      ? []
      : mode === 'empty' || mode === 'one' || mode === 'boundary' || mode === 'overflow'
        ? content.databases
        : scopeDatabaseFixture(project.selectedId, environment.selectedId, mode === 'localized'),
  )
  const statusSource = scopeStatusFixture(environment.selectedId ?? '', mode === 'localized')
  const status = { ...statusSource, regions: stableValidItems(statusSource.regions) }
  return {
    ...content,
    navigation,
    environmentNavigation,
    pickers: { organisation: picker('organisation'), project, environment },
    currentNavigationId: isValidId(content.currentNavigationId) ? content.currentNavigationId : '',
    query: state.query,
    databases,
    status,
    account: { ...content.account, items: accountItems },
    onScope: (kind, id) => {
      if (isValidId(id) && picker(kind).options.some((option) => option.id === id)) {
        state.select(kind, id)
        content.onScope(kind, id)
      }
    },
    onQuery: (value) => {
      state.search(value)
      content.onQuery(value)
    },
    onAction: (action, id) => {
      if (action === 'navigate' && id && isValidId(id) && navigationIds.has(id)) {
        content.onAction(action, id)
      } else if (action === 'account' && id && isValidId(id) && accountIds.has(id)) {
        content.onAction(action, id)
      } else if (action === 'create' || action === 'read-more') {
        content.onAction(action, id)
      }
    },
  }
}
