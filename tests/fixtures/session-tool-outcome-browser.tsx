// Test-only controlled React projection. No Host, Run, provider or tool executes.
import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import { HbarMessageBlocks, projectSessionMessages, projectToolActivities } from '@hbar/app-react'
import type { SessionTimelineState } from '@hbar/app-runtime'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, resolveShellLocale } from '../../apps/web/src/shell-copy'
import { createSessionToolPresenter } from '../../apps/web/src/session-tool-presentation'
import '@lumen/app-ui/styles.css'
import './session-tool-outcome-browser.css'

export interface ToolOutcomeFixtureInput {
  readonly messages: SessionTimelineState['messages']
  readonly streaming: boolean
  readonly longLabels?: boolean
  readonly longFeedback?: boolean
  readonly largeText?: boolean
  readonly rejectClipboard?: boolean
  readonly toolTimeline?: Pick<SessionTimelineState, 'sessionId' | 'messages' | 'runs' | 'toolEvents' | 'toolClock'>
  readonly connected?: boolean
  readonly presentTools?: boolean
  readonly motion?: boolean
  readonly mode?: 'light' | 'dark'
}

declare global {
  interface Window {
    toolOutcomeFixture: {
      readonly render: (input: ToolOutcomeFixtureInput) => void
      readonly clipboardWrites: () => readonly string[]
    }
  }
}

const locale = resolveShellLocale(navigator.languages)
const copy = getShellCopy(locale)
const fixtureCopy = {
  title: locale === 'zh-CN' ? '工具结果：受控 React 生命周期' : 'Tool outcomes: controlled React lifecycle',
  scope:
    locale === 'zh-CN'
      ? '真实生产组件与宿主文案；合成消息，无 Host、运行或工具执行。'
      : 'Real production components and host labels; synthetic messages, no Host, Run or tool execution.',
  outside: locale === 'zh-CN' ? '原消息之外的焦点目标' : 'Focus target outside the original message',
  longTool:
    locale === 'zh-CN'
      ? '原始工作区内具有非常长名称的只读工具调用，完整名称仍然可识别'
      : 'Read-only tool invocation with an exceptionally long but identifiable original workspace name',
}
const writes: string[] = []
const appearance = createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)
const container = document.getElementById('root')
if (!container) throw new Error('Tool outcome fixture root is missing')
const root = createRoot(container)

function Fixture({ input }: { readonly input: ToolOutcomeFixtureInput }) {
  const projections = projectSessionMessages(input.messages)
  const activities = input.toolTimeline ? projectToolActivities(input.toolTimeline, input.connected ?? true) : undefined
  const messageLabels = input.longLabels
    ? { ...copy.session.messageBlocks, tool: (name: string) => `${fixtureCopy.longTool} — ${name}` }
    : copy.session.messageBlocks
  const feedback = messageLabels.feedback
  const labels =
    input.longFeedback && feedback
      ? {
          ...messageLabels,
          feedback: {
            ...feedback,
            duration: (...args: Parameters<typeof feedback.duration>) => feedback.duration(...args).repeat(12),
            cumulativeDuration: (duration: number) => feedback.cumulativeDuration(duration).repeat(12),
            counts: (...args: Parameters<typeof feedback.counts>) => feedback.counts(...args).repeat(4),
            progress: (percentage: number) => feedback.progress(percentage).repeat(48),
          },
        }
      : messageLabels
  return (
    <LumenProvider
      appearance={{
        ...appearance,
        textSize: input.largeText ? 'l' : appearance.textSize,
        mode: input.mode ?? 'light',
        motion: input.motion ?? false,
      }}
    >
      <LumenFrame as="main" className="tool-outcome-fixture">
        <LumenText as="h1">{fixtureCopy.title}</LumenText>
        <LumenText as="p">{fixtureCopy.scope}</LumenText>
        <LumenFrame
          className="tool-outcome-fixture-action-reading"
          role="group"
          aria-label={fixtureCopy.outside}
          tabIndex={0}
        >
          <LumenButton data-fixture-outside="true">{fixtureCopy.outside}</LumenButton>
        </LumenFrame>
        <LumenFrame className="tool-outcome-fixture-messages" data-fixture-count={projections.length}>
          {projections.map((projection, index) => (
            // Stable fixture slots intentionally exercise production identity reset,
            // rather than hiding a missing reset behind a fixture-provided source key.
            <LumenFrame
              key={index}
              data-fixture-message={projection.message.id}
              data-fixture-session={projection.message.sessionId}
              data-fixture-run={projection.message.runId}
            >
              <HbarMessageBlocks
                sessionId={projection.message.sessionId}
                messageId={projection.message.id}
                blocks={projection.blocks}
                results={projection.results}
                toolActivity={
                  activities ? (activities.get(projection.message.runId) ?? new Map<string, never>()) : undefined
                }
                streaming={input.streaming}
                describeTool={input.presentTools ? createSessionToolPresenter(locale) : undefined}
                labels={labels}
                clipboard={{
                  writeText: (text) => {
                    writes.push(text)
                    return input.rejectClipboard
                      ? Promise.reject(new Error('Controlled clipboard rejection'))
                      : Promise.resolve()
                  },
                }}
              />
            </LumenFrame>
          ))}
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}

window.toolOutcomeFixture = {
  render: (input) => {
    flushSync(() =>
      root.render(
        <StrictMode>
          <Fixture input={input} />
        </StrictMode>,
      ),
    )
  },
  clipboardWrites: () => [...writes],
}
document.documentElement.lang = locale
window.toolOutcomeFixture.render({ messages: [], streaming: false })
