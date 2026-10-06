import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageMarkdown, MessageInlineMarkdown } from '../packages/app-react/src/message-markdown'
import { MessageLiteralText } from '../packages/app-react/src/message-literal-text'
import { ToolOutputImageLinks } from '../packages/app-react/src/tool-output-image-links'
import { MessageImagePreviewProvider } from '../packages/app-react/src/message-image-preview-context'
import { imageLinkSource, remoteImageSource } from '../packages/app-react/src/message-image-preview-model'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'

const image = 'https://images.hbar.invalid/图像.PNG?signature=abc#original'
function render(text: string, kind: 'markdown' | 'literal' | 'tool' = 'markdown') {
  const copy = sessionImageCopy('zh-CN')
  return renderToStaticMarkup(
    <MessageImagePreviewProvider
      labels={{
        loading: copy.loading.repeat(8),
        failed: copy.error('READ_FAILED'),
        retry: copy.retry,
        open: copy.open,
      }}
    >
      {kind === 'markdown' ? (
        <MessageMarkdown text={text} />
      ) : kind === 'literal' ? (
        <MessageLiteralText text={text} />
      ) : (
        <ToolOutputImageLinks text={text} />
      )}
    </MessageImagePreviewProvider>,
  )
}

test('direct image links recognize case, query, fragment and encoded names while rejecting unsupported addresses', () => {
  expect(imageLinkSource(image)).toBe(new URL(image).href)
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'apng', 'bmp', 'ico'])
    expect(imageLinkSource(`https://images.hbar.invalid/picture.${extension}`)).not.toBeNull()
  expect(imageLinkSource('https://images.hbar.invalid/图像%2Epng?x=1')).not.toBeNull()
  expect(remoteImageSource('https://images.hbar.invalid/download?id=1')).not.toBeNull()
  for (const value of [
    'https://hbar.invalid/page',
    'https://hbar.invalid/a.png/read',
    'https://hbar.invalid/?file=a.png',
  ])
    expect(imageLinkSource(value)).toBeNull()
  for (const value of [
    'file:///C:/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/a.png',
    'https://user:password@hbar.invalid/a.png',
    'http://[broken]/a.png',
  ])
    expect(remoteImageSource(value)).toBeNull()
})

test('Markdown, literal prompts and tool outputs automatically show bounded lazy images with host copy', () => {
  for (const kind of ['markdown', 'literal', 'tool'] as const)
    for (const count of [0, 1, 4, 12, 13]) {
      const text = Array.from(
        { length: count },
        (_, index) => `https://images.hbar.invalid/same.png?occurrence=${index}`,
      ).join('\n')
      const html = render(text, kind)
      expect((html.match(/<img /g) ?? []).length).toBe(Math.min(count, 12))
      expect((html.match(/loading="lazy"/g) ?? []).length).toBe(Math.min(count, 12))
      expect(html).not.toContain('<link rel="preload"')
      if (count) expect(html).toContain(sessionImageCopy('zh-CN').loading)
      if (kind !== 'tool' && count === 13) expect(html).toContain('occurrence=12')
    }
})

test('authored images allow extensionless sources, preserve alt and linked-image destinations without nesting anchors', () => {
  const html = render(
    '![参考图片](https://images.hbar.invalid/download?id=1)\n\n[图片链接](https://images.hbar.invalid/a.png)',
  )
  expect((html.match(/<img /g) ?? []).length).toBe(2)
  expect(html).toContain('alt="参考图片"')
  expect(html).toContain('图片链接')
  const linked = render('[![参考](https://images.hbar.invalid/a.png)](https://hbar.invalid/view)')
  expect((linked.match(/<img /g) ?? []).length).toBe(1)
  expect((linked.match(/<a /g) ?? []).length).toBe(1)
  expect(linked).toContain('href="https://hbar.invalid/view"')
  const bounded = render(
    Array.from(
      { length: 13 },
      (_, index) =>
        `[![Picture ${index}](https://images.hbar.invalid/image.png?index=${index})](https://hbar.invalid/view?index=${index})`,
    ).join('\n\n'),
  )
  expect((bounded.match(/<img /g) ?? []).length).toBe(12)
  expect((bounded.match(/<a /g) ?? []).length).toBe(13)
  expect(bounded).toContain('Picture 12</span>')
})

test('inline disclosure captions and Markdown code examples make no image elements or preloads', () => {
  expect(
    render(`\`https://images.hbar.invalid/a.png\`\n\n\`\`\`md\n![code](https://images.hbar.invalid/b.png)\n\`\`\``),
  ).not.toContain('<img ')
  const inline = renderToStaticMarkup(<MessageInlineMarkdown text={`![alt](${image}) ${image}`} />)
  expect(inline).not.toContain('<img ')
  expect(inline).not.toContain('rel="preload"')
})
