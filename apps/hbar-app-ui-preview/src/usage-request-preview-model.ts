import { createStore } from 'zustand/vanilla'
import type { LumenUsageRequestRecord } from '@lumen/app-ui'
import type { LumenUsageRequestLogContent } from '@lumen/app-ui/catalog'

export interface UsageRequestFact {
  readonly id: string
  readonly time: string
  readonly endpoint: string
  readonly model: string
  readonly tokens: string
  readonly input: string
  readonly output: string
  readonly latency: string
  readonly preciseLatency: string
  readonly cost: number
  readonly status: 'success' | 'capped' | 'error'
}
export interface UsageRequestCopy {
  readonly title: string
  readonly filterLabel: string
  readonly filters: { readonly all: string; readonly capped: string; readonly error: string }
  readonly statuses: { readonly success: string; readonly capped: string; readonly error: string }
  readonly columns: NonNullable<LumenUsageRequestLogContent['table']>['columns']
  readonly details: {
    readonly request: string
    readonly model: string
    readonly status: string
    readonly input: string
    readonly output: string
    readonly latency: string
  }
  readonly empty: string
  readonly previous: string
  readonly next: string
  readonly summary: (count: number, cost: number) => string
  readonly money: (cost: number) => string
  readonly mobileSummary: (time: string, model: string) => string
  readonly page: (current: number, count: number) => string
}
export interface UsageRequestPreviewState {
  readonly records: readonly UsageRequestFact[]
  readonly filter: 'all' | 'capped' | 'error'
  readonly expandedId: string | null
  readonly page: number
  readonly selectFilter: (id: string) => void
  readonly toggle: (id: string) => void
  readonly next: () => void
  readonly previous: () => void
  readonly replace: (records: readonly UsageRequestFact[]) => void
}
export const USAGE_REQUEST_PAGE_SIZE = 50
function unique(records: readonly UsageRequestFact[]) {
  return [...new Map(records.filter((row) => row.id.trim()).map((row) => [row.id, row])).values()]
}
function matching(state: Pick<UsageRequestPreviewState, 'records' | 'filter'>) {
  return state.records.filter((row) => state.filter === 'all' || row.status === state.filter)
}
function lastPage(count: number) {
  return Math.max(0, Math.ceil(count / USAGE_REQUEST_PAGE_SIZE) - 1)
}
export function createUsageRequestPreviewStore(records: readonly UsageRequestFact[], expandedId: string | null) {
  const rows = unique(records)
  return createStore<UsageRequestPreviewState>((set, get) => ({
    records: rows,
    filter: 'all',
    expandedId: rows.some((row) => row.id === expandedId) ? expandedId : null,
    page: 0,
    selectFilter(id) {
      if (id === 'all' || id === 'capped' || id === 'error') set({ filter: id, page: 0 })
    },
    toggle(id) {
      if (id.trim() && get().records.some((row) => row.id === id))
        set({ expandedId: get().expandedId === id ? null : id })
    },
    next() {
      set({ page: Math.min(lastPage(matching(get()).length), get().page + 1) })
    },
    previous() {
      set({ page: Math.max(0, get().page - 1) })
    },
    replace(next) {
      const records = unique(next)
      set({
        records,
        expandedId: records.some((row) => row.id === get().expandedId) ? get().expandedId : null,
        page: Math.min(get().page, lastPage(matching({ ...get(), records }).length)),
      })
    },
  }))
}
function cost(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
export function projectUsageRequestPreview(
  state: UsageRequestPreviewState,
  copy: UsageRequestCopy,
): LumenUsageRequestLogContent {
  const records = matching(state)
  const rows: readonly LumenUsageRequestRecord[] = records
    .slice(state.page * USAGE_REQUEST_PAGE_SIZE, (state.page + 1) * USAGE_REQUEST_PAGE_SIZE)
    .map((row) => ({
      ...row,
      cost: copy.money(cost(row.cost)),
      mobileSummary: copy.mobileSummary(row.time, row.model),
      details: [
        { id: 'request', label: copy.details.request, value: row.id },
        { id: 'model', label: copy.details.model, value: row.model },
        { id: 'status', label: copy.details.status, value: copy.statuses[row.status] },
        { id: 'input', label: copy.details.input, value: row.input },
        { id: 'output', label: copy.details.output, value: row.output },
        { id: 'latency', label: copy.details.latency, value: row.preciseLatency },
      ],
    }))
  return {
    title: copy.title,
    description: copy.summary(
      records.length,
      records.reduce((sum, row) => sum + cost(row.cost), 0),
    ),
    strategy: 'content-grown',
    emptyLabel: copy.empty,
    rows: [],
    table: {
      rows,
      expandedId: state.expandedId,
      onToggle: state.toggle,
      columns: copy.columns,
      emptyLabel: copy.empty,
      filter: {
        label: copy.filterLabel,
        value: state.filter,
        onChange: state.selectFilter,
        options: [
          { id: 'all', label: copy.filters.all },
          { id: 'capped', label: copy.filters.capped },
          { id: 'error', label: copy.filters.error },
        ],
      },
      pagination:
        records.length > USAGE_REQUEST_PAGE_SIZE
          ? {
              label: copy.page(state.page + 1, lastPage(records.length) + 1),
              previousLabel: copy.previous,
              nextLabel: copy.next,
              canPrevious: state.page > 0,
              canNext: state.page < lastPage(records.length),
              onPrevious: state.previous,
              onNext: state.next,
            }
          : undefined,
    },
  }
}
