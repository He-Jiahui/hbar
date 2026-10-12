import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createMessageScope } from './messages'

interface TestMessages {
  readonly title: string
  readonly count: (count: number, label: string) => string
}

const { Provider, useMessages, useOptionalMessages } = createMessageScope<TestMessages>()

function MessageExample() {
  const { t } = useMessages()
  return createElement('p', null, `${t('title')}:${t('count')(2, 'runs')}`)
}

function OptionalMessageExample() {
  const messages = useOptionalMessages()
  return createElement('p', null, messages ? messages.t('title') : 'No message scope')
}

describe('host message scopes', () => {
  it('reads the current host copy and preserves formatter argument types', () => {
    const html = renderToStaticMarkup(
      createElement(Provider, {
        messages: {
          title: '运行',
          count: (count, label) => `${label}：${count}`,
        },
        children: createElement(MessageExample),
      }),
    )

    expect(html).toBe('<p>运行:runs：2</p>')
  })

  it('requires a host provider instead of supplying library fallback copy', () => {
    expect(() => renderToStaticMarkup(createElement(MessageExample))).toThrow(
      'A host message scope provider is required for this feature.',
    )
  })

  it('allows an explicitly optional host scope to be absent', () => {
    expect(renderToStaticMarkup(createElement(OptionalMessageExample))).toBe('<p>No message scope</p>')
  })

  it('uses replacement host messages after a locale change', () => {
    const englishHtml = renderToStaticMarkup(
      createElement(Provider, {
        messages: { title: 'Runs', count: (count, label) => `${label}: ${count}` },
        children: createElement(MessageExample),
      }),
    )
    const chineseHtml = renderToStaticMarkup(
      createElement(Provider, {
        messages: { title: '运行', count: (count, label) => `${label}：${count}` },
        children: createElement(MessageExample),
      }),
    )

    expect(englishHtml).toBe('<p>Runs:runs: 2</p>')
    expect(chineseHtml).toBe('<p>运行:runs：2</p>')
  })
})
