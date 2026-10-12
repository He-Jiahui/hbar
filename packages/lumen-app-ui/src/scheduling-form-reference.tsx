'use client'

import * as React from 'react'
import { LumenInput, LumenSelect, LumenTextarea } from './forms'
import type {
  LumenSchedulingAction,
  LumenSchedulingAttendee,
  LumenSchedulingChoice,
  LumenSchedulingListStrategy,
} from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-form-reference.css'

export interface LumenSchedulingFormReferenceContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly name: string
    readonly namePlaceholder: string
    readonly attendees: string
    readonly addAttendee: string
    readonly attendeePlaceholder: string
    readonly removeAttendee: (name: string) => string
    readonly date: string
    readonly starts: string
    readonly ends: string
    readonly attachmentTitle: string
    readonly attachmentHint: string
    readonly attach: string
    readonly meetingLink: string
    readonly meetingLinkPlaceholder: string
    readonly notes: string
    readonly notesPlaceholder: string
    readonly cancel: string
    readonly create: string
  }
  readonly name: string
  readonly attendeeQuery: string
  readonly attendees: readonly LumenSchedulingAttendee[]
  readonly attendeeStrategy: LumenSchedulingListStrategy
  readonly date: string
  readonly starts: readonly LumenSchedulingChoice[]
  readonly ends: readonly LumenSchedulingChoice[]
  readonly startId: string
  readonly endId: string
  readonly meetingLink: string
  readonly notes: string
  readonly onNameChange?: ((value: string) => void) | undefined
  readonly onAttendeeQueryChange?: ((value: string) => void) | undefined
  readonly onRemoveAttendee?: ((id: string) => void) | undefined
  readonly onDateChange?: ((value: string) => void) | undefined
  readonly onStartChange?: ((id: string) => void) | undefined
  readonly onEndChange?: ((id: string) => void) | undefined
  readonly onMeetingLinkChange?: ((value: string) => void) | undefined
  readonly onNotesChange?: ((value: string) => void) | undefined
}

type FormIconKind = 'remove' | 'attach'
function FormIcon({ kind }: { readonly kind: FormIconKind }): React.ReactElement {
  const paths = {
    remove: 'm5 5 14 14M19 5 5 19',
    attach:
      'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  }
  return (
    <svg className={`lumen-scheduling-form-icon is-${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

function FormChoice({
  id,
  label,
  items,
  value,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenSchedulingChoice[]
  readonly value: string
  readonly onChange: ((id: string) => void) | undefined
}): React.ReactElement {
  const options = uniqueLumenSchedulingItems(items)
  const selected = selectLumenSchedulingItem(options, value)
  return (
    <div className="lumen-scheduling-form-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <LumenSelect
          id={id}
          variant="plain"
          className="lumen-scheduling-form-select"
          value={selected?.id ?? ''}
          disabled={!options.length}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </LumenSelect>
      </div>
    </div>
  )
}

export function LumenSchedulingFormReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingFormReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const instanceId = React.useId()
  const attendees = uniqueLumenSchedulingItems(content.attendees)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const updateEdges = React.useCallback(() => {
    const pane = scrollRef.current
    if (pane) {
      const next = { top: pane.scrollTop > 1, bottom: pane.scrollTop + pane.clientHeight < pane.scrollHeight - 1 }
      setEdges((current) => (current.top === next.top && current.bottom === next.bottom ? current : next))
    }
  }, [])
  React.useEffect(() => {
    const pane = scrollRef.current
    if (!pane) {
      return undefined
    }
    const observer = new ResizeObserver(updateEdges)
    observer.observe(pane)
    for (const child of pane.children) {
      observer.observe(child)
    }
    updateEdges()
    return () => observer.disconnect()
  }, [content, updateEdges])
  return (
    <section className="lumen-scheduling-form-card">
      <header data-hbar-app-ui-region="form-header">
        <h2>{content.labels.title}</h2>
        <p>{content.labels.description}</p>
      </header>
      <div className="lumen-scheduling-form-body">
        <div
          className="lumen-scheduling-form-scroll"
          data-hbar-app-ui-region="form-scroll"
          ref={scrollRef}
          onScroll={updateEdges}
          data-scroll-top={edges.top}
          data-scroll-bottom={edges.bottom}
        >
          <div className="lumen-scheduling-form-field">
            <label htmlFor={`${instanceId}-name`}>{content.labels.name}</label>
            <LumenInput
              type="text"
              id={`${instanceId}-name`}
              variant="plain"
              value={content.name}
              placeholder={content.labels.namePlaceholder}
              onChange={(event) => content.onNameChange?.(event.currentTarget.value)}
            />
          </div>
          <div className="lumen-scheduling-form-attendees" data-hbar-app-ui-region="form-attendees">
            <p>{content.labels.attendees}</p>
            <div data-hbar-app-ui-list-strategy={content.attendeeStrategy.kind}>
              {attendees.length
                ? attendees.map((person) => (
                    <span className="lumen-scheduling-form-person" key={person.id}>
                      <span className="lumen-scheduling-form-initials" aria-hidden="true">
                        {person.initials}
                      </span>
                      <span>{person.name}</span>
                      <button
                        type="button"
                        aria-label={content.labels.removeAttendee(person.name)}
                        data-hbar-app-ui-action="remove-attendee"
                        data-hbar-app-ui-target={person.id}
                        onClick={() => {
                          content.onRemoveAttendee?.(person.id)
                          onAction?.({ actionId: 'remove-attendee', value: person.id })
                        }}
                      >
                        <FormIcon kind="remove" />
                      </button>
                    </span>
                  ))
                : null}
              <LumenInput
                type="text"
                variant="plain"
                aria-label={content.labels.addAttendee}
                value={content.attendeeQuery}
                placeholder={content.labels.attendeePlaceholder}
                onChange={(event) => content.onAttendeeQueryChange?.(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="lumen-scheduling-form-field is-icon">
            <label htmlFor={`${instanceId}-date`}>{content.labels.date}</label>
            <div>
              <LumenInput
                type="text"
                id={`${instanceId}-date`}
                variant="plain"
                className="is-calendar"
                value={content.date}
                onChange={(event) => content.onDateChange?.(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="lumen-scheduling-form-times">
            <FormChoice
              id={`${instanceId}-start`}
              label={content.labels.starts}
              items={content.starts}
              value={content.startId}
              onChange={content.onStartChange}
            />
            <FormChoice
              id={`${instanceId}-end`}
              label={content.labels.ends}
              items={content.ends}
              value={content.endId}
              onChange={content.onEndChange}
            />
          </div>
          <div className="lumen-scheduling-form-attachments" data-hbar-app-ui-region="form-attachments">
            <div>
              <p>{content.labels.attachmentTitle}</p>
              <p>{content.labels.attachmentHint}</p>
            </div>
            <button type="button" onClick={() => onAction?.({ actionId: 'attach' })}>
              <FormIcon kind="attach" />
              {content.labels.attach}
            </button>
          </div>
          <div className="lumen-scheduling-form-field is-icon">
            <label htmlFor={`${instanceId}-link`}>{content.labels.meetingLink}</label>
            <div>
              <LumenInput
                type="text"
                id={`${instanceId}-link`}
                variant="plain"
                className="is-link"
                value={content.meetingLink}
                placeholder={content.labels.meetingLinkPlaceholder}
                onChange={(event) => content.onMeetingLinkChange?.(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="lumen-scheduling-form-field is-notes">
            <label htmlFor={`${instanceId}-notes`}>{content.labels.notes}</label>
            <LumenTextarea
              id={`${instanceId}-notes`}
              variant="plain"
              rows={3}
              value={content.notes}
              placeholder={content.labels.notesPlaceholder}
              onChange={(event) => content.onNotesChange?.(event.currentTarget.value)}
            />
          </div>
        </div>
      </div>
      <footer data-hbar-app-ui-region="form-footer">
        <button type="button" onClick={() => onAction?.({ actionId: 'cancel' })}>
          {content.labels.cancel}
        </button>
        <button type="button" className="is-create" onClick={() => onAction?.({ actionId: 'create-schedule' })}>
          {content.labels.create}
        </button>
      </footer>
    </section>
  )
}
