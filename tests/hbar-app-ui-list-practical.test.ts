import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenList, type LumenListReferenceContent as Content } from '@lumen/app-ui'
import { createListPreviewStore } from '../apps/hbar-app-ui-preview/src/listPreviewModel'
import { createListPreviewSeed, projectListPreview } from '../apps/hbar-app-ui-preview/src/listPreviewProjection'
import { createListPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/listPreviewReferenceFixtures'

function renderReference(variant: number, content: Content): string {
  return renderToStaticMarkup(
    createElement(LumenList, {
      variant,
      variantId: `list-practical-${variant}`,
      content: { reference: content },
    }),
  )
}

function setup(variant: number, mode = 'default', ownerId = `list-practical-${variant}-${mode}`) {
  const content = createListPreviewReferenceContent(variant, mode)
  const store = createListPreviewStore(createListPreviewSeed(content, variant, ownerId, mode))
  const requests: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const project = () => {
    const projected = projectListPreview(content, store, (event) => requests.push(event))
    if (!projected.reference) throw new Error(`list variant ${variant} did not project reference content`)
    return projected.reference
  }
  return { content, store, requests, project, render: () => renderReference(variant, project()) }
}

function ofKind<K extends Content['kind']>(content: Content, kind: K): Extract<Content, { kind: K }> {
  if (content.kind !== kind) throw new Error(`expected ${kind} reference, received ${content.kind}`)
  return content as Extract<Content, { kind: K }>
}

function rowsOf(content: Content): readonly { readonly id: string }[] {
  return 'rows' in content ? content.rows : content.nodes
}

test('all twelve list references keep distinct kinds, capacities, and SSR structure', () => {
  const owners = Array.from({ length: 12 }, (_, index) => setup(index + 1))
  const kinds = owners.map(({ project }) => project().kind)
  expect(kinds).toEqual([
    'metrics',
    'spend',
    'security',
    'queue',
    'assets',
    'deliveries',
    'suppliers',
    'inbox',
    'contacts',
    'runbook',
    'leaderboard',
    'tree',
  ])
  expect(owners.map(({ project }) => rowsOf(project()).length)).toEqual([4, 6, 12, 8, 11, 8, 14, 8, 31, 8, 9, 22])
  const rendered = owners.map(({ render }) => render())
  rendered.forEach((html, index) => {
    expect(html).toContain('data-lumen-component="list"')
    expect(html).toContain(`data-lumen-variant="${index + 1}"`)
    expect(html).toContain(`data-reference-kind="${kinds[index]}"`)
  })
  expect(rowsOf(owners[11]!.project())).toHaveLength(22)
})

test('metrics disclosure is owned by flags and unknown periods recover to the captured default', () => {
  const owner = setup(1)
  const initial = owner.project()
  if (initial.kind !== 'metrics') throw new Error('expected metrics reference')

  initial.onFlag('expanded-orders', true)
  const expanded = owner.project()
  if (expanded.kind !== 'metrics') throw new Error('expected metrics reference after disclosure')
  expect(expanded.expandedIds).toEqual(['orders'])
  expect(owner.render()).toContain('Picked, packed and handed to a carrier')

  expanded.onSelect('range', '7d')
  const sevenDays = ofKind(owner.project(), 'metrics')
  expect(sevenDays.available).toBe(true)
  expect(sevenDays.rows.map(({ value }) => value)).toEqual(['1,284', '$92.4k', '$71.96', '4.1%'])
  sevenDays.onSelect('range', 'quarter')
  const unavailable = owner.project()
  expect(unavailable.available).toBe(false)
  expect(owner.render()).toContain(unavailable.labels.unavailable)

  unavailable.onSelect('range', owner.content.selectedId)
  const recovered = owner.project()
  expect(recovered.selectedId).toBe(owner.content.selectedId)
  expect(recovered.available).not.toBe(false)
  expect(ofKind(recovered, 'metrics').expandedIds).toEqual(['orders'])
})

test('supplier query intersects the selected category and handles empty, boundary, overflow, and localized fixtures', () => {
  const owner = setup(7)
  const initial = owner.project()
  if (initial.kind !== 'suppliers') throw new Error('expected suppliers reference')

  initial.onSelect('range', 'Cloud')
  initial.onQuery('Meridian')
  const filtered = owner.project()
  if (filtered.kind !== 'suppliers') throw new Error('expected suppliers reference after filtering')
  expect(filtered.rows.map(({ id }) => id)).toEqual(['meridian'])
  expect(filtered.query).toBe('Meridian')
  expect(owner.render()).toContain('Meridian Cloud Systems')

  filtered.onQuery('')
  const category = owner.project()
  if (category.kind !== 'suppliers') throw new Error('expected suppliers reference after clearing query')
  expect(category.rows.every(({ categoryId }) => categoryId === 'Cloud')).toBe(true)
  expect(category.rows).toHaveLength(3)

  expect(rowsOf(setup(7, 'empty').project())).toHaveLength(0)
  expect(rowsOf(setup(7, 'one').project())).toHaveLength(1)
  expect(setup(7, 'boundary').project().listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 80 })
  expect(rowsOf(setup(7, 'boundary').project())).toHaveLength(80)
  expect(rowsOf(setup(7, 'overflow').project())).toHaveLength(81)
  expect(setup(7, 'localized').render()).toContain('供应商与账户联系人在较长工作区名称下的完整列表')
})

test('delivery endpoint and failure filters intersect, while stale and hidden replay targets are rejected', () => {
  const owner = setup(6)
  const initial = owner.project()
  if (initial.kind !== 'deliveries') throw new Error('expected deliveries reference')

  initial.onSelect('range', 'failed')
  initial.onSelect('endpoint', 'hooks.meridian.app')
  const filtered = owner.project()
  if (filtered.kind !== 'deliveries') throw new Error('expected deliveries reference after filters')
  expect(filtered.rows.map(({ id }) => id)).toEqual(['payout', 'checkout'])

  const target = filtered.rows[0]
  if (!target) throw new Error('expected a failed delivery')
  filtered.onFlag(`expanded-${target.id}`, true)
  const expanded = owner.project()
  if (expanded.kind !== 'deliveries') throw new Error('expected deliveries reference after expansion')
  expect(expanded.expandedIds).toEqual([target.id])

  const replay = { id: 'replay', value: target.id, label: expanded.replayLabel }
  expanded.onRequest(replay)
  expect(owner.store.getState().lastRequest).toEqual({
    ownerId: owner.store.getState().ownerId,
    variant: 6,
    fixtureId: 'default',
    actionId: 'replay',
    value: target.id,
  })

  const stale = expanded
  expanded.onSelect('endpoint', 'hooks.northwind.io')
  expect(owner.store.getState().lastRequest).toBeUndefined()
  stale.onRequest(replay)
  stale.onRequest({ id: 'replay', value: 'missing', label: expanded.replayLabel })
  expect(owner.store.getState().lastRequest).toBeUndefined()
})

test('queue callbacks preserve stable row IDs and reset the owned order after a move', () => {
  const owner = setup(4)
  const initial = owner.project()
  if (initial.kind !== 'queue') throw new Error('expected queue reference')
  const originalIds = initial.rows.map(({ id }) => id)

  initial.onMove('css', 'ssr')
  const moved = owner.project()
  if (moved.kind !== 'queue') throw new Error('expected queue reference after move')
  expect(moved.rows.map(({ id }) => id)).toEqual([
    'css',
    'ssr',
    ...originalIds.filter((id) => id !== 'css' && id !== 'ssr'),
  ])
  moved.onMove('css', undefined)
  const movedToEnd = owner.project()
  if (movedToEnd.kind !== 'queue') throw new Error('expected queue reference after moving to end')
  expect(movedToEnd.rows.at(-1)?.id).toBe('css')

  moved.onRequest({ id: 'reset-order', label: 'Reset order' })
  const reset = owner.project()
  if (reset.kind !== 'queue') throw new Error('expected queue reference after reset')
  expect(reset.rows.map(({ id }) => id)).toEqual(originalIds)
  expect(owner.render()).toContain('Publishing queue')
})

test('assets selection respects filtered rows, records an enabled bulk intent, and guards disabled or empty actions', () => {
  const owner = setup(5)
  const initial = owner.project()
  if (initial.kind !== 'assets') throw new Error('expected assets reference')

  initial.onSelect('range', 'approved')
  const filtered = owner.project()
  if (filtered.kind !== 'assets') throw new Error('expected assets reference after category filter')
  filtered.rows.slice(0, 3).forEach(({ id }) => filtered.onFlag(`selected-${id}`, true))
  const selected = owner.project()
  if (selected.kind !== 'assets') throw new Error('expected assets reference after selection')
  expect(selected.selectedIds).toEqual(['pricing', 'onboarding', 'testimonial'])

  const download = selected.bulkActions.find(({ id }) => id === 'download')
  if (!download) throw new Error('expected download action')
  expect(download.disabled).toBe(false)
  selected.onRequest(download)
  expect(owner.store.getState().lastRequest?.actionId).toBe('download')
  expect(owner.requests).toEqual([{ actionId: 'download', value: 'pricing,onboarding,testimonial' }])
  expect(owner.store.getState().request(owner.store.getState().ownerId, { actionId: 'download' })).toBeUndefined()

  selected.onRequest({ id: 'download', label: 'Download', disabled: true })
  expect(owner.store.getState().lastRequest?.actionId).toBe('download')
  selected.onRequest({ id: 'clear-selection', label: 'Clear selection', disabled: false })
  const cleared = owner.project()
  if (cleared.kind !== 'assets') throw new Error('expected assets reference after clear')
  expect(cleared.selectedIds).toEqual([])
  cleared.onRequest(download)
  expect(owner.store.getState().lastRequest).toBeUndefined()
})

test('inbox read and archive state is owner scoped, supports multiple archives, and undoes only the latest archive', () => {
  const owner = setup(8, 'default', 'list-inbox-a')
  const other = setup(8, 'default', 'list-inbox-b')
  const initial = owner.project()
  if (initial.kind !== 'inbox') throw new Error('expected inbox reference')

  initial.onFlag('read-review', true)
  const read = owner.project()
  if (read.kind !== 'inbox') throw new Error('expected inbox after marking read')
  expect(read.rows.find(({ id }) => id === 'review')?.unread).toBe(false)
  initial.onSelect('archive', 'mention-priya')
  const firstArchive = owner.project()
  if (firstArchive.kind !== 'inbox') throw new Error('expected inbox after first archive')
  expect(firstArchive.rows.some(({ id }) => id === 'mention-priya')).toBe(false)
  expect(firstArchive.archiveNotice).toBeDefined()

  firstArchive.onSelect('archive', 'review')
  const secondArchive = owner.project()
  if (secondArchive.kind !== 'inbox') throw new Error('expected inbox after second archive')
  expect(secondArchive.rows.some(({ id }) => id === 'mention-priya')).toBe(false)
  expect(secondArchive.rows.some(({ id }) => id === 'review')).toBe(false)
  secondArchive.onSelect('archive', 'none')
  const undone = owner.project()
  if (undone.kind !== 'inbox') throw new Error('expected inbox after undo')
  expect(undone.rows.some(({ id }) => id === 'review')).toBe(true)
  expect(undone.rows.some(({ id }) => id === 'mention-priya')).toBe(false)
  expect(undone.archiveNotice).toBeUndefined()

  initial.onSelect('archive', 'quota')
  const otherInbox = other.project()
  if (otherInbox.kind !== 'inbox') throw new Error('expected other inbox reference')
  expect(otherInbox.rows.some(({ id }) => id === 'quota')).toBe(true)
})

test('runbook progression, leaderboard sorting, tree expansion, and contact target guards stay observable', () => {
  const runbook = setup(10)
  const firstRunbook = runbook.project()
  if (firstRunbook.kind !== 'runbook') throw new Error('expected runbook reference')
  expect(firstRunbook.rows[1]?.disabled).toBe(true)
  firstRunbook.onFlag('completed-channel', true)
  expect(ofKind(runbook.project(), 'runbook').completedIds).toEqual([])
  firstRunbook.onFlag('completed-ack', true)
  const acked = runbook.project()
  if (acked.kind !== 'runbook') throw new Error('expected runbook after ack')
  expect(acked.rows[1]?.disabled).toBe(false)
  acked.onFlag('completed-channel', true)
  expect(ofKind(runbook.project(), 'runbook').completedIds).toEqual(['ack', 'channel'])
  acked.onFlag('completed-ack', false)
  expect(ofKind(runbook.project(), 'runbook').completedIds).toEqual([])

  const leaderboard = setup(11)
  const initialLeaderboard = leaderboard.project()
  if (initialLeaderboard.kind !== 'leaderboard') throw new Error('expected leaderboard reference')
  initialLeaderboard.onSelect('range', 'response')
  const response = leaderboard.project()
  if (response.kind !== 'leaderboard') throw new Error('expected leaderboard response sort')
  expect(response.rows.map(({ id }) => id)).toEqual(
    [...initialLeaderboard.rows]
      .sort((left, right) => left.responseSeconds - right.responseSeconds)
      .map(({ id }) => id),
  )
  response.onSelect('range', 'satisfaction')
  response.onSelect('period', 'month')
  const satisfaction = leaderboard.project()
  if (satisfaction.kind !== 'leaderboard') throw new Error('expected leaderboard satisfaction sort')
  expect(satisfaction.periodId).toBe('month')
  expect(satisfaction.rows.map(({ id }) => id)).toEqual(
    [...initialLeaderboard.rows].sort((left, right) => right.satisfaction - left.satisfaction).map(({ id }) => id),
  )

  const tree = setup(12)
  const initialTree = tree.project()
  if (initialTree.kind !== 'tree') throw new Error('expected tree reference')
  expect(initialTree.nodes).toHaveLength(22)
  expect(initialTree.expandedIds).toEqual(['src', 'components'])
  initialTree.onFlag('expanded-src', false)
  expect(ofKind(tree.project(), 'tree').expandedIds).toEqual(['components'])
  initialTree.onFlag('expanded-src', true)
  expect(ofKind(tree.project(), 'tree').expandedIds).toEqual(['src', 'components'])
  const entryBefore = tree.store.getState().selectedBySlot.entry
  initialTree.onSelect('entry', 'invented-node')
  expect(tree.store.getState().selectedBySlot.entry).toBe(entryBefore)

  const contacts = setup(9)
  const initialContacts = contacts.project()
  if (initialContacts.kind !== 'contacts') throw new Error('expected contacts reference')
  expect(initialContacts.selectedLetter).toBe('')
  initialContacts.onSelect('letter', 'A')
  const letterA = contacts.project()
  if (letterA.kind !== 'contacts') throw new Error('expected contacts reference after letter selection')
  expect(letterA.selectedLetter).toBe('A')
  expect(letterA.rows.filter(({ letter }) => letter === 'A')).not.toHaveLength(0)
  letterA.onSelect('letter', 'Z')
  expect(ofKind(contacts.project(), 'contacts').selectedLetter).toBe('A')
  const firstContact = letterA.rows.find(({ letter }) => letter === 'A')
  if (!firstContact) throw new Error('expected contact in selected letter group')
  letterA.onRequest({
    id: 'email',
    value: firstContact.id,
    label: initialContacts.emailLabel(firstContact.title),
  })
  expect(contacts.store.getState().lastRequest?.value).toBe(firstContact.id)
  const staleContacts = initialContacts
  letterA.onSelect('range', 'customers')
  expect(rowsOf(contacts.project())).toHaveLength(0)
  expect(contacts.project().available).toBe(false)
  expect(contacts.store.getState().lastRequest).toBeUndefined()
  staleContacts.onRequest({
    id: 'email',
    value: firstContact.id,
    label: initialContacts.emailLabel(firstContact.title),
  })
  expect(contacts.store.getState().lastRequest).toBeUndefined()
})
