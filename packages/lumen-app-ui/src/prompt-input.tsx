'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenTextarea, LumenChoiceSelect } from './forms'
import LumenDivider from './LumenDivider'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import { LumenPromptComposer, type LumenPromptComposerProps, type LumenPromptLabels } from './session-components'
import './prompt-input.css'
import { type LumenPromptReferenceViewModel } from './prompt-input/reference-content'
import { ReferencePromptInput } from './prompt-input/ReferencePromptInput'
import { LumenChip } from './ui-controls'

export interface LumenPromptInputListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenPromptInputChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenPromptInputToolContent {
  readonly labels: {
    readonly title: string
    readonly detail: (tokenCount: number) => string
    readonly model: string
    readonly tokenUsage: (used: number, limit: number) => string
    readonly tools: string
    readonly toolLimit: string
    readonly placeholder: string
  }
  readonly models: readonly LumenPromptInputChoice[]
  readonly tools: readonly LumenPromptInputChoice[]
  readonly initialModelId: string
  readonly initialToolIds: readonly string[]
  readonly maximumSelectedTools: number
  readonly tokenCount: number
  readonly tokenLimit: number
}

export interface LumenPromptInputHeroContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly suggestions: string
    readonly recent: string
    readonly placeholder: string
    readonly emptyRecent: string
  }
  readonly suggestions: readonly LumenPromptInputChoice[]
  readonly recent: readonly LumenPromptInputChoice[]
  readonly maximumVisibleSuggestions: number
  readonly listStrategy: LumenPromptInputListStrategy
}

export interface LumenPromptInputVariable {
  readonly id: string
  readonly label: string
  readonly token: string
}

export interface LumenPromptInputTemplateContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly save: string
    readonly name: string
    readonly prompt: string
    readonly variables: string
    readonly valid: string
    readonly invalid: string
  }
  readonly initialName: string
  readonly initialPrompt: string
  readonly variables: readonly LumenPromptInputVariable[]
  readonly listStrategy: LumenPromptInputListStrategy
}

export interface LumenPromptInputUpload {
  readonly id: string
  readonly name: string
  readonly size: string
  readonly progress: number
}

export interface LumenPromptInputUploadContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly addFile: string
    readonly drop: string
    readonly release: string
    readonly hint: string
    readonly uploaded: string
    readonly uploading: string
    readonly progress: (name: string) => string
    readonly progressValue?: ((value: number) => string) | undefined
    readonly placeholder: string
    readonly empty: string
  }
  readonly uploads: readonly LumenPromptInputUpload[]
  readonly listStrategy: LumenPromptInputListStrategy
}

export interface LumenPromptInputSource {
  readonly id: string
  readonly label: string
  readonly kind: string
}

export interface LumenPromptInputScopeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly mention: string
    readonly scope: string
    readonly mentions: string
    readonly clear: string
    readonly placeholder: string
    readonly sourceLimit: string
    readonly emptyMentions: string
  }
  readonly scopes: readonly LumenPromptInputChoice[]
  readonly mentions: readonly LumenPromptInputSource[]
  readonly initialScopeId: string
  readonly initialSourceIds: readonly string[]
  readonly maximumSources: number
  readonly listStrategy: LumenPromptInputListStrategy
}

export interface LumenPromptInputModeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly modes: string
    readonly placeholder: (modeLabel: string) => string
  }
  readonly modes: readonly LumenPromptInputChoice[]
  readonly initialModeId: string
  readonly keyboardHints: readonly LumenPromptInputChoice[]
}

export interface LumenPromptInputContent {
  readonly referenceViewModel?: LumenPromptReferenceViewModel | undefined
  readonly composerLabels: LumenPromptLabels
  readonly tools?: LumenPromptInputToolContent | undefined
  readonly hero?: LumenPromptInputHeroContent | undefined
  readonly template?: LumenPromptInputTemplateContent | undefined
  readonly upload?: LumenPromptInputUploadContent | undefined
  readonly scope?: LumenPromptInputScopeContent | undefined
  readonly modes?: LumenPromptInputModeContent | undefined
}

export interface LumenPromptInputProviderProps {
  readonly content: LumenPromptInputContent
  readonly children: React.ReactNode
}

export interface LumenPromptInputAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenPromptInputProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenPromptInputContent | undefined
  readonly composer?: LumenPromptComposerProps | undefined
  readonly onAction?: ((event: LumenPromptInputAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Production host controlled layout for numbered variants; content remains host-owned. */
  readonly controlled?:
    | {
        readonly header?: React.ReactNode
        readonly body: React.ReactNode
        readonly composer?: React.ReactNode
      }
    | undefined
}

export type LumenPromptInputVariantProps = Omit<LumenPromptInputProps, 'variant' | 'variantId'>

const PromptInputContext = React.createContext<LumenPromptInputContent | undefined>(undefined)

export function LumenPromptInputProvider({ content, children }: LumenPromptInputProviderProps) {
  return <PromptInputContext.Provider value={content}>{children}</PromptInputContext.Provider>
}

export function useLumenPromptInputContent() {
  return React.useContext(PromptInputContext)
}

export function uniqueLumenPromptInputItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenPromptInputItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenPromptInputProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'sparkle' | 'wand' | 'check' | 'plus' | 'file' | 'mention' | 'close' }) {
  const paths = {
    sparkle: 'm8 1 1.2 4.2L13 7l-3.8 1.8L8 13l-1.2-4.2L3 7l3.8-1.8Z',
    wand: 'm3 13 8-8 2 2-8 8Zm7-11v2m3-1.5-1.5 1.5M14 6h-2',
    check: 'm3 8 3 3 7-7',
    plus: 'M8 3v10M3 8h10',
    file: 'M4 2h5l3 3v9H4Zm5 0v3h3',
    mention: 'M11 11c-1 1-3 1-3-1V7a2 2 0 1 1 4 0v4c3 0 3-7-3-8a6 6 0 1 0 3 10',
    close: 'm4 4 8 8m0-8-8 8',
  }
  return (
    <svg className="lumen-prompt-input-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
  children,
}: Omit<LumenPromptInputProps, 'content' | 'composer' | 'onAction'> & {
  readonly children: React.ReactNode
}) {
  const contentClassName = [
    'lumen-prompt-input',
    `hbar-app-ui-prompt-variant-${variant}`,
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
      boundary="horizontal"
      {...lumenPartProps("prompt-input.surface")} className="lumen-prompt-input-surface"
      contentClassName={contentClassName}
      data-lumen-component="prompt-input"
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
    <header className="lumen-prompt-input-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function LocalComposer({
  labels,
  placeholder,
  actionId,
  onAction,
}: {
  labels: LumenPromptLabels
  placeholder: string
  actionId?: string | undefined
  onAction: LumenPromptInputProps['onAction']
}) {
  const [value, setValue] = React.useState('')
  return (
    <LumenPromptComposer
      value={value}
      labels={{ ...labels, placeholder }}
      attachments={[]}
      submitting={false}
      uploading={false}
      canSubmit={Boolean(value.trim())}
      canStop={false}
      onChange={setValue}
      onRemoveAttachment={() => undefined}
      onSubmit={() => {
        const next = value.trim()
        if (!next) {
          return
        }
        report(onAction, actionId ?? 'send', next)
        setValue('')
      }}
      onStop={() => undefined}
    />
  )
}

function Controlled(
  props: Omit<LumenPromptInputProps, 'content'> & {
    composer?: LumenPromptComposerProps | undefined
  },
) {
  return <Root {...props}>{props.composer ? <LumenPromptComposer {...props.composer} /> : null}</Root>
}

function Tools(
  props: Omit<LumenPromptInputProps, 'content'> & {
    content: LumenPromptInputToolContent
    composerLabels: LumenPromptLabels
  },
) {
  const models = uniqueLumenPromptInputItems(props.content.models)
  const tools = uniqueLumenPromptInputItems(props.content.tools)
  const initialTools = uniqueLumenPromptInputItems(props.content.initialToolIds.map((id) => ({ id })))
    .map((item) => item.id)
    .filter((id) => tools.some((tool) => tool.id === id))
    .slice(0, Math.max(0, props.content.maximumSelectedTools))
  const initialModel = selectLumenPromptInputItem(models, props.content.initialModelId)?.id ?? ''
  const [modelId, setModelId] = React.useState(initialModel)
  const [selectedToolIds, setSelectedToolIds] = React.useState<readonly string[]>(initialTools)
  const maximum = Math.max(0, props.content.maximumSelectedTools)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail(props.content.tokenCount)} />
      <div className="lumen-prompt-input-tools-bar">
        <LumenFormField controlId={`${props.variantId}-model`} label={props.content.labels.model}>
          <LumenChoiceSelect
            id={`${props.variantId}-model`}
            label={props.content.labels.model}
            value={modelId}
            options={models}
            onValueChange={(id) => {
              setModelId(id)
              report(props.onAction, 'model', id)
            }}
          />
        </LumenFormField>
        <LumenStatus value={props.content.labels.tokenUsage(props.content.tokenCount, props.content.tokenLimit)} />
      </div>
      <div className="lumen-prompt-input-tool-toggles" role="group" aria-label={props.content.labels.tools}>
        {tools.map((tool) => {
          const selected = selectedToolIds.includes(tool.id)
          const disabled = Boolean(tool.disabled || (!selected && selectedToolIds.length >= maximum))
          return (
            <LumenButton
              key={tool.id}
              variant={selected ? 'solid' : 'outlined'}
              aria-pressed={selected}
              disabled={disabled}
              title={disabled && !tool.disabled ? props.content.labels.toolLimit : undefined}
              onClick={() => {
                setSelectedToolIds((current) =>
                  selected ? current.filter((id) => id !== tool.id) : [...current, tool.id],
                )
                report(props.onAction, 'tool', tool.id)
              }}
            >
              <Glyph name={selected ? 'check' : 'plus'} />
              {tool.label}
            </LumenButton>
          )
        })}
      </div>
      <LocalComposer
        labels={props.composerLabels}
        placeholder={props.content.labels.placeholder}
        onAction={props.onAction}
      />
    </Root>
  )
}

function Hero(
  props: Omit<LumenPromptInputProps, 'content'> & {
    content: LumenPromptInputHeroContent
    composerLabels: LumenPromptLabels
  },
) {
  const suggestions = uniqueLumenPromptInputItems(props.content.suggestions).slice(
    0,
    Math.max(0, props.content.maximumVisibleSuggestions),
  )
  const recent = uniqueLumenPromptInputItems(props.content.recent)
  return (
    <Root {...props}>
      <div className="lumen-prompt-input-hero">
        <Glyph name="sparkle" />
        <LumenText as="h2" variant="title">
          {props.content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {props.content.labels.detail}
        </LumenText>
        <div className="lumen-prompt-input-suggestions" aria-label={props.content.labels.suggestions}>
          {suggestions.map((suggestion) => (
            <LumenButton
              key={suggestion.id}
              variant="outlined"
              disabled={suggestion.disabled}
              onClick={() => report(props.onAction, 'suggestion', suggestion.id)}
            >
              {suggestion.label}
              <Glyph name="wand" />
            </LumenButton>
          ))}
        </div>
        <LocalComposer
          labels={props.composerLabels}
          placeholder={props.content.labels.placeholder}
          onAction={props.onAction}
        />
        <div className="lumen-prompt-input-recent" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          <LumenText as="strong" variant="label">
            {props.content.labels.recent}
          </LumenText>
          {recent.length ? (
            recent.map((item) => (
              <LumenButton
                key={item.id}
                variant="text"
                disabled={item.disabled}
                onClick={() => report(props.onAction, 'recent', item.id)}
              >
                {item.label}
              </LumenButton>
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.emptyRecent}
            </LumenText>
          )}
        </div>
      </div>
    </Root>
  )
}

function Template(props: Omit<LumenPromptInputProps, 'content'> & { content: LumenPromptInputTemplateContent }) {
  const variables = uniqueLumenPromptInputItems(props.content.variables)
  const [name, setName] = React.useState(props.content.initialName)
  const [prompt, setPrompt] = React.useState(props.content.initialPrompt)
  const valid = variables.every((variable) => prompt.includes(variable.token))
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            tone="primary"
            disabled={!valid || !name.trim()}
            onClick={() => report(props.onAction, 'save-template', JSON.stringify({ name: name.trim(), prompt }))}
          >
            <Glyph name="check" />
            {props.content.labels.save}
          </LumenButton>
        }
      />
      <div className="lumen-prompt-input-template">
        <div>
          <LumenFormField controlId={`${props.variantId}-name`} label={props.content.labels.name}>
            <LumenInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </LumenFormField>
          <LumenFormField controlId={`${props.variantId}-prompt`} label={props.content.labels.prompt}>
            <LumenTextarea value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} />
          </LumenFormField>
        </div>
        <aside data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          <LumenText as="strong" variant="label">
            {props.content.labels.variables}
          </LumenText>
          {variables.map((variable) => {
            const present = prompt.includes(variable.token)
            return (
              <div key={variable.id}>
                <Glyph name="check" />
                <code>{variable.label}</code>
                <LumenStatus
                  value={present ? props.content.labels.valid : props.content.labels.invalid}
                  tone={present ? 'success' : 'warning'}
                />
              </div>
            )
          })}
        </aside>
      </div>
    </Root>
  )
}

function Upload(
  props: Omit<LumenPromptInputProps, 'content'> & {
    content: LumenPromptInputUploadContent
    composerLabels: LumenPromptLabels
  },
) {
  const uploads = uniqueLumenPromptInputItems(props.content.uploads)
  const [dragging, setDragging] = React.useState(false)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'add-file')}>
            <Glyph name="plus" />
            {props.content.labels.addFile}
          </LumenButton>
        }
      />
      <div
        className="lumen-prompt-input-dropzone"
        data-dragging={dragging || undefined}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          report(props.onAction, 'upload-drop', String(event.dataTransfer.files.length))
        }}
      >
        <Glyph name="file" />
        <LumenText as="strong" variant="heading">
          {dragging ? props.content.labels.release : props.content.labels.drop}
        </LumenText>
        <LumenText as="small" tone="muted">
          {props.content.labels.hint}
        </LumenText>
      </div>
      <div className="lumen-prompt-input-uploads" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {uploads.length ? (
          uploads.map((upload) => {
            const progress = Math.max(0, Math.min(100, upload.progress))
            return (
              <article key={upload.id}>
                <Glyph name="file" />
                <div>
                  <LumenText as="strong" variant="label">
                    {upload.name}
                  </LumenText>
                  <LumenText as="small" tone="muted">
                    {upload.size} · {progress === 100 ? props.content.labels.uploaded : props.content.labels.uploading}
                  </LumenText>
                  <span
                    className="lumen-prompt-input-progress"
                    role="progressbar"
                    aria-label={props.content.labels.progress(upload.name)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <i style={{ inlineSize: `${progress}%` }} />
                  </span>
                </div>
                <LumenText as="span" variant="code">
                  {progress}%
                </LumenText>
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <LocalComposer
        labels={props.composerLabels}
        placeholder={props.content.labels.placeholder}
        onAction={props.onAction}
      />
    </Root>
  )
}

function Scope(
  props: Omit<LumenPromptInputProps, 'content'> & {
    content: LumenPromptInputScopeContent
    composerLabels: LumenPromptLabels
  },
) {
  const scopes = uniqueLumenPromptInputItems(props.content.scopes)
  const mentions = uniqueLumenPromptInputItems(props.content.mentions)
  const initialScope = selectLumenPromptInputItem(scopes, props.content.initialScopeId)?.id ?? ''
  const validInitialIds = uniqueLumenPromptInputItems(props.content.initialSourceIds.map((id) => ({ id })))
    .map((item) => item.id)
    .filter((id) => mentions.some((mention) => mention.id === id))
    .slice(0, Math.max(0, props.content.maximumSources))
  const [scopeId, setScopeId] = React.useState(initialScope)
  const [sourceIds, setSourceIds] = React.useState<readonly string[]>(validInitialIds)
  const [open, setOpen] = React.useState(false)
  const maximum = Math.max(0, props.content.maximumSources)
  const selectedSources = sourceIds
    .map((id) => mentions.find((mention) => mention.id === id))
    .filter((source): source is LumenPromptInputSource => Boolean(source))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-prompt-input-scope-bar">
        <LumenButton variant="outlined" onClick={() => setOpen((value) => !value)}>
          <Glyph name="mention" />
          {props.content.labels.mention}
        </LumenButton>
        <LumenFormField controlId={`${props.variantId}-scope`} label={props.content.labels.scope}>
          <LumenChoiceSelect
            id={`${props.variantId}-scope`}
            label={props.content.labels.scope}
            value={scopeId}
            options={scopes}
            onValueChange={(id) => {
              setScopeId(id)
              report(props.onAction, 'scope', id)
            }}
          />
        </LumenFormField>
      </div>
      {open ? (
        <div
          className="lumen-prompt-input-mention-menu"
          aria-label={props.content.labels.mentions}
          data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
        >
          {mentions.length ? (
            mentions.map((mention) => {
              const selected = sourceIds.includes(mention.id)
              const disabled = !selected && sourceIds.length >= maximum
              return (
                <LumenButton
                  key={mention.id}
                  variant={selected ? 'solid' : 'text'}
                  disabled={disabled}
                  title={disabled ? props.content.labels.sourceLimit : undefined}
                  onClick={() => {
                    setSourceIds((current) =>
                      selected ? current.filter((id) => id !== mention.id) : [...current, mention.id],
                    )
                    report(props.onAction, selected ? 'remove-source' : 'add-source', mention.id)
                  }}
                >
                  <Glyph name="mention" />
                  <span>{mention.label}</span>
                  <small>{mention.kind}</small>
                </LumenButton>
              )
            })
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.emptyMentions}
            </LumenText>
          )}
        </div>
      ) : null}
      <div className="lumen-prompt-input-sources">
        {selectedSources.map((source) => (
          <LumenChip key={source.id} label={source.label} startAdornment={<Glyph name="file" />} />
        ))}
        {selectedSources.length ? (
          <LumenButton
            variant="text"
            onClick={() => {
              setSourceIds([])
              report(props.onAction, 'clear-context')
            }}
          >
            <Glyph name="close" />
            {props.content.labels.clear}
          </LumenButton>
        ) : null}
      </div>
      <LocalComposer
        labels={props.composerLabels}
        placeholder={props.content.labels.placeholder}
        onAction={props.onAction}
      />
    </Root>
  )
}

function Modes(
  props: Omit<LumenPromptInputProps, 'content'> & {
    content: LumenPromptInputModeContent
    composerLabels: LumenPromptLabels
  },
) {
  const modes = uniqueLumenPromptInputItems(props.content.modes)
  const [modeId, setModeId] = React.useState(props.content.initialModeId)
  const mode = selectLumenPromptInputItem(modes, modeId)
  const hints = uniqueLumenPromptInputItems(props.content.keyboardHints)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-prompt-input-tabs" role="tablist" aria-label={props.content.labels.modes}>
        {modes.map((item) => (
          <LumenButton
            key={item.id}
            role="tab"
            variant="text"
            aria-selected={mode?.id === item.id}
            disabled={item.disabled}
            onClick={() => {
              setModeId(item.id)
              report(props.onAction, 'mode', item.id)
            }}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      <LumenDivider className="lumen-prompt-input-tab-divider" />
      <LocalComposer
        labels={props.composerLabels}
        placeholder={props.content.labels.placeholder(mode?.label ?? '')}
        onAction={props.onAction}
      />
      <div className="lumen-prompt-input-hints">
        {hints.map((hint) => (
          <span key={hint.id}>{hint.label}</span>
        ))}
      </div>
    </Root>
  )
}

function empty(props: LumenPromptInputProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenPromptInput(props: LumenPromptInputProps) {
  const inheritedContent = useLumenPromptInputContent()
  if (props.controlled) {
    return (
      <Root {...props}>
        {props.controlled.header}
        {props.controlled.body}
        {props.controlled.composer}
      </Root>
    )
  }
  const content = props.content ?? inheritedContent
  if (content?.referenceViewModel?.content.variant === props.variant) {
    return (
      <ReferencePromptInput
        variantId={props.variantId}
        className={props.className}
        viewModel={content.referenceViewModel}
        onAction={props.onAction}
      />
    )
  }
  if (props.variant === 1) {
    return <Controlled {...props} />
  }
  if (!content) {
    return empty(props)
  }
  if (props.variant === 2) {
    return content.tools ? (
      <Tools {...props} content={content.tools} composerLabels={content.composerLabels} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 3) {
    return content.hero ? (
      <Hero {...props} content={content.hero} composerLabels={content.composerLabels} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 4) {
    return content.template ? <Template {...props} content={content.template} /> : empty(props)
  }
  if (props.variant === 5) {
    return content.upload ? (
      <Upload {...props} content={content.upload} composerLabels={content.composerLabels} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 6) {
    return content.scope ? (
      <Scope {...props} content={content.scope} composerLabels={content.composerLabels} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 7) {
    return content.modes ? (
      <Modes {...props} content={content.modes} composerLabels={content.composerLabels} />
    ) : (
      empty(props)
    )
  }
  return empty(props)
}

function variant(value: number, props: LumenPromptInputVariantProps) {
  return <LumenPromptInput {...props} variant={value} variantId={`hbar-app-ui-prompt-input-${value}`} />
}

export const LumenPromptInput01 = (props: LumenPromptInputVariantProps) => variant(1, props)

export const LumenPromptInput02 = (props: LumenPromptInputVariantProps) => variant(2, props)

export const LumenPromptInput03 = (props: LumenPromptInputVariantProps) => variant(3, props)

export const LumenPromptInput04 = (props: LumenPromptInputVariantProps) => variant(4, props)

export const LumenPromptInput05 = (props: LumenPromptInputVariantProps) => variant(5, props)

export const LumenPromptInput06 = (props: LumenPromptInputVariantProps) => variant(6, props)

export const LumenPromptInput07 = (props: LumenPromptInputVariantProps) => variant(7, props)
