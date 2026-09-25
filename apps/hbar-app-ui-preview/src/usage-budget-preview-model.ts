import { createStore } from 'zustand/vanilla'
import type { HbarAppUiBudgetSettingsContent } from 'hbar-app-ui/catalog'

export interface UsageBudgetChoice {
  readonly id: string
  readonly label: string
  readonly checked: boolean
}
export interface UsageBudgetSetting extends UsageBudgetChoice {
  readonly description: string
}
export interface UsageBudgetFacts {
  readonly spent: number
  readonly projected: number
  readonly cap: number
  readonly minimum: number
  readonly maximum: number
  readonly step: number
}
export interface UsageBudgetCopy {
  readonly title: string
  readonly description: string
  readonly month: string
  readonly cap: string
  readonly notify: string
  readonly progress: string
  readonly emptyThresholds: string
  readonly emptySwitches: string
  readonly legacySave: string
  readonly legacySaving: string
  readonly money: (amount: number) => string
  readonly capacity: (cap: number) => string
  readonly forecast: (projected: number, over: boolean) => string
}
export interface UsageBudgetPreviewState {
  readonly facts: UsageBudgetFacts
  readonly thresholds: readonly UsageBudgetChoice[]
  readonly settings: readonly UsageBudgetSetting[]
  readonly changeCap: (cap: number) => void
  readonly setThreshold: (id: string, checked: boolean) => void
  readonly setSetting: (id: string, checked: boolean) => void
  readonly replace: (
    facts: UsageBudgetFacts,
    thresholds: readonly UsageBudgetChoice[],
    settings: readonly UsageBudgetSetting[],
  ) => void
}
function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}
function normalize(facts: UsageBudgetFacts): UsageBudgetFacts {
  const minimum = Math.max(0, finite(facts.minimum, 0)),
    maximum = Math.max(minimum, finite(facts.maximum, minimum))
  const step = facts.step > 0 && Number.isFinite(facts.step) ? facts.step : 1
  const cap = Math.min(
    maximum,
    Math.max(minimum, minimum + Math.round((finite(facts.cap, minimum) - minimum) / step) * step),
  )
  return {
    spent: Math.max(0, finite(facts.spent, 0)),
    projected: Math.max(0, finite(facts.projected, 0)),
    minimum,
    maximum,
    step,
    cap,
  }
}
export function createUsageBudgetPreviewStore(
  facts: UsageBudgetFacts,
  thresholds: readonly UsageBudgetChoice[],
  settings: readonly UsageBudgetSetting[],
) {
  return createStore<UsageBudgetPreviewState>((set, get) => ({
    facts: normalize(facts),
    thresholds: unique(thresholds),
    settings: unique(settings),
    changeCap(cap) {
      if (Number.isFinite(cap)) set({ facts: normalize({ ...get().facts, cap }) })
    },
    setThreshold(id, checked) {
      if (get().thresholds.some((item) => item.id === id))
        set({ thresholds: get().thresholds.map((item) => (item.id === id ? { ...item, checked } : item)) })
    },
    setSetting(id, checked) {
      if (get().settings.some((item) => item.id === id))
        set({ settings: get().settings.map((item) => (item.id === id ? { ...item, checked } : item)) })
    },
    replace(facts, thresholds, settings) {
      set({ facts: normalize(facts), thresholds: unique(thresholds), settings: unique(settings) })
    },
  }))
}
export function projectUsageBudgetPreview(
  state: UsageBudgetPreviewState,
  copy: UsageBudgetCopy,
): HbarAppUiBudgetSettingsContent {
  const facts = state.facts
  const progress = facts.cap > 0 ? (facts.spent / facts.cap) * 100 : facts.spent > 0 ? 100 : 0
  return {
    title: copy.title,
    description: copy.description,
    labels: { cap: copy.cap, save: copy.legacySave, saving: copy.legacySaving },
    cap: {
      value: String(facts.cap),
      display: copy.money(facts.cap),
      input: 'range',
      minimum: facts.minimum,
      maximum: facts.maximum,
      step: facts.step,
    },
    onCapChange: (value) => state.changeCap(Number(value)),
    busy: false,
    canSave: false,
    onSave: () => {},
    panel: {
      summary: {
        label: copy.month,
        spent: copy.money(facts.spent),
        capacity: copy.capacity(facts.cap),
        progress,
        progressLabel: copy.progress,
        forecast: copy.forecast(facts.projected, facts.projected > facts.cap),
        overBudget: facts.projected > facts.cap,
      },
      cap: {
        label: copy.cap,
        display: copy.money(facts.cap),
        value: facts.cap,
        minimum: facts.minimum,
        maximum: facts.maximum,
        step: facts.step,
        onChange: state.changeCap,
      },
      notifyLabel: copy.notify,
      emptyThresholds: copy.emptyThresholds,
      emptySwitches: copy.emptySwitches,
      thresholds: state.thresholds.map((item) => ({
        ...item,
        onChange: (checked) => state.setThreshold(item.id, checked),
      })),
      switches: state.settings.map((item) => ({ ...item, onChange: (checked) => state.setSetting(item.id, checked) })),
    },
  }
}
