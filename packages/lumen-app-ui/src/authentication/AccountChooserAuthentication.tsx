'use client'

import * as React from 'react'
import { ArrowRight, Check as CheckIcon, Plus as PlusIcon, RotateCcw } from 'lucide-react'
import { LumenButton } from '../primitives'
import { Check, Plus } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthBrand,
  AuthButton,
  AuthCard,
  AuthFrame,
  AuthIcon,
  AuthStatus,
} from './primitives'
import { type LumenAuthAccountContent, selectLumenAuthItem, uniqueLumenAuthItems } from './content'

export type AccountChooserAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthAccountContent
}

export function AccountChooserAuthentication({ spec, onAction, content }: AccountChooserAuthenticationProps) {
  if (content.referenceFlow) {
    return <ReferenceAccountChooserAuthentication spec={spec} onAction={onAction} content={content} />
  }
  return <LegacyAccountChooserAuthentication spec={spec} onAction={onAction} content={content} />
}

function ReferenceAccountChooserAuthentication({ spec, onAction, content }: AccountChooserAuthenticationProps) {
  const flow = content.referenceFlow
  if (!flow) {
    return null
  }
  const accounts = uniqueLumenAuthItems(content.accounts)
  const selected = selectLumenAuthItem(accounts, flow.selectedId)
  const continuation =
    selected?.continuation ??
    (selected
      ? {
          label: content.labels.continueWith(content.workspaceName),
          hint: content.labels.signingInAs(selected.email),
          kind: 'resume' as const,
        }
      : undefined)
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-account-reference">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <AuthCard className="hbar-app-ui-auth-account-reference-card">
          <span className="hbar-app-ui-auth-account-reference-brand">{content.labels.brand.slice(0, 1)}</span>
          <h1>{content.labels.title}</h1>
          <p className="hbar-app-ui-auth-account-reference-description">{content.labels.description}</p>
          <div
            className="hbar-app-ui-auth-account-reference-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {accounts.map((account) => (
              <LumenButton
                type="button"
                indicator="none"
                className={`hbar-app-ui-auth-account-row hbar-app-ui-auth-account-reference-row ${account.id === selected?.id ? 'is-selected' : ''}`}
                aria-pressed={account.id === selected?.id}
                key={account.id}
                onClick={() => flow.onSelect(account.id)}
              >
                <span className="hbar-app-ui-auth-account-reference-avatar">{account.initials}</span>
                <span className="hbar-app-ui-auth-account-reference-copy">
                  <span>{account.name}</span>
                  <small>{account.email}</small>
                  <span className={`hbar-app-ui-auth-account-reference-status is-${account.statusTone}`}>
                    <i aria-hidden="true" />
                    {account.status}
                  </span>
                </span>
                {account.id === selected?.id && (
                  <AuthIcon tier="sm">
                    <CheckIcon />
                  </AuthIcon>
                )}
              </LumenButton>
            ))}
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-account-row hbar-app-ui-auth-account-reference-row hbar-app-ui-auth-account-reference-another"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'use-another' })}
            >
              <span className="hbar-app-ui-auth-account-reference-avatar">
                <AuthIcon tier="sm">
                  <PlusIcon />
                </AuthIcon>
              </span>
              <span className="hbar-app-ui-auth-account-reference-copy">
                <span>{content.labels.useAnother}</span>
                <small>{content.labels.useAnotherDescription}</small>
              </span>
            </LumenButton>
            {!accounts.length && (
              <p className="hbar-app-ui-auth-account-reference-empty">{content.labels.emptyAccounts}</p>
            )}
          </div>
          <LumenButton
            type="button"
            indicator="none"
            className="hbar-app-ui-auth-account-reference-primary"
            disabled={!selected}
            onClick={() => selected && onAction?.({ variantId: spec.id, actionId: 'continue', value: selected.id })}
          >
            {continuation?.kind === 'reauth' && (
              <AuthIcon tier="sm">
                <RotateCcw />
              </AuthIcon>
            )}
            <span>{continuation?.label ?? content.labels.useAnother}</span>
            {continuation?.kind === 'resume' && (
              <AuthIcon tier="sm">
                <ArrowRight />
              </AuthIcon>
            )}
          </LumenButton>
          <p className="hbar-app-ui-auth-account-reference-hint">
            {continuation?.hint ?? content.labels.useAnotherDescription}
          </p>
        </AuthCard>
        <p className="hbar-app-ui-auth-account-reference-footer">
          {content.labels.finished}
          <LumenButton
            type="button"
            indicator="none"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'sign-out-all' })}
          >
            {content.labels.signOutAll}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}

function LegacyAccountChooserAuthentication({ spec, onAction, content }: AccountChooserAuthenticationProps) {
  const accounts = React.useMemo(() => uniqueLumenAuthItems(content.accounts), [content.accounts])
  const [selectedId, setSelectedId] = React.useState(selectLumenAuthItem(accounts, content.initialAccountId)?.id)
  const selected = selectLumenAuthItem(accounts, selectedId)
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-account-surface">
      <div className="hbar-app-ui-auth-centered">
        <AuthCard className="hbar-app-ui-auth-account-card">
          <AuthBrand label={content.labels.brand} compact />
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description}</p>
          <div
            className={`hbar-app-ui-auth-account-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {accounts.map((account) => (
              <LumenButton
                type="button"
                indicatorEdge="right"
                indicatorState={account.id === selected?.id ? 'selected' : 'idle'}
                className={`hbar-app-ui-auth-account-row ${account.id === selected?.id ? 'is-selected' : ''}`}
                key={account.id}
                onClick={() => setSelectedId(account.id)}
              >
                <span className="hbar-app-ui-auth-avatar">{account.initials}</span>
                <span className="hbar-app-ui-auth-account-copy">
                  <strong>{account.name}</strong>
                  <small>{account.email}</small>
                  <AuthStatus label={account.status} tone={account.statusTone} />
                </span>
                {account.id === selected?.id && (
                  <AuthIcon>
                    <Check />
                  </AuthIcon>
                )}
              </LumenButton>
            ))}
            <LumenButton
              type="button"
              className="hbar-app-ui-auth-account-row"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'use-another' })}
            >
              <span className="hbar-app-ui-auth-avatar">
                <AuthIcon>
                  <Plus />
                </AuthIcon>
              </span>
              <span className="hbar-app-ui-auth-account-copy">
                <strong>{content.labels.useAnother}</strong>
                <small>{content.labels.useAnotherDescription}</small>
              </span>
            </LumenButton>
            {!accounts.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyAccounts}</p>}
          </div>
          <AuthButton
            type="button"
            tone="accent"
            disabled={!selected}
            onClick={() =>
              selected &&
              onAction?.({
                variantId: spec.id,
                actionId: 'continue',
                value: selected.id,
              })
            }
          >
            {content.labels.continueWith(content.workspaceName)}
            <AuthIcon>
              <Check />
            </AuthIcon>
          </AuthButton>
          <p className="hbar-app-ui-auth-footer-note">
            {selected ? content.labels.signingInAs(selected.email) : content.labels.useAnotherDescription}
          </p>
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">
          {content.labels.finished}
          <LumenButton
            type="button"
            className="hbar-app-ui-auth-inline-link"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'sign-out-all',
              })
            }
          >
            {content.labels.signOutAll}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}
