import { createStore } from 'zustand/vanilla'
import type { HbarAppUiModelSpendContent } from 'hbar-app-ui/catalog'

export type UsageModelSort = 'cost' | 'requests' | 'tokens'
export interface UsageModelPreviewRecord {
  readonly row: Omit<NonNullable<HbarAppUiModelSpendContent['table']>['rows'][number], 'share' | 'shareEmphasis'>
  readonly shares: { readonly cost: number; readonly requests: number; readonly tokens: number }
}
export interface UsageModelPreviewState {
  readonly records: readonly UsageModelPreviewRecord[]
  readonly sortBy: UsageModelSort
  readonly page: number
  readonly select: (id: string) => void
  readonly replace: (records: readonly UsageModelPreviewRecord[]) => void
  readonly previous: () => void
  readonly next: () => void
}
export const USAGE_MODEL_PAGE_SIZE = 50
function unique(records: readonly UsageModelPreviewRecord[]): readonly UsageModelPreviewRecord[] {
  return [...new Map(records.map((record) => [record.row.id, record])).values()]
}
function lastPage(records: readonly UsageModelPreviewRecord[]): number {
  return Math.max(0, Math.ceil(records.length / USAGE_MODEL_PAGE_SIZE) - 1)
}
export function createUsageModelPreviewStore(records: readonly UsageModelPreviewRecord[]) {
  return createStore<UsageModelPreviewState>((set, get) => ({
    records: unique(records),
    sortBy: 'cost',
    page: 0,
    select(id) {
      if (id === 'cost' || id === 'requests' || id === 'tokens') set({ sortBy: id, page: 0 })
    },
    replace(next) {
      const records = unique(next)
      set({ records, page: Math.min(get().page, lastPage(records)) })
    },
    previous() {
      set({ page: Math.max(0, get().page - 1) })
    },
    next() {
      set({ page: Math.min(lastPage(get().records), get().page + 1) })
    },
  }))
}
export interface UsageModelPaginationCopy {
  readonly previous: string
  readonly next: string
  readonly page: (current: number, total: number) => string
}
export function projectUsageModelPreview(
  state: UsageModelPreviewState,
  base: HbarAppUiModelSpendContent,
  copy: UsageModelPaginationCopy,
): HbarAppUiModelSpendContent {
  if (!base.table) return base
  const sorted = [...state.records].sort((a, b) => b.shares[state.sortBy] - a.shares[state.sortBy])
  const records = sorted.slice(state.page * USAGE_MODEL_PAGE_SIZE, (state.page + 1) * USAGE_MODEL_PAGE_SIZE)
  return {
    ...base,
    table: {
      ...base.table,
      sortBy: base.table.sortBy ? { ...base.table.sortBy, value: state.sortBy, onChange: state.select } : undefined,
      rows: records.map((record) => ({
        ...record.row,
        share: record.shares[state.sortBy],
        shareEmphasis: record.shares[state.sortBy] >= 50,
      })),
      pagination:
        state.records.length > USAGE_MODEL_PAGE_SIZE
          ? {
              label: copy.page(state.page + 1, lastPage(state.records) + 1),
              previousLabel: copy.previous,
              nextLabel: copy.next,
              canPrevious: state.page > 0,
              canNext: state.page < lastPage(state.records),
              onPrevious: state.previous,
              onNext: state.next,
            }
          : undefined,
    },
  }
}
