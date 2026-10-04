import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import {
  sessionMarkdownRemarkPlugins,
  sessionMarkdownRehypePlugins,
  sessionMarkdownRehypeOptions,
  projectSessionFindText,
} from '../packages/app-react/src/session-find-text'

function render(text: string) {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={sessionMarkdownRemarkPlugins}
      rehypePlugins={sessionMarkdownRehypePlugins}
      remarkRehypeOptions={sessionMarkdownRehypeOptions}
    >
      {text}
    </ReactMarkdown>,
  )
}

test('bare prose links stop before Chinese punctuation without dropping visible text', () => {
  const text = '打开 https://example.invalid/docs，然后继续。'
  expect(render(text)).toBe(
    '<p>打开 <a href="https://example.invalid/docs">https://example.invalid/docs</a>，然后继续。</p>',
  )
  expect(projectSessionFindText(text).text).toBe(text)
})

test('explicit Markdown destinations remain unchanged while malformed autolinks are split', () => {
  const explicit = render('[链接](https://example.invalid/docs，然后继续。)')
  expect(explicit).toContain(`href="${new URL('https://example.invalid/docs，然后继续。').href}"`)
  expect(render('https://example.invalid/docs，然后继续。')).toContain(
    '<a href="https://example.invalid/docs">https://example.invalid/docs</a>，然后继续。',
  )
})

test('typed explicit labels, angle links, inline code and fences are not rewritten as prose', () => {
  expect(render('[https://example.invalid/，](https://destination.invalid/)')).toContain(
    'href="https://destination.invalid/"',
  )
  expect(render('<https://example.invalid/，>')).toContain('href="https://example.invalid/%EF%BC%8C"')
  expect(render('`curl http://localhost:3000`')).not.toContain('<a')
  expect(render('```\nhttps://example.invalid/docs，然后继续。\n```')).not.toContain('<a')
  expect(render('javascript:alert(1)')).not.toContain('<a')
  expect(render('[danger](javascript:alert(1))')).not.toContain('href="javascript:')
  expect(render('https://x:99999')).not.toContain('<a')
})

test('Chinese paths, authority-adjacent prose, multiple links and Unicode Find text stay consistent', () => {
  for (const text of [
    '在 http://localhost:3000上运行。',
    '中文路径 https://example.invalid/文档?q=是，然后继续。',
    'https://a.invalid/a，https://b.invalid/b。',
    '（https://example.invalid/Foo_(bar)）继续😀é',
    '嵌套 **打开 https://example.invalid/docs，然后继续。**',
  ]) {
    const html = render(text)
    expect(html).not.toMatch(/href="[^"]*(?:%EF%BC%8C|%E3%80%82)/)
    expect(projectSessionFindText(text).text).toBe(text.replaceAll('**', ''))
  }
})

test('dense adjacent CJK links preserve complete text without repeated child-array insertion', () => {
  const text = 'https://example.invalid/a，'.repeat(2_000)
  const html = render(text)
  expect(html.match(/href="https:\/\/example.invalid\/a"/g)).toHaveLength(2_000)
  expect(projectSessionFindText(text).text).toBe(text)
})
