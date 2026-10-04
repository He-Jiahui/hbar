import type {HbarAppUiVariantProps} from '../types'

export function actionText(spec: HbarAppUiVariantProps['spec'], id: string, fallback: string): string {
    return spec.actions.find((action) => action.id === id)?.label ?? fallback
}

export function profileTone(state: HbarAppUiVariantProps['spec']['profile']['initialState']): 'neutral' | 'positive' | 'warning' | 'danger' {
    if (state === 'success') return 'positive'
    if (state === 'active' || state === 'warning' || state === 'review') return 'warning'
    if (state === 'error') return 'danger'
    return 'neutral'
}

export function scenarioLead(scenario: string, fallback: string): string {
    const lead = scenario.split(/[,.]/, 1)[0]?.trim()
    return lead || fallback
}

export function seededNumber(seed: number, minimum: number, span: number): number {
    return minimum + (Math.abs(seed) % Math.max(1, span))
}

export function hasScenario(spec: HbarAppUiVariantProps['spec'], ...terms: string[]): boolean {
    const scenario = spec.profile.scenario.toLowerCase()
    return terms.some((term) => scenario.includes(term.toLowerCase()))
}
