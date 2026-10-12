'use client'

import * as React from 'react'
import { ArrowRight, Check as CheckIcon, Plus as PlusIcon, Search as SearchIcon } from 'lucide-react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { Check, LogOut, Search } from './glyphs'
import { type LumenAuthCompositionProps, AuthAvatar, AuthButton, AuthFrame, AuthIcon } from './primitives'
import { type LumenAuthWorkspaceContent, selectLumenAuthItem, uniqueLumenAuthItems } from './content'

export type WorkspacePickerAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthWorkspaceContent
}

export function WorkspacePickerAuthentication({ spec, onAction, content }: WorkspacePickerAuthenticationProps) {
  if (content.referenceFlow) {
    return <ReferenceWorkspacePickerAuthentication spec={spec} onAction={onAction} content={content} />
  }
  return <LegacyWorkspacePickerAuthentication spec={spec} onAction={onAction} content={content} />
}

function ReferenceWorkspacePickerAuthentication({ spec, onAction, content }: WorkspacePickerAuthenticationProps) {
  const flow = content.referenceFlow
  if (!flow) {
    return null
  }
  const workspaces = uniqueLumenAuthItems(content.workspaces)
  const selected = selectLumenAuthItem(workspaces, flow.selectedId)
  const visible = workspaces.filter((item) =>
    item.name.toLocaleLowerCase().includes(flow.query.trim().toLocaleLowerCase()),
  )
  let actionLabel = content.labels.create
  if (selected) {
    actionLabel = selected.invitation ? flow.labels.acceptAndOpen(selected.name) : content.labels.open(selected.name)
  }
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-workspace-reference">
      <div className="hbar-app-ui-auth-workspace-reference-shell hbar-app-ui-full-canvas-owner">
        <div className="hbar-app-ui-auth-workspace-reference-header">
          <span className="hbar-app-ui-auth-workspace-reference-person">{content.account.initials}</span>
          <div className="hbar-app-ui-auth-workspace-reference-account">
            <p>{content.account.name}</p>
            <p>{content.account.email}</p>
          </div>
          <LumenButton
            type="button"
            indicator="none"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'sign-out' })}
          >
            {content.labels.signOut}
          </LumenButton>
        </div>
        <div className="hbar-app-ui-auth-workspace-reference-main">
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description}</p>
          <label className="hbar-app-ui-auth-workspace-reference-search">
            <AuthIcon tier="sm">
              <SearchIcon />
            </AuthIcon>
            <LumenInput
              value={flow.query}
              aria-label={content.labels.searchLabel}
              placeholder={content.labels.searchPlaceholder}
              onChange={(event) => flow.onQueryChange(event.currentTarget.value)}
            />
          </label>
          <div
            className="hbar-app-ui-auth-workspace-reference-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {visible.map((workspace) => (
              <LumenButton
                type="button"
                indicator="none"
                className={`hbar-app-ui-auth-workspace-row hbar-app-ui-auth-workspace-reference-row ${workspace.id === selected?.id ? 'is-selected' : ''}`}
                aria-pressed={workspace.id === selected?.id}
                key={workspace.id}
                onClick={() => flow.onSelect(workspace.id)}
              >
                <span className="hbar-app-ui-auth-workspace-reference-mark">{workspace.initials}</span>
                <span className="hbar-app-ui-auth-workspace-reference-copy">
                  <span className="hbar-app-ui-auth-workspace-reference-name">
                    <span>{workspace.name}</span>
                    {workspace.invitation && <small>{workspace.invitation}</small>}
                  </span>
                  <small>{workspace.invitationSummary ?? workspace.summary}</small>
                </span>
                {workspace.id === selected?.id && (
                  <AuthIcon tier="sm">
                    <CheckIcon />
                  </AuthIcon>
                )}
              </LumenButton>
            ))}
            {!visible.length && (
              <div className="hbar-app-ui-auth-workspace-reference-empty">
                <p>{workspaces.length ? flow.labels.emptyForQuery(flow.query) : content.labels.emptyWorkspaces}</p>
                <p>{flow.labels.emptyHint}</p>
              </div>
            )}
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-workspace-reference-row hbar-app-ui-auth-workspace-reference-create"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'create-workspace' })}
            >
              <span className="hbar-app-ui-auth-workspace-reference-mark">
                <AuthIcon tier="sm">
                  <PlusIcon />
                </AuthIcon>
              </span>
              <span className="hbar-app-ui-auth-workspace-reference-copy">
                <span>{content.labels.create}</span>
                <small>{content.labels.createDescription}</small>
              </span>
            </LumenButton>
          </div>
        </div>
        <div className="hbar-app-ui-auth-workspace-reference-footer">
          <LumenButton
            type="button"
            indicator="none"
            disabled={!selected}
            onClick={() =>
              selected && onAction?.({ variantId: spec.id, actionId: 'open-workspace', value: selected.id })
            }
          >
            <span>{actionLabel}</span>
            <AuthIcon tier="sm">
              <ArrowRight />
            </AuthIcon>
          </LumenButton>
          <p>{content.labels.footer}</p>
        </div>
      </div>
    </AuthFrame>
  )
}

function LegacyWorkspacePickerAuthentication({ spec, onAction, content }: WorkspacePickerAuthenticationProps) {
  const [query, setQuery] = React.useState('')
  const [selectedId, setSelectedId] = React.useState(content.initialWorkspaceId)
  const workspaces = React.useMemo(() => uniqueLumenAuthItems(content.workspaces), [content.workspaces])
  const visible = workspaces.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
  const selected = selectLumenAuthItem(workspaces, selectedId)
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-workspace-surface">
      <div className="hbar-app-ui-auth-wide-shell">
        <header className="hbar-app-ui-auth-header-bar">
          <div className="hbar-app-ui-auth-avatar-line">
            <AuthAvatar initials={content.account.initials} label={content.account.name} />
            <div>
              <strong>{content.account.name}</strong>
              <small>
                {content.labels.signedInAs} {content.account.email}
              </small>
            </div>
          </div>
          <AuthButton
            type="button"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'sign-out',
              })
            }
          >
            <AuthIcon>
              <LogOut />
            </AuthIcon>
            {content.labels.signOut}
          </AuthButton>
        </header>
        <main className="hbar-app-ui-auth-wide-main">
          <div className="hbar-app-ui-auth-wide-content hbar-app-ui-auth-workspace-content">
            <h1>{content.labels.title}</h1>
            <p>{content.labels.description}</p>
            <div className="hbar-app-ui-auth-search">
              <span className="hbar-app-ui-auth-search-input">
                <AuthIcon>
                  <Search />
                </AuthIcon>
                <LumenInput
                  value={query}
                  aria-label={content.labels.searchLabel}
                  placeholder={content.labels.searchPlaceholder}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </span>
            </div>
            <div
              className={`hbar-app-ui-auth-workspace-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            >
              {visible.map((workspace) => (
                <LumenButton
                  type="button"
                  indicatorEdge="right"
                  indicatorState={workspace.id === selected?.id ? 'selected' : 'idle'}
                  className={`hbar-app-ui-auth-workspace-row ${workspace.id === selected?.id ? 'is-selected' : ''}`}
                  key={workspace.id}
                  onClick={() => setSelectedId(workspace.id)}
                >
                  <span className="hbar-app-ui-auth-org-mark">{workspace.initials}</span>
                  <span className="hbar-app-ui-auth-workspace-copy">
                    <strong>{workspace.name}</strong>
                    <small>{workspace.summary}</small>
                    {workspace.invitation && <small>{workspace.invitation}</small>}
                  </span>
                  {workspace.id === selected?.id && (
                    <AuthIcon>
                      <Check />
                    </AuthIcon>
                  )}
                </LumenButton>
              ))}
              {!visible.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyWorkspaces}</p>}
            </div>
            <AuthButton
              type="button"
              tone="accent"
              disabled={!selected}
              onClick={() =>
                selected &&
                onAction?.({
                  variantId: spec.id,
                  actionId: 'open-workspace',
                  value: selected.id,
                })
              }
            >
              {selected ? content.labels.open(selected.name) : content.labels.create}
              <AuthIcon>
                <Check />
              </AuthIcon>
            </AuthButton>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.footer}</p>
          </div>
        </main>
      </div>
    </AuthFrame>
  )
}
