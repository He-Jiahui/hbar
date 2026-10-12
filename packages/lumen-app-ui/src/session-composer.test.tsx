import { describe, expect, it, vi } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import { LumenPromptComposer, type LumenPromptComposerProps } from './session-components'

const labels = {
  input: '消息',
  placeholder: '输入消息',
  send: '发送',
  submitTitle: '发送当前消息',
  stop: '停止当前运行',
  uploading: '上传中',
  addAttachment: '添加附件',
  removeAttachment: () => '移除附件',
}
const runningActions = {
  submit: 'queue' as const,
  queueLabel: '加入队列',
  queueTitle: '等待当前运行完成后处理',
}
const defaults: LumenPromptComposerProps = {
  value: '原会话草稿',
  labels,
  attachments: [],
  submitting: false,
  uploading: false,
  canSubmit: true,
  canStop: true,
  onChange() {},
  onSubmit() {},
  onStop() {},
  onRemoveAttachment() {},
}

describe('LumenPromptComposer running actions', () => {
  const { render } = createRenderer()

  it('keeps the compatibility boundary with a continuous surface instead of edge lamps', () => {
    render(<LumenPromptComposer {...defaults} />)
    const form = screen.getByRole('textbox', { name: labels.input }).closest('form')
    expect(form?.getAttribute('data-boundary')).to.equal('horizontal')
    expect(
      Array.from(form?.children ?? [])
        .map((child) => child.getAttribute('data-edge'))
        .filter(Boolean),
    ).to.deep.equal([])
    expect(form).to.have.class('lumen-surface')
  })

  it('preserves input and submit when boundary is none', async () => {
    const onSubmit = vi.fn()
    const { user } = render(<LumenPromptComposer {...defaults} boundary="none" canStop={false} onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: labels.input })
    const form = input.closest('form')
    expect(form?.getAttribute('data-boundary')).to.equal('none')
    expect(form?.getAttribute('data-interactive')).to.equal('true')
    expect(Array.from(form?.children ?? []).filter((child) => child.hasAttribute('data-edge'))).to.have.length(0)
    await user.click(input)
    expect(input).to.equal(document.activeElement)
    await user.click(screen.getByRole('button', { name: labels.send }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('preserves the legacy Stop and Send controls when the optional contract is omitted', () => {
    render(<LumenPromptComposer {...defaults} />)
    expect(screen.getByRole('button', { name: labels.stop })).not.to.equal(null)
    expect(screen.getByRole('button', { name: labels.send })).not.to.equal(null)
  })

  it('keeps a host background action next to Send outside the scrolling control rail', async () => {
    const onBackgroundStop = vi.fn()
    const { user } = render(
      <LumenPromptComposer
        {...defaults}
        canStop={false}
        backgroundAction={
          <button type="button" onClick={onBackgroundStop}>
            {labels.stop}
          </button>
        }
      />,
    )
    const stop = screen.getByRole('button', { name: labels.stop })
    const send = screen.getByRole('button', { name: labels.send })
    expect(stop.closest('.lumen-composer-control-rail')).to.equal(null)
    expect(stop.parentElement).to.equal(send.parentElement)
    await user.click(stop)
    expect(onBackgroundStop).toHaveBeenCalledTimes(1)
  })

  it('shows only Stop for an empty running draft and Enter never cancels or submits it', async () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    const { user } = render(
      <LumenPromptComposer
        {...defaults}
        value=""
        onSubmit={onSubmit}
        onStop={onStop}
        runningActions={{ ...runningActions, submit: 'hidden' }}
      />,
    )
    expect(screen.queryByRole('button', { name: labels.send })).to.equal(null)
    expect(screen.queryByRole('button', { name: runningActions.queueLabel })).to.equal(null)
    await user.click(screen.getByRole('textbox', { name: labels.input }))
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(0)
    expect(onStop).toHaveBeenCalledTimes(0)
    await user.click(screen.getByRole('button', { name: labels.stop }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(0)
  })

  it('uses the same callback for queued Enter and the named queue button, with Stop last', async () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    const { user } = render(
      <LumenPromptComposer {...defaults} runningActions={runningActions} onSubmit={onSubmit} onStop={onStop} />,
    )
    const queue = screen.getByRole('button', { name: runningActions.queueLabel })
    const stop = screen.getByRole('button', { name: labels.stop })
    expect(screen.queryByRole('button', { name: labels.send })).to.equal(null)
    expect(queue.closest('.lumen-composer-control-rail')).not.to.equal(null)
    expect(stop.closest('.lumen-composer-control-rail')).to.equal(null)
    expect(queue.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).not.to.equal(0)
    await user.click(queue)
    await user.click(screen.getByRole('textbox', { name: labels.input }))
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(onStop).toHaveBeenCalledTimes(0)
    await user.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('retains normal Send when no run is active and ignores Shift+Enter', async () => {
    const onSubmit = vi.fn()
    const { user } = render(
      <LumenPromptComposer {...defaults} canStop={false} runningActions={runningActions} onSubmit={onSubmit} />,
    )
    expect(screen.queryByRole('button', { name: labels.stop })).to.equal(null)
    expect(screen.queryByRole('button', { name: runningActions.queueLabel })).to.equal(null)
    await user.click(screen.getByRole('textbox', { name: labels.input }))
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSubmit).toHaveBeenCalledTimes(0)
    await user.click(screen.getByRole('button', { name: labels.send }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('accepts a host-owned editor without replacing the existing Send control', async () => {
    const onSubmit = vi.fn()
    const { user } = render(
      <LumenPromptComposer
        {...defaults}
        canStop={false}
        editor={({ inputLabel, onSubmit: submit }) => (
          <div
            role="textbox"
            aria-label={inputLabel}
            contentEditable
            tabIndex={0}
            data-testid="rich-composer-editor"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submit()
              }
            }}
          />
        )}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getAllByRole('textbox')).to.have.length(1)
    expect(screen.getByTestId('rich-composer-editor')).not.to.equal(null)
    expect(screen.queryByPlaceholderText(labels.placeholder)).to.equal(null)
    await user.click(screen.getByRole('textbox', { name: labels.input }))
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: labels.send }))
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('passes the submission gate and disabled state into a rich editor', async () => {
    const onSubmit = vi.fn()
    const { user } = render(
      <LumenPromptComposer
        {...defaults}
        disabled
        canStop={false}
        editor={({ inputLabel, disabled, onSubmit: submit }) => (
          <button type="button" aria-label={inputLabel} data-editor-disabled={disabled} onClick={submit} />
        )}
        onSubmit={onSubmit}
      />,
    )
    const editor = screen.getByRole('button', { name: labels.input })
    expect(editor.getAttribute('data-editor-disabled')).to.equal('true')
    await user.click(editor)
    expect(onSubmit).toHaveBeenCalledTimes(0)
  })

  it('can queue an attachment-only draft and preserves the host-owned long translated label', async () => {
    const onSubmit = vi.fn()
    const queueLabel = '在当前会话正在执行的任务完成之后，把这份附件加入后续处理队列'
    const { user } = render(
      <LumenPromptComposer
        {...defaults}
        value=""
        attachments={[{ id: 'file', kind: 'file', name: '排队附件.md' }]}
        runningActions={{ ...runningActions, queueLabel }}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByText('排队附件.md')).not.to.equal(null)
    await user.click(screen.getByRole('button', { name: queueLabel }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps Stop disabled while the host is resolving its cancellation', () => {
    render(<LumenPromptComposer {...defaults} stopping runningActions={{ ...runningActions, submit: 'hidden' }} />)
    expect(screen.getByRole('button', { name: labels.stop })).to.have.property('disabled', true)
  })

  for (const block of [{ uploading: true }, { submitting: true }, { canSubmit: false }, { disabled: true }]) {
    it(`blocks queued submission for ${Object.keys(block)[0]}`, async () => {
      const onSubmit = vi.fn()
      const { user } = render(
        <LumenPromptComposer {...defaults} {...block} runningActions={runningActions} onSubmit={onSubmit} />,
      )
      expect(screen.getByRole('button', { name: runningActions.queueLabel })).to.have.property('disabled', true)
      await user.click(screen.getByRole('textbox', { name: labels.input }))
      await user.keyboard('{Enter}')
      expect(onSubmit).toHaveBeenCalledTimes(0)
    })
  }
})
