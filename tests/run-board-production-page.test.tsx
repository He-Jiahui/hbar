import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'
import { LumenKanban01 } from '@lumen/app-ui'
import { createRunBoardKanbanContent, resolveRunBoardAction } from '../apps/web/src/run-board-page'
import { runBoardCopy } from '../apps/web/src/run-board-copy'
import type { RunBoardItem } from '@hbar/contracts/commands/run-board'

const item = (id: string, status: RunBoardItem['run']['status'] = 'running'): RunBoardItem => ({
  run: {
    id,
    sessionId: `session-${id}`,
    workspaceName: 'Workspace',
    sessionTitle: 'Session',
    requestId: `request-${id}`,
    modelId: 'model',
    status,
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  },
  workspaceName: 'Workspace',
  sessionTitle: 'Session',
  plan: null,
  usage: null,
})

describe('production run board page contract', () => {
  test('builds complete host-owned canonical content with bounded 400 item strategy', () => {
    const content = createRunBoardKanbanContent([item('run-1')], runBoardCopy('en-US'))
    expect(content.listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 400 })
    expect(content.columns).toHaveLength(8)
    expect(content.cards[0]?.id).toBe('run-1')
    expect(content.labels.boardTitle).toBe('Run board')
  })

  test('canonical read-only board exposes stable card identity and no move control', () => {
    const content = createRunBoardKanbanContent([item('run-1')], runBoardCopy('en-US'))
    const html = renderToStaticMarkup(createElement(LumenKanban01, { content, readOnly: true }))
    expect(html).toContain('run-1')
    expect(html).not.toContain('Move')
  })

  test('missing names remain explicit localized values', () => {
    const missing = item('run-2')
    missing.workspaceName = null
    missing.sessionTitle = null
    missing.run.workspaceName = null
    missing.run.sessionTitle = null
    const content = createRunBoardKanbanContent([missing], runBoardCopy('en-US'))
    expect(content.cards[0]?.label).toBe('Session name unavailable')
    expect(content.cards[0]?.assignee).toBe('Workspace name unavailable')
  })

  test('stable action resolver binds open, cancel and retry and ignores stale or unknown cards', () => {
    const run = item('run-action')
    expect(resolveRunBoardAction({ actionId: 'open', value: 'run-action' }, run, 'workspace-1')).toEqual({
      command: 'app.setSession',
      input: { sessionId: 'session-run-action', workspaceId: 'workspace-1' },
    })
    expect(resolveRunBoardAction({ actionId: 'cancel', value: 'run-action' }, run, 'workspace-1')).toEqual({
      command: 'operation.cancel',
      input: { operationId: 'run-action' },
    })
    expect(resolveRunBoardAction({ actionId: 'retry', value: 'run-action' }, run, 'workspace-1')).toEqual({
      command: 'run.retry',
      input: { operationId: 'run-action', sessionId: 'session-run-action' },
    })
    expect(resolveRunBoardAction({ actionId: 'open', value: 'stale' }, run, 'workspace-1')).toBeNull()
    expect(resolveRunBoardAction({ actionId: 'unknown', value: 'run-action' }, run, 'workspace-1')).toBeNull()
  })
})
