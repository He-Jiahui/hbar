import { createStore, type StoreApi } from 'zustand/vanilla'

export type WizardPreviewVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7
export interface WizardPreviewScope {
  readonly ownerId: string
  readonly variant: WizardPreviewVariant
  readonly fixtureId: string
}
export interface WizardPreviewField {
  readonly id: string
  readonly value: string
  readonly optionIds?: readonly string[] | undefined
}
export type WizardPreviewFlow =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'information'
      readonly fields: readonly WizardPreviewField[]
      readonly stepIds: readonly string[]
      readonly stepId: string
    }
  | { readonly kind: 'invoice'; readonly fields: readonly WizardPreviewField[] }
  | {
      readonly kind: 'upgrade'
      readonly stepIds: readonly string[]
      readonly stepId: string
      readonly planIds: readonly string[]
      readonly planId: string
    }
  | { readonly kind: 'environment'; readonly serviceIds: readonly string[]; readonly selectedIds: readonly string[] }
  | { readonly kind: 'review'; readonly confirmed: boolean }
  | {
      readonly kind: 'migration'
      readonly progress: number
      readonly step: number
      readonly intervalMs: number
      readonly ceiling: number
    }
  | {
      readonly kind: 'shipping'
      readonly questions: readonly { readonly id: string; readonly optionIds: readonly string[] }[]
      readonly questionId: string
      readonly answers: Readonly<Record<string, string | undefined>>
    }

export interface WizardPreviewSeed {
  readonly scope: WizardPreviewScope
  readonly flow: WizardPreviewFlow
}
export interface WizardPreviewModelState extends WizardPreviewSeed {
  readonly refresh: (seed: WizardPreviewSeed) => void
  readonly field: (scope: WizardPreviewScope, id: string, value: string) => boolean
  readonly step: (scope: WizardPreviewScope, id: string) => boolean
  readonly plan: (scope: WizardPreviewScope, id: string) => boolean
  readonly service: (scope: WizardPreviewScope, id: string) => boolean
  readonly confirm: (scope: WizardPreviewScope, value: boolean) => boolean
  readonly question: (scope: WizardPreviewScope, id: string) => boolean
  readonly answer: (scope: WizardPreviewScope, questionId: string, optionId: string) => boolean
  readonly tick: (scope: WizardPreviewScope) => boolean
}
export type WizardPreviewStoreApi = StoreApi<WizardPreviewModelState>

const kinds = {
  1: 'information',
  2: 'invoice',
  3: 'upgrade',
  4: 'environment',
  5: 'review',
  6: 'migration',
  7: 'shipping',
} satisfies Record<WizardPreviewVariant, WizardPreviewFlow['kind']>

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
function ids(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((id) => id.trim().length > 0))]
}
function selection(values: readonly string[], initial: string): string {
  return values.includes(initial) ? initial : (values[0] ?? '')
}
function percent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}
function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}
function normalizeFields(fields: readonly WizardPreviewField[]): readonly WizardPreviewField[] {
  return unique(fields).map((field) => {
    if (field.optionIds === undefined) return { id: field.id, value: field.value }
    const optionIds = ids(field.optionIds)
    return { id: field.id, value: selection(optionIds, field.value), optionIds }
  })
}
function normalize({ scope, flow }: WizardPreviewSeed): WizardPreviewFlow {
  if (flow.kind !== 'empty' && flow.kind !== kinds[scope.variant]) return { kind: 'empty' }
  switch (flow.kind) {
    case 'empty':
      return flow
    case 'information': {
      const stepIds = ids(flow.stepIds)
      return { ...flow, fields: normalizeFields(flow.fields), stepIds, stepId: selection(stepIds, flow.stepId) }
    }
    case 'invoice':
      return { ...flow, fields: normalizeFields(flow.fields) }
    case 'upgrade': {
      const stepIds = ids(flow.stepIds)
      const planIds = ids(flow.planIds)
      return {
        ...flow,
        stepIds,
        planIds,
        stepId: selection(stepIds, flow.stepId),
        planId: selection(planIds, flow.planId),
      }
    }
    case 'environment': {
      const serviceIds = ids(flow.serviceIds)
      return { ...flow, serviceIds, selectedIds: ids(flow.selectedIds).filter((id) => serviceIds.includes(id)) }
    }
    case 'review':
      return { ...flow }
    case 'migration': {
      const ceiling = percent(flow.ceiling)
      return {
        ...flow,
        ceiling,
        progress: Math.min(ceiling, percent(flow.progress)),
        step: positive(flow.step),
        intervalMs: positive(flow.intervalMs),
      }
    }
    case 'shipping': {
      const questions = unique(flow.questions).map((question) => ({ ...question, optionIds: ids(question.optionIds) }))
      let answers: Readonly<Record<string, string | undefined>> = {}
      for (const question of questions) {
        const answer = flow.answers[question.id]
        if (typeof answer === 'string' && question.optionIds.includes(answer))
          answers = { ...answers, [question.id]: answer }
      }
      return {
        ...flow,
        questions,
        questionId: selection(
          questions.map((question) => question.id),
          flow.questionId,
        ),
        answers,
      }
    }
  }
}

/** A scope object is a generation token: equal strings cannot authorize an old callback. */
export function createWizardPreviewStore(seed: WizardPreviewSeed): WizardPreviewStoreApi {
  return createStore<WizardPreviewModelState>((set, get) => {
    const update = (
      scope: WizardPreviewScope,
      change: (flow: WizardPreviewFlow) => WizardPreviewFlow | undefined,
    ): boolean => {
      const current = get()
      if (current.scope !== scope) return false
      const flow = change(current.flow)
      if (!flow || flow === current.flow) return false
      set({ flow })
      return true
    }
    return {
      scope: seed.scope,
      flow: normalize(seed),
      refresh: (next) => {
        set({ scope: next.scope, flow: normalize(next) })
      },
      field: (scope, id, value) =>
        update(scope, (flow) => {
          if (flow.kind !== 'information' && flow.kind !== 'invoice') return undefined
          const field = flow.fields.find((item) => item.id === id)
          if (!field || field.value === value || (field.optionIds !== undefined && !field.optionIds.includes(value)))
            return undefined
          return { ...flow, fields: flow.fields.map((item) => (item.id === id ? { ...item, value } : item)) }
        }),
      step: (scope, id) =>
        update(scope, (flow) => {
          if (
            (flow.kind !== 'information' && flow.kind !== 'upgrade') ||
            !flow.stepIds.includes(id) ||
            flow.stepId === id
          )
            return undefined
          return { ...flow, stepId: id }
        }),
      plan: (scope, id) =>
        update(scope, (flow) => {
          if (flow.kind !== 'upgrade' || !flow.planIds.includes(id) || flow.planId === id) return undefined
          return { ...flow, planId: id }
        }),
      service: (scope, id) =>
        update(scope, (flow) => {
          if (flow.kind !== 'environment' || !flow.serviceIds.includes(id)) return undefined
          return {
            ...flow,
            selectedIds: flow.selectedIds.includes(id)
              ? flow.selectedIds.filter((item) => item !== id)
              : [...flow.selectedIds, id],
          }
        }),
      confirm: (scope, value) =>
        update(scope, (flow) => {
          if (flow.kind !== 'review' || flow.confirmed === value) return undefined
          return { ...flow, confirmed: value }
        }),
      question: (scope, id) =>
        update(scope, (flow) => {
          if (flow.kind !== 'shipping' || !flow.questions.some((item) => item.id === id) || flow.questionId === id)
            return undefined
          return { ...flow, questionId: id }
        }),
      answer: (scope, questionId, optionId) =>
        update(scope, (flow) => {
          if (flow.kind !== 'shipping' || flow.questionId !== questionId) return undefined
          const question = flow.questions.find((item) => item.id === questionId)
          if (!question?.optionIds.includes(optionId) || flow.answers[questionId] === optionId) return undefined
          return { ...flow, answers: { ...flow.answers, [questionId]: optionId } }
        }),
      tick: (scope) =>
        update(scope, (flow) => {
          if (flow.kind !== 'migration' || flow.step <= 0 || flow.intervalMs <= 0 || flow.progress >= flow.ceiling)
            return undefined
          return { ...flow, progress: Math.min(flow.ceiling, flow.progress + flow.step) }
        }),
    }
  })
}
