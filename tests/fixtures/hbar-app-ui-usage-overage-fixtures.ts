import type { LumenUsageOveragePlan } from '@lumen/app-ui'
import type { UsageOverageCopy } from '../../apps/hbar-app-ui-preview/src/usage-overage-preview-model'

export const USAGE_OVERAGE_PLANS: readonly LumenUsageOveragePlan[] = [
  {
    id: 'scale',
    label: 'Scale',
    price: '$400/mo · $1.80 per M over',
    benefits: [
      { id: 'tokens', label: '250M tokens included' },
      { id: 'limits', label: 'Tier 2 rate limits' },
      { id: 'routing', label: 'Priority routing on Atlas Pro' },
    ],
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    price: '$1400/mo · $1.20 per M over',
    benefits: [
      { id: 'tokens', label: '1B tokens included' },
      { id: 'limits', label: 'Tier 3 rate limits' },
      { id: 'routing', label: 'Dedicated capacity and a support channel' },
    ],
  },
]
export const USAGE_OVERAGE_COPY: UsageOverageCopy = {
  title: 'You are over your included tokens',
  description: 'Requests keep working. Anything past the allowance bills at $2.40 per million.',
  summary: {
    label: 'Tokens used',
    used: '128M',
    allowance: ' of 100M included',
    includedPercent: 77.8816,
    includedLabel: 'Included',
    overageLabel: 'Overage 28M · $68 so far',
  },
  plansLabel: 'Move to a larger allowance',
  groupLabel: 'Plan',
  emptyLabel: 'No available plans',
  note: 'Changes apply immediately and prorate against this cycle.',
  stay: 'Stay on overage',
  upgrade: 'Upgrade',
}
const GERMAN_OVERAGE_COPY: UsageOverageCopy = {
  title: 'Das enthaltene Tokenkontingent wurde überschritten',
  description: 'Anfragen funktionieren weiterhin. Zusätzliche Tokens werden nutzungsabhängig abgerechnet.',
  summary: {
    label: 'Verwendete Tokens',
    used: '128 Mio.',
    allowance: ' von 100 Mio. enthalten',
    includedPercent: 77.8816,
    includedLabel: 'Enthalten',
    overageLabel: 'Mehrverbrauch 28 Mio. · bisher 68 $',
  },
  plansLabel: 'Ein größeres monatliches Kontingent auswählen',
  groupLabel: 'Tarif',
  emptyLabel: 'Keine Tarife verfügbar',
  note: 'Änderungen gelten sofort und werden für den laufenden Abrechnungszeitraum anteilig verrechnet.',
  stay: 'Mehrverbrauch beibehalten',
  upgrade: 'Tarif erweitern',
}
export function usageOverageFixture(mode: string | null) {
  const plans =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 7 }, (_, i) => ({
            ...USAGE_OVERAGE_PLANS[i % 2]!,
            id: `plan-${i}`,
            benefits: Array.from({ length: 7 }, (_, j) => ({
              id: `benefit-${j}`,
              label: `Additional allowance benefit ${j + 1}`,
            })),
          }))
        : mode === 'localized'
          ? USAGE_OVERAGE_PLANS.map((plan, i) => ({
              ...plan,
              label: i ? 'Unternehmen' : 'Skalierung',
              price: i
                ? '1400 $/Monat · 1,20 $ pro zusätzlicher Million'
                : '400 $/Monat · 1,80 $ pro zusätzlicher Million',
              benefits: [
                { id: 'tokens', label: 'Erweitertes monatliches Tokenkontingent' },
                { id: 'limits', label: 'Höhere Anfrageraten für das gesamte Team' },
                { id: 'routing', label: 'Dedizierte Kapazität und ein persönlicher Unterstützungskanal' },
              ],
            }))
          : USAGE_OVERAGE_PLANS
  return { plans, copy: mode === 'localized' ? GERMAN_OVERAGE_COPY : USAGE_OVERAGE_COPY }
}
