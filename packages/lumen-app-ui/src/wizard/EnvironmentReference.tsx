'use client'

import {
  Activity,
  ArrowLeft,
  Check,
  Clock3,
  Database,
  FolderArchive,
  Layers3,
  ScrollText,
  Search,
  Zap,
} from 'lucide-react'
import type { LumenWizardContent, LumenWizardReferenceEnvironmentService } from '../wizard'

const icons = {
  database: Database,
  cache: Zap,
  storage: FolderArchive,
  queue: Layers3,
  clock: Clock3,
  search: Search,
  activity: Activity,
  log: ScrollText,
} satisfies Record<LumenWizardReferenceEnvironmentService['icon'], typeof Database>

export default function EnvironmentReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceEnvironment
  if (!flow) {
    return null
  }
  const steps = flow.steps.filter((step, index) => flow.steps.findIndex((other) => other.id === step.id) === index)
  const services = flow.services.filter(
    (service, index) => flow.services.findIndex((other) => other.id === service.id) === index,
  )
  const selected = new Set(flow.selectedServiceIds)
  const count = services.filter((service) => selected.has(service.id)).length
  const seconds = services.reduce(
    (total, service) =>
      total +
      (selected.has(service.id) && Number.isFinite(service.deploySeconds) ? Math.max(0, service.deploySeconds) : 0),
    0,
  )
  return (
    <div className="hbar-app-ui-wizard-environment-frame">
      <header className="hbar-app-ui-wizard-environment-header">
        <div className="hbar-app-ui-wizard-environment-toolbar">
          <button type="button" className="hbar-app-ui-wizard-environment-back" aria-label={flow.labels.back}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="hbar-app-ui-wizard-environment-title">
            <h1>{flow.labels.title}</h1>
            <p>{flow.labels.detail}</p>
          </div>
          <button type="button" className="hbar-app-ui-wizard-environment-save">
            {flow.labels.save}
          </button>
        </div>
        <ol className="hbar-app-ui-wizard-environment-steps">
          {steps.map((step, index) => {
            const complete = flow.completedStepIds.includes(step.id)
            const current = step.id === flow.currentStepId
            return (
              <li key={step.id}>
                <span
                  className={`hbar-app-ui-wizard-environment-step-mark ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                  aria-hidden="true"
                >
                  {complete ? <Check /> : index + 1}
                </span>
                <span className="hbar-app-ui-wizard-environment-step-label">{step.label}</span>
                {index < steps.length - 1 && (
                  <span className="hbar-app-ui-wizard-environment-step-line" aria-hidden="true" />
                )}
              </li>
            )
          })}
        </ol>
      </header>
      <div className="hbar-app-ui-wizard-environment-scroll" data-hbar-app-ui-list-strategy={flow.listStrategy.kind}>
        <div className="hbar-app-ui-wizard-environment-content">
          <h2>{flow.labels.heading}</h2>
          <p className="hbar-app-ui-wizard-environment-subtitle">{flow.labels.subtitle}</p>
          {services.length ? (
            <div className="hbar-app-ui-wizard-environment-services" role="group" aria-label={flow.labels.group}>
              {services.map((service) => {
                const Icon = icons[service.icon]
                return (
                  <button
                    key={service.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected.has(service.id)}
                    onClick={() => flow.onServiceToggle(service.id)}
                  >
                    <span className="hbar-app-ui-wizard-environment-card-top" aria-hidden="true">
                      <span className="hbar-app-ui-wizard-environment-icon">
                        <Icon />
                      </span>
                      <span className="hbar-app-ui-wizard-environment-check">
                        {selected.has(service.id) && <Check />}
                      </span>
                    </span>
                    <span className="hbar-app-ui-wizard-environment-name">{service.label}</span>
                    <span className="hbar-app-ui-wizard-environment-detail">{service.detail}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="hbar-app-ui-wizard-environment-empty">{flow.labels.empty}</p>
          )}
          <p className="hbar-app-ui-wizard-environment-safety">{flow.labels.safety}</p>
        </div>
      </div>
      <div className="hbar-app-ui-wizard-environment-footer">
        <div>
          <p>{flow.labels.selection(count, services.length)}</p>
          <p>{flow.labels.estimate(seconds)}</p>
        </div>
        <button type="button">{flow.labels.next}</button>
      </div>
    </div>
  )
}
