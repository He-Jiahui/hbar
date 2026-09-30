import type { HbarAppUiBillingPlansContent } from '../../packages/hbar-app-ui/src/index'

export function createBillingPlansReferenceFixture(locale: 'en' | 'de-long'): HbarAppUiBillingPlansContent {
  const isGerman = locale === 'de-long'
  const planNames = isGerman
    ? { starter: 'Einsteiger', growth: 'Wachstum', scale: 'Skalierung' }
    : { starter: 'Starter', growth: 'Growth', scale: 'Scale' }
  const status = isGerman ? 'Aktiv' : 'Active'
  return {
    referenceLayout: { ownerId: 'billing:plans:cedar-labs' },
    labels: {
      pageTitle: isGerman ? 'Tarife und Berechtigungen' : 'Plans',
      pageDescription: isGerman
        ? 'Drei veröffentlichte Tarife für Cedar Labs; zuletzt vor 14 Minuten von Amelia Whitfield bearbeitet, mit aktiven Berechtigungen und wiederkehrenden Nutzungsabrechnungen.'
        : '3 plans · 3 live · edited 14 min ago by Amelia Whitfield',
      newPlan: isGerman ? 'Einen neuen Tarif erstellen' : 'New plan',
      unsavedTitle: isGerman ? 'Nicht gespeicherte Änderungen' : 'Unsaved changes',
      unsavedDescription: isGerman
        ? 'Vier Änderungen für Skalierung und Enterprise sind noch nicht veröffentlicht.'
        : '4 edits across Scale and Enterprise are not published yet.',
      discard: isGerman ? 'Änderungen verwerfen' : 'Discard',
      save: isGerman ? 'Änderungen speichern' : 'Save changes',
      entitlementsTitle: isGerman ? 'BERECHTIGUNGEN' : 'ENTITLEMENTS',
      addOnsTitle: isGerman ? 'ZUSATZLEISTUNGEN' : 'ADD-ONS',
      addEntitlement: isGerman ? 'Berechtigung hinzufügen' : 'Add entitlement',
      editPlan: (name) => (isGerman ? `${name} bearbeiten` : `Edit ${name}`),
      togglePlan: (name, label) => `${name}: ${label}`,
      emptyPlans: isGerman ? 'Es sind noch keine Tarife eingerichtet.' : 'No plans configured.',
    },
    initialDirty: true,
    plans: [
      {
        id: 'starter',
        name: planNames.starter,
        status,
        statusTone: 'positive',
        meta: 'PLAN-Starter · 1,840 subscribers',
        price: '$29',
        priceSuffix: isGerman ? 'pro Platz / Monat' : 'per seat / mo',
        entitlements: [
          { id: 'seats', label: isGerman ? 'Plätze' : 'Seats', value: '5 included', icon: 'people' },
          { id: 'api', label: 'API calls', value: '50k / month', icon: 'bolt' },
          { id: 'storage', label: isGerman ? 'Speicher' : 'Storage', value: '10 GB', icon: 'storage' },
          { id: 'env', label: isGerman ? 'Umgebungen' : 'Environments', value: '1', icon: 'layers' },
        ],
        addOns: [
          {
            id: 'extra-storage',
            label: isGerman ? 'Zusätzlicher Speicher' : 'Extra storage',
            value: '$9 / mo',
            icon: 'storage',
          },
        ],
        toggles: [
          { id: 'active', label: isGerman ? 'Aktiv' : 'Active', enabled: true },
          { id: 'listed', label: isGerman ? 'Öffentlich gelistet' : 'Listed publicly', enabled: true },
        ],
      },
      {
        id: 'growth',
        name: planNames.growth,
        status,
        statusTone: 'positive',
        meta: 'PLAN-Growth · 1,120 subscribers',
        price: '$89',
        priceSuffix: isGerman ? 'pro Platz / Monat' : 'per seat / mo',
        entitlements: [
          { id: 'seats', label: isGerman ? 'Plätze' : 'Seats', value: '20 included', icon: 'people' },
          { id: 'api', label: 'API calls', value: '500k / month', icon: 'bolt' },
          { id: 'storage', label: isGerman ? 'Speicher' : 'Storage', value: '100 GB', icon: 'storage' },
          { id: 'env', label: isGerman ? 'Umgebungen' : 'Environments', value: '3', icon: 'layers' },
        ],
        addOns: [
          {
            id: 'insights',
            label: isGerman ? 'Nutzungsanalysen' : 'Usage insights',
            value: '$19 / mo',
            icon: 'sparkles',
          },
        ],
        toggles: [
          { id: 'active', label: isGerman ? 'Aktiv' : 'Active', enabled: true },
          { id: 'listed', label: isGerman ? 'Öffentlich gelistet' : 'Listed publicly', enabled: true },
        ],
      },
      {
        id: 'scale',
        name: planNames.scale,
        status,
        statusTone: 'positive',
        meta: 'PLAN-Scale · 214 subscribers',
        price: '$249',
        priceSuffix: isGerman ? 'pro Platz / Monat' : 'per seat / mo',
        entitlements: [
          { id: 'seats', label: isGerman ? 'Plätze' : 'Seats', value: '100 included', icon: 'people' },
          { id: 'api', label: 'API calls', value: '5M / month', icon: 'bolt' },
          { id: 'storage', label: isGerman ? 'Speicher' : 'Storage', value: '1 TB', icon: 'storage' },
          { id: 'env', label: isGerman ? 'Umgebungen' : 'Environments', value: '10', icon: 'layers' },
        ],
        addOns: [
          { id: 'sso', label: 'SSO and SAML', value: '$99 / mo', icon: 'shield' },
          {
            id: 'insights',
            label: isGerman ? 'Nutzungsanalysen' : 'Usage insights',
            value: '$19 / mo',
            icon: 'sparkles',
          },
        ],
        toggles: [
          { id: 'active', label: isGerman ? 'Aktiv' : 'Active', enabled: true },
          { id: 'listed', label: isGerman ? 'Öffentlich gelistet' : 'Listed publicly', enabled: false },
        ],
      },
    ],
    listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
  }
}
