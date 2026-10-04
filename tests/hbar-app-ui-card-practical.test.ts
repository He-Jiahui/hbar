import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenCard, type LumenCardContent } from '@lumen/app-ui'
import {
  createCardPreviewReferenceContent,
  cardRequestNotice,
} from '../apps/hbar-app-ui-preview/src/cardPreviewReferenceFixtures'
import { createCardPreviewStore } from '../apps/hbar-app-ui-preview/src/cardPreviewModel'
import { createCardPreviewSeed, projectCardPreview } from '../apps/hbar-app-ui-preview/src/cardPreviewProjection'

function owner(
  variant: number,
  mode = 'default',
  content = createCardPreviewReferenceContent(variant, mode),
  ownerId = 'card-a',
) {
  const store = createCardPreviewStore(createCardPreviewSeed(content, variant, ownerId, mode))
  const events: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const projection = () =>
    projectCardPreview(content, store, cardRequestNotice(mode === 'localized'), (event) => events.push(event))
  const html = () =>
    renderToStaticMarkup(
      createElement(LumenCard, { variant, variantId: `hbar-app-ui-card-${variant}`, content: projection() }),
    )
  return { content, store, projection, html, events }
}

test('all eleven card compositions preserve distinct reference data and semantic collections', () => {
  const values = Array.from({ length: 11 }, (_, index) => owner(index + 1))
  expect(values.map((value) => value.content.reference?.kind ?? 'invoice')).toEqual([
    'members',
    'integrations',
    'onboarding',
    'agenda',
    'plans',
    'accounts',
    'updates',
    'files',
    'profile',
    'balance',
    'invoice',
  ])
  expect(new Set(values.map((value) => value.html())).size).toBe(11)
  expect(values[0]?.html()).toContain('Sam Rivera')
  expect(values[0]?.html()).not.toContain('Workspace operator')
  expect(values[0]?.html().match(/lumen-card-reference-item/g)).toHaveLength(6)
  expect(values[1]?.html()).toContain('Data warehouse')
  expect(values[2]?.html()).toContain('1 of 4 steps complete')
  expect(values[3]?.html().match(/lumen-card-agenda-main/g)).toHaveLength(6)
  expect(values[4]?.html()).toContain('Data residency')
  expect(values[4]?.html()).not.toContain('Monthly')
  expect(values[5]?.html()).toContain('role="radiogroup"')
  expect(values[6]?.html().match(/href="#"/g)).toHaveLength(6)
  expect(values[7]?.html()).toContain('1 selected of 8 files')
  expect(values[8]?.html()).toContain('Verified account')
  expect(values[8]?.html()).toContain('class="lumen-card-message" href="#"')
  expect(values[9]?.html()).toContain('Amazon Web Services')
  expect(values[10]?.html()).toContain('Total due')
})

test('member/integration/bookmark state changes independently with refresh rejecting removed callbacks', () => {
  const member = owner(1)
  const value = member.projection().reference
  if (value?.kind !== 'members') throw new Error('Expected members')
  value.onToggle?.('sam', true)
  expect(member.store.getState().flagsById.sam).toBe(true)
  expect(member.store.getState().flagsById.imani).toBe(true)
  expect(member.store.getState().flagsById.dana).toBe(false)
  expect(member.html()).toContain('aria-label="Connected with Sam Rivera"')
  const next = {
    reference: { ...value, items: value.items.filter((item) => item.id !== 'sam') },
  } satisfies LumenCardContent
  member.store.getState().refresh('card-a', createCardPreviewSeed(next, 1, 'card-a', 'default'))
  value.onToggle?.('sam', false)
  expect(member.store.getState().flagsById.sam).toBeUndefined()
  const integration = owner(2)
  const services = integration.projection().reference
  if (services?.kind !== 'integrations') throw new Error('Expected integrations')
  services.onToggle?.('warehouse', true)
  expect(integration.store.getState().flagsById.warehouse).toBe(true)
  expect(integration.store.getState().flagsById.chat).toBe(true)
  const update = owner(7)
  const changes = update.projection().reference
  if (changes?.kind !== 'updates') throw new Error('Expected updates')
  changes.onToggle?.('exports', true)
  expect(update.html()).toContain('Remove bookmark from Scheduled exports')
  expect(update.store.getState().flagsById.search).toBe(true)
})

test('onboarding completion is independent, reversible and reset clears actual steps', () => {
  const value = owner(3)
  const steps = value.projection().reference
  if (steps?.kind !== 'onboarding') throw new Error('Expected steps')
  steps.onToggle?.('ship', true)
  expect(value.html()).toContain('2 of 4 steps complete')
  expect(value.store.getState().completedByStep.team).toBe(false)
  expect(value.store.getState().completedByStep.rules).toBe(false)
  steps.onToggle?.('source', false)
  expect(value.html()).toContain('1 of 4 steps complete')
  steps.onReset?.()
  expect(value.html()).toContain('0 of 4 steps complete')
  expect(Object.values(value.store.getState().completedByStep).every((complete) => !complete)).toBe(true)
})

test('agenda responses update only the selected event and do not conflate unselected with decline', () => {
  const value = owner(4)
  const agenda = value.projection().reference
  if (agenda?.kind !== 'agenda') throw new Error('Expected agenda')
  expect(value.store.getState().flagsById['decline:standup']).toBe(false)
  agenda.onRespond?.('roadmap', 'going', false)
  expect(value.store.getState().flagsById['going:roadmap']).toBe(false)
  expect(value.store.getState().flagsById['decline:roadmap']).toBe(false)
  agenda.onRespond?.('standup', 'decline', true)
  expect(value.store.getState().flagsById['decline:standup']).toBe(true)
  expect(value.store.getState().flagsById['going:critique']).toBe(false)
})

test('7d accounts replace actual dataset and unknown 90d is not fabricated', () => {
  const value = owner(6)
  const accounts = value.projection().reference
  if (accounts?.kind !== 'accounts') throw new Error('Expected accounts')
  accounts.onRange?.('7d')
  expect(value.html()).toContain('18,420')
  expect(value.html()).toContain('9,760')
  expect(value.html()).not.toContain('74,910')
  expect(value.html()).toContain('3.1%')
  accounts.onRange?.('90d')
  expect(value.html()).toContain('No data for this date range.')
  expect(value.html()).not.toContain('74,910')
})

test('files support multi-selection, exact request targets, clear and stale download rejection', () => {
  const value = owner(8)
  const initial = value.projection().reference
  if (initial?.kind !== 'files') throw new Error('Expected files')
  initial.onToggle?.('table', true)
  expect(value.html()).toContain('2 selected of 8 files')
  initial.onDownload?.()
  expect(value.store.getState().lastRequest).toBeUndefined()
  const current = value.projection().reference
  if (current?.kind !== 'files') throw new Error('Expected files')
  current.onDownload?.()
  current.onDownload?.()
  expect(value.events.filter((event) => event.actionId === 'download')).toEqual([
    { actionId: 'download', value: '["narrative","table"]' },
  ])
  expect(value.html()).toContain('no external action was performed')
  current.onClear?.()
  expect(value.html()).toContain('8 files')
  current.onDownload?.()
  expect(value.store.getState().lastRequest).toBeUndefined()
})

test('profile toggle is owner-local and external plan/balance/invoice actions never mutate records', () => {
  const value = owner(9)
  const other = owner(9, 'default', value.content, 'card-b')
  const profile = value.projection().reference
  if (profile?.kind !== 'profile') throw new Error('Expected profile')
  profile.onFollow?.(true)
  expect(value.html()).toContain('aria-label="Following Sam Rivera"')
  expect(other.html()).toContain('aria-label="Follow Sam Rivera"')
  for (const [variant, actionId, target] of [
    [5, 'choose-plan', 'starter'],
    [10, 'deposit', 'operating'],
    [11, 'download', 'INV-2024-0318'],
  ] as const) {
    const action = owner(variant)
    const before = action.content
    action.projection().onAction?.({ actionId, value: target })
    expect(action.store.getState().lastRequest).toMatchObject({ actionId, targetId: target })
    expect(action.content).toBe(before)
  }
})

test('typed empty/one/boundary/overflow and non-default long copy are supported', () => {
  const fixture = createCardPreviewReferenceContent(8, 'default').reference
  if (fixture?.kind !== 'files') throw new Error('Expected files')
  expect(owner(8, 'default', { reference: { ...fixture, items: [] } }).html()).toContain('No records')
  expect(owner(8, 'default', { reference: { ...fixture, items: fixture.items.slice(0, 1) } }).html()).toContain(
    '1 selected of 1 files',
  )
  const overflow = owner(8, 'overflow')
  expect(overflow.html()).toContain('Workspace export 60.pdf')
  expect(overflow.html()).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  const localized = owner(3, 'localized')
  expect(localized.html()).toContain('Als abgeschlossen markieren')
  expect(localized.html()).not.toContain('Mark complete')
})
