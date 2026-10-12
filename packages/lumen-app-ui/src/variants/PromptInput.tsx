'use client'

import * as React from 'react'
import LumenField from '../LumenField'
import LumenIndicator from '../LumenIndicator'
import LumenSurface from '../LumenSurface'
import { LumenChoiceSelect, LumenFileButton, LumenFormField, LumenInput, LumenTextarea } from '../forms'
import { LumenButton } from '../primitives'
import { LumenMenu, LumenProgress } from '../ui-controls'
import type {
  HbarAppUiPromptInput01Props,
  HbarAppUiPromptInput02Props,
  HbarAppUiPromptInput03Props,
  HbarAppUiPromptInput04Props,
  HbarAppUiPromptInput05Props,
  HbarAppUiPromptInput06Props,
  HbarAppUiPromptInput07Props,
  PromptBaseActions,
  PromptBaseCopy,
  PromptBaseState,
  PromptOption,
} from './promptInputTypes'
import styles from './prompt-input.module.css'

export type {
  HbarAppUiPromptInput01Props,
  HbarAppUiPromptInput02Props,
  HbarAppUiPromptInput03Props,
  HbarAppUiPromptInput04Props,
  HbarAppUiPromptInput05Props,
  HbarAppUiPromptInput06Props,
  HbarAppUiPromptInput07Props,
  PromptBaseActions,
  PromptBaseState,
} from './promptInputTypes'

function unique<Item extends PromptOption>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
}

function Frame({
  id,
  title,
  detail,
  children,
}: {
  id: string
  title: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <LumenSurface className={styles.surface} data-hbar-app-ui-variant={id}>
      <section className={styles.frame} aria-labelledby={`${id}-title`}>
        <header className={styles.header}>
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{detail}</p>
          </div>
          <LumenIndicator edge="left" state="selected" />
        </header>
        {children}
      </section>
    </LumenSurface>
  )
}

function Action({
  children,
  onClick,
  disabled,
  selected,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean | undefined
  selected?: boolean | undefined
}) {
  let indicatorState: 'idle' | 'selected' | 'disabled' = 'idle'
  if (disabled) {
    indicatorState = 'disabled'
  } else if (selected) {
    indicatorState = 'selected'
  }
  return (
    <LumenButton
      className={styles.action}
      variant="outlined"
      indicatorState={indicatorState}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected === undefined ? undefined : selected}
    >
      {children}
    </LumenButton>
  )
}

function Composer({
  id,
  copy,
  state,
  actions,
  sendOnEnter = false,
}: {
  id: string
  copy: PromptBaseCopy
  state: PromptBaseState
  actions: PromptBaseActions
  sendOnEnter?: boolean | undefined
}) {
  const running = state.status === 'running'
  const send = () => {
    const value = state.draft.trim()
    if (value) {
      actions.onSend(id, value)
    }
  }
  return (
    <div className={styles.composer}>
      <LumenField boundary="horizontal" className={styles.field}>
        <LumenTextarea
          rows={2}
          value={state.draft}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          disabled={running}
          onChange={(event) => actions.onDraftChange(id, event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing &&
              (sendOnEnter ? !event.shiftKey : event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault()
              send()
            }
          }}
        />
      </LumenField>
      <div className={styles.composerFooter}>
        {state.error ? (
          <span role="alert" className={styles.error}>
            {state.error}
          </span>
        ) : (
          <span />
        )}
        <Action onClick={() => (running ? actions.onStop(id) : send())} disabled={!running && !state.draft.trim()}>
          {running ? copy.stop : copy.send}
        </Action>
      </div>
    </div>
  )
}

export function HbarAppUiPromptInput01({ copy, content, state, actions }: HbarAppUiPromptInput01Props) {
  return (
    <Frame id="hbar-app-ui-prompt-input-1" title={copy.title} detail={copy.detail}>
      <div className={styles.toolbar}>
        <div className={styles.menuTrigger}>
          <LumenButton onClick={() => actions.onCommandOpen(content.id, !state.commandOpen)}>
            {copy.commands}
          </LumenButton>
          <LumenMenu
            open={state.commandOpen}
            label={copy.commands}
            empty={copy.empty}
            items={unique(content.commands)}
            onSelect={(commandId) => {
              actions.onCommand(content.id, commandId)
              actions.onCommandOpen(content.id, false)
            }}
          />
        </div>
        <LumenFileButton
          label={copy.attach}
          accept={content.accept}
          multiple
          onFiles={(files) => actions.onAttach(content.id, files)}
        />
      </div>
      <div className={styles.pills}>
        {unique(content.attachments).map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            onClick={() => actions.onRemoveAttachment(content.id, item.id)}
            aria-label={copy.removeAttachment(item.label)}
          >
            {copy.removeAttachment(item.label)}
          </LumenButton>
        ))}
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} />
    </Frame>
  )
}

export function HbarAppUiPromptInput02({ copy, content, state, actions }: HbarAppUiPromptInput02Props) {
  const models = unique(content.models)
  return (
    <Frame id="hbar-app-ui-prompt-input-2" title={copy.title} detail={copy.detail}>
      <div className={styles.toolbar}>
        <LumenField boundary="vertical" className={styles.selectField}>
          <LumenFormField controlId={`${content.id}-model`} label={copy.model} size="s">
            <LumenChoiceSelect
              id={`${content.id}-model`}
              label={copy.model}
              placeholder={copy.empty}
              options={models}
              size="s"
              value={models.some((item) => item.id === state.modelId) ? (state.modelId ?? null) : null}
              onValueChange={(id) => actions.onModel(content.id, id)}
            />
          </LumenFormField>
        </LumenField>
        <span className={styles.muted}>{copy.tokens(state.tokenCount)}</span>
      </div>
      <div className={styles.pills} role="group" aria-label={copy.tools}>
        {unique(content.tools).map((tool) => (
          <Action
            key={tool.id}
            selected={state.toolIds.includes(tool.id)}
            onClick={() => actions.onTool(content.id, tool.id)}
          >
            {tool.label}
          </Action>
        ))}
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} />
    </Frame>
  )
}

export function HbarAppUiPromptInput03({ copy, content, state, actions }: HbarAppUiPromptInput03Props) {
  return (
    <Frame id="hbar-app-ui-prompt-input-3" title={copy.title} detail={copy.detail}>
      <div className={styles.hero}>
        <h3>{copy.suggestions}</h3>
        <div className={styles.pills}>
          {unique(content.suggestions).map((item) => (
            <Action key={item.id} onClick={() => actions.onSuggestion(content.id, item.id)}>
              {item.label}
            </Action>
          ))}
        </div>
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} />
      <section className={styles.recent} aria-label={copy.recent}>
        <h3>{copy.recent}</h3>
        {unique(content.recent).map((item) => (
          <Action key={item.id} onClick={() => actions.onRecent(content.id, item.id)}>
            {item.label}
          </Action>
        ))}
      </section>
    </Frame>
  )
}

export function HbarAppUiPromptInput04({ copy, content, state, actions }: HbarAppUiPromptInput04Props) {
  return (
    <Frame id="hbar-app-ui-prompt-input-4" title={copy.title} detail={copy.detail}>
      <div className={styles.stack}>
        <LumenField boundary="horizontal">
          <LumenFormField controlId={`${content.id}-name`} label={copy.name}>
            <LumenInput value={state.name} onChange={(event) => actions.onNameChange(content.id, event.target.value)} />
          </LumenFormField>
        </LumenField>
        <LumenField boundary="horizontal">
          <LumenFormField controlId={`${content.id}-template`} label={copy.template}>
            <LumenTextarea
              rows={4}
              value={state.template}
              onChange={(event) => actions.onTemplateChange(content.id, event.target.value)}
            />
          </LumenFormField>
        </LumenField>
        <div className={styles.pills} aria-label={copy.variables}>
          {unique(content.variables).map((item) => (
            <code key={item.id}>{`{{${item.label}}}`}</code>
          ))}
        </div>
        {!state.valid && (
          <p role="alert" className={styles.error}>
            {state.error || copy.invalid}
          </p>
        )}
        <Action
          disabled={!state.valid || !state.name.trim()}
          onClick={() => actions.onSave(content.id, state.name, state.template)}
        >
          {copy.save}
        </Action>
      </div>
    </Frame>
  )
}

export function HbarAppUiPromptInput05({ copy, content, state, actions }: HbarAppUiPromptInput05Props) {
  const [dragging, setDragging] = React.useState(false)
  return (
    <Frame id="hbar-app-ui-prompt-input-5" title={copy.title} detail={copy.detail}>
      <div
        className={styles.dropzone}
        data-lumen-dropzone
        data-dragging={dragging}
        onDragEnter={() => setDragging(true)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false)
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length) {
            actions.onUpload(content.id, files, 'drop')
          }
        }}
      >
        <strong>{dragging ? copy.release : copy.drop}</strong>
        <LumenFileButton
          label={copy.choose}
          accept={content.accept}
          multiple
          onFiles={(files) => actions.onUpload(content.id, files, 'picker')}
        />
      </div>
      <div className={styles.uploads}>
        {unique(content.attachments).map((item) => (
          <div key={item.id} className={styles.upload}>
            <span>{item.label}</span>
            <LumenProgress label={copy.progress(item.label, item.progress)} value={item.progress} />
            <span>{copy.percentage(item.progress)}</span>
            {item.status === 'failed' && (
              <Action onClick={() => actions.onRetry(content.id, item.id)}>{copy.retry(item.label)}</Action>
            )}
          </div>
        ))}
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} />
    </Frame>
  )
}

export function HbarAppUiPromptInput06({ copy, content, state, actions }: HbarAppUiPromptInput06Props) {
  const scopes = unique(content.scopes)
  return (
    <Frame id="hbar-app-ui-prompt-input-6" title={copy.title} detail={copy.detail}>
      <div className={styles.toolbar}>
        <div className={styles.menuTrigger}>
          <LumenButton onClick={() => actions.onMentionOpen(content.id, !state.mentionOpen)}>
            {copy.mention}
          </LumenButton>
          <LumenMenu
            open={state.mentionOpen}
            label={copy.mention}
            empty={copy.empty}
            items={unique(content.sources)}
            onSelect={(sourceId) => {
              actions.onSource(content.id, sourceId)
              actions.onMentionOpen(content.id, false)
            }}
          />
        </div>
        <LumenField boundary="vertical" className={styles.selectField}>
          <LumenFormField controlId={`${content.id}-scope`} label={copy.scope} size="s">
            <LumenChoiceSelect
              id={`${content.id}-scope`}
              label={copy.scope}
              placeholder={copy.empty}
              options={scopes}
              size="s"
              value={scopes.some((item) => item.id === state.scopeId) ? (state.scopeId ?? null) : null}
              onValueChange={(id) => actions.onScope(content.id, id)}
            />
          </LumenFormField>
        </LumenField>
      </div>
      <div className={styles.pills}>
        {unique(content.sources)
          .filter((source) => state.sourceIds.includes(source.id))
          .map((source) => (
            <LumenButton
              key={source.id}
              variant="text"
              aria-label={copy.remove(source.label)}
              onClick={() => actions.onRemoveSource(content.id, source.id)}
            >
              {copy.remove(source.label)}
            </LumenButton>
          ))}
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} />
    </Frame>
  )
}

export function HbarAppUiPromptInput07({ copy, content, state, actions }: HbarAppUiPromptInput07Props) {
  return (
    <Frame id="hbar-app-ui-prompt-input-7" title={copy.title} detail={copy.detail}>
      <div className={styles.pills} role="group" aria-label={copy.mode}>
        {unique(content.modes).map((mode) => (
          <Action key={mode.id} selected={state.modeId === mode.id} onClick={() => actions.onMode(content.id, mode.id)}>
            {mode.label}
          </Action>
        ))}
      </div>
      <Composer id={content.id} copy={copy} state={state} actions={actions} sendOnEnter />
      <div className={styles.hints}>
        {copy.hints.map((hint, index) => (
          <span key={`${index}-${hint}`}>{hint}</span>
        ))}
      </div>
    </Frame>
  )
}
