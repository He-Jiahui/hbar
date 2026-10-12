import { expect, test } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  HbarComposerFeedback,
  HbarComposerFeedbackProvider,
  HbarComposerPrimaryNotice,
} from './composer-feedback'

test('one primary notice prioritizes blocking state and returns to recovery when the blocker clears', () => {
  const labels = {
    title: 'Details',
    empty: 'No additional notices',
    close: 'Close',
    summary: (count: number) => `${count} notices`,
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
