import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import {
  HbarChatSearchView,
  visibleChatSearchRows,
  type HbarChatSearchRow,
  type HbarChatSearchStatus,
} from '@hbar/app-react'
import type { SessionSearchScope, SessionSearchSource } from '@hbar/contracts/commands/session-search'
import { chatSearchCopy } from '../../apps/web/src/chat-search-copy'
import '@lumen/app-ui/styles.css'

export interface ChatSearchContentInput {
  readonly locale: 'zh-CN' | 'en-US'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly status: HbarChatSearchStatus
  readonly suffix: string
  readonly selected: 'first' | 'stale' | 'none'
  readonly feedback: 'idle' | 'opening' | 'failed'
  readonly duplicates?: boolean
}
export interface ChatSearchContentCall {
  readonly action: string
  readonly value: string
  readonly workspaceId?: string
}
declare global {
  interface Window {
    mountChatSearchContent(input: ChatSearchContentInput): void
    reverseChatSearchContent(): void
    chatSearchContentState(): {
      readonly calls: readonly ChatSearchContentCall[]
      readonly visible: readonly string[]
      readonly selected: string | null
    }
  }
}

export const chatSearchOriginalTitle = (index: number) =>
  `原始会话 ${index} Complete original session title `.repeat(3).trim()
export const chatSearchOriginalSnippet = 'Original <img src=x onerror=alert(1)> needle 原始搜索片段 '.repeat(4)
let root: Root | undefined
window.mountChatSearchContent = (input) => {
  const element = document.getElementById('chat-search-content-fixture')
  if (!element) throw new Error('Missing owned chat search content fixture')
  root?.unmount()
  const sources: readonly SessionSearchSource[] = ['title', 'conversation', 'file', 'patch', 'tool']
  const originals: HbarChatSearchRow[] = Array.from({ length: input.count }, (_, index) => ({
    resultId: `original-result-${index}`,
    source: sources[index % sources.length],
    sessionId: `original-session-${index}`,
    workspaceId: `original-workspace-${index}`,
    title: chatSearchOriginalTitle(index),
    workspaceName: '原始项目 Complete original workspace name '.repeat(8),
    updatedAt: 1_700_000_000_000,
    matchCount: 999,
    matchCountCapped: true,
    snippets: Array.from({ length: 4 }, (_, snippet) => ({
      messageId: `original-message-${index}-${snippet}`,
      role: 'assistant' as const,
      text: chatSearchOriginalSnippet,
      highlights: [
        { start: chatSearchOriginalSnippet.indexOf('needle'), end: chatSearchOriginalSnippet.indexOf('needle') + 6 },
      ],
    })),
  }))
  if (input.duplicates && originals[0]) originals.push(originals[0], { ...originals[0], resultId: '' })
  const base = chatSearchCopy(input.locale)
  const labels = {
    ...base,
    recent: base.recent + input.suffix,
    scopes: {
      all: base.scopes.all + input.suffix,
      title: base.scopes.title + input.suffix,
      conversation: base.scopes.conversation + input.suffix,
      file: base.scopes.file + input.suffix,
      patch: base.scopes.patch + input.suffix,
      tool: base.scopes.tool + input.suffix,
    },
    sources: {
      title: base.sources.title + input.suffix,
      conversation: base.sources.conversation + input.suffix,
      file: base.sources.file + input.suffix,
      patch: base.sources.patch + input.suffix,
      tool: base.sources.tool + input.suffix,
    },
    noRecent: base.noRecent + input.suffix,
    loading: base.loading + input.suffix,
    indexing: base.indexing + input.suffix,
    disconnected: base.disconnected + input.suffix,
    empty: base.empty + input.suffix,
    searchFailed: base.searchFailed + input.suffix,
    retry: base.retry + input.suffix,
    truncated: base.truncated + input.suffix,
    role: (role: 'user' | 'assistant' | 'tool') => base.role(role) + input.suffix,
    time: (updatedAt: number) => base.time(updatedAt) + input.suffix,
    opening: (title: string) => base.opening(title) + input.suffix,
    navigate: base.navigate + input.suffix,
    select: base.select + input.suffix,
    closeHint: base.closeHint + input.suffix,
  }
  function Fixture() {
    const inputRef = useRef<HTMLInputElement>(null)
    const [rows, setRows] = useState<readonly HbarChatSearchRow[]>(originals)
    const [source, setSource] = useState<SessionSearchScope>('all')
    const [query, setQuery] = useState(input.status === 'recent' ? '' : 'needle')
    const [selected, setSelected] = useState<string | null>(
      input.selected === 'first' ? 'original-result-0' : input.selected === 'stale' ? 'gone-result' : null,
    )
    const calls = useRef<ChatSearchContentCall[]>([])
    const record = (action: string, value = '', workspaceId?: string) => {
      calls.current.push({ action, value, ...(workspaceId === undefined ? {} : { workspaceId }) })
    }
    window.reverseChatSearchContent = () => setRows((current) => [...current].reverse())
    window.chatSearchContentState = () => ({
      calls: calls.current,
      visible: visibleChatSearchRows(rows, input.status).map((row) => row.resultId ?? row.sessionId),
      selected,
    })
    return (
      <LumenProvider
        className="chat-search-fixture-provider"
        appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
      >
        <HbarChatSearchView
          source={source}
          onSourceChange={(value) => {
            record('source', value)
            setSource(value)
          }}
          inputRef={inputRef}
          query={query}
          status={input.status}
          rows={rows}
          selectedResultId={selected}
          truncated={input.count > 50}
          error={input.status === 'error' ? labels.searchFailed : null}
          openingResultId={input.feedback === 'opening' ? 'original-result-0' : null}
          openError={
            input.feedback === 'failed' ? { sessionId: 'original-result-0', message: labels.searchFailed } : null
          }
          labels={labels}
          onQueryChange={(value) => {
            record('query', value)
            setQuery(value)
          }}
          onMove={(direction) => {
            record('move', direction)
            const visible = visibleChatSearchRows(rows, input.status)
            const index = visible.findIndex((row) => row.resultId === selected)
            const next = visible[Math.max(0, Math.min(visible.length - 1, index + (direction === 'down' ? 1 : -1)))]
            setSelected(next?.resultId ?? null)
          }}
          onSelect={(value) => {
            record('select', value)
            setSelected(value)
          }}
          onOpen={(value, workspaceId) => record('open', value, workspaceId)}
          onClose={() => record('close')}
          onCompositionStart={() => record('composition-start')}
          onCompositionEnd={(value) => {
            record('composition-end', value)
            setQuery(value)
          }}
          onRetry={() => record('retry')}
        />
      </LumenProvider>
    )
  }
  root = createRoot(element)
  root.render(<Fixture />)
}
