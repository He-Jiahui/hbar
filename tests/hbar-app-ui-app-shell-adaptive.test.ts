import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell08, selectAdaptiveJobs, type LumenAppShellAdaptiveContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { adaptiveJobs, appShellAdaptiveFixture } from './fixtures/hbar-app-ui-app-shell-adaptive-fixtures'
import {
  createAppShellAdaptivePreviewStore,
  projectAppShellAdaptivePreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-adaptive-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const setup = (mode: string | null = null, report: (action: string, value?: string) => void = () => {}) => {
  const store = createAppShellAdaptivePreviewStore(),
    fixture = appShellAdaptiveFixture(mode, report)
  return { store, fixture, view: () => projectAppShellAdaptivePreview(store.getState(), fixture) }
}
const render = (adaptive: LumenAppShellAdaptiveContent) =>
  renderToStaticMarkup(
    createElement(LumenAppShell08, {
      content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, adaptive },
    }),
  )

test('responsive shell has real queues, work orders and mobile navigation, without artificial viewport tabs', () => {
  const html = render(setup().view())
  expect(html).toContain('aria-label="Queues"')
  expect(html).toContain('aria-label="Open queues"')
  expect(html).toContain('aria-label="Sort jobs"')
  expect(html).toContain('aria-label="Flag WO-4821 for follow-up"')
  expect(html).toContain('aria-label="Clear follow-up on WO-4825"')
  expect(html).toContain('<dl class="lumen-adaptive-job-detail">')
  expect(html).not.toContain('role="tablist"')
  expect(selectAdaptiveJobs(setup().view())).toHaveLength(12)
})
test('queues filter by stable membership; customer sorting and search target distinct fields', () => {
  const { view } = setup()
  view().onQueue('unassigned')
  expect(selectAdaptiveJobs(view()).map((job) => job.id)).toEqual(['WO-4825', 'WO-4829', 'WO-4832', 'WO-4835'])
  view().onSort('customer')
  expect(selectAdaptiveJobs(view()).map((job) => job.id)).toEqual(['WO-4835', 'WO-4825', 'WO-4832', 'WO-4829'])
  view().onQuery('4832')
  expect(selectAdaptiveJobs(view()).map((job) => job.id)).toEqual(['WO-4832'])
  view().onQuery('NO MATCH')
  expect(selectAdaptiveJobs(view())).toEqual([])
  expect(render(view())).toContain('No jobs match that search')
  expect(render(view())).toContain('lucide-search')
  view().onQuery('')
  view().onQueue('week')
  expect(selectAdaptiveJobs(view())).toHaveLength(18)
  view().onQueue('completed')
  expect(selectAdaptiveJobs(view())).toHaveLength(8)
  view().onQueue('cancelled')
  expect(selectAdaptiveJobs(view())).toEqual([])
  expect(render(view())).toContain('No cancelled jobs')
  expect(render(view())).toContain('lucide-ban')
  expect(render(view())).toContain('Cancelled jobs stay here for 90 days')
  expect(render(view())).not.toContain('Clear search')
})
test('flag on/off is ID-bound and persists across queue transitions without changing other records', () => {
  const events: string[] = [],
    { view } = setup(null, (action, value) => events.push(`${action}:${value ?? ''}`))
  expect(view().jobs.find((job) => job.id === 'WO-4825')?.flagged).toBe(true)
  view().onFlag('WO-4825')
  expect(view().jobs.find((job) => job.id === 'WO-4825')?.flagged).toBe(false)
  view().onFlag('WO-4821')
  view().onQueue('completed')
  expect(view().jobs.find((job) => job.id === 'WO-4821')?.flagged).toBe(true)
  expect(view().jobs.find((job) => job.id === 'WO-4822')?.flagged).toBe(false)
  view().onFlag('not-in-inventory')
  view().onQueue('not-a-queue')
  expect(events).toEqual(['flag:WO-4825', 'flag:WO-4821', 'queue:completed'])
})
test('host localization, long content, empty/one/100/101 records and duplicate IDs remain bounded in flow', () => {
  const translated = setup('localized').view()
  expect(render(translated)).toContain('Aufträge suchen')
  expect(render(translated)).not.toContain('Search jobs')
  expect(
    render({
      ...translated,
      jobs: [{ ...translated.jobs.find((job) => job.id === 'WO-4821')!, customer: 'Kundenorganisation '.repeat(20) }],
    }),
  ).toContain('Kundenorganisation')
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    ['boundary', 100],
    ['overflow', 101],
  ] as const) {
    const value = setup(mode).view()
    expect(selectAdaptiveJobs(value)).toHaveLength(count)
    expect(render(value).match(/class="lumen-adaptive-job-title"/g) ?? []).toHaveLength(count * 2)
  }
  const value = setup().view(),
    first = adaptiveJobs.find((job) => job.id === 'WO-4821')!
  expect(selectAdaptiveJobs({ ...value, jobs: [...value.jobs, { ...first, customer: 'Updated' }] })[0]?.customer).toBe(
    'Updated',
  )
  expect(selectAdaptiveJobs({ ...value, selectedQueueId: 'stale' })).toEqual([])
})
test('interaction sampling explicitly distinguishes replayed mechanisms from inferred repetitions', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-8')
  expect(plan?.samples.length).toBeGreaterThanOrEqual(6)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
