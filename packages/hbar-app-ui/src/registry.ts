import HbarAppUiVariant from './Variant'
import { HBAR_APP_UI_VARIANT_SPECS, createHbarAppUiVariantSpec } from './specs'
import type { HbarAppUiCategory, HbarAppUiRegistryEntry, HbarAppUiVariantComponent } from './types'

const entries = new Map(HBAR_APP_UI_VARIANT_SPECS.map((spec) => [spec.id, { spec, component: HbarAppUiVariant as HbarAppUiVariantComponent } satisfies HbarAppUiRegistryEntry]))

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
