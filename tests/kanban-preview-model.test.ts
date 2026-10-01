import { expect, test } from 'bun:test'
import {
  createKanbanPreviewSeed,
  createKanbanPreviewStore,
  type KanbanBoardSeed,
  type KanbanPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/kanbanPreviewModel'
import { HBAR_APP_UI_KANBAN_FIXTURES } from './fixtures/hbar-app-ui-kanban-fixtures'

const content = HBAR_APP_UI_KANBAN_FIXTURES

function seed(variant: 1 | 2 | 3 | 4 | 5 | 6, ownerId = 'kanban-owner-a', fixtureId = 'fixture-a') {
  return createKanbanPreviewSeed(content, variant, ownerId, fixtureId)
}

function boardSeed(overrides: Partial<KanbanBoardSeed> = {}): KanbanPreviewSeed {
  const base = seed(1)
  if (base.data.kind !== 'board') throw new Error('Board seed expected')
  return { ...base, data: { ...base.data, ...overrides } }
}

test('normalizes duplicate board IDs and rejects unknown board targets', () => {
  const initial = boardSeed({
    kind: 'board',
    cardIds: ['a', 'a', 'b'],
    columns: [
      { id: 'todo', cardIds: ['a', 'a', 'missing'] },
      { id: 'done', cardIds: ['b'] },
      { id: 'done', cardIds: ['ignored'] },
    ],
    composerColumnId: 'unknown',
    draft: '  draft  ',
  })
  const store = createKanbanPreviewStore(initial)
  const data = store.getState().data
  expect(data.kind).toBe('board')
  if (data.kind !== 'board') return
  expect(data.cardIds).toEqual(['a', 'b'])
  expect(data.columns).toEqual([
    { id: 'todo', cardIds: ['a'] },
    { id: 'done', cardIds: ['b'] },
  ])
  expect(data.composerColumnId).toBeNull()
  expect(store.getState().boardTargetChange(store.getState().ownerId, 'missing')).toBe(false)
})

test('actions are owner and variant scoped', () => {
  const first = createKanbanPreviewStore(seed(1, 'owner-a'))
  const second = createKanbanPreviewStore(seed(1, 'owner-b'))
  expect(first.getState().boardGrab('owner-b', 'HAL-241', 'backlog')).toBe(false)
  expect(first.getState().boardGrab('owner-a', 'missing', 'backlog')).toBe(false)
  expect(second.getState().data).not.toBe(first.getState().data)
  const variant = createKanbanPreviewStore(seed(2, 'owner-a'))
  expect(variant.getState().boardGrab('owner-a', 'HAL-231', 'todo')).toBe(false)
  expect(variant.getState().swimGrab('owner-a', 'HAL-231')).toBe(true)
})

test('board previews drag positions, rolls back on cancel, and keeps a committed drop after dragEnd', () => {
  const store = createKanbanPreviewStore(seed(1))
  const owner = store.getState().ownerId
  expect(store.getState().boardGrab(owner, 'HAL-229', 'backlog')).toBe(true)
  expect(store.getState().boardTargetChange(owner, 'done')).toBe(true)
  const preview = store.getState().data
  expect(preview.kind).toBe('board')
  if (preview.kind !== 'board') return
  expect(preview.columns.find(({ id }) => id === 'done')?.cardIds).toContain('HAL-229')
  expect(store.getState().boardCancelGrab(owner)).toBe(true)
  const rolledBack = store.getState().data
  expect(rolledBack.kind).toBe('board')
  if (rolledBack.kind !== 'board') return
  expect(rolledBack.columns.find(({ id }) => id === 'backlog')?.cardIds).toContain('HAL-229')
  expect(store.getState().boardGrab(owner, 'HAL-229', 'backlog')).toBe(true)
  expect(store.getState().boardTargetChange(owner, 'done')).toBe(true)
  expect(store.getState().boardDrop(owner, 'HAL-229', 'done')).toBe(true)
  expect(store.getState().boardCancelGrab(owner)).toBe(false)
  const committed = store.getState().data
  expect(committed.kind).toBe('board')
  if (committed.kind !== 'board') return
  expect(committed.columns.find(({ id }) => id === 'done')?.cardIds).toContain('HAL-229')
})

test('board composer creates a bounded stable card without hard-coded assignee', () => {
  const store = createKanbanPreviewStore(seed(1))
  const owner = store.getState().ownerId
  expect(store.getState().boardOpenComposer(owner, 'progress')).toBe(true)
  expect(store.getState().boardDraft(owner, '  New release checklist  ')).toBe(true)
  expect(store.getState().boardAddCard(owner, 'Triage', { id: 'SA', name: 'Sofia Alvarez' })).toBe(true)
  const data = store.getState().data
  expect(data.kind).toBe('board')
  if (data.kind !== 'board') return
  expect(data.addedCards[0]).toMatchObject({ id: 'HAL-242', label: 'New release checklist', assignee: 'SA' })
  expect(data.columns.find(({ id }) => id === 'progress')?.cardIds).toContain('HAL-242')
})

test('swimlane move is immediate, validates lane and stage, and rolls back', () => {
  const store = createKanbanPreviewStore(seed(2))
  const owner = store.getState().ownerId
  expect(store.getState().swimGrab(owner, 'HAL-241')).toBe(true)
  expect(store.getState().swimMove(owner, 'HAL-241', 'identity', 'review')).toBe(true)
  expect(store.getState().swimMove(owner, 'HAL-241', 'identity', 'unknown')).toBe(false)
  expect(store.getState().swimCancelGrab(owner)).toBe(true)
  const data = store.getState().data
  expect(data.kind).toBe('swimlanes')
  if (data.kind !== 'swimlanes') return
  expect(data.lanes.find(({ id }) => id === 'billing')?.columns.find(({ id }) => id === 'progress')?.cardIds).toContain(
    'HAL-241',
  )
  expect(
    data.lanes.find(({ id }) => id === 'identity')?.columns.find(({ id }) => id === 'review')?.cardIds,
  ).not.toContain('HAL-241')
})

test('regroup validates current group and restores card values when group changes mid-drag', () => {
  const store = createKanbanPreviewStore(seed(3))
  const owner = store.getState().ownerId
  expect(store.getState().regroupGrab(owner, 'NW-412')).toBe(true)
  expect(store.getState().regroupMove(owner, 'NW-412', 'status', 'review')).toBe(true)
  expect(store.getState().regroupGroupChange(owner, 'priority')).toBe(true)
  const data = store.getState().data
  expect(data.kind).toBe('regroup')
  if (data.kind !== 'regroup') return
  expect(data.groupId).toBe('priority')
  expect(data.cards.find(({ id }) => id === 'NW-412')?.statusId).toBe('building')
})

test('detail selection and direct moves retain card metadata and support explicit close', () => {
  const store = createKanbanPreviewStore(seed(4))
  const owner = store.getState().ownerId
  expect(store.getState().detailSelect(owner, 'CDR-109')).toBe(true)
  expect(store.getState().detailGrab(owner, 'CDR-109')).toBe(true)
  expect(store.getState().detailMove(owner, 'CDR-109', 'done')).toBe(true)
  expect(store.getState().detailClose(owner)).toBe(true)
  const data = store.getState().data
  expect(data.kind).toBe('detail')
  if (data.kind !== 'detail') return
  expect(data.selectedCardId).toBeNull()
  expect(data.statusByCard['CDR-109']).toBe('done')
})

test('sprint move previews then commits on drop and ignores dragEnd cancellation after commit', () => {
  const store = createKanbanPreviewStore(seed(5))
  const owner = store.getState().ownerId
  expect(store.getState().sprintGrab(owner, 'MER-52')).toBe(true)
  expect(store.getState().sprintMove(owner, 'MER-52', 'accepted')).toBe(true)
  expect(store.getState().sprintDrop(owner, 'MER-52', 'accepted')).toBe(true)
  expect(store.getState().sprintCancelGrab(owner)).toBe(false)
  const data = store.getState().data
  expect(data.kind).toBe('sprint')
  if (data.kind !== 'sprint') return
  expect(data.stageByCard['MER-52']).toBe('accepted')
  expect(store.getState().sprintGrab(owner, 'MER-49')).toBe(true)
  expect(store.getState().sprintMove(owner, 'MER-49', 'accepted')).toBe(true)
  expect(store.getState().sprintCancelGrab(owner)).toBe(true)
  const restored = store.getState().data
  expect(restored.kind === 'sprint' && restored.stageByCard['MER-49']).toBe('building')
})

test('refresh preserves valid local position and selection while pruning stale IDs', () => {
  const store = createKanbanPreviewStore(seed(6))
  const owner = store.getState().ownerId
  expect(store.getState().compactSelectColumn(owner, 'done')).toBe(true)
  expect(store.getState().compactMove(owner, 'invite', 'done')).toBe(true)
  const next = seed(6, owner)
  const data = next.data
  if (data.kind !== 'compact') return
  const refreshed = store.getState().refresh({
    ...next,
    data: {
      ...data,
      cardIds: ['invite', 'rss'],
      columnByCard: { invite: 'inbox', rss: 'done' },
      selectedColumnId: 'inbox',
    },
  })
  expect(refreshed).toBe(true)
  const current = store.getState().data
  expect(current.kind).toBe('compact')
  if (current.kind !== 'compact') return
  expect(current.selectedColumnId).toBe('done')
  expect(current.columnByCard.invite).toBe('done')
  expect(current.cardIds).toEqual(['invite', 'rss'])
})

test('compact rejects stale cards and targets while accepting valid one-step moves', () => {
  const store = createKanbanPreviewStore(seed(6))
  const owner = store.getState().ownerId
  expect(store.getState().compactMove(owner, 'missing', 'done')).toBe(false)
  expect(store.getState().compactMove(owner, 'invite', 'missing')).toBe(false)
  expect(store.getState().compactMove(owner, 'invite', 'today')).toBe(true)
  expect(store.getState().compactSelectColumn(owner, 'today')).toBe(true)
})
