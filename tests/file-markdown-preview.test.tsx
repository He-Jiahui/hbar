import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarFileMarkdownPreview,
  canRenderFileMarkdown,
  FILE_MARKDOWN_PREVIEW_BYTES,
  isMarkdownFile,
  resolveMarkdownFileLink,
} from '../packages/app-react/src/file-markdown-preview'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('file Markdown renders semantic content and never loads or executes embedded resources', () => {
  const labels = getShellCopy('zh-CN').files
  const html = renderToStaticMarkup(
    <HbarFileMarkdownPreview
      path="长名字-项目说明.md"
      label={labels.textPreview('长名字-项目说明.md')}
      imageLabel={labels.markdownImage}
      openFileLabel={labels.openLinkedFile}
      onOpenFile={() => {}}
      value={
        '# 项目说明\n\n1. **检查**长标题和内容自然换行。\n\n| 状态 | 动作 |\n|---|---|\n| 草稿 | 审核 |\n\n```ts\nconst ready = true\n```\n\n![很长的中文图片说明](https://example.invalid/pixel.png)\n\n[链接](javascript:alert(1))\n\n<script>alert(1)</script>\n<iframe src="https://example.invalid"></iframe>\n'
      }
    />,
  )
  expect(html).toContain('<h1>项目说明</h1>')
  expect(html).toContain('<ol>')
  expect(html).toContain('<strong>检查</strong>')
  expect(html).toContain('<table>')
  expect(html).toContain('const ready = true')
  expect(html).toContain('图片未加载：很长的中文图片说明')
  expect(html).not.toMatch(/<(?:img|script|iframe)|\shref=|\ssrc=/)
})

test('file Markdown empty, single, long and exact UTF-8 capacity are explicit without text truncation', () => {
  expect(isMarkdownFile('README.MARKDOWN')).toBe(true)
  expect(isMarkdownFile('notes.mdx')).toBe(false)
  expect(canRenderFileMarkdown('README.md', '')).toBe(true)
  expect(canRenderFileMarkdown('README.md', '# One')).toBe(true)
  expect(canRenderFileMarkdown('file.ts', '# One')).toBe(false)
  expect(canRenderFileMarkdown('README.md', 'a'.repeat(FILE_MARKDOWN_PREVIEW_BYTES))).toBe(true)
  expect(canRenderFileMarkdown('README.md', 'a'.repeat(FILE_MARKDOWN_PREVIEW_BYTES + 1))).toBe(false)
  expect(canRenderFileMarkdown('README.md', '读'.repeat(Math.floor(FILE_MARKDOWN_PREVIEW_BYTES / 3)))).toBe(true)
  expect(canRenderFileMarkdown('README.md', '读'.repeat(Math.floor(FILE_MARKDOWN_PREVIEW_BYTES / 3) + 1))).toBe(false)
  for (const value of [
    '',
    '# One',
    Array.from({ length: 50 }, (_, i) => `## Section ${i}\n\nLong content — 长内容\n`).join('\n'),
  ]) {
    const html = renderToStaticMarkup(
      <HbarFileMarkdownPreview
        path="README.md"
        label="Document"
        value={value}
        imageLabel={(alt) => alt}
        openFileLabel={(path) => path}
        onOpenFile={() => {}}
      />,
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    if (value) expect(html).toContain(value.startsWith('# One') ? '<h1>One</h1>' : 'Section 49')
  }
})

test('Markdown links keep the original document-relative target and do not authorize traversal or resource loading', () => {
  expect(resolveMarkdownFileLink('docs/README.md', '../other.txt#details')).toBe('other.txt')
  expect(resolveMarkdownFileLink('docs/README.md', './长名字%20文件.md')).toBe('docs/长名字 文件.md')
  for (const href of [
    '../../secret',
    '/absolute',
    'C:/secret',
    'file:///secret',
    'javascript:alert(1)',
    '//remote',
    '%2fabsolute',
    '%2e%2e/%2e%2e/secret',
    '#footnote',
    'invalid%',
  ])
    expect(resolveMarkdownFileLink('docs/README.md', href)).toBeNull()
  const html = renderToStaticMarkup(
    <HbarFileMarkdownPreview
      path="docs/README.md"
      value="[Original target](../other.txt), [Sibling](other.txt) and [external](https://example.invalid)"
      label="Document"
      imageLabel={(alt) => alt}
      openFileLabel={(path) => `Open ${path}`}
      onOpenFile={() => {}}
    />,
  )
  expect(html).toContain('aria-label="Open other.txt"')
  expect(html).toContain('aria-label="Open docs/other.txt"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noreferrer noopener"')
})
