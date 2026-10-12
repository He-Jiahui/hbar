'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { LumenInput, LumenSelect } from './forms'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import './plan-editor.css'

export type LumenPlanState = 'queued' | 'running' | 'done' | 'skipped' | 'failed' | 'blocked' | 'waiting'

export interface LumenPlanStep {
  id: string
  title: string
  state: LumenPlanState
  stateLabel: string
  detail?: string | undefined
}

export interface LumenPlanListStrategy {
  kind: 'content-grown' | 'pane-scroll'
  expectedMaximum: number
}

export interface LumenPlanEditorLabels {
  title: string
  summary: string
  review: string
  addPlaceholder: string
  add: string
  start: (count: number) => string
  moveUp: (title: string) => string
  moveDown: (title: string) => string
  skip: (title: string) => string
  restore: (title: string) => string
  newStepStateLabel: string
  empty: string
}

export interface LumenPlanEditorEditing {
  titleLabel: (index: number) => string
  statusLabel: (index: number) => string
  statuses: readonly { id: LumenPlanState; label: string }[]
  onTitleChange: (id: string, value: string) => void
  onStatusChange: (id: string, value: LumenPlanState) => void
}

export interface LumenPlanEditorProps {
  labels: LumenPlanEditorLabels
  steps: readonly LumenPlanStep[]
  listStrategy: LumenPlanListStrategy
  draft: string
  busy: boolean
  canAdd: boolean
  canSubmit: boolean
  error?: string | undefined
  before?: React.ReactNode
  after?: React.ReactNode
  actions?: React.ReactNode
  editing?: LumenPlanEditorEditing | undefined
  onDraftChange: (value: string) => void
  onAdd: () => void
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
  onSubmit: () => void
}

function uniquePlanSteps(steps: readonly LumenPlanStep[]): readonly LumenPlanStep[] {
  const seen = new Set<string>()
  return steps.filter((step) => {
    if (seen.has(step.id)) {
      return false
    }
    seen.add(step.id)
    return true
  })
}

function PlanGlyph({ name }: { name: 'add' | 'down' | 'play' | 'remove' | 'restore' | 'up' }) {
  return (
    <svg className="lumen-plan-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'add' ? <path d="M8 3v10M3 8h10" /> : null}
      {name === 'down' ? <path d="m4 6 4 4 4-4" /> : null}
      {name === 'play' ? <path d="m5 3 8 5-8 5Z" /> : null}
      {name === 'remove' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
      {name === 'restore' ? <path d="M5 5H2v-3M2 5a6 6 0 1 1-1 5" /> : null}
      {name === 'up' ? <path d="m4 10 4-4 4 4" /> : null}
    </svg>
  )
}

/** Bounded plan editor. The host owns drafts, stable IDs, limits, status values, and mutations. */
export function LumenPlanEditor({
  labels,
  steps: sourceSteps,
  listStrategy,
  draft,
  busy,
  canAdd,
  canSubmit,
  error,
  before,
  after,
  actions,
  editing,
  onDraftChange,
  onAdd,
  onMove,
  onRemove,
  onSubmit,
}: LumenPlanEditorProps) {
  const steps = uniquePlanSteps(sourceSteps)
  const includedCount = steps.filter((step) => step.state !== 'skipped').length

  return (
    <section {...lumenPartProps("plan-editor")} className="lumen-plan-editor" aria-label={labels.title} aria-busy={busy || undefined}>
      <header>
        <LumenText as="h2" variant="heading">
          {labels.title}
        </LumenText>
        <LumenText as="span" tone="muted" variant="supporting">
          {labels.summary}
        </LumenText>
      </header>
      {before}
      <main>
        {steps.length > 0 ? (
          <div className="lumen-plan-card" data-list-strategy={listStrategy.kind}>
            <ol>
              {steps.map((step, index) => (
                <li key={step.id} data-skipped={step.state === 'skipped' || undefined}>
                  <LumenText as="span" className="lumen-plan-number" tone="subtle" variant="code" aria-hidden="true">
                    {index + 1}
                  </LumenText>
                  {editing ? (
                    <div className="lumen-plan-step-fields">
                      <LumenInput
                        aria-label={editing.titleLabel(index + 1)}
                        value={step.title}
                        disabled={busy}
                        onChange={(event) => editing.onTitleChange(step.id, event.currentTarget.value)}
                      />
                      <LumenSelect
                        aria-label={editing.statusLabel(index + 1)}
                        value={step.state}
                        disabled={busy}
                        onChange={(event) => {
                          const status = editing.statuses.find((item) => item.id === event.currentTarget.value)
                          if (status) {
                            editing.onStatusChange(step.id, status.id)
                          }
                        }}
                      >
                        {editing.statuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </LumenSelect>
                    </div>
                  ) : (
                    <LumenText as="strong" className="lumen-plan-step-title" variant="label">
                      {step.title}
                    </LumenText>
                  )}
                  <div className="lumen-plan-row-actions">
                    <LumenIconButton
                      label={labels.moveUp(step.title)}
                      disabled={busy || index === 0}
                      onClick={() => onMove(step.id, -1)}
                    >
                      <PlanGlyph name="up" />
                    </LumenIconButton>
                    <LumenIconButton
                      label={labels.moveDown(step.title)}
                      disabled={busy || index === steps.length - 1}
                      onClick={() => onMove(step.id, 1)}
                    >
                      <PlanGlyph name="down" />
                    </LumenIconButton>
                    <LumenIconButton
                      label={step.state === 'skipped' ? labels.restore(step.title) : labels.skip(step.title)}
                      disabled={busy}
                      onClick={() => onRemove(step.id)}
                    >
                      <PlanGlyph name={step.state === 'skipped' ? 'restore' : 'remove'} />
                    </LumenIconButton>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <LumenText as="p" className="lumen-plan-empty" tone="muted">
            {labels.empty}
          </LumenText>
        )}
        <form
          className="lumen-plan-add-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (canAdd && !busy) {
              onAdd()
            }
          }}
        >
          <LumenInput
            aria-label={labels.addPlaceholder}
            placeholder={labels.addPlaceholder}
            value={draft}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            disabled={busy || !canAdd}
          />
          <LumenButton type="submit" variant="outlined" disabled={busy || !canAdd}>
            <PlanGlyph name="add" />
            {labels.add}
          </LumenButton>
        </form>
      </main>
      {after}
      {error ? (
        <LumenText as="p" tone="danger" role="alert">
          {error}
        </LumenText>
      ) : null}
      <footer>
        <LumenText as="p" tone="muted" variant="supporting">
          {labels.review}
        </LumenText>
        <div className="lumen-plan-actions">
          {actions}
          <LumenButton tone="primary" disabled={busy || !canSubmit} onClick={onSubmit}>
            <PlanGlyph name="play" />
            {labels.start(includedCount)}
          </LumenButton>
        </div>
      </footer>
    </section>
  )
}
