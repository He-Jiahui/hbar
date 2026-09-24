import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenConversation, type LumenMessageProps } from '@lumen/app-ui'

const messages = (count: number): LumenMessageProps[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `message-${index}`,
    role: 'assistant',
    author: '助手',
    avatar: 'AI',
    copyLabel: '复制',
    children: `宿主提供的消息 ${index}`,
  }))

for (const count of [0, 1, 40, 41]) {
  test(`conversation keeps ${count} server-rendered messages accessible before browser measurement`, () => {
    const markup = renderToStaticMarkup(
      <LumenConversation
        title="包含很长本地化标题的会话历史区域"
        messages={messages(count)}
        empty={<p>尚无消息</p>}
        composer={<textarea aria-label="输入消息" />}
        latestLabel="查看最新消息"
        scrollKey="session-without-a-saved-anchor"
      />,
    )
    expect(markup.match(/data-message-id=/g) ?? []).toHaveLength(count)
    expect(markup.includes('尚无消息')).toBe(count === 0)
    expect(markup).toContain('aria-label="输入消息"')
    expect(markup).toContain('包含很长本地化标题的会话历史区域')
    expect(markup).not.toContain('lumen-conversation-latest')
  })
}

test('duplicate message IDs retain the first host record without duplicate content', () => {
  const original = messages(1)
  const duplicate: LumenMessageProps = {
    id: 'message-0',
    role: 'assistant',
    author: '助手',
    avatar: 'AI',
    copyLabel: '复制',
    children: '重复消息不应显示',
  }
  const markup = renderToStaticMarkup(
    <LumenConversation title="会话" messages={[...original, duplicate]} empty={null} composer={null} />,
  )
  expect(markup.match(/data-message-id=/g) ?? []).toHaveLength(1)
  expect(markup).toContain('宿主提供的消息 0')
  expect(markup).not.toContain('重复消息不应显示')
})
