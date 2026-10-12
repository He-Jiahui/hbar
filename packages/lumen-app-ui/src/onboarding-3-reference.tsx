'use client'

import { ArrowUpRight, Check } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenText } from './primitives'
import './onboarding-3-reference.css'

export interface LumenOnboarding3ReferenceTask {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly checked: boolean
  readonly checkboxLabel: string
  readonly actionLabel: string
}

export interface LumenOnboarding3ReferenceContent {
  readonly title: string
  readonly description: string
  readonly progressLabel: string
  readonly progressText: string
  readonly completedCount: number
  readonly totalCount: number
  readonly visualFillPercent: number
  readonly tasks: readonly LumenOnboarding3ReferenceTask[]
  readonly footerText: string
  readonly emptyTasksText: string
}

export interface LumenOnboarding3ReferenceViewModel {
  readonly content: LumenOnboarding3ReferenceContent
  readonly onCompletionChangeRequest: (taskId: string, checked: boolean) => void
  readonly onTaskActionRequest: (taskId: string) => void
}

export interface LumenOnboarding3ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding3ReferenceViewModel
}

export function LumenOnboarding3Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding3ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding3-reference',
    'hbar-app-ui-onboarding-variant-3',
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
      as="div"
      material="solid"
      className="lumen-onboarding3-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={3}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <header className="lumen-onboarding3-header">
        <LumenText as="h2" variant="heading">
          {content.title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {content.description}
        </LumenText>
      </header>

      <div className="lumen-onboarding3-progress-row">
        <span
          className="lumen-onboarding3-progress-track"
          role="progressbar"
          aria-label={content.progressLabel}
          aria-valuemin={0}
          aria-valuemax={content.totalCount}
          aria-valuenow={content.completedCount}
        >
          <span className="lumen-onboarding3-progress-fill" style={{ inlineSize: `${content.visualFillPercent}%` }} />
        </span>
        <LumenText as="p" className="lumen-onboarding3-progress-text" tone="muted">
          {content.progressText}
        </LumenText>
      </div>

      {content.tasks.length ? (
        <ul className="lumen-onboarding3-task-list">
          {content.tasks.map((task) => (
            <li className="lumen-onboarding3-task" key={task.id} data-onboarding3-task-id={task.id}>
              <button
                className="lumen-onboarding3-checkbox"
                type="button"
                role="checkbox"
                aria-label={task.checkboxLabel}
                aria-checked={task.checked}
                data-onboarding3-completion
                onClick={() => viewModel.onCompletionChangeRequest(task.id, !task.checked)}
              >
                {task.checked ? <Check className="lumen-onboarding3-check-icon" aria-hidden="true" /> : null}
              </button>
              <div className="lumen-onboarding3-task-copy">
                <LumenText as="p" className={task.checked ? 'is-complete' : undefined} variant="label">
                  {task.label}
                </LumenText>
                <LumenText as="p" className="lumen-onboarding3-task-detail" tone="muted">
                  {task.detail}
                </LumenText>
              </div>
              <a
                className="lumen-onboarding3-task-action"
                href="#"
                data-onboarding3-task-action
                onClick={(event) => {
                  event.preventDefault()
                  viewModel.onTaskActionRequest(task.id)
                }}
              >
                <span>{task.actionLabel}</span>
                <ArrowUpRight className="lumen-onboarding3-action-icon" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <LumenText as="p" className="lumen-onboarding3-empty" tone="muted">
          {content.emptyTasksText}
        </LumenText>
      )}

      <LumenText as="p" className="lumen-onboarding3-footer" data-onboarding3-footer tone="muted" variant="supporting">
        {content.footerText}
      </LumenText>
    </LumenSurface>
  )
}
