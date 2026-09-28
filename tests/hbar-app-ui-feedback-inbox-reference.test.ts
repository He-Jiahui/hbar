import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
  getHbarAppUiVariant, HbarAppUiFeedbackProvider,
  selectHbarAppUiFeedbackInboxThread, uniqueHbarAppUiFeedbackInboxThreads,
  type HbarAppUiFeedbackContent,
} from '../packages/hbar-app-ui/src/index'
import {createFeedbackInboxPreviewStore} from '../apps/hbar-app-ui-preview/src/feedbackInboxPreviewStore'
import {
  HBAR_APP_UI_FEEDBACK_FIXTURES, createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const content = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceInbox
if (!content) throw new Error('Expected Feedback 5 fixture')

function render(input: HbarAppUiFeedbackContent = HBAR_APP_UI_FEEDBACK_FIXTURES): string {
  const component = getHbarAppUiVariant('feedback', 5).component
  return renderToStaticMarkup(createElement(HbarAppUiFeedbackProvider, {
    content: input, children: createElement(component),
  }))
}

describe('source-owned feedback inbox', () => {
  test('keeps all seven host threads, detail semantics and separate bounded pane owners', () => {
    const markup = render()
    expect(content.threads).toHaveLength(7)
    expect(markup.match(/<li>/g)).toHaveLength(9)
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(markup).toContain('Internal note')
    expect(markup).toContain('Running the Monday revenue export')
    expect(markup).toContain('Others said the same thing')
    expect(markup.indexOf('Amelia Whitfield')).toBeLessThan(markup.indexOf('Jonas Vikander'))
  })

  test('deduplicates IDs, safely falls back for stale selections and handles empty content', () => {
    const duplicate = [content.threads[0]!, {...content.threads[0]!, sender: 'Duplicate'}, content.threads[1]!]
    expect(uniqueHbarAppUiFeedbackInboxThreads(duplicate).map(thread => thread.sender)).toEqual(['Amelia Whitfield', 'Jonas Vikander'])
    expect(selectHbarAppUiFeedbackInboxThread(duplicate, 'stale')?.id).toBe(content.threads[0]?.id)
    expect(render({...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceInbox: {...content, threads: [], details: []}})).toContain(content.labels.emptyThreads)
    expect(render({...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceInbox: {...content, threads: [], details: []}})).toContain(content.labels.emptyDetail)
  })

  test('host selection changes the detail and preserves a shared draft, with stale guards', () => {
    const store = createFeedbackInboxPreviewStore(content)
    store.getState().changeNote(content.inboxId, 'Investigate export')
    store.getState().selectThread(content.inboxId, 'saved-views')
    expect(store.getState().selectedThreadId).toBe('saved-views')
    expect(store.getState().noteDraft).toBe('Investigate export')
    store.getState().selectThread('other-inbox', 'sso-plan')
    store.getState().selectThread(content.inboxId, 'missing')
    store.getState().changeNote('other-inbox', 'discard')
    expect(store.getState().selectedThreadId).toBe('saved-views')
    expect(store.getState().noteDraft).toBe('Investigate export')
    store.getState().reset({...content, selectedThreadId: 'missing', threads: content.threads.slice(2)})
    expect(store.getState().selectedThreadId).toBe('sso-plan')
    expect(store.getState().noteDraft).toBe('')
  })

  test('long locale and over-capacity records remain host-owned', () => {
    const localized = render(createHbarAppUiFeedbackLocalizedFixtures())
    expect(localized).toContain('Feedback-Posteingang')
    expect(localized).toContain('Interne Notiz für das Team hinzufügen')
    const overflow = createHbarAppUiFeedbackOverflowFixtures().referenceInbox
    expect(overflow?.threads).toHaveLength(25)
    expect(overflow?.details).toHaveLength(25)
    expect(render(createHbarAppUiFeedbackOverflowFixtures())).toContain('Additional sender 18')
  })
})
