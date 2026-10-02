import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerBackgroundAgentStop,
  HbarComposerBackgroundAgentFeedback,
  type HbarBackgroundAgentFeedbackKind,
} from '../packages/app-react/src/composer-background-agents'
import { HbarPromptComposer } from '../packages/app-react/src/prompt-composer'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('background stop is a separate non-submit action with host-owned localized count and loading', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.backgroundAgents
    for (const count of [0, 1, 3, 128, 129]) {
      const html = renderToStaticMarkup(
        <HbarComposerBackgroundAgentStop
          count={count}
          disabled={false}
          pending={false}
          labels={labels}
          onStop={() => undefined}
        />,
      )
      if (count === 0) {
        expect(html).toBe('')
        continue
      }
      expect(html).toContain(`aria-label="${labels.stop(count)}"`)
      expect(html).toContain('type="button"')
      expect(html).toContain('data-tone="danger"')
      expect(html).toContain('data-lumen-indicator="none"')
      expect(html).not.toContain('data-edge=')
      expect(html).toContain('lucide-square')
    }
    const pending = renderToStaticMarkup(
      <HbarComposerBackgroundAgentStop count={2} disabled pending labels={labels} onStop={() => undefined} />,
    )
    expect(pending).toContain('disabled=""')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('lucide-loader-circle')
  }
})

test('background cancellation feedback distinguishes acceptance, unknown, actual settlement and explicit recovery', () => {
  const base = getShellCopy('zh-CN').session.backgroundAgents
  const labels = { ...base, unknown: `${base.unknown}${'这是一段很长的宿主翻译文案。'.repeat(15)}` }
  const messages = {
    submitting: labels.stopping,
    requested: labels.requested,
    unknown: labels.unknown,
    checking: labels.checking,
    settled: labels.settled,
    failed: labels.failed('OWNED_FAILURE'),
    'read-error': labels.readFailed('OWNED_FAILURE'),
  } satisfies Record<HbarBackgroundAgentFeedbackKind, string>
  for (const kind of Object.keys(messages) as HbarBackgroundAgentFeedbackKind[]) {
    const html = renderToStaticMarkup(
      <HbarComposerBackgroundAgentFeedback
        kind={kind}
        error="OWNED_FAILURE"
        disabled
        labels={labels}
        onReconcile={() => undefined}
        onRetry={() => undefined}
        onRefresh={() => undefined}
      />,
    )
    expect(html).toContain(messages[kind])
    expect(html).toContain(`data-state="${kind}"`)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain(kind === 'failed' || kind === 'read-error' ? 'role="alert"' : 'role="status"')
    if (kind === 'unknown' || kind === 'requested') {
      expect(html).toContain(labels.reconcile)
      expect(html).not.toContain(labels.retry)
    }
    if (kind === 'failed') expect(html).toContain(labels.retry)
    if (kind === 'read-error') expect(html).toContain(labels.refresh)
    if (['submitting', 'checking', 'settled'].includes(kind)) expect(html).not.toContain('<button')
  }
})

test('background stop renders before independent enabled Send without changing the composer draft or gate', () => {
  const copy = getShellCopy('zh-CN').session
  const draft = '继续输入，后台停止不得提交或清除这段草稿。'
  const html = renderToStaticMarkup(
    <HbarPromptComposer
      value={draft}
      labels={copy.prompt}
      attachments={[]}
      submitting={false}
      uploading={false}
      canSubmit
      canStop={false}
      boundary="none"
      onChange={() => undefined}
      onRemoveAttachment={() => undefined}
      onSubmit={() => undefined}
      onStop={() => undefined}
      backgroundAction={
        <HbarComposerBackgroundAgentStop
          count={2}
          disabled={false}
          pending={false}
          labels={copy.backgroundAgents}
          onStop={() => undefined}
        />
      }
    />,
  )
  expect(html).toContain(draft)
  // The host-owned background stop and the native Send action are both
  // present and independently enabled. Their semantic names are the stable
  // contract; implementation CSS classes may vary across Lumen revisions.
  expect(html).toContain(`aria-label="${copy.backgroundAgents.stop(2)}"`)
  expect(html).toContain(`aria-label="${copy.prompt.send}"`)
  expect((html.match(/<button/g) ?? []).length).toBe(2)
  expect(html.indexOf(`aria-label="${copy.backgroundAgents.stop(2)}"`)).toBeLessThan(
    html.indexOf(`aria-label="${copy.prompt.send}"`),
  )
  expect(html).not.toContain('disabled=""')
  expect(html).not.toContain(`aria-label="${copy.prompt.stop}"`)
})
