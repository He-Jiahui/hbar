'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenTextarea, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './ai-chat.css'
import './ai-chat-controlled-flow.css'
import { type LumenAiChatReferenceViewModel } from './ai-chat/reference-content'
import { ReferenceAiChat } from './ai-chat/ReferenceAiChat'
import { LumenProgress, LumenTabs } from './ui-controls'

export interface LumenAiChatListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenAiChatChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
}

export interface LumenAiChatMessage extends LumenAiChatChoice {
  readonly author: string
  readonly own?: boolean | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | undefined
}

export interface LumenAiChatProviderChoice extends LumenAiChatChoice {
  readonly context: string
  readonly cost: string
  readonly status: string
}

export interface LumenAiChatContent {
  readonly referenceViewModel?: LumenAiChatReferenceViewModel | undefined
  readonly labels: {
    readonly threadTitle: string
    readonly threadDetail: string
    readonly artifactTitle: string
    readonly artifactDetail: string
    readonly artifactVersions: string
    readonly artifactFiles: string
    readonly embeddedTitle: string
    readonly embeddedDetail: string
    readonly embeddedPrompt: string
    readonly ready: string
    readonly contextTitle: string
    readonly contextDetail: (model: string, used: number) => string
    readonly settings: string
    readonly model: string
    readonly includeContext: string
    readonly showTools: string
    readonly contextWindow: string
    readonly contextUsage: (used: number) => string
    readonly approvalTitle: string
    readonly approvalDetail: string
    readonly awaiting: string
    readonly approved: string
    readonly allow: string
    readonly deny: string
    readonly agentsTitle: string
    readonly agentsDetail: string
    readonly agents: string
    readonly handoff: string
    readonly active: string
    readonly available: string
    readonly citationsTitle: string
    readonly citationsDetail: string
    readonly sources: string
    readonly openContext: string
    readonly voiceTitle: string
    readonly voiceDetail: string
    readonly startRecording: string
    readonly stopRecording: string
    readonly idleWaveform: string
    readonly liveWaveform: string
    readonly transcriptIdle: string
    readonly transcriptLive: string
    readonly modelsTitle: string
    readonly modelsDetail: string
    readonly providers: string
    readonly useSelection: string
    readonly context: string
    readonly cost: string
    readonly effort: string
    readonly composer: string
    readonly send: string
    readonly empty: string
    readonly emptySources: string
    readonly emptyProviders: string
  }
  readonly messages: readonly LumenAiChatMessage[]
  readonly suggestions: readonly LumenAiChatChoice[]
  readonly artifactVersions: readonly LumenAiChatChoice[]
  readonly initialArtifactVersionId: string
  readonly artifactCode: (version: string) => string
  readonly artifactFiles: readonly LumenAiChatChoice[]
  readonly models: readonly LumenAiChatChoice[]
  readonly initialModelId: string
  readonly contextUsed: number
  readonly approval: { readonly title: string; readonly detail: string; readonly scope: string }
  readonly agents: readonly LumenAiChatChoice[]
  readonly initialAgentId: string
  readonly activity: readonly LumenAiChatChoice[]
  readonly sources: readonly LumenAiChatChoice[]
  readonly attachments: readonly LumenAiChatChoice[]
  readonly providers: readonly LumenAiChatProviderChoice[]
  readonly initialProviderId: string
  readonly efforts: readonly LumenAiChatChoice[]
  readonly initialEffortId: string
  readonly listStrategy: LumenAiChatListStrategy
}

export interface LumenAiChatProviderProps {
  readonly content: LumenAiChatContent
  readonly children: React.ReactNode
}

export interface LumenAiChatAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAiChatProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAiChatContent | undefined
  readonly onAction?: ((event: LumenAiChatAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Production host controlled layout. When supplied, no preview/content records are required. */
  readonly controlled?:
    | {
        readonly header?: React.ReactNode
        readonly body: React.ReactNode
        readonly composer?: React.ReactNode
      }
    | undefined
}

export type LumenAiChatVariantProps = Omit<LumenAiChatProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenAiChatContent | undefined>(undefined)

export function LumenAiChatProvider({ content, children }: LumenAiChatProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenAiChatContent() {
  return React.useContext(Context)
}

export function uniqueLumenAiChatItems<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAiChatItem<T extends { readonly id: string }>(items: readonly T[], id: string | undefined) {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenAiChatProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'send' | 'file' | 'spark' | 'shield' | 'branch' | 'mic' | 'stop' | 'bot' | 'check' }) {
  const paths = {
    send: 'm2 3 12 5-12 5 2-5z',
    file: 'M4 2h5l3 3v9H4zM9 2v3h3',
    spark: 'M8 1.5 9.5 6 14 8l-4.5 2L8 14.5 6.5 10 2 8l4.5-2z',
    shield: 'M8 2 13 4v4c0 3-2 5-5 6-3-1-5-3-5-6V4z',
    branch:
      'M4 3v7a3 3 0 0 0 3 3h5M4 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 5h2a3 3 0 0 1 3 3v3',
    mic: 'M6 3a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0zM3 8a5 5 0 0 0 10 0M8 13v2',
    stop: 'M4 4h8v8H4z',
    bot: 'M3 5h10v8H3zM6 2h4M8 2v3M6 9h.1M10 9h.1',
    check: 'm3 8 3 3 7-7',
  } as const
  return (
    <svg className="lumen-ai-chat-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  controlled,
  children,
}: Omit<LumenAiChatProps, 'content' | 'onAction'> & { children: React.ReactNode }) {
  const contentClassName = [
    'lumen-ai-chat-stage',
    `hbar-app-ui-ai-chat-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary={controlled ? 'none' : 'horizontal'}
      surfaceRole={controlled ? 'reading' : undefined}
      className="lumen-ai-chat-surface"
      contentClassName={contentClassName}
      data-lumen-component="ai-chat"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-ai-chat-header">
      <div>
        <LumenText as="h1" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions ? <div className="lumen-ai-chat-header-actions">{actions}</div> : null}
    </header>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <LumenText as="p" className="lumen-ai-chat-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Bubble({ message }: { message: LumenAiChatMessage }) {
  return (
    <article className="lumen-ai-chat-bubble" data-own={message.own || undefined} data-tone={message.tone}>
      <span>{message.author.slice(0, 1)}</span>
      <div>
        <strong>{message.author}</strong>
        <p>{message.detail}</p>
      </div>
    </article>
  )
}

function Transcript({
  content,
  messages = content.messages,
}: {
  content: LumenAiChatContent
  messages?: readonly LumenAiChatMessage[] | undefined
}) {
  const unique = uniqueLumenAiChatItems(messages)
  return (
    <div className="lumen-ai-chat-transcript" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
      {unique.length ? (
        unique.map((message) => <Bubble key={message.id} message={message} />)
      ) : (
        <Empty>{content.labels.empty}</Empty>
      )}
    </div>
  )
}

function Composer({
  content,
  onAction,
  placeholder = content.labels.composer,
}: {
  content: LumenAiChatContent
  onAction: LumenAiChatProps['onAction']
  placeholder?: string | undefined
}) {
  const [value, setValue] = React.useState('')
  return (
    <form
      className="lumen-ai-chat-composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (!value.trim()) {
          return
        }
        report(onAction, 'send', value.trim())
        setValue('')
      }}
    >
      <LumenTextarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <LumenIconButton label={content.labels.send} type="submit" disabled={!value.trim()}>
        <Glyph name="send" />
      </LumenIconButton>
    </form>
  )
}

function Thread(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  return (
    <Root {...props}>
      <Header title={props.content.labels.threadTitle} detail={props.content.labels.threadDetail} />
      <Transcript content={props.content} />
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function Artifact(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const versions = uniqueLumenAiChatItems(props.content.artifactVersions)
  const [versionId, setVersionId] = React.useState(props.content.initialArtifactVersionId)
  const version = selectLumenAiChatItem(versions, versionId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.artifactTitle}
        detail={props.content.labels.artifactDetail}
        actions={
          <LumenTabs
            className="lumen-ai-chat-tabs"
            label={props.content.labels.artifactVersions}
            items={versions}
            selectedId={version?.id ?? null}
            onChange={(id) => {
              setVersionId(id)
              report(props.onAction, 'version', id)
            }}
          />
        }
      />
      <div className="lumen-ai-chat-artifact">
        <div>
          <Transcript content={props.content} />
          <Composer content={props.content} onAction={props.onAction} />
        </div>
        <aside>
          <header>
            <Glyph name="file" />
            <strong>{props.content.labels.artifactFiles}</strong>
            <span>{version?.label}</span>
          </header>
          <pre>{props.content.artifactCode(version?.label ?? '')}</pre>
          <div>
            {props.content.artifactFiles.map((file) => (
              <LumenButton key={file.id} variant="text" onClick={() => report(props.onAction, 'file', file.id)}>
                <Glyph name="file" />
                {file.label}
              </LumenButton>
            ))}
          </div>
        </aside>
      </div>
    </Root>
  )
}

function Embedded(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const suggestions = uniqueLumenAiChatItems(props.content.suggestions)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.embeddedTitle}
        detail={props.content.labels.embeddedDetail}
        actions={<LumenStatus value={props.content.labels.ready} tone="success" />}
      />
      <main className="lumen-ai-chat-embedded">
        <Glyph name="spark" />
        <LumenText as="h2" variant="heading">
          {props.content.labels.embeddedPrompt}
        </LumenText>
        {suggestions.length ? (
          <div>
            {suggestions.map((item) => (
              <LumenButton key={item.id} variant="outlined" onClick={() => report(props.onAction, 'send', item.id)}>
                {item.label}
                <Glyph name="send" />
              </LumenButton>
            ))}
          </div>
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </main>
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function ContextAware(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const models = uniqueLumenAiChatItems(props.content.models)
  const [modelId, setModelId] = React.useState(props.content.initialModelId)
  const [settings, setSettings] = React.useState(false)
  const model = selectLumenAiChatItem(models, modelId)
  const used = Math.max(0, Math.min(100, props.content.contextUsed))
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.contextTitle}
        detail={props.content.labels.contextDetail(model?.label ?? '', used)}
        actions={
          <React.Fragment>
            <LumenButton variant="outlined" onClick={() => setSettings((value) => !value)}>
              {props.content.labels.settings}
            </LumenButton>
            <LumenChoiceSelect
              id="ai-chat-context-model"
              label={props.content.labels.model}
              options={models}
              value={model?.id ?? null}
              onValueChange={(id) => {
                setModelId(id)
                report(props.onAction, 'model', id)
              }}
            />
          </React.Fragment>
        }
      />
      {settings ? (
        <aside className="lumen-ai-chat-settings hbar-app-ui-dialog-menu">
          <label>
            <LumenCheckBoxControl defaultChecked />
            {props.content.labels.includeContext}
          </label>
          <label>
            <LumenCheckBoxControl />
            {props.content.labels.showTools}
          </label>
        </aside>
      ) : null}
      <div className="lumen-ai-chat-context-meter">
        <div>
          <span>{props.content.labels.contextWindow}</span>
          <strong>{props.content.labels.contextUsage(used)}</strong>
        </div>
        <LumenProgress label={props.content.labels.contextWindow} value={used} tone="info" />
      </div>
      <Transcript content={props.content} />
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function Approval(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const [approved, setApproved] = React.useState(false)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.approvalTitle}
        detail={props.content.labels.approvalDetail}
        actions={
          <LumenStatus
            value={approved ? props.content.labels.approved : props.content.labels.awaiting}
            tone={approved ? 'success' : 'warning'}
          />
        }
      />
      <Transcript content={props.content} />
      <LumenSurface
        as="section"
        boundary="horizontal"
        className="lumen-ai-chat-approval-surface"
        contentClassName="lumen-ai-chat-approval"
        material="frost"
        tone="warning"
      >
        <Glyph name="shield" />
        <div>
          <strong>{props.content.approval.title}</strong>
          <p>{props.content.approval.detail}</p>
          <small>{props.content.approval.scope}</small>
        </div>
        <div>
          <LumenButton
            tone="primary"
            disabled={approved}
            onClick={() => {
              setApproved(true)
              report(props.onAction, 'approve')
            }}
          >
            {approved ? props.content.labels.approved : props.content.labels.allow}
          </LumenButton>
          <LumenButton variant="outlined" disabled={approved} onClick={() => report(props.onAction, 'deny')}>
            {props.content.labels.deny}
          </LumenButton>
        </div>
      </LumenSurface>
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function Agents(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const agents = uniqueLumenAiChatItems(props.content.agents)
  const [agentId, setAgentId] = React.useState(props.content.initialAgentId)
  const agent = selectLumenAiChatItem(agents, agentId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.agentsTitle}
        detail={props.content.labels.agentsDetail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'handoff', agent?.id)}>
            <Glyph name="branch" />
            {props.content.labels.handoff}
          </LumenButton>
        }
      />
      <div className="lumen-ai-chat-agents">
        <aside>
          <LumenText as="h2" variant="heading">
            {props.content.labels.agents}
          </LumenText>
          {agents.map((item) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-pressed={item.id === agent?.id}
              onClick={() => setAgentId(item.id)}
            >
              <span>{item.label.slice(0, 1)}</span>
              {item.label}
              <LumenStatus
                value={item.id === agent?.id ? props.content.labels.active : props.content.labels.available}
                tone={item.id === agent?.id ? 'warning' : 'success'}
              />
            </LumenButton>
          ))}
        </aside>
        <main>
          <Transcript
            content={props.content}
            messages={props.content.messages.map((message) => ({
              ...message,
              author: agent?.label ?? message.author,
            }))}
          />
          <div className="lumen-ai-chat-activity">
            {props.content.activity.map((item) => (
              <span key={item.id}>{item.label}</span>
            ))}
          </div>
          <Composer
            content={props.content}
            onAction={props.onAction}
            placeholder={`${props.content.labels.composer} · ${agent?.label ?? ''}`}
          />
        </main>
      </div>
    </Root>
  )
}

function Citations(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const sources = uniqueLumenAiChatItems(props.content.sources)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.citationsTitle}
        detail={props.content.labels.citationsDetail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'context')}>
            <Glyph name="file" />
            {props.content.labels.openContext}
          </LumenButton>
        }
      />
      <section className="lumen-ai-chat-sources">
        <LumenText as="h2" variant="heading">
          {props.content.labels.sources}
        </LumenText>
        {sources.length ? (
          sources.map((item) => (
            <LumenButton key={item.id} variant="text" onClick={() => report(props.onAction, 'source', item.id)}>
              <Glyph name="file" />
              {item.label}
              <small>{item.detail}</small>
            </LumenButton>
          ))
        ) : (
          <Empty>{props.content.labels.emptySources}</Empty>
        )}
      </section>
      <Transcript content={props.content} />
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function Voice(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const [recording, setRecording] = React.useState(false)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.voiceTitle}
        detail={props.content.labels.voiceDetail}
        actions={
          <LumenButton
            tone={recording ? 'danger' : 'primary'}
            onClick={() => {
              setRecording((value) => !value)
              report(props.onAction, 'record', recording ? 'stop' : 'start')
            }}
          >
            <Glyph name={recording ? 'stop' : 'mic'} />
            {recording ? props.content.labels.stopRecording : props.content.labels.startRecording}
          </LumenButton>
        }
      />
      <div
        className="lumen-ai-chat-waveform"
        role="img"
        aria-label={recording ? props.content.labels.liveWaveform : props.content.labels.idleWaveform}
      >
        {Array.from({ length: 28 }, (_, index) => (
          <i
            key={index}
            data-live={recording || undefined}
            style={{ blockSize: `${0.5 + ((index * 7) % 15) / 10}rem` }}
          />
        ))}
      </div>
      <LumenText as="p" className="lumen-ai-chat-transcript-status">
        {recording ? props.content.labels.transcriptLive : props.content.labels.transcriptIdle}
      </LumenText>
      <div className="lumen-ai-chat-attachments">
        {props.content.attachments.map((item) => (
          <LumenButton key={item.id} variant="outlined" onClick={() => report(props.onAction, 'attach', item.id)}>
            <Glyph name="file" />
            {item.label}
          </LumenButton>
        ))}
      </div>
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function Models(props: Omit<LumenAiChatProps, 'content'> & { content: LumenAiChatContent }) {
  const providers = uniqueLumenAiChatItems(props.content.providers)
  const efforts = uniqueLumenAiChatItems(props.content.efforts)
  const [providerId, setProviderId] = React.useState(props.content.initialProviderId)
  const [effortId, setEffortId] = React.useState(props.content.initialEffortId)
  const provider = selectLumenAiChatItem(providers, providerId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.modelsTitle}
        detail={props.content.labels.modelsDetail}
        actions={
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'select', provider?.id)}>
            <Glyph name="check" />
            {props.content.labels.useSelection}
          </LumenButton>
        }
      />
      <div className="lumen-ai-chat-providers">
        <aside>
          <LumenText as="h2" variant="heading">
            {props.content.labels.providers}
          </LumenText>
          {providers.length ? (
            providers.map((item) => (
              <LumenButton
                key={item.id}
                variant="text"
                aria-pressed={item.id === provider?.id}
                onClick={() => {
                  setProviderId(item.id)
                  report(props.onAction, 'provider', item.id)
                }}
              >
                <Glyph name="bot" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </LumenButton>
            ))
          ) : (
            <Empty>{props.content.labels.emptyProviders}</Empty>
          )}
        </aside>
        {provider ? (
          <main>
            <div>
              <LumenText as="h2" variant="heading">
                {provider.label}
              </LumenText>
              <LumenStatus value={provider.status} tone="success" />
            </div>
            <dl>
              <div>
                <dt>{props.content.labels.context}</dt>
                <dd>{provider.context}</dd>
              </div>
              <div>
                <dt>{props.content.labels.cost}</dt>
                <dd>{provider.cost}</dd>
              </div>
            </dl>
            <label>
              {props.content.labels.effort}
              <LumenChoiceSelect
                id="ai-chat-provider-effort"
                label={props.content.labels.effort}
                options={efforts}
                value={selectLumenAiChatItem(efforts, effortId)?.id ?? null}
                onValueChange={(id) => {
                  setEffortId(id)
                  report(props.onAction, 'effort', id)
                }}
              />
            </label>
          </main>
        ) : null}
      </div>
      <Composer content={props.content} onAction={props.onAction} />
    </Root>
  )
}

function empty(props: LumenAiChatProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenAiChat(props: LumenAiChatProps) {
  const providerContent = useLumenAiChatContent()
  if (props.controlled) {
    return (
      <Root {...props} className={['lumen-ai-chat-controlled-stage', props.className].filter(Boolean).join(' ')}>
        {props.controlled.header != null ? (
          <div className="lumen-ai-chat-controlled-header">{props.controlled.header}</div>
        ) : null}
        <div className="lumen-ai-chat-controlled-body">{props.controlled.body}</div>
        {props.controlled.composer != null ? (
          <div className="lumen-ai-chat-controlled-composer">{props.controlled.composer}</div>
        ) : null}
      </Root>
    )
  }
  const content = props.content ?? providerContent
  if (!content) {
    return empty(props)
  }
  if (content.referenceViewModel?.content.variant === props.variant) {
    return (
      <ReferenceAiChat
        variantId={props.variantId}
        className={props.className}
        viewModel={content.referenceViewModel}
        onAction={props.onAction}
      />
    )
  }
  if (props.variant === 1) {
    return <Thread {...props} content={content} />
  }
  if (props.variant === 2) {
    return <Artifact {...props} content={content} />
  }
  if (props.variant === 3) {
    return <Embedded {...props} content={content} />
  }
  if (props.variant === 4) {
    return <ContextAware {...props} content={content} />
  }
  if (props.variant === 5) {
    return <Approval {...props} content={content} />
  }
  if (props.variant === 6) {
    return <Agents {...props} content={content} />
  }
  if (props.variant === 7) {
    return <Citations {...props} content={content} />
  }
  if (props.variant === 8) {
    return <Voice {...props} content={content} />
  }
  if (props.variant === 9) {
    return <Models {...props} content={content} />
  }
  return empty(props)
}

function variant(value: number, props: LumenAiChatVariantProps) {
  return <LumenAiChat {...props} variant={value} variantId={`hbar-app-ui-ai-chat-${value}`} />
}

export const LumenAiChat01 = (props: LumenAiChatVariantProps) => variant(1, props),
  LumenAiChat02 = (props: LumenAiChatVariantProps) => variant(2, props),
  LumenAiChat03 = (props: LumenAiChatVariantProps) => variant(3, props),
  LumenAiChat04 = (props: LumenAiChatVariantProps) => variant(4, props),
  LumenAiChat05 = (props: LumenAiChatVariantProps) => variant(5, props),
  LumenAiChat06 = (props: LumenAiChatVariantProps) => variant(6, props),
  LumenAiChat07 = (props: LumenAiChatVariantProps) => variant(7, props),
  LumenAiChat08 = (props: LumenAiChatVariantProps) => variant(8, props),
  LumenAiChat09 = (props: LumenAiChatVariantProps) => variant(9, props)
