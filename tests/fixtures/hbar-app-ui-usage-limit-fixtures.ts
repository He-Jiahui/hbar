import {
  createUsageLimitPreviewStore,
  projectUsageLimitPreview,
  type UsageLimitMetric,
  type UsageLimitTier,
  type UsageLimitCopy,
} from '../../apps/hbar-app-ui-preview/src/usage-limit-preview-model'

export const USAGE_LIMIT_TIERS: readonly UsageLimitTier[] = [
  { id: 'tier-1', label: 'Tier 1', multiplier: 1, highest: false },
  { id: 'tier-2', label: 'Tier 2', multiplier: 4, highest: false },
  { id: 'tier-3', label: 'Tier 3', multiplier: 10, highest: true },
]
export const USAGE_LIMIT_METRICS: readonly UsageLimitMetric[] = [
  {
    id: 'rpm',
    label: 'Requests per minute',
    detail: 'Rolling 60 second window',
    progressLabel: 'Requests per minute utilisation',
    current: 412,
    baseLimit: 500,
    unit: 'req',
  },
  {
    id: 'tpm',
    label: 'Tokens per minute',
    detail: 'Input and output combined',
    progressLabel: 'Tokens per minute utilisation',
    current: 148000,
    baseLimit: 400000,
    unit: 'tok',
  },
  {
    id: 'concurrent',
    label: 'Concurrent requests',
    detail: 'In flight right now',
    progressLabel: 'Concurrent requests utilisation',
    current: 18,
    baseLimit: 40,
    unit: 'req',
  },
  {
    id: 'queued',
    label: 'Queued batch jobs',
    detail: 'Waiting for a worker',
    progressLabel: 'Queued batch jobs utilisation',
    current: 3,
    baseLimit: 25,
    unit: 'jobs',
  },
]
const format = new Intl.NumberFormat('en-US')
export const USAGE_LIMIT_COPY: UsageLimitCopy = {
  title: 'Rate limits',
  empty: 'No limits configured',
  tier: 'Usage tier',
  increase: 'Request an increase',
  status: (near) => (near ? `${near} ${near === 1 ? 'limit' : 'limits'} near capacity` : 'All limits within range'),
  format: (value) => format.format(value),
  capacity: (limit, unit) => ` / ${format.format(limit)} ${unit}`,
  hint: (highest) =>
    highest
      ? 'Highest tier. Contact us for a bespoke ceiling.'
      : 'Limits rise automatically once spend clears the next threshold.',
}
export function usageLimitFixture(mode: string | null) {
  const german = new Intl.NumberFormat('de-DE')
  return {
    tiers:
      mode === 'localized'
        ? USAGE_LIMIT_TIERS.map((tier) => ({ ...tier, label: `Stufe ${tier.id.slice(-1)}` }))
        : USAGE_LIMIT_TIERS,
    metrics:
      mode === 'empty'
        ? []
        : mode === 'overflow'
          ? Array.from({ length: 13 }, (_, i) => ({ ...USAGE_LIMIT_METRICS[i % 4]!, id: `limit-${i}` }))
          : mode === 'localized'
            ? USAGE_LIMIT_METRICS.map((metric) => ({
                ...metric,
                label: `Ausführliche Ressourcenbegrenzung ${metric.id}`,
                detail: 'Auslastung im aktuellen Abrechnungszeitfenster',
                progressLabel: `Auslastung ${metric.id}`,
              }))
            : USAGE_LIMIT_METRICS,
    copy:
      mode === 'localized'
        ? ({
            title: 'Nutzungsgrenzen',
            empty: 'Keine Grenzen konfiguriert',
            tier: 'Nutzungsstufe',
            increase: 'Erhöhung anfragen',
            status: (near: number) => (near ? `${near} Grenze nahe der Kapazität` : 'Alle Grenzen im Normalbereich'),
            format: (value: number) => german.format(value),
            capacity: (limit: number, unit: string) => ` / ${german.format(limit)} ${unit}`,
            hint: (highest: boolean) =>
              highest
                ? 'Höchste Stufe. Kontaktieren Sie uns für individuelle Grenzen.'
                : 'Grenzen steigen automatisch nach Erreichen des nächsten Ausgabenschwellenwerts.',
          } satisfies UsageLimitCopy)
        : USAGE_LIMIT_COPY,
  }
}
export const USAGE_LIMIT_FIXTURE = projectUsageLimitPreview(
  createUsageLimitPreviewStore(USAGE_LIMIT_TIERS, USAGE_LIMIT_METRICS).getState(),
  USAGE_LIMIT_COPY,
  () => {},
)
