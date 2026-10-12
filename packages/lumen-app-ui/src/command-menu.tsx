'use client'

import * as React from 'react'
import {
  LumenCommandFooter,
  LumenCommandList,
  LumenCommandQuery,
  type LumenCommandListProps,
  type LumenCommandHints,
  type LumenCommandItem,
} from './command-list'
import { LumenDialog } from './dialog'
import { LumenInput, LumenSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenPopover } from './ui-controls'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import './command-menu.css'

export interface LumenCommandSurfaceContent extends LumenCommandListProps {
  readonly navigation?: LumenNestedCommandSurfaceContent['navigation'] | undefined
  readonly open: boolean
  readonly title: string
  readonly trigger: string
  readonly onOpen: () => void
  readonly onClose: () => void
}

export interface LumenCommandOverlay {
  readonly open: boolean
  readonly title: string
  readonly trigger: string
  readonly closeLabel: string
  readonly onOpen: () => void
  readonly onClose: () => void
}

export interface LumenSearchCommandsProps {
  readonly scopeRole?: 'tabs' | 'buttons' | undefined
  readonly showOpenResult?: boolean | undefined
  readonly list: LumenCommandListProps
  readonly scopeLabel: string
  readonly scopes: readonly { readonly id: string; readonly label: string }[]
  readonly scopeId: string | undefined
  readonly onScopeChange: (id: string) => void
  readonly detail:
    | {
        readonly id: string
        readonly kind: string
        readonly title: string
        readonly description: string
        readonly fields: readonly {
          readonly id: string
          readonly label: string
          readonly value: string
        }[]
        readonly body: string
        readonly openLabel: string
        readonly busy: boolean
      }
    | undefined
  readonly missingDetail: string
  readonly onOpenResult: (id: string) => void
}

export interface LumenInviteCommandProps {
  readonly inlineAction?: LumenInlineActionContent | undefined
  readonly actionList?: LumenCommandListProps | undefined
  readonly hints?: LumenCommandHints | undefined
  readonly confirmation?:
    | {
        readonly summary: string
        readonly backLabel: string
        readonly confirmLabel: string
        readonly onConfirm: () => void
      }
    | undefined
  readonly labels: {
    readonly title: string
    readonly step: string
    readonly back: string
    readonly email: string
    readonly role: string
    readonly unavailableRole: string
    readonly review: string
  }
  readonly email: string
  readonly roleId: string | undefined
  readonly roles: readonly { readonly id: string; readonly label: string }[]
  readonly busy: boolean
  readonly canReview: boolean
  readonly error: string | undefined
  readonly onBack: () => void
  readonly onEmailChange: (value: string) => void
  readonly onRoleChange: (id: string) => void
  readonly onReview: () => void
}

export interface LumenInlineActionContent {
  readonly title: string
  readonly step: string
  readonly backLabel: string
  readonly actionLabel: string
  readonly hints: LumenCommandHints
  readonly fields: readonly ({
    readonly id: string
    readonly label: string
    readonly value: string
  } & (
    | { readonly kind: 'text'; readonly placeholder: string }
    | {
        readonly kind: 'choice'
        readonly options: readonly { readonly id: string; readonly label: string }[]
      }
  ))[]
  readonly summary?: string | undefined
  readonly canSubmit: boolean
  readonly onBack: () => void
  readonly onChange: (id: string, value: string) => void
  readonly onSubmit: () => void
}

export interface LumenAssistantCommandsProps {
  readonly results?: LumenCommandListProps | undefined
  readonly hints?: LumenCommandHints | undefined
  readonly labels: {
    readonly search: string
    readonly title: string
    readonly description: string
    readonly ask: (query: string) => string
    readonly suggestions: string
    readonly resultSummary: string
  }
  readonly query: string
  readonly suggestions: readonly { readonly id: string; readonly label: string }[]
  readonly canAsk: boolean
  readonly busy: boolean
  readonly error: string | undefined
  readonly onQueryChange: (value: string) => void
  readonly onAsk: () => void
  readonly onSuggestion: (id: string) => void
}

export interface LumenCommandMenuContent {
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly grouped?: LumenCommandSurfaceContent | undefined
  readonly quick?: LumenCommandSurfaceContent | LumenNestedCommandSurfaceContent | undefined
  readonly rooms?: LumenCommandSurfaceContent | undefined
  readonly search?: (LumenCommandOverlay & LumenSearchCommandsProps) | undefined
  readonly invite?: (LumenCommandOverlay & LumenInviteCommandProps) | undefined
  readonly assistant?: (LumenCommandOverlay & LumenAssistantCommandsProps) | undefined
}

export interface LumenCommandMenuProviderProps {
  readonly content: LumenCommandMenuContent
  readonly children: React.ReactNode
}

export interface LumenCommandMenuProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenCommandMenuContent | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenCommandMenuVariantProps = Omit<LumenCommandMenuProps, 'variant' | 'variantId'>

const CommandMenuContentContext = React.createContext<LumenCommandMenuContent>({})

export function LumenCommandMenuProvider({ content, children }: LumenCommandMenuProviderProps) {
  return <CommandMenuContentContext.Provider value={content}>{children}</CommandMenuContentContext.Provider>
}

export function useLumenCommandMenuContent() {
  return React.useContext(CommandMenuContentContext)
}

export function uniqueLumenCommandItems<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  return [...new Map(items.filter((item) => item.id.trim()).map((item) => [item.id, item])).values()]
}

function CommandGlyph({ name }: { readonly name: 'ask' | 'back' | 'search' | 'empty' }) {
  return (
    <svg
      className="lumen-command-menu-glyph"
      data-tier={name === 'empty' ? 'xl' : 'md'}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'ask' ? <path d="M2.5 3.5h11v7h-6l-3.5 3v-3H2.5Z" /> : null}
      {name === 'back' ? <path d="m7 3-5 5 5 5M2 8h12" /> : null}
      {name === 'search' || name === 'empty' ? <path d="m11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z" /> : null}
      {name === 'empty' ? <path d="m4.5 12.5 7-9" /> : null}
    </svg>
  )
}

function CommandMenuRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenCommandMenuProps, 'content'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-command-menu',
    `hbar-app-ui-command-variant-${variant}`,
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
      className="lumen-command-menu-surface"
      contentClassName={contentClassName}
      data-lumen-component="command-menu"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

export function LumenSearchCommands(content: LumenSearchCommandsProps) {
  const detail =
    content.detail &&
    content.detail.id === content.list.selectedId &&
    content.list.items.some((item) => item.id === content.detail?.id)
      ? content.detail
      : undefined
  return (
    <div className="hbar-app-ui-search-commands">
      <LumenCommandQuery {...content.list} />
      <nav aria-label={content.scopeLabel} role={content.scopeRole === 'tabs' ? 'tablist' : undefined}>
        {uniqueLumenCommandItems(content.scopes).map((scope) => (
          <LumenButton
            variant="text"
            key={scope.id}
            role={content.scopeRole === 'tabs' ? 'tab' : undefined}
            aria-pressed={content.scopeRole === 'tabs' ? undefined : scope.id === content.scopeId}
            aria-selected={content.scopeRole === 'tabs' ? scope.id === content.scopeId : undefined}
            onClick={() => content.onScopeChange(scope.id)}
          >
            {scope.label}
          </LumenButton>
        ))}
      </nav>
      <div className="hbar-app-ui-search-commands-body">
        <LumenCommandList {...content.list} hideQuery />
        <article>
          {detail ? (
            <>
              <LumenText as="small" tone="subtle" variant="supporting">
                {detail.kind}
              </LumenText>
              <LumenText as="h2" variant="heading">
                {detail.title}
              </LumenText>
              <LumenText as="p" tone="muted">
                {detail.description}
              </LumenText>
              <dl>
                {uniqueLumenCommandItems(detail.fields).map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <LumenText as="p">{detail.body}</LumenText>
              {content.showOpenResult !== false && (
                <LumenButton tone="primary" disabled={detail.busy} onClick={() => content.onOpenResult(detail.id)}>
                  {detail.openLabel}
                </LumenButton>
              )}
            </>
          ) : (
            <LumenText as="p" tone="muted" role="status">
              {content.missingDetail}
            </LumenText>
          )}
        </article>
      </div>
    </div>
  )
}

export function LumenInviteCommand(content: LumenInviteCommandProps) {
  const titleId = React.useId()
  const roles = uniqueLumenCommandItems(content.roles)
  const valid = roles.some((role) => role.id === content.roleId)
  if (content.inlineAction) return <InlineActionCommands content={content.inlineAction} />
  if (content.actionList) return <LumenCommandList {...content.actionList} />
  if (content.confirmation) {
    const confirmation = content.confirmation
    return (
      <section className="hbar-app-ui-invite-command" aria-labelledby={titleId}>
        <header>
          <LumenIconButton label={confirmation.backLabel} onClick={content.onBack} disabled={content.busy}>
            <CommandGlyph name="back" />
          </LumenIconButton>
          <div>
            <LumenText id={titleId} as="h2" variant="heading">
              {content.labels.title}
            </LumenText>
            <LumenText as="small" tone="muted" variant="supporting">
              {content.labels.step}
            </LumenText>
          </div>
        </header>
        <p>{confirmation.summary}</p>
        <dl className="lumen-command-confirmation-details">
          <div>
            <dt>{content.labels.email}</dt>
            <dd>{content.email}</dd>
          </div>
          <div>
            <dt>{content.labels.role}</dt>
            <dd>{roles.find((role) => role.id === content.roleId)?.label}</dd>
          </div>
        </dl>
        {content.error && <p role="alert">{content.error}</p>}
        <footer>
          {content.hints && <LumenCommandFooter as="div" hints={content.hints} />}
          <LumenButton
            tone="primary"
            disabled={!valid || content.busy || !content.canReview}
            onClick={confirmation.onConfirm}
          >
            {confirmation.confirmLabel}
          </LumenButton>
        </footer>
      </section>
    )
  }
  return (
    <form
      className="hbar-app-ui-invite-command"
      aria-labelledby={titleId}
      aria-busy={content.busy || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canReview && !content.busy && valid) content.onReview()
      }}
    >
      <header>
        <LumenIconButton label={content.labels.back} onClick={content.onBack} disabled={content.busy}>
          <CommandGlyph name="back" />
        </LumenIconButton>
        <div>
          <LumenText id={titleId} as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {content.labels.step}
          </LumenText>
        </div>
      </header>
      <label>
        <LumenText as="span" variant="label">
          {content.labels.email}
        </LumenText>
        <LumenInput
          type="email"
          value={content.email}
          disabled={content.busy}
          onChange={(event) => content.onEmailChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <LumenText as="span" variant="label">
          {content.labels.role}
        </LumenText>
        <LumenSelect
          value={valid ? content.roleId : ''}
          disabled={content.busy}
          onChange={(event) => content.onRoleChange(event.currentTarget.value)}
        >
          <option value="" disabled hidden={valid}>
            {content.labels.unavailableRole}
          </option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </LumenSelect>
      </label>
      {content.error ? <p role="alert">{content.error}</p> : null}
      <footer>
        {content.hints && <LumenCommandFooter as="div" hints={content.hints} />}
        <LumenButton type="submit" tone="primary" disabled={!valid || content.busy || !content.canReview}>
          {content.labels.review}
        </LumenButton>
      </footer>
    </form>
  )
}

function InlineActionCommands({ content }: { readonly content: LumenInlineActionContent }) {
  const titleId = React.useId()
  return (
    <form
      className="hbar-app-ui-invite-command"
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canSubmit) content.onSubmit()
      }}
    >
      <header>
        <LumenIconButton label={content.backLabel} onClick={content.onBack}>
          <CommandGlyph name="back" />
        </LumenIconButton>
        <div>
          <LumenText id={titleId} as="h2" variant="heading">
            {content.title}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {content.step}
          </LumenText>
        </div>
      </header>
      {content.summary ? (
        <>
          <p>{content.summary}</p>
          <dl className="lumen-command-confirmation-details">
            {content.fields.map((field) => (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>
                  {field.kind === 'choice'
                    ? field.options.find((option) => option.id === field.value)?.label
                    : field.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        content.fields.map((field) => (
          <label key={field.id}>
            <LumenText as="span" variant="label">
              {field.label}
            </LumenText>
            {field.kind === 'text' ? (
              <LumenInput
                value={field.value}
                placeholder={field.placeholder}
                onChange={(event) => content.onChange(field.id, event.currentTarget.value)}
              />
            ) : (
              <LumenSelect
                value={field.value}
                onChange={(event) => content.onChange(field.id, event.currentTarget.value)}
              >
                {uniqueLumenCommandItems(field.options).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </LumenSelect>
            )}
          </label>
        ))
      )}
      <footer>
        <LumenCommandFooter as="div" hints={content.hints} />
        <LumenButton type="submit" tone="primary" disabled={!content.canSubmit}>
          {content.actionLabel}
        </LumenButton>
      </footer>
    </form>
  )
}

export function LumenAssistantCommands(content: LumenAssistantCommandsProps) {
  if (content.results?.items.length) return <LumenCommandList {...content.results} />
  return (
    <form
      className="hbar-app-ui-assistant-commands"
      aria-label={content.labels.search}
      aria-busy={content.busy || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canAsk && !content.busy) {
          content.onAsk()
        }
      }}
    >
      <div>
        <CommandGlyph name="search" />
        <LumenInput
          type="search"
          variant="plain"
          role="combobox"
          aria-expanded="true"
          aria-label={content.labels.search}
          value={content.query}
          placeholder={content.labels.search}
          disabled={content.busy}
          onChange={(event) => content.onQueryChange(event.currentTarget.value)}
        />
      </div>
      <div className="hbar-app-ui-assistant-empty">
        <CommandGlyph name="empty" />
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.labels.description}
        </LumenText>
        <LumenButton type="submit" tone="primary" disabled={!content.canAsk || content.busy}>
          <CommandGlyph name="ask" />
          {content.labels.ask(content.query)}
        </LumenButton>
        <LumenText as="strong" tone="subtle" variant="supporting">
          {content.labels.suggestions}
        </LumenText>
        <div className="hbar-app-ui-assistant-suggestions">
          {uniqueLumenCommandItems(content.suggestions).map((item) => (
            <LumenButton
              variant="outlined"
              key={item.id}
              disabled={content.busy}
              onClick={() => content.onSuggestion(item.id)}
            >
              {item.label}
            </LumenButton>
          ))}
        </div>
        {content.error ? (
          <LumenText as="p" tone="danger" role="alert">
            {content.error}
          </LumenText>
        ) : null}
      </div>
      {content.hints ? <LumenCommandFooter hints={content.hints} /> : <footer>{content.labels.resultSummary}</footer>}
    </form>
  )
}

function CommandPreviewContent({
  presentation,
  children,
}: {
  readonly presentation: LumenCommandMenuContent['presentation']
  readonly children: React.ReactNode
}) {
  if (!presentation) return <>{children}</>
  return (
    <div className="lumen-command-menu-preview-content" key={presentation.ownerId}>
      {presentation.notice && (
        <p className="lumen-command-menu-preview-notice" role="status">
          {presentation.notice}
        </p>
      )}
      {children}
    </div>
  )
}

function ListCommandSurface({
  props,
  content,
}: {
  readonly props: LumenCommandMenuProps
  readonly content: LumenCommandSurfaceContent | undefined
}) {
  return (
    <CommandMenuRoot {...props}>
      {content ? (
        <>
          <LumenButton className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          <LumenDialog
            open={content.open}
            size={props.variant === 6 ? 'large' : 'medium'}
            title={content.title}
            closeLabel={content.labels.close}
            onClose={content.onClose}
            className={`hbar-app-ui-command-dialog ${props.variant === 6 ? 'hbar-app-ui-command-dialog-room' : 'hbar-app-ui-command-dialog-list'}`}
            chromeless
          >
            <CommandPreviewContent presentation={props.content?.presentation}>
              <LumenCommandList {...content} />
            </CommandPreviewContent>
          </LumenDialog>
        </>
      ) : null}
    </CommandMenuRoot>
  )
}

function WorkflowCommandSurface({
  props,
  content,
  children,
}: {
  readonly props: LumenCommandMenuProps
  readonly content: LumenCommandOverlay | undefined
  readonly children: React.ReactNode
}) {
  let dialogKind = 'assistant'
  if (props.variant === 3) {
    dialogKind = 'search'
  } else if (props.variant === 4) {
    dialogKind = 'form'
  }

  return (
    <CommandMenuRoot {...props}>
      {content ? (
        <React.Fragment>
          <LumenButton className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          <LumenDialog
            open={content.open}
            size={props.variant === 3 ? 'large' : 'medium'}
            title={content.title}
            closeLabel={content.closeLabel}
            onClose={content.onClose}
            className={`hbar-app-ui-command-dialog hbar-app-ui-command-dialog-${dialogKind}`}
            chromeless
          >
            <CommandPreviewContent presentation={props.content?.presentation}>{children}</CommandPreviewContent>
          </LumenDialog>
        </React.Fragment>
      ) : null}
    </CommandMenuRoot>
  )
}

export function LumenCommandMenu(props: LumenCommandMenuProps) {
  const context = useLumenCommandMenuContent()
  const content = props.content ?? context
  const ownedProps = { ...props, content }
  if (props.variant === 1) return <ListCommandSurface props={ownedProps} content={content.grouped} />
  if (props.variant === 2) {
    return content.quick?.navigation ? (
      <NestedCommandSurface props={ownedProps} content={{ ...content.quick, navigation: content.quick.navigation }} />
    ) : (
      <ListCommandSurface props={ownedProps} content={content.quick} />
    )
  }
  if (props.variant === 6) return <PopoverCommandSurface props={ownedProps} content={content.rooms} />
  if (props.variant === 3) {
    return (
      <WorkflowCommandSurface props={ownedProps} content={content.search}>
        {content.search ? <LumenSearchCommands {...content.search} /> : null}
      </WorkflowCommandSurface>
    )
  }
  if (props.variant === 4) {
    return (
      <WorkflowCommandSurface props={ownedProps} content={content.invite}>
        {content.invite ? <LumenInviteCommand {...content.invite} /> : null}
      </WorkflowCommandSurface>
    )
  }
  return (
    <WorkflowCommandSurface props={ownedProps} content={content.assistant}>
      {content.assistant ? <LumenAssistantCommands {...content.assistant} /> : null}
    </WorkflowCommandSurface>
  )
}

function commandMenuVariant(variant: number, props: LumenCommandMenuVariantProps) {
  return <LumenCommandMenu {...props} variant={variant} variantId={`hbar-app-ui-command-menu-${variant}`} />
}

export function LumenCommandMenu01(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(1, props)
}

export function LumenCommandMenu02(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(2, props)
}

export function LumenCommandMenu03(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(3, props)
}

export function LumenCommandMenu04(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(4, props)
}

export function LumenCommandMenu05(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(5, props)
}

export function LumenCommandMenu06(props: LumenCommandMenuVariantProps) {
  return commandMenuVariant(6, props)
}

export interface LumenNestedCommandSurfaceContent extends LumenCommandSurfaceContent {
  readonly navigation: {
    readonly home: string
    readonly back: string
    readonly current: string
    readonly canGoBack: boolean
    readonly onBack: () => void
    readonly pages: readonly {
      readonly id: string
      readonly title: string
      readonly items: readonly LumenCommandItem[]
    }[]
  }
}

function NestedCommandSurface({
  props,
  content,
}: {
  readonly props: LumenCommandMenuProps
  readonly content: LumenCommandSurfaceContent & {
    readonly navigation: NonNullable<LumenCommandSurfaceContent['navigation']>
  }
}) {
  return (
    <CommandMenuRoot {...props}>
      {content ? (
        <React.Fragment>
          <LumenButton className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          <LumenDialog
            open={content.open}
            title={content.title}
            closeLabel={content.labels.close}
            onClose={content.onClose}
            className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-nested"
            chromeless
          >
            <div className="hbar-app-ui-nested-command">
              <header>
                <LumenButton
                  variant="text"
                  size="s"
                  disabled={!content.navigation.canGoBack}
                  onClick={content.navigation.onBack}
                >
                  <CommandGlyph name="back" />
                  {content.navigation.back}
                </LumenButton>
                <div>
                  <LumenText as="small" tone="muted" variant="supporting">
                    {content.navigation.home}
                  </LumenText>
                  <LumenText as="h2" variant="heading">
                    {content.navigation.current}
                  </LumenText>
                </div>
              </header>
              <LumenCommandList
                {...content}
                breadcrumb={
                  <LumenText as="p" tone="subtle" variant="supporting">
                    {content.navigation.current}
                  </LumenText>
                }
              />
            </div>
          </LumenDialog>
        </React.Fragment>
      ) : null}
    </CommandMenuRoot>
  )
}

function PopoverCommandSurface({
  props,
  content,
}: {
  readonly props: LumenCommandMenuProps
  readonly content: LumenCommandSurfaceContent | undefined
}) {
  return (
    <CommandMenuRoot {...props}>
      {content ? (
        <div className="hbar-app-ui-quick-command-anchor">
          <LumenButton className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          <LumenPopover open={content.open} label={content.title} className="hbar-app-ui-quick-command-popover">
            <header>
              <LumenText as="h2" variant="heading">
                {content.title}
              </LumenText>
              <LumenButton variant="text" size="s" onClick={content.onClose}>
                {content.labels.close}
              </LumenButton>
            </header>
            <LumenCommandList {...content} />
          </LumenPopover>
        </div>
      ) : null}
    </CommandMenuRoot>
  )
}
