import { expect, test } from 'bun:test'
import { bindInteractionSession, sessionInteractionCommand } from '../apps/host/src/session-command-interaction'

test('interaction commands retain native network/process effects even when their command metadata is a query', () => {
  expect(sessionInteractionCommand('browser.status', {})).toMatchObject({
    effect: 'network',
    alias: 'browser_status',
    metadata: { kind: 'query', stateEffect: 'none' },
  })
  expect(sessionInteractionCommand('browser.screenshot', {})).toMatchObject({ effect: 'network' })
  expect(sessionInteractionCommand('computer.screenshot', {})).toMatchObject({
    effect: 'process',
    alias: 'computer_screenshot',
    metadata: { kind: 'query', stateEffect: 'none' },
  })
  expect(sessionInteractionCommand('computer.status', {})).toMatchObject({ effect: 'read', alias: 'computer_status' })
  expect(sessionInteractionCommand('browser.close', {})).toMatchObject({
    effect: 'network',
    metadata: { stateEffect: 'application' },
  })
  expect(sessionInteractionCommand('browser.unknown', {})).toBeUndefined()
})

test('native permission aliases use the final native argument names without a model-controlled Session', () => {
  expect(
    sessionInteractionCommand('browser.press', {
      sessionId: 'source',
      contextId: 'context',
      pageId: 'page',
      key: 'Enter',
    }),
  ).toMatchObject({ alias: 'browser_press_key', arguments: { context_id: 'context', page_id: 'page', key: 'Enter' } })
  expect(
    sessionInteractionCommand('computer.doubleClick', { sessionId: 'source', appId: 'app', x: 1, y: 2 }),
  ).toMatchObject({ alias: 'computer_double_click', arguments: { app_id: 'app', x: 1, y: 2 } })
  expect(
    sessionInteractionCommand('computer.scroll', { sessionId: 'source', deltaX: 1, deltaY: -2 })?.arguments,
  ).toEqual({ delta_x: 1, delta_y: -2 })
  expect(bindInteractionSession('source', {})).toEqual({ sessionId: 'source' })
  expect(() => bindInteractionSession('source', { sessionId: 'borrowed' })).toThrow('original Session')
})
