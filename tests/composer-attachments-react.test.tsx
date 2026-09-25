import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionDraftState } from '@hbar/app-runtime'
import { HbarComposerAttachmentTransfers } from '../packages/app-react/src/composer-attachments'
import { getShellCopy } from '../apps/web/src/shell-copy'

type Transfer = SessionDraftState['attachmentTransfers'][number]
const transfer = (status: Transfer['status'], index = 0): Transfer => ({
  id: `reservation-${index}`,
  ownerRevision: 1,
  originalOperationId: null,
  name: `${index}-长文件名与本地化状态不会替换原操作目标.txt`,
  mime: 'text/plain',
  size: 4,
  status,
  kind: 'file',
  upload: null,
  confirmed: null,
  error: status === 'unknown' ? 'CONNECTION_CLOSED' : null,
})
function render(transfers: readonly Transfer[], locale: 'en-US' | 'zh-CN' = 'zh-CN') {
  return renderToStaticMarkup(
    <HbarComposerAttachmentTransfers
      transfers={transfers}
      labels={getShellCopy(locale).session.attachments}
      connected
      onRemove={() => {}}
      onReconcile={() => {}}
      onAccept={() => {}}
    />,
  )
}
test('attachment feedback has an explicit empty state, per-file names and localized recovery rather than silent failure', () => {
  expect(render([])).toBe('')
  const unknown = transfer('unknown')
  const labels = getShellCopy('zh-CN').session.attachments
  const html = render([unknown])
  expect(html).toContain(labels.status('unknown'))
  expect(html).toContain(labels.reconcile(unknown.name))
  expect(html).toContain(labels.error('CONNECTION_CLOSED'))
  expect(html).not.toContain(labels.remove(unknown.name))
  expect(html).not.toContain('src=')
  expect(render([transfer('failed')])).toContain(labels.remove(unknown.name))
  expect(render([transfer('ready')])).toContain(labels.acceptNamed(unknown.name))
})
test('the twelve-reservation boundary keeps every original label in the pane-owned transfer queue', () => {
  const transfers = Array.from({ length: 12 }, (_, index) => transfer(index % 2 === 0 ? 'preparing' : 'failed', index))
  const html = render(transfers, 'en-US')
  expect(html.match(/role="listitem"/g)).toHaveLength(12)
  for (const item of transfers) expect(html).toContain(item.name)
  expect(html).toContain(getShellCopy('en-US').session.attachments.label)
  expect(html).not.toContain('上传结果待核对')
})
