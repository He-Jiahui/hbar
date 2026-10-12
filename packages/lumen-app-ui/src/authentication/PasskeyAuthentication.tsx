'use client'

import * as React from 'react'
import { Fingerprint, Laptop as LaptopIcon, Smartphone as SmartphoneIcon, Usb, X } from 'lucide-react'
import { LumenButton } from '../primitives'
import { Check, Mail, ShieldCheck } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthButton,
  AuthCard,
  AuthCheck,
  AuthDivider,
  AuthFrame,
  AuthLeadingIcon,
  AuthIcon,
} from './primitives'
import { type LumenAuthPasskeyContent, selectLumenAuthItem, uniqueLumenAuthItems } from './content'

export type PasskeyAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthPasskeyContent
}

export function PasskeyAuthentication({ spec, onAction, content }: PasskeyAuthenticationProps) {
  if (content.referenceFlow) {
    return <ReferencePasskeyAuthentication spec={spec} onAction={onAction} content={content} />
  }
  return <LegacyPasskeyAuthentication spec={spec} onAction={onAction} content={content} />
}

function passkeyIcon(kind: 'laptop' | 'phone' | 'key') {
  switch (kind) {
    case 'laptop':
      return <LaptopIcon />
    case 'phone':
      return <SmartphoneIcon />
    case 'key':
      return <Usb />
    default:
      return null
  }
}

function ReferencePasskeyAuthentication({ spec, onAction, content }: PasskeyAuthenticationProps) {
  const flow = content.referenceFlow
  if (!flow) {
    return null
  }
  const passkeys = uniqueLumenAuthItems(content.passkeys)
  const selected = selectLumenAuthItem(passkeys, flow.selectedId)
  return (
    <AuthFrame
      spec={spec}
      onAction={onAction}
      className="hbar-app-ui-auth-passkey-surface hbar-app-ui-auth-passkey-reference"
    >
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        {flow.phase === 'request' && selected ? (
          <AuthCard className="hbar-app-ui-auth-passkey-request">
            <span className="hbar-app-ui-auth-passkey-request-icon">
              <AuthIcon tier="xl">
                <Fingerprint />
              </AuthIcon>
            </span>
            <h1>{flow.labels.confirmOn(selected.name)}</h1>
            <p>{flow.labels.waiting}</p>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-passkey-cancel"
              onClick={flow.onCancel}
            >
              <AuthIcon tier="xs">
                <X />
              </AuthIcon>
              {flow.labels.cancel}
            </LumenButton>
          </AuthCard>
        ) : (
          <AuthCard className="hbar-app-ui-auth-passkey-choice">
            <span className="hbar-app-ui-auth-passkey-emblem">
              <AuthIcon tier="md">
                <Fingerprint />
              </AuthIcon>
            </span>
            <h1>{content.labels.title}</h1>
            <p className="hbar-app-ui-auth-passkey-description">{content.labels.description}</p>
            <fieldset className="hbar-app-ui-auth-passkey-group">
              <legend>{content.labels.choose}</legend>
              <div
                className="hbar-app-ui-auth-passkey-options"
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}
              >
                {passkeys.map((passkey) => (
                  <LumenButton
                    type="button"
                    indicator="none"
                    className={`hbar-app-ui-auth-passkey-option ${selected?.id === passkey.id ? 'is-selected' : ''}`}
                    aria-pressed={selected?.id === passkey.id}
                    key={passkey.id}
                    onClick={() => flow.onSelect(passkey.id)}
                  >
                    <span className="hbar-app-ui-auth-passkey-device-icon">
                      <AuthIcon tier="sm">{passkeyIcon(passkey.icon)}</AuthIcon>
                    </span>
                    <span className="hbar-app-ui-auth-passkey-device-copy">
                      <span>{passkey.name}</span>
                      <small>{passkey.detail}</small>
                    </span>
                    {selected?.id === passkey.id && (
                      <AuthIcon tier="sm">
                        <Check />
                      </AuthIcon>
                    )}
                  </LumenButton>
                ))}
                {!passkeys.length && <p className="hbar-app-ui-auth-passkey-empty">{content.labels.emptyPasskeys}</p>}
              </div>
            </fieldset>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-passkey-primary"
              disabled={!selected}
              onClick={() => selected && flow.onContinue(selected.id)}
            >
              <AuthIcon tier="md">
                <Fingerprint />
              </AuthIcon>
              <span>{selected ? content.labels.continueWith(selected.name) : content.labels.choose}</span>
            </LumenButton>
            <div className="hbar-app-ui-auth-passkey-divider">
              <span />
              {content.labels.otherWays}
              <span />
            </div>
            <div className="hbar-app-ui-auth-passkey-fallbacks">
              <LumenButton
                type="button"
                indicator="none"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'password' })}
              >
                <AuthIcon tier="sm">
                  <ShieldCheck />
                </AuthIcon>
                {content.labels.password}
              </LumenButton>
              <LumenButton
                type="button"
                indicator="none"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'email-link' })}
              >
                <AuthIcon tier="sm">
                  <Mail />
                </AuthIcon>
                {content.labels.emailLink}
              </LumenButton>
            </div>
          </AuthCard>
        )}
        <p className="hbar-app-ui-auth-passkey-footer">{content.labels.footer}</p>
      </div>
    </AuthFrame>
  )
}

function LegacyPasskeyAuthentication({ spec, onAction, content }: PasskeyAuthenticationProps) {
  const [selectedId, setSelectedId] = React.useState(content.initialPasskeyId)
  const passkeys = React.useMemo(() => uniqueLumenAuthItems(content.passkeys), [content.passkeys])
  const selected = selectLumenAuthItem(passkeys, selectedId)
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-passkey-surface">
      <div className="hbar-app-ui-auth-centered">
        <AuthCard className="hbar-app-ui-auth-passkey-card">
          <AuthLeadingIcon kind="key" />
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description}</p>
          <span className="hbar-app-ui-auth-field">
            <span>{content.labels.choose}</span>
          </span>
          <div
            className={`hbar-app-ui-auth-device-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {passkeys.map((passkey) => (
              <LumenButton
                type="button"
                indicatorEdge="right"
                indicatorState={passkey.id === selected?.id ? 'selected' : 'idle'}
                className={`hbar-app-ui-auth-device-row ${passkey.id === selected?.id ? 'is-selected' : ''}`}
                key={passkey.id}
                onClick={() => setSelectedId(passkey.id)}
              >
                <AuthLeadingIcon kind={passkey.icon} />
                <span className="hbar-app-ui-auth-device-copy">
                  <strong>{passkey.name}</strong>
                  <small>{passkey.detail}</small>
                </span>
                {passkey.id === selected?.id && (
                  <span className="hbar-app-ui-auth-selected-mark">
                    <AuthCheck />
                  </span>
                )}
              </LumenButton>
            ))}
            {!passkeys.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyPasskeys}</p>}
          </div>
          <AuthButton
            type="button"
            tone="accent"
            disabled={!selected}
            onClick={() =>
              selected &&
              onAction?.({
                variantId: spec.id,
                actionId: 'continue-passkey',
                value: selected.id,
              })
            }
          >
            {selected ? content.labels.continueWith(selected.name) : content.labels.choose}
          </AuthButton>
          <AuthDivider label={content.labels.otherWays} />
          <div className="hbar-app-ui-auth-fallbacks">
            <AuthButton
              type="button"
              onClick={() =>
                onAction?.({
                  variantId: spec.id,
                  actionId: 'password',
                })
              }
            >
              {content.labels.password}
            </AuthButton>
            <AuthButton
              type="button"
              onClick={() =>
                onAction?.({
                  variantId: spec.id,
                  actionId: 'email-link',
                })
              }
            >
              {content.labels.emailLink}
            </AuthButton>
          </div>
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">{content.labels.footer}</p>
      </div>
    </AuthFrame>
  )
}
