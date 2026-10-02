import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { MessageMarkdown } from '../packages/app-react/src/message-markdown'
import { MessageLiteralText } from '../packages/app-react/src/message-literal-text'
import { projectSessionFindText } from '../packages/app-react/src/session-find-text'
import type { MessageFileReferenceContext } from '../packages/app-react/src/message-file-reference'

const text =
  '查看 src/main.ts:2，`src/main.ts:80:4`，[尾部](src/main.ts:110)。\n\n```ts\nsrc/main.ts:3\n```\n\n`bun test src/main.ts` https://example.org/src/main.ts:2'
const context: MessageFileReferenceContext = {
  owner: {},
  targetKey: 'source-message',
  labels: getShellCopy('zh-CN').session.fileReferences,
  onOpen: () => Promise.resolve(),
}

test('serialized Goal/Plan instructions stay literal instead of exposing false file actions', () => {
  const prompt = `/tool exit_plan_mode ${JSON.stringify({ plan: '# 先计划，再执行\n\n- 明确当前状态。' })}`
  const html = renderToStaticMarkup(<MessageLiteralText text={prompt} fileReferences={context} />)
  expect(html).not.toContain('hbar-message-file-link')
  expect(html).toContain('再执行\\n\\n-')
})

test('host-owned Chinese file links preserve text and sanitized external URL/code boundaries', () => {
  const html = renderToStaticMarkup(<MessageMarkdown text={text} fileReferences={context} />)
  expect(html.match(/class="hbar-message-file-link"/g)).toHaveLength(3)
  expect(html).toContain('aria-label="打开文件 src/main.ts，第 80 行，第 4 列"')
  expect(html).toContain('target="_blank" rel="noreferrer noopener"')
  expect(html).not.toContain('href="src/main.ts')
  expect(html).toContain('<code>bun test src/main.ts</code>')
  expect(projectSessionFindText(text).text).toContain('src/main.ts:80:4')
})

test('missing navigation capability leaves references unadorned; streaming never links prose fragments', () => {
  const plain = renderToStaticMarkup(<MessageMarkdown text={text} />)
  expect(plain).not.toContain('hbar-message-file-link')
  const streaming = renderToStaticMarkup(
    <MessageMarkdown text={text} fileReferences={{ ...context, streaming: true }} />,
  )
  expect(streaming.match(/class="hbar-message-file-link"/g)).toHaveLength(2)
  const literal = renderToStaticMarkup(
    <MessageLiteralText
      text={'**authored** src/main.ts:2\nhttps://example.org/src/main.ts'}
      fileReferences={context}
    />,
  )
  expect(literal).toContain('**authored**')
  expect(literal.match(/class="hbar-message-file-link"/g)).toHaveLength(1)
})

test('English and long host labels do not replace authored path text or permit executable schemes', () => {
  const english = { ...context, labels: getShellCopy('en-US').session.fileReferences }
  const html = renderToStaticMarkup(
    <MessageMarkdown
      text={'[file](src/main.ts:2) [bad](javascript:alert(1)) [escape](../outside.ts)'}
      fileReferences={english}
    />,
  )
  expect(html).toContain('aria-label="Open file src/main.ts, line 2"')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('href="../outside.ts"')
  expect(html.match(/class="hbar-message-file-link"/g)).toHaveLength(1)
  const long = renderToStaticMarkup(
    <MessageLiteralText
      text={'src/main.ts:2'}
      fileReferences={{ ...context, labels: { ...context.labels, open: () => '很长的宿主提供标签'.repeat(20) } }}
    />,
  )
  expect(long).toContain('src/main.ts:2</a>')
})
