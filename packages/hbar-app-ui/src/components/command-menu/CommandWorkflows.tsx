import { useId } from 'react'
import { ArrowLeft, MessageSquare, Search, SearchX } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton } from '../../primitives'
import { uniqueItems } from '../../collection'
import { HbarAppUiCommandList, type HbarAppUiCommandListProps } from './CommandList'
import './CommandWorkflows.css'

export interface HbarAppUiSearchCommandsProps {
  readonly list: HbarAppUiCommandListProps
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
        readonly fields: readonly { readonly id: string; readonly label: string; readonly value: string }[]
        readonly body: string
        readonly openLabel: string
        readonly busy: boolean
      }
    | undefined
  readonly missingDetail: string
  readonly onOpenResult: (id: string) => void
}
export function HbarAppUiSearchCommands(content: HbarAppUiSearchCommandsProps) {
  const detail =
    content.detail &&
    content.detail.id === content.list.selectedId &&
    content.list.items.some((item) => item.id === content.detail?.id)
      ? content.detail
      : undefined
  return (
    <div className="hbar-app-ui-search-commands">
      <nav aria-label={content.scopeLabel}>
        {uniqueItems(content.scopes).map((scope) => (
          <HbarAppUiButton
            key={scope.id}
            aria-pressed={scope.id === content.scopeId}
            onClick={() => content.onScopeChange(scope.id)}
          >
            {scope.label}
          </HbarAppUiButton>
        ))}
      </nav>
      <div className="hbar-app-ui-search-commands-body">
        <HbarAppUiCommandList {...content.list} />
        <article>
          {detail ? (
            <>
              <small>{detail.kind}</small>
              <h2>{detail.title}</h2>
              <p>{detail.description}</p>
              <dl>
                {uniqueItems(detail.fields).map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <p>{detail.body}</p>
              <HbarAppUiButton disabled={detail.busy} onClick={() => content.onOpenResult(detail.id)}>
                {detail.openLabel}
              </HbarAppUiButton>
            </>
          ) : (
            <p role="status">{content.missingDetail}</p>
          )}
        </article>
      </div>
    </div>
  )
}
export interface HbarAppUiInviteCommandProps {
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
  /** A finite host-owned role set grows in its native select. */
  readonly roles: readonly { readonly id: string; readonly label: string }[]
  readonly busy: boolean
  readonly canReview: boolean
  readonly error: string | undefined
  readonly onBack: () => void
  readonly onEmailChange: (value: string) => void
  readonly onRoleChange: (id: string) => void
  readonly onReview: () => void
}
export function HbarAppUiInviteCommand(content: HbarAppUiInviteCommandProps) {
  const titleId = useId(),
    roles = uniqueItems(content.roles),
    valid = roles.some((role) => role.id === content.roleId)
  return (
    <form
      className="hbar-app-ui-invite-command"
      aria-labelledby={titleId}
      aria-busy={content.busy}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canReview && !content.busy && valid) content.onReview()
      }}
    >
      <header>
        <HbarAppUiButton aria-label={content.labels.back} onClick={content.onBack} disabled={content.busy}>
          <HbarAppUiIcon icon={ArrowLeft} tier="md" />
        </HbarAppUiButton>
        <div>
          <h2 id={titleId}>{content.labels.title}</h2>
          <small>{content.labels.step}</small>
        </div>
      </header>
      <label>
        {content.labels.email}
        <input
          type="email"
          value={content.email}
          disabled={content.busy}
          onChange={(event) => content.onEmailChange(event.currentTarget.value)}
        />
      </label>
      <label>
        {content.labels.role}
        <select
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
        </select>
      </label>
      {content.error && <p role="alert">{content.error}</p>}
      <footer>
        <HbarAppUiButton type="submit" tone="accent" disabled={!valid || content.busy || !content.canReview}>
          {content.labels.review}
        </HbarAppUiButton>
      </footer>
    </form>
  )
}
export interface HbarAppUiAssistantCommandsProps {
  readonly labels: {
    readonly search: string
    readonly title: string
    readonly description: string
    readonly ask: (query: string) => string
    readonly suggestions: string
    readonly resultSummary: string
  }
  readonly query: string
  /** Suggestions are finite and grow with content; this is not an unbounded search history. */
  readonly suggestions: readonly { readonly id: string; readonly label: string }[]
  readonly canAsk: boolean
  readonly busy: boolean
  readonly error: string | undefined
  readonly onQueryChange: (value: string) => void
  readonly onAsk: () => void
  readonly onSuggestion: (id: string) => void
}
export function HbarAppUiAssistantCommands(content: HbarAppUiAssistantCommandsProps) {
  return (
    <form
      className="hbar-app-ui-assistant-commands"
      aria-label={content.labels.search}
      aria-busy={content.busy}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canAsk && !content.busy) content.onAsk()
      }}
    >
      <label>
        <HbarAppUiIcon icon={Search} tier="md" />
        <input
          type="search"
          aria-label={content.labels.search}
          value={content.query}
          placeholder={content.labels.search}
          disabled={content.busy}
          onChange={(event) => content.onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="hbar-app-ui-assistant-empty">
        <HbarAppUiIcon icon={SearchX} tier="xl" />
        <h2>{content.labels.title}</h2>
        <p>{content.labels.description}</p>
        <HbarAppUiButton type="submit" disabled={!content.canAsk || content.busy}>
          <HbarAppUiIcon icon={MessageSquare} tier="md" />
          {content.labels.ask(content.query)}
        </HbarAppUiButton>
        <strong>{content.labels.suggestions}</strong>
        <div className="hbar-app-ui-assistant-suggestions">
          {uniqueItems(content.suggestions).map((item) => (
            <HbarAppUiButton key={item.id} disabled={content.busy} onClick={() => content.onSuggestion(item.id)}>
              {item.label}
            </HbarAppUiButton>
          ))}
        </div>
        {content.error && <p role="alert">{content.error}</p>}
      </div>
      <footer>{content.labels.resultSummary}</footer>
    </form>
  )
}
