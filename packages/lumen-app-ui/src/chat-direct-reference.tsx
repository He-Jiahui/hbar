'use client'

import * as React from 'react'
import { CheckCheck, Phone, Search, Video } from 'lucide-react'
import { LumenInput } from './forms'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import type { LumenChatContact, LumenChatDirectContent, LumenChatMessage, LumenChatProps } from './chat'
import type { LumenChatDirectReferenceLayout } from './chat/reference-content'
import './chat-direct-reference.css'

export interface LumenChatDirectReferenceProps {
  readonly content: LumenChatDirectContent
  readonly layout: LumenChatDirectReferenceLayout
  readonly composer: React.ReactNode
  readonly onAction?: LumenChatProps['onAction'] | undefined
}

function report(onAction: LumenChatDirectReferenceProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function Avatar({ initials }: { readonly initials: string }) {
  return (
    <span className="lumen-chat-direct-avatar" aria-hidden="true">
      {initials}
    </span>
  )
}

function ContactButton({
  contact,
  selected,
  onSelect,
}: {
  readonly contact: LumenChatContact
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  return (
    <li>
      <LumenButton
        className="lumen-chat-direct-contact"
        variant={selected ? 'solid' : 'text'}
        aria-pressed={selected}
        data-hbar-app-ui-action="direct:select-contact"
        onClick={onSelect}
      >
        <Avatar initials={contact.initials} />
        <span className="lumen-chat-direct-contact-copy">
          <strong>{contact.name}</strong>
          <small>{contact.meta}</small>
        </span>
        <span className="lumen-chat-direct-contact-meta">
          {contact.time ? <time>{contact.time}</time> : null}
          {contact.unreadCount ? <span className="lumen-chat-direct-unread">{contact.unreadCount}</span> : null}
        </span>
      </LumenButton>
    </li>
  )
}

function DirectMessage({ message, readLabel }: { readonly message: LumenChatMessage; readonly readLabel: string }) {
  return (
    <article
      className={message.outgoing ? 'lumen-chat-direct-message is-outgoing' : 'lumen-chat-direct-message is-incoming'}
    >
      <div className="lumen-chat-direct-bubble">
        <LumenText as="p">{message.body}</LumenText>
        <footer>
          <LumenText as="small" tone="muted" variant="supporting">
            {message.meta}
          </LumenText>
          {message.outgoing && message.read ? (
            <span className="lumen-chat-direct-read" role="img" aria-label={readLabel}>
              <CheckCheck aria-hidden="true" />
            </span>
          ) : null}
          {message.outgoing && !message.read && message.status ? (
            <LumenText as="small" tone="muted" variant="supporting">
              {message.status}
            </LumenText>
          ) : null}
        </footer>
      </div>
    </article>
  )
}

export function LumenChatDirectReference({ content, layout, composer, onAction }: LumenChatDirectReferenceProps) {
  const searchId = React.useId()
  const flow = content.referenceFlow
  const contacts = uniqueById(content.contacts)
  const messages = uniqueById(content.messages)
  const query = flow?.query ?? ''
  const queryKey = query.trim().toLocaleLowerCase()
  const filteredContacts = queryKey
    ? contacts.filter((contact) =>
        `${contact.name} ${contact.meta} ${contact.time ?? ''}`.toLocaleLowerCase().includes(queryKey),
      )
    : contacts
  const activeContactId = flow?.contactId ?? content.initialContactId
  const selectedContact = contacts.find((contact) => contact.id === activeContactId) ?? contacts[0]
  const conversationMessages = selectedContact
    ? messages.filter((message) => message.contactId === selectedContact.id)
    : []

  return (
    <div className="lumen-chat-direct-reference" data-hbar-app-ui-region="direct-messages">
      <aside className="lumen-chat-direct-rail" aria-label={layout.labels.search}>
        <label className="lumen-chat-direct-search" htmlFor={searchId}>
          <Search className="lumen-chat-direct-icon lumen-chat-direct-icon-sm" aria-hidden="true" />
          <LumenInput
            id={searchId}
            aria-label={layout.labels.search}
            autoComplete="off"
            data-hbar-app-ui-action="direct:query-change"
            data-hbar-app-ui-field="conversation-search"
            onChange={(event) => flow?.onQueryChange?.(event.currentTarget.value)}
            placeholder={layout.labels.searchPlaceholder}
            readOnly={!flow?.onQueryChange}
            type="search"
            value={query}
          />
        </label>
        <ul
          className="lumen-chat-direct-contact-list"
          data-hbar-app-ui-region="direct-contact-list"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {filteredContacts.length ? (
            filteredContacts.map((contact) => (
              <ContactButton
                key={contact.id}
                contact={contact}
                selected={contact.id === selectedContact?.id}
                onSelect={() => {
                  if (flow) {
                    flow.onContactChange(contact.id)
                  } else {
                    report(onAction, 'direct:select-contact', contact.id)
                  }
                }}
              />
            ))
          ) : (
            <li className="lumen-chat-direct-empty">
              <LumenText as="span" tone="muted">
                {queryKey ? layout.labels.emptySearch : content.labels.emptyContacts}
              </LumenText>
            </li>
          )}
        </ul>
      </aside>

      <section className="lumen-chat-direct-conversation" data-hbar-app-ui-region="conversation">
        <header className="lumen-chat-direct-header">
          {selectedContact ? <Avatar initials={selectedContact.initials} /> : null}
          <div className="lumen-chat-direct-title">
            <LumenText as="h2" variant="heading">
              {selectedContact?.name ?? content.labels.emptyContacts}
            </LumenText>
            {selectedContact?.status ? (
              <LumenStatus value={selectedContact.status} />
            ) : (
              <LumenText as="p" tone="muted" variant="supporting">
                {content.labels.conversationDetail}
              </LumenText>
            )}
          </div>
          <div className="lumen-chat-direct-header-actions">
            <LumenButton
              className="lumen-chat-direct-icon-button"
              variant="text"
              aria-label={layout.labels.voiceCall}
              disabled={!selectedContact}
              data-hbar-app-ui-action="direct:start-voice-call"
              onClick={() => report(onAction, 'direct:start-voice-call', selectedContact?.id)}
            >
              <Phone className="lumen-chat-direct-icon lumen-chat-direct-icon-sm" aria-hidden="true" />
            </LumenButton>
            <LumenButton
              className="lumen-chat-direct-icon-button"
              variant="text"
              aria-label={layout.labels.videoCall}
              disabled={!selectedContact}
              data-hbar-app-ui-action="direct:start-video-call"
              onClick={() => report(onAction, 'direct:start-video-call', selectedContact?.id)}
            >
              <Video className="lumen-chat-direct-icon lumen-chat-direct-icon-sm" aria-hidden="true" />
            </LumenButton>
          </div>
        </header>

        <div className="lumen-chat-direct-pane">
          <LumenText as="p" className="lumen-chat-direct-day" variant="supporting">
            {layout.labels.day}
          </LumenText>
          <div
            className="lumen-chat-direct-messages"
            data-hbar-app-ui-region="conversation-messages"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {conversationMessages.length ? (
              conversationMessages.map((message) => (
                <DirectMessage key={message.id} message={message} readLabel={layout.labels.read} />
              ))
            ) : (
              <LumenText as="p" className="lumen-chat-direct-empty" tone="muted">
                {content.labels.emptyMessages}
              </LumenText>
            )}
          </div>
        </div>

        <footer className="lumen-chat-direct-composer" data-hbar-app-ui-region="composer">
          {selectedContact ? <Avatar initials={selectedContact.initials} /> : null}
          {composer}
        </footer>
      </section>
    </div>
  )
}
