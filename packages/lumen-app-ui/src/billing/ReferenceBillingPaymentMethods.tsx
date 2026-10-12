import { CreditCard, Landmark, MoreHorizontal, Plus, ShieldCheck } from './glyphs'
import type { LumenBillingContact, LumenBillingPaymentMethod, LumenBillingPaymentMethodsContent } from './content'
import type { LumenBillingCompositionProps } from './primitives'
import type { LumenBillingPaymentMethodsReferenceLayout } from './reference-content'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingIconButton,
  BillingStatus,
  BillingValueRows,
} from './primitives'
import './reference-payment-methods.css'

export interface ReferenceBillingPaymentMethodsProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingPaymentMethodsContent
  readonly layout: LumenBillingPaymentMethodsReferenceLayout
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function MethodIcon({ method }: { readonly method: LumenBillingPaymentMethod }) {
  return method.kind === 'bank' ? <Landmark /> : <CreditCard />
}

function ContactRow({
  contact,
  onAction,
  variantId,
}: {
  readonly contact: LumenBillingContact
  readonly onAction: ReferenceBillingPaymentMethodsProps['onAction']
  readonly variantId: string
}) {
  return (
    <div
      className="hbar-app-ui-billing-reference-payment-contact-row"
      role="listitem"
      data-hbar-app-ui-item-id={contact.id}
    >
      <span className="hbar-app-ui-billing-reference-payment-contact-avatar">{contact.initials}</span>
      <div>
        <strong>{contact.name}</strong>
        <small>{contact.detail}</small>
      </div>
      <BillingIconButton
        type="button"
        label={contact.actionLabel}
        onClick={() => onAction?.({ variantId, actionId: 'contact-actions', value: contact.id })}
      >
        <BillingIcon tier="sm">
          <MoreHorizontal />
        </BillingIcon>
      </BillingIconButton>
    </div>
  )
}

export function ReferenceBillingPaymentMethods({
  spec,
  onAction,
  content,
  layout,
}: ReferenceBillingPaymentMethodsProps) {
  const methods = uniqueById(content.methods)
  const contacts = uniqueById(content.contacts)
  const taxRows = uniqueById(content.taxRows)
  const sourcePrimary = methods.find((method) => method.primary)?.id ?? methods[0]?.id ?? null
  const flow = content.referenceFlow
  const requestedPrimary = flow ? flow.primaryMethodId : sourcePrimary
  const primaryExists = methods.some((method) => method.id === requestedPrimary)
  const primaryId = primaryExists || flow?.primaryMethodId === null ? requestedPrimary : sourcePrimary

  return (
    <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-reference-payment-methods-surface">
      <main className="hbar-app-ui-billing-reference-payment-methods-page" data-hbar-app-ui-owner-id={layout.ownerId}>
        <header className="hbar-app-ui-billing-reference-payment-methods-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
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
        </header>

        <section
          className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-payment-methods-panel"
          aria-busy={flow?.pending || undefined}
        >
          {flow?.error ? (
            <p className="hbar-app-ui-billing-reference-payment-methods-error" role="alert">
              {flow.error}
            </p>
          ) : null}
          {flow?.feedback ? <p role="status">{flow.feedback}</p> : null}
          {methods.length ? (
            <div
              className="hbar-app-ui-billing-reference-payment-methods-list"
              role="list"
              data-hbar-app-ui-list-strategy={content.methodListStrategy.kind}
            >
              {methods.map((method) => {
                const isPrimary = primaryId === method.id
                return (
                  <div
                    className="hbar-app-ui-billing-reference-payment-method-row"
                    role="listitem"
                    key={method.id}
                    data-hbar-app-ui-item-id={method.id}
                  >
                    <span className="hbar-app-ui-billing-reference-payment-method-icon">
                      <BillingIcon tier="md">
                        <MethodIcon method={method} />
                      </BillingIcon>
                    </span>
                    <div className="hbar-app-ui-billing-reference-payment-method-copy">
                      <strong>{method.name}</strong>
                      <small>{method.detail}</small>
                    </div>
                    {method.status && !isPrimary ? (
                      <BillingStatus value={method.status} tone={method.statusTone} />
                    ) : null}
                    {isPrimary ? (
                      <BillingStatus value={content.labels.primary} tone="positive" />
                    ) : (
                      <BillingButton
                        tone="quiet"
                        type="button"
                        disabled={!flow || flow.pending}
                        onClick={() => flow?.onMakePrimary(method.id)}
                      >
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
                      <BillingIcon tier="sm">
                        <MoreHorizontal />
                      </BillingIcon>
                    </BillingIconButton>
                  </div>
                )
              })}
            </div>
          ) : (
            <BillingEmptyState message={content.labels.emptyMethods} />
          )}
        </section>

        <section className="hbar-app-ui-billing-reference-payment-methods-section-head">
          <div>
            <h2>{content.labels.billingContactsTitle}</h2>
            <p>{content.labels.billingContactsDescription}</p>
          </div>
        </section>
        <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-payment-contacts-panel">
          {contacts.length ? (
            <div
              className="hbar-app-ui-billing-reference-payment-contacts-list"
              role="list"
              data-hbar-app-ui-list-strategy={content.contactListStrategy.kind}
            >
              {contacts.map((contact) => (
                <ContactRow contact={contact} key={contact.id} onAction={onAction} variantId={spec.id} />
              ))}
            </div>
          ) : (
            <BillingEmptyState message={content.labels.emptyContacts} />
          )}
          <BillingButton
            className="hbar-app-ui-billing-reference-payment-invite-contact"
            type="button"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'invite-contact' })}
          >
            <BillingIcon tier="sm">
              <Plus />
            </BillingIcon>
            {content.labels.inviteContact}
          </BillingButton>
        </section>

        <div className="hbar-app-ui-billing-reference-payment-address-columns">
          <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-payment-address-column">
            <header>
              <BillingIcon tier="sm">
                <Landmark />
              </BillingIcon>
              <h2>{content.labels.billingAddressTitle}</h2>
            </header>
            <div className="hbar-app-ui-billing-reference-payment-address-lines">
              {content.addressLines.map((line, index) =>
                index === 0 ? (
                  <strong key={`${index}-${line}`}>{line}</strong>
                ) : (
                  <span key={`${index}-${line}`}>{line}</span>
                ),
              )}
            </div>
            <BillingButton type="button" onClick={() => onAction?.({ variantId: spec.id, actionId: 'edit-address' })}>
              {content.labels.editAddress}
            </BillingButton>
          </section>
          <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-payment-address-column">
            <header>
              <BillingIcon tier="sm">
                <ShieldCheck />
              </BillingIcon>
              <h2>{content.labels.taxTitle}</h2>
            </header>
            <BillingValueRows rows={taxRows} />
            <p className="hbar-app-ui-billing-reference-payment-tax-notice">{content.taxNotice}</p>
          </section>
        </div>
      </main>
    </BillingFrame>
  )
}
