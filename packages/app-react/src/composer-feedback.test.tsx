import { expect, test } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import {
  HbarComposerFeedback,
  HbarComposerFeedbackProvider,
  HbarComposerFeedbackRegistryProvider,
  HbarComposerFeedbackSessionProvider,
  HbarComposerFeedbackDetails,
  HbarComposerPrimaryNotice,
  HbarComposerBlockedNotice,
  primaryComposerFeedback,
} from './composer-feedback'

test('one primary notice prioritizes blocking state and returns to recovery when the blocker clears', () => {
  const labels = {
    title: 'Details',
    empty: 'No additional notices',
    close: 'Close',
    summary: (count: number) => `${count} notices`,
    blockedReason: (reason: string) => `Cannot send: ${reason}`,
  }
  const content = (blocking: boolean) => (
    <HbarComposerFeedbackProvider labels={labels}>
      <HbarComposerPrimaryNotice />
      <HbarComposerFeedback>Informational progress</HbarComposerFeedback>
      <HbarComposerFeedback tone="danger">
        <button type="button">Reconcile result</button>
      </HbarComposerFeedback>
      <HbarComposerFeedback active={blocking} priority="blocking">
        Disconnected
      </HbarComposerFeedback>
    </HbarComposerFeedbackProvider>
  )
  try {
    const view = render(content(true))
    expect(screen.getByText('Disconnected').textContent).toBe('Disconnected')
    expect(screen.queryByRole('button', { name: 'Reconcile result' })).toBeNull()
    expect(screen.queryByText('Informational progress')).toBeNull()
    view.rerender(content(false))
    expect(screen.queryByText('Disconnected')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reconcile result' }).textContent).toBe('Reconcile result')
    expect(view.container.querySelectorAll('.hbar-composer-primary-notice')).toHaveLength(1)
  } finally {
    cleanup()
  }
})

test('the first information notice becomes primary when no higher priority exists', () => {
  expect(primaryComposerFeedback(new Map([['progress', { tone: 'neutral', priority: 'information' }]]))).toBe(
    'progress',
  )
})

test('session panel details preserve owning actions and isolate runtime workspace/session scopes', () => {
  const labels = {
    title: 'Session notices',
    empty: 'No additional notices',
    close: 'Close notice details',
    summary: (count: number) => `${count} notices`,
    blockedReason: (reason: string) => `Cannot send: ${reason}`,
  }
  let retries = 0
  const content = (showRecovery: boolean, showSession: boolean) => (
    <HbarComposerFeedbackRegistryProvider>
      <HbarComposerFeedbackSessionProvider
        labels={labels}
        scope={{ workspaceId: 'workspace-a', sessionId: 'session-a' }}
      >
        <HbarComposerPrimaryNotice />
        <HbarComposerFeedback priority="blocking">Session connection confirmed</HbarComposerFeedback>
        <HbarComposerFeedback>Refreshing history</HbarComposerFeedback>
        <HbarComposerFeedback active={showRecovery} tone="danger">
          <button type="button" onClick={() => (retries += 1)}>
            Retry original history request
          </button>
        </HbarComposerFeedback>
      </HbarComposerFeedbackSessionProvider>
      {showSession && (
        <HbarComposerFeedbackSessionProvider
          labels={labels}
          scope={{ workspaceId: 'workspace-b', sessionId: 'session-b' }}
        >
          <HbarComposerFeedback>Different session update</HbarComposerFeedback>
        </HbarComposerFeedbackSessionProvider>
      )}
      <HbarComposerFeedbackDetails scope={{ workspaceId: 'workspace-a', sessionId: 'session-a' }} labels={labels} />
      <HbarComposerFeedbackDetails scope={{ workspaceId: 'workspace-b', sessionId: 'session-b' }} labels={labels} />
    </HbarComposerFeedbackRegistryProvider>
  )
  try {
    const view = render(content(true, true))
    expect(screen.getByText('Refreshing history').textContent).toBe('Refreshing history')
    expect(screen.queryByText('Different session update')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '3 notices' }))
    expect(screen.getByRole('button', { name: 'Retry original history request' })).toBeTruthy()
    expect(screen.queryByText('Different session update')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry original history request' }))
    expect(retries).toBe(1)

    view.rerender(content(false, false))
    expect(screen.queryByRole('button', { name: '3 notices' })).toBeNull()
    expect(screen.queryByText('Different session update')).toBeNull()
    expect(screen.getByText('Refreshing history').textContent).toBe('Refreshing history')
  } finally {
    cleanup()
  }
})

test('blocked send state exposes its host-localized reason in the nearby primary notice', () => {
  const labels = {
    title: 'Session notices',
    empty: 'No additional notices',
    close: 'Close notice details',
    summary: (count: number) => `${count} notices`,
    blockedReason: (reason: string) => `Cannot send: ${reason}`,
  }
  try {
    render(
      <HbarComposerFeedbackRegistryProvider>
        <HbarComposerFeedbackSessionProvider
          labels={labels}
          scope={{ workspaceId: 'workspace-a', sessionId: 'session-a' }}
        >
          <HbarComposerPrimaryNotice />
          <HbarComposerBlockedNotice reason="model-required" />
        </HbarComposerFeedbackSessionProvider>
      </HbarComposerFeedbackRegistryProvider>,
    )
    expect(screen.getByRole('status').textContent).toBe('Cannot send: model-required')
  } finally {
    cleanup()
  }
})

test('scope changes remove a notice from its old session before exposing it in the new one', () => {
  const labels = {
    title: 'Session notices',
    empty: 'No additional notices',
    close: 'Close notice details',
    summary: (count: number) => `${count} notices`,
    blockedReason: (reason: string) => `Cannot send: ${reason}`,
  }
  const content = (sessionId: string) => (
    <HbarComposerFeedbackRegistryProvider>
      <HbarComposerFeedbackSessionProvider labels={labels} scope={{ workspaceId: 'workspace-a', sessionId }}>
        <HbarComposerFeedback>Current session notice</HbarComposerFeedback>
      </HbarComposerFeedbackSessionProvider>
      <HbarComposerFeedbackDetails scope={{ workspaceId: 'workspace-a', sessionId: 'session-a' }} labels={labels} />
      <HbarComposerFeedbackDetails scope={{ workspaceId: 'workspace-a', sessionId: 'session-b' }} labels={labels} />
    </HbarComposerFeedbackRegistryProvider>
  )
  try {
    const view = render(content('session-a'))
    expect(screen.getByRole('button', { name: '1 notices' })).toBeTruthy()
    view.rerender(content('session-b'))
    expect(screen.getByRole('button', { name: '1 notices' })).toBeTruthy()
    expect(screen.queryByText('Current session notice')).toBeNull()
  } finally {
    cleanup()
  }
})

test('independent runtime registries do not leak equal session scopes across windows', () => {
  const labels = {
    title: 'Session notices',
    empty: 'No additional notices',
    close: 'Close notice details',
    summary: (count: number) => `${count} notices`,
    blockedReason: (reason: string) => `Cannot send: ${reason}`,
  }
  const runtime = (name: string) => (
    <HbarComposerFeedbackRegistryProvider>
      <HbarComposerFeedbackSessionProvider
        labels={labels}
        scope={{ workspaceId: 'shared-workspace', sessionId: 'shared-session' }}
      >
        <HbarComposerFeedback priority="blocking">Ready to send</HbarComposerFeedback>
        <HbarComposerFeedback>Updating {name}</HbarComposerFeedback>
        <HbarComposerFeedback tone="danger">
          <button type="button">Retry {name}</button>
        </HbarComposerFeedback>
      </HbarComposerFeedbackSessionProvider>
      <HbarComposerFeedbackDetails
        scope={{ workspaceId: 'shared-workspace', sessionId: 'shared-session' }}
        labels={labels}
      />
    </HbarComposerFeedbackRegistryProvider>
  )
  try {
    const runtimeA = render(runtime('window A'))
    const runtimeB = render(runtime('window B'))
    fireEvent.click(within(runtimeA.container).getByRole('button', { name: '3 notices' }))
    expect(within(runtimeA.container).getByRole('button', { name: 'Retry window A' })).toBeTruthy()
    expect(within(runtimeB.container).queryByRole('button', { name: 'Retry window A' })).toBeNull()
    fireEvent.click(within(runtimeB.container).getByRole('button', { name: '3 notices' }))
    expect(within(runtimeB.container).getByRole('button', { name: 'Retry window B' })).toBeTruthy()
    runtimeA.unmount()
    expect(within(runtimeB.container).getByRole('button', { name: 'Retry window B' })).toBeTruthy()
  } finally {
    cleanup()
  }
})
