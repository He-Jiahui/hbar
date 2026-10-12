'use client'
import * as React from 'react'
import { CreditCard, Landmark, MoreHorizontal, Plus, ShieldCheck } from './glyphs'
import type { LumenBillingCompositionProps } from './primitives'
import type { LumenBillingPaymentMethod, LumenBillingPaymentMethodsContent } from './content'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingIconButton,
  BillingStatus,
  BillingValueRows,
} from './primitives'

function PaymentMethodIcon({ method }: { readonly method: LumenBillingPaymentMethod }) {
  return method.kind === 'bank' ? <Landmark /> : <CreditCard />
}

export default function PaymentMethodsBilling({
  spec,
  onAction,
  content,
}: LumenBillingCompositionProps & {
  readonly content: LumenBillingPaymentMethodsContent
}) {
  const methods = React.useMemo(() => {
    const seen = new Set<string>()
    return content.methods.filter((method) => {
      if (seen.has(method.id)) {
        return false
      }
      seen.add(method.id)
      return true
    })
  }, [content.methods])
  const contacts = React.useMemo(() => {
    const seen = new Set<string>()
    return content.contacts.filter((contact) => {
      if (seen.has(contact.id)) {
        return false
      }
      seen.add(contact.id)
      return true
    })
  }, [content.contacts])
  const initialPrimary = methods.find((method) => method.primary)?.id ?? methods[0]?.id ?? ''
  const [primaryId, setPrimaryId] = React.useState(initialPrimary)

  const makePrimary = (method: LumenBillingPaymentMethod) => {
    setPrimaryId(method.id)
    onAction?.({ variantId: spec.id, actionId: 'make-primary', value: method.id })
  }

  return (
    <BillingFrame spec={spec} className="hbar-app-ui-billing-payment-methods-surface">
      <main className="hbar-app-ui-billing-payment-page">
        <header className="hbar-app-ui-billing-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-billing-actions">
            <BillingButton
              tone="accent"
              type="button"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'add-method' })}
            >
              <BillingIcon tier="sm">
                <Plus />
              </BillingIcon>
              {content.labels.addMethod}
            </BillingButton>
          </div>
        </header>

        <section className="hbar-app-ui-billing-panel">
          {methods.length ? (
            <div
              className="hbar-app-ui-billing-payment-list"
              role="list"
              data-hbar-app-ui-list-strategy={content.methodListStrategy.kind}
            >
              {methods.map((method) => (
                <div
                  className="hbar-app-ui-billing-payment-row"
                  role="listitem"
                  key={method.id}
                  data-hbar-app-ui-item-id={method.id}
                >
                  <span className="hbar-app-ui-billing-method-icon">
                    <BillingIcon tier="md">
                      <PaymentMethodIcon method={method} />
                    </BillingIcon>
                  </span>
                  <div>
                    <strong>{method.name}</strong>
                    <small>{method.detail}</small>
                  </div>
                  {method.status && primaryId !== method.id && (
                    <BillingStatus value={method.status} tone={method.statusTone} />
                  )}
                  {primaryId === method.id ? (
                    <BillingStatus value={content.labels.primary} tone="positive" />
                  ) : (
                    <BillingButton tone="quiet" type="button" onClick={() => makePrimary(method)}>
                      {content.labels.makePrimary}
                    </BillingButton>
                  )}
                  <BillingIconButton
                    type="button"
                    label={method.actionLabel}
                    onClick={() =>
                      onAction?.({
                        variantId: spec.id,
                        actionId: 'method-actions',
                        value: method.id,
                      })
                    }
                  >
                    <MoreHorizontal />
                  </BillingIconButton>
                </div>
              ))}
            </div>
          ) : (
            <BillingEmptyState message={content.labels.emptyMethods} />
          )}
        </section>

        <section className="hbar-app-ui-billing-section-head">
          <div>
            <h2>{content.labels.billingContactsTitle}</h2>
            <p>{content.labels.billingContactsDescription}</p>
          </div>
        </section>
        <section className="hbar-app-ui-billing-panel">
          {contacts.length ? (
            <div
              className="hbar-app-ui-billing-contact-list"
              role="list"
              data-hbar-app-ui-list-strategy={content.contactListStrategy.kind}
            >
              {contacts.map((contact) => (
                <div
                  className="hbar-app-ui-billing-contact-row"
                  role="listitem"
                  key={contact.id}
                  data-hbar-app-ui-item-id={contact.id}
                >
                  <span className="hbar-app-ui-billing-contact-avatar">{contact.initials}</span>
                  <div>
                    <strong>{contact.name}</strong>
                    <small>{contact.detail}</small>
                  </div>
                  <BillingIconButton
                    type="button"
                    label={contact.actionLabel}
                    onClick={() =>
                      onAction?.({
                        variantId: spec.id,
                        actionId: 'contact-actions',
                        value: contact.id,
                      })
                    }
                  >
                    <MoreHorizontal />
                  </BillingIconButton>
                </div>
              ))}
            </div>
          ) : (
            <BillingEmptyState message={content.labels.emptyContacts} />
          )}
          <BillingButton
            className="hbar-app-ui-billing-invite-contact"
            type="button"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'invite-contact' })}
          >
            <BillingIcon tier="sm">
              <Plus />
            </BillingIcon>
            {content.labels.inviteContact}
          </BillingButton>
        </section>

        <div className="hbar-app-ui-billing-address-columns">
          <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-address-column">
            <header>
              <BillingIcon tier="sm">
                <Landmark />
              </BillingIcon>
              <h2>{content.labels.billingAddressTitle}</h2>
            </header>
            <div className="hbar-app-ui-billing-address-lines">
              {content.addressLines.map((line, index) =>
                index === 0 ? (
                  <strong key={`${line}-${index}`}>{line}</strong>
                ) : (
                  <span key={`${line}-${index}`}>{line}</span>
                ),
              )}
            </div>
            <BillingButton type="button" onClick={() => onAction?.({ variantId: spec.id, actionId: 'edit-address' })}>
              {content.labels.editAddress}
            </BillingButton>
          </section>
          <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-address-column">
            <header>
              <BillingIcon tier="sm">
                <ShieldCheck />
              </BillingIcon>
              <h2>{content.labels.taxTitle}</h2>
            </header>
            <BillingValueRows rows={content.taxRows} />
            <p className="hbar-app-ui-billing-tax-notice">{content.taxNotice}</p>
          </section>
        </div>
      </main>
    </BillingFrame>
  )
}
