import { expect, test } from 'bun:test'
import { HBAR_APP_UI_SUPPORT_FIXTURES } from './fixtures/hbar-app-ui-support-fixtures'
import {
  createSupportTicketPreviewCopy,
  localizeSupportTicketPreviewContent,
} from '../apps/hbar-app-ui-preview/src/supportTicketPreviewCopy'

test('support preview copy is localized without changing draft IDs or claiming service delivery', () => {
  const english = localizeSupportTicketPreviewContent(HBAR_APP_UI_SUPPORT_FIXTURES, 'en')
  const german = localizeSupportTicketPreviewContent(HBAR_APP_UI_SUPPORT_FIXTURES, 'de')
  expect(english).toBe(HBAR_APP_UI_SUPPORT_FIXTURES)
  expect(german.ticket?.initialSubject).toBe(english.ticket?.initialSubject)
  expect(german.ticket?.priorities.map(({ id }) => id)).toEqual(english.ticket?.priorities.map(({ id }) => id))
  expect(german.ticket?.labels.submit).toBe('Support-Anfrage senden')
  expect(german.ticket?.labels.responseFor('Dringend')).toBe('1 Stunde')
  expect(createSupportTicketPreviewCopy('de').confirmed).toContain('kein echtes Support-Ticket')
  expect(createSupportTicketPreviewCopy('en').confirmed).toContain('No real support ticket')
})
