import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  uniqueHbarAppUiFeedbackBoardRequests,
  visibleHbarAppUiFeedbackBoardRequests,
  type HbarAppUiFeedbackBoardReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createFeedbackBoardPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackBoardPreviewStore'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const board = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceBoard
if (!board) throw new Error('Expected hosted board fixture')

function render(content: HbarAppUiFeedbackBoardReferenceContent): string {
  const component = getHbarAppUiVariant('feedback', 4).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, {
      content: { ...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceBoard: content },
      children: createElement(component, {}),
    }),
  )
}

describe('reference feature request board contract', () => {
  test('renders hosted records in stable Top, New and Shipped projections', () => {
    expect(render(board).match(/<article/g)).toHaveLength(5)
    expect(visibleHbarAppUiFeedbackBoardRequests(board.requests, 'new').map((item) => item.id)).toEqual([
      'webhook-retries',
      'dark-mode',
      'bulk-undo',
      'row-permissions',
      'sheet-export',
    ])
    expect(visibleHbarAppUiFeedbackBoardRequests(board.requests, 'shipped').map((item) => item.id)).toEqual([
      'dark-mode',
    ])
    expect(render({ ...board, selectedSortId: 'shipped' }).match(/<article/g)).toHaveLength(1)
    expect(render({ ...board, searchQuery: 'no matching feature' }).match(/<article/g)).toHaveLength(5)
  })

  test('supports empty, one, duplicate and over-bound pane with long localized copy', () => {
    expect(render({ ...board, requests: [] })).toContain('No feature requests match this search.')
    const first = board.requests[0]
    if (!first) throw new Error('Expected first request')
    expect(render({ ...board, requests: [first] }).match(/<article/g)).toHaveLength(1)
    expect(uniqueHbarAppUiFeedbackBoardRequests([first, first])).toEqual([first])
    const overflow = createHbarAppUiFeedbackOverflowFixtures().referenceBoard
    if (!overflow) throw new Error('Expected overflow board')
    expect(render(overflow).match(/<article/g)).toHaveLength(19)
    expect(render(overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    const localized = createHbarAppUiFeedbackLocalizedFixtures().referenceBoard
    if (!localized) throw new Error('Expected localized board')
    expect(render(localized)).toContain('Funktionswünsche')
    expect(render(localized)).not.toContain('Feature requests')
    expect(render(localized)).toContain('international verteilte Arbeitsgruppen')
  })

  test('host state guards stale IDs, vote toggles and keeps source search as input only', () => {
    const store = createFeedbackBoardPreviewStore(board)
    const state = () => store.getState()
    state().vote('stale-board', 'row-permissions')
    state().vote(board.boardId, 'stale-request')
    expect(state().votedIds).toEqual(['dark-mode', 'sheet-export'])
    state().vote(board.boardId, 'row-permissions')
    expect(state().votedIds).toContain('row-permissions')
    state().vote(board.boardId, 'row-permissions')
    expect(state().votedIds).not.toContain('row-permissions')
    state().sort(board.boardId, 'new')
    state().sort(board.boardId, 'shipped')
    expect(state().selectedSortId).toBe('shipped')
    state().search(board.boardId, 'webhook')
    expect(state().searchQuery).toBe('webhook')
    expect(state().requests).toHaveLength(5)
    state().reset({
      ...board,
      requests: [board.requests[0]!, board.requests[0]!],
      votedIds: ['stale-request', 'dark-mode'],
    })
    expect(state()).toMatchObject({ requests: [board.requests[0]], votedIds: ['dark-mode'] })
  })
})
