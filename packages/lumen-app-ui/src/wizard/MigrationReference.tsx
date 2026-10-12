'use client'

import { Check, TriangleAlert } from 'lucide-react'
import type { LumenWizardContent } from '../wizard'

export default function MigrationReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceMigration
  if (!flow) {
    return null
  }
  const tasks = flow.tasks.filter((task, index) => flow.tasks.findIndex((other) => other.id === task.id) === index)
  const progress = Number.isFinite(flow.progress) ? Math.max(0, Math.min(100, flow.progress)) : 0
  return (
    <section className="hbar-app-ui-wizard-migration-card">
      <div className="hbar-app-ui-wizard-migration-header">
        <div>
          <h2>{flow.labels.title}</h2>
          <p>{flow.labels.detail}</p>
        </div>
        <p>{flow.labels.remaining}</p>
      </div>
      <div className="hbar-app-ui-wizard-migration-body">
        <div className="hbar-app-ui-wizard-migration-progress">
          <div
            role="progressbar"
            aria-label={flow.labels.progressBar}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ inlineSize: `${progress}%` }} />
          </div>
          <p>{flow.labels.progress(progress)}</p>
        </div>
        {tasks.length ? (
          <ol className="hbar-app-ui-wizard-migration-tasks" data-hbar-app-ui-list-strategy={flow.listStrategy.kind}>
            {tasks.map((task) => {
              let mark = <span />
              if (task.status === 'complete') {
                mark = <Check />
              }
              if (task.status === 'warning') {
                mark = <TriangleAlert />
              }
              return (
                <li key={task.id}>
                  <span className={`hbar-app-ui-wizard-migration-status is-${task.status}`} aria-hidden="true">
                    {mark}
                  </span>
                  <span className="hbar-app-ui-wizard-migration-task-copy">
                    <p>{task.label}</p>
                    <p>{task.detail}</p>
                  </span>
                  {task.action && <button type="button">{task.action}</button>}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="hbar-app-ui-wizard-migration-empty">{flow.labels.empty}</p>
        )}
        <p className="hbar-app-ui-wizard-migration-safety">{flow.labels.safety}</p>
      </div>
      <div className="hbar-app-ui-wizard-migration-footer">
        <button type="button">{flow.labels.cancel}</button>
        <button type="button">{flow.labels.background}</button>
      </div>
    </section>
  )
}
