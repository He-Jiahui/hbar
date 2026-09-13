import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import type { Run, SessionEvent } from '@hbar/contracts'
import ActivitySurface, { type ActivitySurfaceLabels } from './ActivitySurface'

const labels: ActivitySurfaceLabels = {
  activityAndEvents: 'Runs and events', activityView: 'Activity view', run: 'Run', events: 'Events',
  currentSession: 'Current session', runCount: 'runs', activeCount: 'active', timeline: 'Timeline',
  imageMessage: 'Image', notStarted: 'Not started', stopRun: 'Stop', runHistory: 'History',
  noRunHistory: 'No history', runHistoryHint: 'Send a message', eventDetails: 'Event details',
  backToEvents: 'Back', sequence: 'Sequence', time: 'Time', eventRun: 'Run', loadingEvents: 'Loading',
  filterEvents: 'Filter', filterEventsPlaceholder: 'Filter events', viewEvent: 'View', noEvents: 'No events',
  eventsHint: 'Events appear here', noMatchingEvents: 'No matches', adjustFilterHint: 'Adjust filter',
}

const run: Run = {
  id: 'run_1', sessionId: 'session_1', requestId: 'request_1', input: { text: 'inspect', images: [], files: [] },
  modelId: 'model', status: 'completed', createdAt: 0, startedAt: 0, endedAt: 1_000, error: null,
}
const event: SessionEvent = {
  eventId: 'event_1', sessionId: 'session_1', seq: 1, runId: run.id, stepId: null,
  type: 'run.status', data: { run: { status: 'completed' } }, time: 0, version: 1,
}

test('activity surface binds live runs, timeline, metrics and event trace', () => {
  const markup = renderToStaticMarkup(
    createElement(ActivitySurface, {
      labels,
      runs: [run],
      timelineRun: run,
      timelineEvents: [{ id: event.eventId, title: 'Completed', meta: 'now', status: 'success' }],
      metrics: [{ id: 'input', label: 'Input', value: '10' }],
      events: [event],
      eventsLoading: false,
      eventsError: '',
      runningCount: 0,
      onStopRun: () => undefined,
    }),
  )
  expect(markup).toContain('rb-activity-surface')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1"')
  expect(markup).toContain('inspect')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/ai-usage"')
})
