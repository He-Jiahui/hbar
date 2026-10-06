import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenConversation, type LumenMessageProps } from '@lumen/app-ui'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'
import LumenProvider from '@lumen/app-ui/provider'
import '../../packages/hbar-app-ui/src/theme.css'

const copyByLocale = {
  en: {
    title: 'Conversation stability fixture',
    author: 'Assistant',
    copy: 'Copy',
    empty: 'No messages yet',
    composer: 'Message',
    latest: 'View latest',
    body: 'Host-owned test content that can grow after deferred rendering.',
  },
  zh: {
    title: '会话稳定性验证',
    author: '助手',
    copy: '复制',
    empty: '暂无消息',
    composer: '输入消息',
    latest: '查看最新消息',
    body: '宿主提供的测试内容，在延迟渲染后会增长，用于验证阅读位置是否保持稳定。',
  },
} as const

const copy = document.documentElement.lang.startsWith('zh') ? copyByLocale.zh : copyByLocale.en

export interface ConversationFixtureOptions {
  readonly count: number
  readonly first: number
  readonly session: string
  readonly followLatest: boolean
}

export interface ConversationFixtureApi {
  configure(options: Partial<ConversationFixtureOptions>): void
  expand(id: string): void
}

declare global {
  interface Window {
    conversationStabilityFixture: ConversationFixtureApi
  }
}

function DeferredBody({ id }: { readonly id: string }) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const expand = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === id) setExpanded(true)
    }
    window.addEventListener('fixture-body-expand', expand)
    return () => window.removeEventListener('fixture-body-expand', expand)
  }, [id])
  return (
    <div data-fixture-body={id} data-expanded={expanded}>
      {Array.from({ length: expanded ? 18 : 2 }, (_, index) => (
        <p key={index}>{copy.body}</p>
      ))}
    </div>
  )
}

function ConversationFixture({ count, first, session, followLatest }: ConversationFixtureOptions) {
  const messages = useMemo<readonly LumenMessageProps[]>(
    () =>
      Array.from({ length: Math.min(180, Math.max(0, count)) }, (_, index) => {
        const id = `message-${first + index}`
        return {
          id,
          role: 'assistant',
          author: copy.author,
          avatar: 'AI',
          appearance: 'transcript',
          copyLabel: copy.copy,
          actions: null,
          children: <DeferredBody id={id} />,
        }
      }),
    [count, first],
  )
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: 'dark' }} withCssBaseline={false}>
      <main className="conversation-stability-fixture">
        <LumenConversation
          title={copy.title}
          messages={messages}
          empty={<p>{copy.empty}</p>}
          composer={<textarea className="fixture-composer" aria-label={copy.composer} rows={3} />}
          header={null}
          scrollKey={session}
          followLatest={followLatest}
          latestLabel={copy.latest}
        />
      </main>
    </LumenProvider>
  )
}

const container = document.getElementById('fixture-root')
if (!container) throw new Error('Missing conversation fixture root')
const root = createRoot(container)
let options: ConversationFixtureOptions = { count: 1, first: 0, session: 'session-a', followLatest: true }
window.conversationStabilityFixture = {
  configure(update) {
    options = { ...options, ...update }
    root.render(<ConversationFixture {...options} />)
  },
  expand(id) {
    window.dispatchEvent(new CustomEvent('fixture-body-expand', { detail: id }))
  },
}
window.conversationStabilityFixture.configure({})
