import {
  createUsageBudgetPreviewStore,
  projectUsageBudgetPreview,
  type UsageBudgetChoice,
  type UsageBudgetCopy,
  type UsageBudgetFacts,
  type UsageBudgetSetting,
} from '../../apps/hbar-app-ui-preview/src/usage-budget-preview-model'

export const USAGE_BUDGET_FACTS: UsageBudgetFacts = {
  spent: 1840,
  projected: 2613,
  cap: 2500,
  minimum: 500,
  maximum: 10000,
  step: 250,
}
export const USAGE_BUDGET_THRESHOLDS: readonly UsageBudgetChoice[] = [
  { id: '50', label: '50% of cap', checked: false },
  { id: '75', label: '75% of cap', checked: true },
  { id: '90', label: '90% of cap', checked: true },
]
export const USAGE_BUDGET_SETTINGS: readonly UsageBudgetSetting[] = [
  {
    id: 'pause',
    label: 'Pause requests at 100%',
    description: 'New calls return a quota error until the next cycle.',
    checked: true,
  },
  { id: 'digest', label: 'Weekly spend digest', description: 'Sent to workspace admins every Monday.', checked: false },
]
const money = (value: number) => `$${value.toLocaleString('en-US')}`
export const USAGE_BUDGET_COPY: UsageBudgetCopy = {
  title: 'Budget and alerts',
  description: 'Cap monthly model spend and decide who hears about it.',
  month: 'This month',
  cap: 'Monthly cap',
  notify: 'Notify at',
  progress: 'Budget consumed',
  emptyThresholds: 'No alert thresholds',
  emptySwitches: 'No delivery settings',
  legacySave: 'Save budget',
  legacySaving: 'Saving budget',
  money,
  capacity: (value) => ` of ${money(value)}`,
  forecast: (projected, over) =>
    `Projected ${money(projected)} at current pace, ${over ? 'over budget on the 26th' : 'within budget'}.`,
}
export function usageBudgetFixture(mode: string | null) {
  const thresholds =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 7 }, (_, i) => ({ ...USAGE_BUDGET_THRESHOLDS[i % 3]!, id: `threshold-${i}` }))
        : USAGE_BUDGET_THRESHOLDS
  const settings =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 9 }, (_, i) => ({ ...USAGE_BUDGET_SETTINGS[i % 2]!, id: `setting-${i}` }))
        : USAGE_BUDGET_SETTINGS
  if (mode !== 'localized') return { facts: USAGE_BUDGET_FACTS, thresholds, settings, copy: USAGE_BUDGET_COPY }
  const money = (value: number) => `${value.toLocaleString('de-DE')} $`
  const copy: UsageBudgetCopy = {
    title: 'Budget und Benachrichtigungen',
    description: 'Begrenzen Sie die monatlichen Modellausgaben und bestimmen Sie die Empfänger.',
    month: 'Diesen Monat',
    cap: 'Monatliche Budgetobergrenze',
    notify: 'Benachrichtigen bei',
    progress: 'Verbrauchtes Budget',
    emptyThresholds: 'Keine Benachrichtigungsschwellen',
    emptySwitches: 'Keine Zustellungseinstellungen',
    legacySave: 'Budget speichern',
    legacySaving: 'Budget wird gespeichert',
    money,
    capacity: (value) => ` von ${money(value)}`,
    forecast: (projected, over) =>
      `Prognose ${money(projected)} bei aktuellem Verbrauch, ${over ? 'Budgetüberschreitung am 26.' : 'innerhalb des Budgets'}.`,
  }
  return {
    facts: USAGE_BUDGET_FACTS,
    thresholds: thresholds.map((row) => ({ ...row, label: `${row.id}% der Budgetobergrenze` })),
    settings: settings.map((row) => ({
      ...row,
      label:
        row.id === 'pause'
          ? 'Anfragen bei vollständigem Verbrauch pausieren'
          : 'Wöchentliche Zusammenfassung der Ausgaben',
      description: 'Ausführliche Beschreibung für die Arbeitsbereichsadministratoren und Administratorinnen.',
    })),
    copy,
  }
}
export const USAGE_BUDGET_FIXTURE = projectUsageBudgetPreview(
  createUsageBudgetPreviewStore(USAGE_BUDGET_FACTS, USAGE_BUDGET_THRESHOLDS, USAGE_BUDGET_SETTINGS).getState(),
  USAGE_BUDGET_COPY,
)
