import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar } from 'lucide-react'
import { LumenContentText, LumenIcon, type LumenContentTextProps } from '@lumen/app-ui'
import { LumenContentText as UiContentText } from '@lumen/app-ui/ui'

const copy = {
  heading: '运行历史与当前会话的详细说明',
  author: '用户提供的会话作者',
  description: '记录保留完整文字；辅助说明可以自然换行，编辑值与显示文案来自各自的宿主。',
  empty: '没有符合条件的记录',
  time: '2026年10月6日 13:24',
}

test('a section title keeps its content role while following document heading hierarchy', () => {
  const html = renderToStaticMarkup(
    <LumenContentText context="section.title" level={3} id="history-heading">
      {copy.heading}
    </LumenContentText>,
  )
  expect(html).toMatch(/^<h3\b/)
  expect(html).toContain('id="history-heading"')
  expect(html).toContain('data-text-context="section.title"')
  expect(html).toContain('data-text-flow="single"')
  expect(html).toContain(copy.heading)
})

test('bidirectional content keeps native isolation within its explicit inline role', () => {
  const branch = 'feature/مرحبا-with-localized-content'
  const html = renderToStaticMarkup(<LumenContentText context="inline.isolated">{branch}</LumenContentText>)
  expect(html).toMatch(/^<bdi\b/)
  expect(html).toContain('data-text-context="inline.isolated"')
  expect(html).toContain('data-text-flow="inline"')
  expect(html).toContain(branch)
})

test('time metadata retains machine-readable time independently of localized content', () => {
  const html = renderToStaticMarkup(
    <LumenContentText context="metadata.time" dateTime="2026-10-06T05:24:00Z">
      {copy.time}
    </LumenContentText>,
  )
  expect(html).toMatch(/^<time\b/)
  expect(html).toContain('dateTime="2026-10-06T05:24:00Z"')
  expect(html).toContain(copy.time)
})

test('host-owned collection text distinguishes a stable caption from a reading description', () => {
  const html = renderToStaticMarkup(
    <>
      <LumenContentText context="collection.title">{copy.author}</LumenContentText>
      <LumenContentText context="collection.description">{copy.description}</LumenContentText>
      <LumenContentText context="empty.description" role="status">
        {copy.empty}
      </LumenContentText>
    </>,
  )
  expect(html).toContain('data-text-context="collection.title" data-text-flow="single"')
  expect(html).toContain('data-text-context="collection.description" data-text-flow="reading"')
  expect(html).toContain('role="status"')
  expect(html).toContain(copy.description)
  expect(html).toContain(copy.empty)
})

test('inline emphasis preserves one host sentence rather than introducing a paragraph', () => {
  const html = renderToStaticMarkup(
    <LumenContentText context="dialog.body">
      {copy.author}
      <LumenContentText context="inline.emphasis">{copy.heading}</LumenContentText>
      {copy.description}
    </LumenContentText>,
  )
  expect(html.match(/<p\b/g)).toHaveLength(1)
  expect(html).toContain('<em')
  expect(html).toContain('data-text-flow="inline"')
  expect(html.indexOf(copy.author)).toBeLessThan(html.indexOf(copy.heading))
  expect(html.indexOf(copy.heading)).toBeLessThan(html.indexOf(copy.description))
})

test('detail values, literal paths and code keep their individual content and reading policy', () => {
  const value = 'C:\\用户项目\\' + '非常长的真实目录名称'.repeat(30)
  const source = `第一行\n  ${value}\n\t最后一行`
  const html = renderToStaticMarkup(
    <>
      <LumenContentText context="detail.term">{copy.heading}</LumenContentText>
      <LumenContentText context="detail.value">{value}</LumenContentText>
      <LumenContentText context="resource.path">{value}</LumenContentText>
      <LumenContentText context="code.block">{source}</LumenContentText>
    </>,
  )
  expect(html).toContain('<dt')
  expect(html).toContain('<dd')
  expect(html).toContain(value)
  expect(html).toContain(source)
  expect(html).toContain('data-text-context="resource.path" data-text-flow="single"')
  expect(html).toContain('data-text-context="code.block" data-text-flow="code"')
})

test('the UI public entry exposes the same semantic renderer and excludes heading levels on metadata', () => {
  expect(UiContentText).toBe(LumenContentText)
  const metadata: LumenContentTextProps<'metadata'> = { context: 'metadata', children: copy.time }
  const level: undefined = metadata.level
  expect(level).toBeUndefined()
  expect(renderToStaticMarkup(<LumenContentText {...metadata} />)).toContain(copy.time)
})

test.each(['xs', 'sm', 'md', 'lg', 'xl'] as const)(
  'icons expose the shared %s tier without changing their hit area',
  (tier) => {
    const html = renderToStaticMarkup(<LumenIcon icon={Calendar} tier={tier} />)
    expect(html).toContain(`data-tier="${tier}"`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toMatch(/^<svg\b/)
    expect(html).toContain('focusable="false"')
    expect(html).not.toContain('<button')
  },
)
