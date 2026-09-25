import { createStore } from 'zustand/vanilla'
import type { LumenUsageOverageContent, LumenUsageOveragePlan } from '@lumen/app-ui'

export interface UsageOverageCopy {
  readonly title: string
  readonly description: string
  readonly summary: NonNullable<LumenUsageOverageContent['panel']>['summary']
  readonly plansLabel: string
  readonly groupLabel: string
  readonly emptyLabel: string
  readonly note: string
  readonly stay: string
  readonly upgrade: string
}
export interface UsageOveragePreviewState {
  readonly plans: readonly LumenUsageOveragePlan[]
  readonly selectedId: string | null
  readonly select: (id: string) => void
  readonly replace: (plans: readonly LumenUsageOveragePlan[]) => void
}
function unique(plans: readonly LumenUsageOveragePlan[]) {
  return [...new Map(plans.map((plan) => [plan.id, plan])).values()]
}
export function createUsageOveragePreviewStore(plans: readonly LumenUsageOveragePlan[], initialId?: string) {
  const records = unique(plans)
  const initial =
    records.find((plan) => plan.id === initialId && !plan.disabled) ?? records.find((plan) => !plan.disabled)
  return createStore<UsageOveragePreviewState>((set, get) => ({
    plans: records,
    selectedId: initial?.id ?? null,
    select(id) {
      if (get().selectedId !== id && get().plans.some((plan) => plan.id === id && !plan.disabled))
        set({ selectedId: id })
    },
    replace(next) {
      const plans = unique(next)
      const selected =
        plans.find((plan) => plan.id === get().selectedId && !plan.disabled) ?? plans.find((plan) => !plan.disabled)
      set({ plans, selectedId: selected?.id ?? null })
    },
  }))
}
export function projectUsageOveragePreview(
  state: UsageOveragePreviewState,
  copy: UsageOverageCopy,
  report: (action: 'stay-on-overage' | 'upgrade', id: string | null) => void,
): LumenUsageOverageContent {
  // Capture this render's target; a queued callback never resolves against a later selection.
  const selectedId = state.selectedId
  return {
    title: copy.title,
    description: copy.description,
    status: copy.title,
    meters: [],
    panel: {
      summary: copy.summary,
      plansLabel: copy.plansLabel,
      groupLabel: copy.groupLabel,
      plans: state.plans,
      selectedId,
      onSelect: state.select,
      emptyLabel: copy.emptyLabel,
      note: copy.note,
      stay: { label: copy.stay, onInvoke: () => report('stay-on-overage', selectedId) },
      upgrade: {
        label: copy.upgrade,
        disabled: selectedId === null,
        onInvoke: () => {
          if (selectedId !== null) report('upgrade', selectedId)
        },
      },
    },
  }
}
