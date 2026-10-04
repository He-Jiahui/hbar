import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { MessageMarkdown } from '../packages/app-react/src/message-markdown'
import { HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { HbarHistoricalPlanMessage } from '../packages/app-react/src/proposed-plan-message'
import { messageCodeBlock, CODE_BLOCK_PREVIEW_LINES } from '../packages/app-react/src/message-code-block-model'
import {
  sessionMarkdownRemarkPlugins,
  sessionMarkdownRehypePlugins,
  sessionMarkdownRehypeOptions,
  projectSessionFindText,
} from '../packages/app-react/src/session-find-text'
import { getShellCopy } from '../apps/web/src/shell-copy'

function parsed(markdown: string) {
  const values: NonNullable<ReturnType<typeof messageCodeBlock>>[] = []
  renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={sessionMarkdownRemarkPlugins}
      rehypePlugins={sessionMarkdownRehypePlugins}
      remarkRehypeOptions={sessionMarkdownRehypeOptions}
      components={{
        pre: ({ node, children }) => {
          const code = messageCodeBlock(node)
          if (code) values.push(code)
          return <pre>{children}</pre>
        },
      }}
    >
      {markdown}
    </ReactMarkdown>,
  )
  return values
}
const fence = (text: string, language = '') => `\`\`\`${language}\n${text}\n\`\`\``

test('parsed code excludes fences and prose without trimming intentional whitespace or entities', () => {
  const source = '  <node>&amp; 😀é\n\n'
  const block = parsed(`Before **prose**\n\n${fence(source, 'tsx title=example')}\n\nAfter`)[0]
  expect(block?.text).toBe(source)
  expect(block?.domText).toBe(`${source}\n`)
  expect(block?.language).toBe('tsx')
  expect(block?.lines).toBe(3)
  expect(block?.occurrenceId).toBe(String('Before **prose**\n\n'.length))
})

test('CRLF, lone CR, blank lines and indented/nested blocks come from the actual renderer AST', () => {
  expect(parsed('```\r\nfirst\r\nsecond\r\n\r\n```')[0]?.text).toBe('first\r\nsecond\r\n')
  expect(parsed('```\rfirst\rsecond\r```')[0]?.text).toBe('first\rsecond')
  expect(parsed('```\rfirst\rsecond\r```')[0]?.lines).toBe(2)
  expect(parsed('    first\n    second')[0]?.text).toBe('first\nsecond')
  expect(parsed('- Example\n\n  ```json\n  {"a": 1}\n  ```')[0]?.text).toBe('{"a": 1}')
  expect(parsed('> ```text\n> quoted code\n> ```')[0]?.text).toBe('quoted code')
})

test('empty, inline, duplicate and unfinished streaming code retain distinct semantic identities', () => {
  expect(parsed('Inline `code` only.')).toEqual([])
  expect(parsed('```\n```')[0]).toMatchObject({ text: '', domText: '', lines: 0 })
  const repeated = parsed(`${fence('same')}\n\n${fence('same')}`)
  expect(repeated).toHaveLength(2)
  expect(repeated[0]?.text).toBe(repeated[1]?.text)
  expect(repeated[0]?.occurrenceId).not.toBe(repeated[1]?.occurrenceId)
  expect(parsed('```ts\nconst streaming =')[0]?.text).toBe('const streaming =')
  expect(messageCodeBlock(undefined)).toBeNull()
})

for (const count of [1, 19, 20, 21, 25])
  test(`${count} parsed lines use the observed 20-line preview without truncating copy`, () => {
    const text = Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n')
    const block = parsed(fence(text))[0]
    expect(block?.text).toBe(text)
    expect(block?.lines).toBe(count)
    expect(block?.domText.slice(0, block.previewEnd)).toBe(
      `${text.split('\n').slice(0, CODE_BLOCK_PREVIEW_LINES).join('\n')}\n`,
    )
    if (count > 20) expect(block?.domText.slice(block.previewEnd)).toContain(`line ${count}`)
    else expect(block?.previewEnd).toBe(block?.domText.length)
  })

async function bodyText(html: string) {
  const plain = await new HTMLRewriter()
    .on('[data-session-find-exclude="code-chrome"]', {
      element: (element) => {
        element.remove()
      },
    })
    .transform(new Response(html))
    .text()
  let text = ''
  await new HTMLRewriter()
    .on('body', {
      text: (chunk) => {
        text += chunk.text
      },
    })
    .transform(new Response(`<body>${plain}</body>`))
    .text()
  return text.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (value) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" })[value] ?? value,
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale}: code actions have host copy and preserve exactly one source text stream for Find`, async () => {
    const labels = getShellCopy(locale).session.messageBlocks.codeBlock
    const source = `Before **bold**\n\n${fence('const a = "<&😀>"', 'typescript')}\n\n${fence(Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n'))}\n\nAfter`
    const html = renderToStaticMarkup(
      <MessageMarkdown
        text={source}
        findSegmentId="text:0"
        code={{ sessionId: 's', messageId: 'm', segmentId: 'text:0', labels }}
      />,
    )
    expect(html.match(/data-code-occurrence=/g)).toHaveLength(2)
    expect(html.match(/data-copy-status="idle"/g)).toHaveLength(2)
    expect(html).toContain(labels.copy)
    expect(html).toContain(labels.lines(25))
    expect(html).toContain(labels.showMore(5))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/data-code-tail="" hidden=""/)
    expect(await bodyText(html)).toBe(projectSessionFindText(source).domText)
    expect(projectSessionFindText(source).text).not.toContain(labels.copy)
  })
  test(`${locale}: empty and whitespace code never offer a false successful Copy`, () => {
    const labels = getShellCopy(locale).session.messageBlocks.codeBlock
    for (const text of ['', ' ', '\n\t']) {
      const html = renderToStaticMarkup(
        <MessageMarkdown text={fence(text)} code={{ sessionId: 's', messageId: 'm', segmentId: 'text:0', labels }} />,
      )
      expect(html).not.toContain('data-copy-status')
      expect(html).not.toContain(labels.copy)
      expect(html).toContain('hbar-message-code-body')
    }
  })
  test(`${locale}: ordinary multi-block messages and historical Plan documents share the entry`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const ordinary = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        labels={labels}
        blocks={[
          { type: 'text', text: fence('first') },
          { type: 'text', text: fence('second') },
        ]}
      />,
    )
    expect(ordinary.match(/data-copy-status="idle"/g)).toHaveLength(2)
    const plan = renderToStaticMarkup(
      <HbarHistoricalPlanMessage
        sessionId="s"
        messageId="p"
        labels={labels}
        readOnlyLabel="Historical plan"
        blocks={[
          {
            type: 'text',
            text: `${fence('before')}\n<proposed_plan>\n${fence('document')}\n</proposed_plan>\n${fence('after')}`,
          },
        ]}
      />,
    )
    expect(plan.match(/data-copy-status="idle"/g)).toHaveLength(3)
    expect(plan).toContain('data-session-find-segment="proposal"')
    expect(plan).toContain('data-session-find-segment="text:0:before"')
    expect(plan).toContain('data-session-find-segment="text:0:after"')
  })
}

test('long localized action/metadata text stays whole, with no technical fallback label', () => {
  const base = getShellCopy('zh-CN').session.messageBlocks.codeBlock
  const copy = '复制当前代码块已经加载的完整代码，不包含前后说明或其他代码块'
  const html = renderToStaticMarkup(
    <MessageMarkdown
      text={fence('code')}
      code={{ sessionId: 's', messageId: 'm', segmentId: 'text:0', labels: { ...base, copy } }}
    />,
  )
  expect(html).toContain(copy)
  expect(html).toContain(base.language(null))
})
