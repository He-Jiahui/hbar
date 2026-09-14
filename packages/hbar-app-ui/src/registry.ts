import {createHbarAppUiVariantSpec, HBAR_APP_UI_VARIANT_SPECS} from './specs'
import {HBAR_APP_UI_VARIANT_COMPONENTS_BY_ID} from './variants'
import type {HbarAppUiCategory, HbarAppUiRegistryEntry, HbarAppUiVariantComponent} from './types'

function componentForSpec(specId: string): HbarAppUiVariantComponent {
    const component = HBAR_APP_UI_VARIANT_COMPONENTS_BY_ID[specId]
    if (!component) throw new Error(`Missing hbar-app-ui component ${specId}`)
    return component
}

const entries = new Map(
    HBAR_APP_UI_VARIANT_SPECS.map((spec) => [
        spec.id,
        {spec, component: componentForSpec(spec.id)} satisfies HbarAppUiRegistryEntry,
    ]),
)

export function getHbarAppUiVariant(category: HbarAppUiCategory, variant: number): HbarAppUiRegistryEntry {
    const spec = createHbarAppUiVariantSpec(category, variant)
    const entry = entries.get(spec.id)
    if (!entry) throw new Error(`Missing hbar-app-ui variant ${spec.id}`)
    return entry
}

export function listHbarAppUiVariants(): readonly HbarAppUiRegistryEntry[] {
    return [...entries.values()]
}

export function getHbarAppUiVariantComponent(category: HbarAppUiCategory, variant: number): HbarAppUiVariantComponent {
    return getHbarAppUiVariant(category, variant).component
}
