import { createStore } from 'zustand/vanilla'
import type { HbarAppUiRateLimitsContent } from 'hbar-app-ui/catalog'

export interface UsageLimitMetric {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly progressLabel: string
  readonly current: number
  readonly baseLimit: number
  readonly unit: string
}
export interface UsageLimitTier {
  readonly id: string
  readonly label: string
  readonly multiplier: number
  readonly highest: boolean
}
export interface UsageLimitCopy {
  readonly title: string
  readonly empty: string
  readonly tier: string
  readonly increase: string
  readonly status: (near: number) => string
  readonly format: (value: number) => string
  readonly capacity: (limit: number, unit: string) => string
  readonly hint: (highest: boolean) => string
}
export interface UsageLimitPreviewState {
  readonly tiers: readonly UsageLimitTier[]
  readonly metrics: readonly UsageLimitMetric[]
  readonly tierId: string | undefined
  readonly select: (id: string) => void
  readonly replace: (tiers: readonly UsageLimitTier[], metrics: readonly UsageLimitMetric[]) => void
}
function unique<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  return [...new Map(rows.filter((row) => row.id.trim()).map((row) => [row.id, row])).values()]
}
export function createUsageLimitPreviewStore(tiers: readonly UsageLimitTier[], metrics: readonly UsageLimitMetric[]) {
  const initialTiers = unique(tiers)
  const initialMetrics = unique(metrics)
  return createStore<UsageLimitPreviewState>((set, get) => ({
    tiers: initialTiers,
    metrics: initialMetrics,
    tierId: initialTiers[0]?.id,
    select(id) {
      if (get().tiers.some((tier) => tier.id === id)) set({ tierId: id })
    },
    replace(nextTiers, nextMetrics) {
      const tiers = unique(nextTiers)
      const currentTierId = get().tierId
      set({
        tiers,
        metrics: unique(nextMetrics),
        tierId: tiers.some((tier) => tier.id === currentTierId) ? currentTierId : tiers[0]?.id,
      })
    },
  }))
}
export function projectUsageLimitPreview(
  state: UsageLimitPreviewState,
  copy: UsageLimitCopy,
  onIncrease: (tierId: string) => void,
): HbarAppUiRateLimitsContent {
  const tier = state.tiers.find((tier) => tier.id === state.tierId)
  const meters = tier
    ? state.metrics.map((metric) => {
        const current = Number.isFinite(metric.current) ? Math.max(0, metric.current) : 0
        const rawLimit = metric.baseLimit * tier.multiplier
        const limit = Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : 0
        const progress = limit > 0 ? (current / limit) * 100 : current > 0 ? 100 : 0
        return {
          id: metric.id,
          label: metric.label,
          detail: metric.detail,
          progressLabel: metric.progressLabel,
          current: copy.format(current),
          capacity: copy.capacity(limit, metric.unit),
          progress,
          nearCapacity: progress >= 80,
        }
      })
    : []
  const near = meters.filter((meter) => meter.nearCapacity).length
  return {
    title: copy.title,
    description: copy.status(near),
    meters: [],
    emptyLabel: copy.empty,
    panel: {
      meters,
      emptyLabel: copy.empty,
      nearCapacity: near > 0,
      tier: state.tiers.length
        ? { label: copy.tier, value: tier?.id ?? '', options: state.tiers, onChange: state.select }
        : undefined,
      footer: {
        description: copy.hint(tier?.highest ?? false),
        icon: tier?.highest ? 'check' : 'info',
        action: tier ? { label: copy.increase, onInvoke: () => onIncrease(tier.id) } : undefined,
      },
    },
  }
}
