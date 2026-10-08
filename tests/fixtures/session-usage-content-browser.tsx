import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  LumenProvider,
  LumenFrame,
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  DEFAULT_LUMEN_APPEARANCE,
  useFloatingTrigger,
} from '@lumen/app-ui'
import type { SessionControlsState } from '@hbar/app-runtime'
import { HbarSessionUsageControl } from '../../packages/app-react/src/session-usage-control'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { monitoringReport } from './session-monitoring-content-data'
import '@lumen/app-ui/styles.css'

export interface SessionUsageContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly kind: 'empty' | 'known' | 'warning' | 'exhausted' | 'error'
  readonly sessionId?: string | null
  readonly long?: boolean
  readonly unknownBudget?: boolean
}
declare global {
  interface Window {
    mountSessionUsageContent(input: SessionUsageContentInput): void
    updateSessionUsageContent(input: SessionUsageContentInput): void
    sessionUsageContentTargets(): readonly string[]
    disposeSessionUsageContent?: () => void
  }
}
const targets: string[] = []
let root: Root | undefined
function Fixture({ input }: { readonly input: SessionUsageContentInput }) {
  const copy = getShellCopy(input.locale).session.usage
  const repeat = input.long ? 8 : 1
  const labels = {
    ...copy,
    title: copy.title.repeat(repeat),
    description: copy.description.repeat(repeat),
    input: copy.input.repeat(repeat),
    output: copy.output.repeat(repeat),
    cost: copy.cost.repeat(repeat),
    rate: copy.rate.repeat(repeat),
    error: (code: string) => copy.error(code).repeat(repeat),
    budgetWarning: copy.budgetWarning.repeat(repeat),
    budgetExhausted: copy.budgetExhausted.repeat(repeat),
    monitor: copy.monitor.repeat(repeat),
    total: (tokens: number) => copy.total(tokens).repeat(repeat),
    remaining: (remaining: number, limit: number) => copy.remaining(remaining, limit).repeat(repeat),
  }
  const sessionId = input.sessionId === undefined ? 'owned-session' : input.sessionId
  const spent = input.kind === 'warning' ? 81 : input.kind === 'exhausted' ? 101 : 25
  const controls: SessionControlsState = {
    sessionId,
    status: 'ready',
    model: null,
    usage: input.kind === 'empty' || sessionId === null ? null : monitoringReport(sessionId, 1),
    budget:
      input.kind === 'empty' || input.unknownBudget || sessionId === null
        ? null
        : {
            sessionId,
            budgetId: 'owned-budget',
            limit: 100,
            usedTokens: spent,
            remainingTokens: Math.max(0, 100 - spent),
            phase: input.kind === 'exhausted' ? 'exhausted' : 'active',
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
    errors: { model: null, usage: input.kind === 'error' ? 'READ_FAILED' : null, budget: null },
  }
  const [other, setOther] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({ open: other, onOpen: () => setOther(true), onClose: () => setOther(false) })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          blockSize: '100dvh',
          padding: '1rem',
          minInlineSize: 0,
        }}
      >
        <LumenFrame
          role="group"
          aria-label={copy.close}
          tabIndex={0}
          style={{ minInlineSize: 0, maxInlineSize: '100%', overflowX: 'auto' }}
        >
          <LumenButton data-usage-outside>{copy.close}</LumenButton>
        </LumenFrame>
        <LumenFrame
          role="group"
          aria-label={copy.title}
          tabIndex={0}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', minInlineSize: 0 }}
        >
          <HbarSessionUsageControl
            controls={controls}
            labels={labels}
            onOpenMonitor={() => {
              if (sessionId) targets.push(sessionId)
            }}
          />
          <LumenButton ref={anchor} {...otherEvents} data-usage-other>
            {copy.monitor}
          </LumenButton>
        </LumenFrame>
        <LumenFloatingSurface
          open={other}
          onClose={() => setOther(false)}
          anchorRef={anchor}
          mode="anchored"
          placement="above"
          label={copy.sparkline}
          role="dialog"
        >
          <LumenContentText context="popover.title">{copy.sparkline}</LumenContentText>
        </LumenFloatingSurface>
      </LumenFrame>
    </LumenProvider>
  )
}
function mount(input: SessionUsageContentInput) {
  const node = document.getElementById('session-usage-content-fixture')
  if (!node) throw new Error('Missing owned usage fixture')
  root ??= createRoot(node)
  root.render(<Fixture input={input} />)
}
window.mountSessionUsageContent = (input) => {
  window.disposeSessionUsageContent?.()
  targets.length = 0
  mount(input)
}
window.updateSessionUsageContent = mount
window.sessionUsageContentTargets = () => targets
window.disposeSessionUsageContent = () => {
  root?.unmount()
  root = undefined
}
