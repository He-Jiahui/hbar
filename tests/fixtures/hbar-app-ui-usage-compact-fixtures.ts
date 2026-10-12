import type { LumenUsageCompactContent, LumenUsageCompactWidgetContent } from '@lumen/app-ui/catalog'

export type UsageCompactAction = 'details' | 'upgrade'
interface UsageCompactCopy {
  readonly title: string
  readonly description: string
  readonly primary: string
  readonly value: string
  readonly allowance: string
  readonly detail: string
  readonly progress: string
  readonly trend: string
  readonly emptyTrend: string
  readonly emptyMeters: string
  readonly details: string
  readonly upgrade: string
  readonly note: string
  readonly meters: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly progress: number
  }[]
}
const ENGLISH: UsageCompactCopy = {
  title: 'Plan usage',
  description: 'Northwind · Team plan',
  primary: 'Assistant messages',
  value: '1,842',
  allowance: '/ 2,000',
  detail: '92% used · Resets 1 Jul',
  progress: 'Assistant messages used',
  trend: 'Assistant message usage trend',
  emptyTrend: 'No usage trend available',
  emptyMeters: 'No additional usage meters',
  details: 'Details',
  upgrade: 'Upgrade',
  note: 'Unlimited messages on Scale.',
  meters: [
    { id: 'runs', label: 'Agent runs', value: '96 / 250', progress: 38 },
    { id: 'documents', label: 'Indexed documents', value: '4,310 / 10,000', progress: 43 },
    { id: 'seats', label: 'Member seats', value: '12 / 20', progress: 60 },
  ],
}
const GERMAN: UsageCompactCopy = {
  title: 'Nutzung des Teamkontingents',
  description: 'Northwind · Gemeinsamer Teamtarif für umfangreiche Projekte',
  primary: 'Nachrichten des Assistenten',
  value: '1.842',
  allowance: '/ 2.000',
  detail: '92 % verwendet · Zurücksetzung am 1. Juli',
  progress: 'Verwendete Assistentennachrichten',
  trend: 'Verlauf der Assistentennachrichten',
  emptyTrend: 'Kein Nutzungsverlauf verfügbar',
  emptyMeters: 'Keine weiteren Verbrauchswerte',
  details: 'Einzelheiten',
  upgrade: 'Erweitern',
  note: 'Unbegrenzte Assistentennachrichten im erweiterten Scale-Tarif.',
  meters: [
    { id: 'runs', label: 'Ausführungen autonomer Agenten', value: '96 / 250', progress: 38 },
    { id: 'documents', label: 'Im Arbeitsbereich indizierte Dokumente', value: '4.310 / 10.000', progress: 43 },
    { id: 'seats', label: 'Mitgliederplätze im gemeinsamen Team', value: '12 / 20', progress: 60 },
  ],
}
// Normalized heights observed on the public rendered preview, not protected source data.
const TREND = [
  0.243243, 0.324324, 0.283784, 0.445946, 0.391892, 0.554054, 0.513514, 0.702703, 0.635135, 0.824324, 0.783784, 1,
]

export function usageCompactFixture(
  mode: string | null,
  onAction: (action: UsageCompactAction, targetId: string) => void,
  targetId = 'northwind-team',
): LumenUsageCompactContent {
  const copy = mode === 'localized' ? GERMAN : ENGLISH
  const meters: LumenUsageCompactWidgetContent['meters'] =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 7 }, (_, index) => ({ ...copy.meters[index % 3]!, id: `meter-${index}` }))
        : copy.meters
  const sparkline = (
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 32 }, (_, index) => TREND[index % TREND.length]!)
        : TREND
  ).map((value, index) => ({ id: `sample-${index}`, value }))
  return {
    title: copy.title,
    description: copy.description,
    value: copy.value,
    detail: copy.detail,
    progress: 92,
    progressLabel: copy.progress,
    tone: 'accent',
    sparkline,
    sparklineLabel: copy.trend,
    metrics: meters.map(({ id, label, value }) => ({ id, label, value })),
    action: { label: copy.upgrade, disabled: mode === 'disabled', onInvoke: () => onAction('upgrade', targetId) },
    widget: {
      primaryLabel: copy.primary,
      allowance: copy.allowance,
      details: { label: copy.details, disabled: mode === 'disabled', onInvoke: () => onAction('details', targetId) },
      meters,
      emptyLabel: copy.emptyMeters,
      emptySparklineLabel: copy.emptyTrend,
      note: copy.note,
    },
  }
}
