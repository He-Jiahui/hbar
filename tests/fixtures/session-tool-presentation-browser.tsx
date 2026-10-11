// Test-only controlled production React rendering: no Host, Run or tool execution.
import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenFrame, LumenNavigationButton, LumenProvider, LumenText } from '@lumen/app-ui'
import {
  HbarMessageBlocks,
  HbarActivityDisclosure,
  groupCompletedSessionActivities,
  messageActivitySummary,
  projectSessionMessages,
} from '@hbar/app-react'
import type { SessionTimelineState } from '@hbar/app-runtime'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, resolveShellLocale, type ShellLocale } from '../../apps/web/src/shell-copy'
import { createSessionToolPresenter } from '../../apps/web/src/session-tool-presentation'
import '@lumen/app-ui/styles.css'
import './session-tool-presentation-browser.css'
import {
  SessionActivityIndicator,
  type SessionActivityIndicatorContent,
} from '../../packages/app-react/src/session-activity-indicator'

export interface ToolPresentationFixtureInput {
  readonly messages: SessionTimelineState['messages']
  readonly locale: ShellLocale
  readonly streaming?: boolean
  readonly longLabels?: boolean
  readonly theme?: 'light' | 'dark'
  readonly motion?: boolean
  readonly activeRunIds?: readonly string[]
  readonly activity?: SessionActivityIndicatorContent
  readonly glow?: number
  readonly groupCompleted?: boolean
}

declare global {
  interface Window {
    toolPresentationFixture: {
      readonly render: (input: ToolPresentationFixtureInput) => void
      readonly clipboardWrites: () => readonly string[]
    }
  }
}

const writes: string[] = []
const container = document.getElementById('root')
if (!container) throw new Error('Tool presentation fixture root is missing')
const root = createRoot(container)

function Fixture({ input }: { readonly input: ToolPresentationFixtureInput }) {
  const appearance = createWebLumenAppearance(
    input.theme ?? 'light',
    DEFAULT_WEB_APPEARANCE_DIMENSIONS,
    input.motion ?? false,
  )
  const copy = getShellCopy(input.locale)
  const fixtureCopy = {
    title: input.locale === 'zh-CN' ? '工具身份：受控 React 验收' : 'Tool identity: controlled React verification',
    scope:
      input.locale === 'zh-CN'
        ? '真实生产组件与宿主呈现器；合成消息，无 Host、运行或工具执行。'
        : 'Real production components and host presenter; synthetic messages, no Host, Run or tool execution.',
    outside: input.locale === 'zh-CN' ? '原消息之外的焦点目标' : 'Focus target outside the original message',
    long:
      input.locale === 'zh-CN'
        ? '用于验证正常流式布局的非常长的本地化工具操作名称，完整原始内容仍可访问'
        : 'An exceptionally long localized tool-operation label used to verify normal flow and original content access',
  }
  const describe = createSessionToolPresenter(input.locale)
  const projections = projectSessionMessages(input.messages)
  const sequence = groupCompletedSessionActivities(projections.map((projection) => ({ kind: 'message', projection })))
  const groupedIds = new Set(
    sequence.flatMap((item) =>
      item.kind === 'activityGroup' ? item.projections.map(({ message }) => message.id) : [],
    ),
  )
  const messageBlocks = (projection: (typeof projections)[number], grouped = false) => (
    <HbarMessageBlocks
      sessionId={projection.message.sessionId}
      messageId={projection.message.id}
      blocks={projection.blocks}
      results={projection.results}
      activityDisplay={grouped ? 'rows' : 'auto'}
      streaming={
        !grouped &&
        (input.activeRunIds ? input.activeRunIds.includes(projection.message.runId) : (input.streaming ?? false))
      }
      labels={copy.session.messageBlocks}
      describeTool={(call) => {
        const presentation = describe(call)
        return input.longLabels
          ? {
              ...presentation,
              label: `${fixtureCopy.long} — ${presentation.label ?? copy.session.messageBlocks.tool(call.name)}`,
            }
          : presentation
      }}
      clipboard={{
        writeText: (text) => {
          writes.push(text)
          return Promise.resolve()
        },
      }}
    />
  )
  return (
    <LumenProvider appearance={{ ...appearance, ...(input.glow === undefined ? {} : { glow: input.glow }) }}>
      <LumenFrame as="main" className="tool-presentation-fixture">
        <LumenText as="h1">{fixtureCopy.title}</LumenText>
        <LumenText as="p">{fixtureCopy.scope}</LumenText>
        <LumenButton data-fixture-outside="true">{fixtureCopy.outside}</LumenButton>
        {input.activity && (
          <LumenNavigationButton
            className="tool-presentation-fixture-activity-row"
            selected
            data-fixture-activity-row="true"
          >
            <LumenText as="span">{fixtureCopy.long}</LumenText>
            <SessionActivityIndicator execution={input.activity} />
          </LumenNavigationButton>
        )}
        <LumenFrame className="tool-presentation-fixture-messages" data-fixture-count={projections.length}>
          {input.groupCompleted
            ? sequence.map((item) =>
                item.kind === 'activityGroup' ? (
                  <LumenFrame key={item.id} data-fixture-group={item.id}>
                    <HbarActivityDisclosure
                      summary={copy.session.messageBlocks.activity(
                        messageActivitySummary(item.rows, copy.session.messageBlocks, describe),
                      )}
                    >
                      {item.projections.map((projection) => (
                        <LumenFrame key={projection.message.id} data-fixture-message={projection.message.id}>
                          {messageBlocks(projection, groupedIds.has(projection.message.id))}
                        </LumenFrame>
                      ))}
                    </HbarActivityDisclosure>
                  </LumenFrame>
                ) : item.kind === 'message' ? (
                  <LumenFrame key={item.projection.message.id} data-fixture-message={item.projection.message.id}>
                    {messageBlocks(item.projection)}
                  </LumenFrame>
                ) : null,
              )
            : projections.map((projection, index) => (
                // Stable slots deliberately expose production identity reset rather than remounting it here.
                <LumenFrame key={index} data-fixture-message={projection.message.id}>
                  {messageBlocks(projection)}
                </LumenFrame>
              ))}
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}

window.toolPresentationFixture = {
  render: (input) => {
    document.documentElement.lang = input.locale
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
window.toolPresentationFixture.render({ messages: [], locale: resolveShellLocale(navigator.languages) })
