import type { HbarAppUiUsageOverviewContent } from '../../packages/hbar-app-ui/src'

export interface UsageOverviewDataset {
  readonly id: string
  readonly label: string
  readonly content: HbarAppUiUsageOverviewContent
}

// Values and visual proportions observed in the public preview. Rounded totals
// are not reverse-engineered into fictional exact token counts.
function dataset(
  id: string,
  metrics: readonly string[],
  rows: readonly (readonly [string, string, string, number, number])[],
): UsageOverviewDataset {
  return {
    id,
    label: id,
    content: {
      title: 'Token usage',
      description: 'Input and output tokens billed to this workspace.',
      meters: [],
      metrics: ['Total tokens', 'Input', 'Output', 'Spend'].map((label, index) => ({
        id: `metric-${index}`,
        label,
        value: metrics[index] ?? '',
      })),
      chart: {
        inputLabel: 'Input',
        outputLabel: 'Output',
        hint: 'Hover a bar for detail',
        emptyLabel: 'No token usage in this range',
        points: rows.map(([label, total, cost, height, output]) => ({
          id: `${id}-${label}`,
          label,
          accessibleLabel: `${label}: ${total} tokens`,
          detail: `${label} · ${total} · ${cost}`,
          totalRatio: height / 100,
          outputShare: output / 100,
        })),
      },
    },
  }
}
export const USAGE_OVERVIEW_DATASETS: readonly UsageOverviewDataset[] = [
  dataset(
    '7d',
    ['48M', '35M', '14M', '$311'],
    [
      ['Mon', '5.7M', '$36.30', 49.1379, 28.0702],
      ['Tue', '7.5M', '$48.90', 64.6552, 29.3333],
      ['Wed', '9.4M', '$59.40', 81.0345, 27.6596],
      ['Thu', '8.3M', '$53.70', 71.5517, 28.9157],
      ['Fri', '12M', '$75.60', 100, 29.3103],
      ['Sat', '3.3M', '$20.70', 28.4483, 27.2727],
      ['Sun', '2.6M', '$16.20', 22.4138, 26.9231],
    ],
  ),
  dataset(
    '30d',
    ['161M', '115M', '46M', '$1,033'],
    [
      ['W1', '31M', '$199', 64.4628, 28.2051],
      ['W2', '37M', '$234', 75.4132, 28.4932],
      ['W3', '45M', '$289', 92.1488, 28.9238],
      ['W4', '48M', '$311', 100, 28.5124],
    ],
  ),
  dataset(
    '90d',
    ['359M', '256M', '102M', '$2,305'],
    [
      ['Apr', '99M', '$632', 72.7606, 28.1534],
      ['May', '124M', '$792', 90.6755, 28.4211],
      ['Jun', '136M', '$881', 100, 28.928],
    ],
  ),
]
export const USAGE_OVERVIEW_FIXTURE: HbarAppUiUsageOverviewContent = {
  ...USAGE_OVERVIEW_DATASETS[0]!.content,
  range: {
    label: 'Range',
    value: '7d',
    options: USAGE_OVERVIEW_DATASETS.map(({ id, label }) => ({ id, label })),
    onChange: () => {},
  },
}

export function usageOverviewDatasets(mode: string | null): readonly UsageOverviewDataset[] {
  return USAGE_OVERVIEW_DATASETS.map((entry) => {
    const chart = entry.content.chart!
    const sample = chart.points[0]!
    if (mode === 'empty')
      return { ...entry, content: { ...entry.content, metrics: [], chart: { ...chart, points: [] } } }
    if (mode === 'overflow')
      return {
        ...entry,
        content: {
          ...entry.content,
          chart: {
            ...chart,
            points: Array.from({ length: 32 }, (_, index) => ({
              ...sample,
              id: `day-${index}`,
              label: `${index + 1}`,
              accessibleLabel: `Day ${index + 1}: 5.7M tokens`,
              detail: `Day ${index + 1} · 5.7M · $36.30`,
            })),
          },
        },
      }
    if (mode === 'localized')
      return {
        ...entry,
        label: `${entry.id} Abrechnungszeitraum`,
        content: {
          ...entry.content,
          title: 'Token-Nutzung',
          description: 'Eingabe- und Ausgabetokens für diesen sehr ausführlich beschriebenen Arbeitsbereich.',
          metrics: entry.content.metrics.map((metric, index) => ({
            ...metric,
            label: ['Gesamte Tokenanzahl', 'Eingabetokens', 'Ausgabetokens', 'Gesamtausgaben'][index] ?? metric.label,
          })),
          chart: {
            ...chart,
            inputLabel: 'Eingabe',
            outputLabel: 'Ausgabe',
            hint: 'Für Einzelheiten einen Balken auswählen',
            emptyLabel: 'Keine Nutzung',
            points: chart.points.map((point) => ({
              ...point,
              accessibleLabel: `${point.label}: abgerechnete Tokens`,
              detail: `${point.label} · ausführliche Nutzungsinformationen · Gesamtkosten`,
            })),
          },
        },
      }
    return entry
  })
}
