import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenButton, LumenContentText } from '@lumen/app-ui'

const copy = {
  title: '确认本会话自动批准？',
  target: '优化 hbar desktop 的布局与弹窗阅读体验',
  before: '当前会话将',
  after: '持续自动批准需要审批的工具。服务端拒绝规则仍生效。',
  failed: '保存失败，原有会话策略已保留。请检查连接后重试。',
}

test('confirmation content keeps the host sentence and inline emphasis in an accessible reading flow', () => {
  const html = renderToStaticMarkup(
    <section aria-labelledby="confirmation-title" aria-describedby="confirmation-body">
      <LumenContentText context="dialog.title" id="confirmation-title">
        {copy.title}
      </LumenContentText>
      <LumenContentText context="dialog.body" id="confirmation-body">
        {copy.before}
        <strong>{copy.target}</strong>
        {copy.after}
      </LumenContentText>
    </section>,
  )
  expect(html).toContain('<h2')
  expect(html).toContain('aria-labelledby="confirmation-title" aria-describedby="confirmation-body"')
  expect(html).toContain(`${copy.before}<strong>${copy.target}</strong>${copy.after}`)
  expect(html).toContain('data-text-context="dialog.body"')
})

test('feedback retains host content, live-region semantics and the related field', () => {
  const html = renderToStaticMarkup(
    <>
      <input aria-label={copy.target} aria-describedby="failure" />
      <LumenContentText context="feedback.detail" role="alert" id="failure" tone="danger">
        {copy.failed}
      </LumenContentText>
    </>,
  )
  expect(html).toContain('aria-describedby="failure"')
  expect(html).toContain('role="alert"')
  expect(html).toContain('id="failure"')
  expect(html).toContain('data-tone="danger"')
  expect(html).toContain(copy.failed)
})

test('code retains original unicode and whitespace without a display-length budget', () => {
  const original = `第一行\n  ${'very-long-original-value'.repeat(100)}\n\t最后一行`
  const html = renderToStaticMarkup(<LumenContentText context="code.block">{original}</LumenContentText>)
  expect(html).toContain('<pre')
  expect(html).toContain(original)
})

test('actions own plain captions while a described option keeps its explicit reading component', () => {
  const html = renderToStaticMarkup(
    <LumenButton>
      {copy.title}
      <LumenContentText context="choice.description">{copy.after}</LumenContentText>
    </LumenButton>,
  )
  expect(html).toContain('data-text-context="control.label"')
  expect(html).toContain('data-text-context="choice.description"')
  expect(html).toContain(copy.title)
  expect(html).toContain(copy.after)
})
