import { createRoot } from 'react-dom/client'
import { useState, type ReactNode } from 'react'
import {
  HbarSessionDecisionHistory,
  type HbarSessionDecisionHistoryLabels,
} from '@hbar/app-react/session-decision-history'
import type { SessionDecision } from '@hbar/app-runtime'
import '@lumen/app-ui/styles.css'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import LumenProvider from '@lumen/app-ui/provider'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'

const count = Number(document.documentElement.dataset.fixtureCount ?? '0')
if (!Number.isInteger(count) || count < 0 || count > 25) throw new Error('Invalid decision history count')
const long = document.documentElement.dataset.fixtureLocale === 'zh-CN'
const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
const labels: HbarSessionDecisionHistoryLabels = long
  ? {
      title: '已处理的确认记录：这是一段很长的中文标题用于窄屏布局验证',
      loadMore: '加载更多记录',
      count: (value) => `${value} 条已处理记录`,
    }
  : {
      title: 'Resolved decisions with a long English label for narrow layout checks',
      loadMore: 'Load more records',
      count: (value) => `${value} resolved records`,
    }
const decisions: SessionDecision[] = Array.from({ length: count }, (_, index) => ({
  kind: 'approval',
  id: `history-${index}`,
  sessionId: 'session-1',
  runId: 'run-1',
  callId: `call-${index}`,
  tool: 'edit_file',
  approval: {
    id: `history-${index}`,
    sessionId: 'session-1',
    runId: 'run-1',
    callId: `call-${index}`,
    tool: 'edit_file',
    args: { path: `file-${index}.txt` },
    status: 'allowed',
    createdAt: index,
  },
}))
const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing fixture root')
function Fixture() {
  const [items, setItems] = useState(decisions)
  const [selectedId, setSelectedId] = useState('')
  const renderDecision = (decision: SessionDecision): ReactNode => (
    <LumenButton type="button" data-history-id={decision.id} onClick={() => setSelectedId(decision.id)}>
      {decision.id}
    </LumenButton>
  )
  return (
    <LumenFrame>
      <LumenButton
        type="button"
        data-action="rotate"
        onClick={() => setItems((current) => [...current.slice(1), ...current.slice(0, 1)])}
      >
        {long ? '调整列表顺序' : 'Rotate the list'}
      </LumenButton>
      <LumenText as="output" data-last-callback>
        {selectedId}
      </LumenText>
      <HbarSessionDecisionHistory decisions={items} labels={labels} renderDecision={renderDecision} />
    </LumenFrame>
  )
}
createRoot(root).render(
  <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode }}>
    <Fixture />
  </LumenProvider>,
)
