import type { HbarAppUiModelSpendContent } from '../../packages/hbar-app-ui/src'
import type {
  UsageModelPaginationCopy,
  UsageModelPreviewRecord,
} from '../../apps/hbar-app-ui-preview/src/usage-model-preview-model'

// Compact counts and normalized widths were observed in the public preview;
// they intentionally do not pretend to be unrounded underlying usage counts.
function record(
  id: string,
  model: string,
  provider: string,
  requests: string,
  input: string,
  output: string,
  cost: string,
  change: string,
  direction: 'up' | 'down',
  costShare: number,
  requestShare: number,
  tokenShare: number,
): UsageModelPreviewRecord {
  return {
    row: {
      id,
      model,
      provider,
      requests,
      input,
      output,
      cost,
      change,
      direction,
      compactSummary: `${requests} req · ${input} in · ${output} out`,
    },
    shares: { cost: costShare, requests: requestShare, tokens: tokenShare },
  }
}
export const USAGE_MODEL_RECORDS: readonly UsageModelPreviewRecord[] = [
  record(
    'atlas-pro',
    'Atlas Pro',
    'Meridian Labs',
    '48k',
    '215M',
    '61M',
    '$1,565.40',
    '12.4%',
    'up',
    100,
    11.9881,
    51.9661,
  ),
  record(
    'atlas',
    'Atlas',
    'Meridian Labs',
    '127k',
    '388M',
    '95M',
    '$812.06',
    '4.1%',
    'down',
    51.8756,
    31.5653,
    90.8561,
  ),
  record(
    'atlas-long',
    'Atlas Long',
    'Meridian Labs',
    '6.5k',
    '513M',
    '19M',
    '$704.28',
    '31.7%',
    'up',
    44.9904,
    1.61134,
    100,
  ),
  record('quill', 'Quill', 'Northwind AI', '71k', '142M', '40M', '$356.72', '2.8%', 'up', 22.7878, 17.7446, 34.318),
  record('ember', 'Ember', 'Orbital', '214k', '96M', '22M', '$118.94', '18.3%', 'down', 7.59806, 53.1593, 22.2954),
  record('ember-mini', 'Ember Mini', 'Orbital', '402k', '62M', '15M', '$42.60', '46.2%', 'up', 2.72135, 100, 14.3932),
]
export const USAGE_MODEL_FIXTURE: HbarAppUiModelSpendContent = {
  title: 'Spend by model',
  description: '$3,600.00 across 6 models this billing period.',
  emptyLabel: 'No model usage',
  strategy: 'content-grown',
  columns: { model: 'Model', share: 'Share', spend: 'Cost', change: 'Change' },
  rows: [],
  table: {
    emptyLabel: 'No model usage in this billing period',
    columns: { model: 'Model', requests: 'Requests', input: 'Input', output: 'Output', share: 'Share', cost: 'Cost' },
    sortBy: {
      label: 'Sort by',
      value: 'cost',
      options: [
        { id: 'cost', label: 'Cost' },
        { id: 'requests', label: 'Requests' },
        { id: 'tokens', label: 'Tokens' },
      ],
      onChange: () => {},
    },
    rows: USAGE_MODEL_RECORDS.map((record) => ({
      ...record.row,
      share: record.shares.cost,
      shareEmphasis: record.shares.cost >= 50,
    })),
  },
}
export function modelSpendFixture(mode: string | null): {
  readonly content: HbarAppUiModelSpendContent
  readonly records: readonly UsageModelPreviewRecord[]
  readonly pagination: UsageModelPaginationCopy
} {
  const pagination: UsageModelPaginationCopy = {
    previous: 'Previous page',
    next: 'Next page',
    page: (current, total) => `Page ${current} of ${total}`,
  }
  if (mode === 'empty')
    return {
      content: { ...USAGE_MODEL_FIXTURE, description: 'No models used this billing period.' },
      records: [],
      pagination,
    }
  if (mode === 'overflow')
    return {
      content: { ...USAGE_MODEL_FIXTURE, description: 'Usage across 200 models this billing period.' },
      records: Array.from({ length: 200 }, (_, index) => {
        const sample = USAGE_MODEL_RECORDS[index % USAGE_MODEL_RECORDS.length]!
        return { ...sample, row: { ...sample.row, id: `model-${index}`, model: `${sample.row.model} ${index + 1}` } }
      }),
      pagination,
    }
  if (mode === 'localized')
    return {
      content: {
        ...USAGE_MODEL_FIXTURE,
        title: 'Modellkosten',
        description: 'Kostenübersicht aller verwendeten Modelle im aktuellen Abrechnungszeitraum.',
        table: {
          ...USAGE_MODEL_FIXTURE.table!,
          emptyLabel: 'Keine Modellnutzung',
          columns: {
            model: 'Modell',
            requests: 'Anfragen',
            input: 'Eingabe',
            output: 'Ausgabe',
            share: 'Anteil',
            cost: 'Kosten',
          },
          sortBy: {
            label: 'Sortierung',
            value: 'cost',
            options: [
              { id: 'cost', label: 'Gesamtkosten' },
              { id: 'requests', label: 'Anfragen' },
              { id: 'tokens', label: 'Tokenanzahl' },
            ],
            onChange: () => {},
          },
        },
      },
      records: USAGE_MODEL_RECORDS.map((record) => ({
        ...record,
        row: {
          ...record.row,
          provider: 'Ein ausführlicher Anbietername für diesen Arbeitsbereich',
          compactSummary: `${record.row.requests} Anfragen · ${record.row.input} Eingabetokens · ${record.row.output} Ausgabetokens`,
        },
      })),
      pagination: {
        previous: 'Vorherige Seite',
        next: 'Nächste Seite',
        page: (current, total) => `Seite ${current} von ${total}`,
      },
    }
  return { content: USAGE_MODEL_FIXTURE, records: USAGE_MODEL_RECORDS, pagination }
}
