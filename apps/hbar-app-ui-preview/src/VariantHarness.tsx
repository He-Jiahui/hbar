import { useState, type ReactNode } from 'react'
import { HbarAppUiButton, HbarAppUiStatus } from 'hbar-app-ui'
import type { HbarAppUiEvent, HbarAppUiProfileControl, HbarAppUiVariantSpec } from 'hbar-app-ui'

const controlLabels: Readonly<Record<HbarAppUiProfileControl, string>> = {
  search: 'Search',
  filter: 'Filter',
  tabs: 'Switch view',
  picker: 'Choose',
  attachments: 'Attachments',
  upload: 'Upload',
  retry: 'Retry',
  save: 'Save',
  confirm: 'Confirm',
  sort: 'Sort',
  pagination: 'Next page',
  drag: 'Reorder',
  expand: 'Expand',
  compose: 'Compose',
}

const feedbackControls = new Set<HbarAppUiProfileControl>([
  'attachments',
  'upload',
  'retry',
  'save',
  'confirm',
  'sort',
  'pagination',
  'drag',
  'expand',
  'filter',
])

type VariantProfileControlsProps = {
  readonly spec: HbarAppUiVariantSpec
  readonly onAction: (event: HbarAppUiEvent) => void
}

function VariantProfileControls({ spec, onAction }: VariantProfileControlsProps) {
  const [activated, setActivated] = useState<HbarAppUiProfileControl | undefined>()
  const [openControl, setOpenControl] = useState<HbarAppUiProfileControl | undefined>()
  const [input, setInput] = useState('')

  const trigger = (control: HbarAppUiProfileControl) => {
    setActivated(control)
    setOpenControl((current) => current === control ? undefined : control)
    onAction({ variantId: spec.id, actionId: control, value: spec.profile.initialState })
  }

  return (
    <div className="hbar-app-ui-profile-controls" aria-label="Variant controls">
      {spec.profile.controls.map((control) => (
        <div className="hbar-app-ui-profile-control" key={control}>
          <HbarAppUiButton
            type="button"
            className={activated === control ? 'is-active' : ''}
            data-hbar-app-ui-control={control}
            onClick={() => trigger(control)}
          >
            {controlLabels[control]}
          </HbarAppUiButton>
          {openControl === control && control === 'search' && (
            <input
              aria-label={`${spec.title} search`}
              placeholder="Search within this surface"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}
          {openControl === control && control === 'picker' && (
            <select
              aria-label={`${spec.title} selection`}
              defaultValue="default"
              onChange={(event) => onAction({ variantId: spec.id, actionId: control, value: event.target.value })}
            >
              <option value="default">Default scope</option>
              <option value="local">Local workspace</option>
              <option value="shared">Shared workspace</option>
            </select>
          )}
          {openControl === control && control === 'tabs' && (
            <div className="hbar-app-ui-profile-subtabs" role="group" aria-label={`${spec.title} views`}>
              {['Overview', 'Details', 'Activity'].map((view) => (
                <button type="button" key={view} onClick={() => onAction({ variantId: spec.id, actionId: control, value: view })}>
                  {view}
                </button>
              ))}
            </div>
          )}
          {openControl === control && control === 'compose' && (
            <textarea
              aria-label={`${spec.title} composer`}
              placeholder="Add a note"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}
          {openControl === control && feedbackControls.has(control) && (
            <small className="hbar-app-ui-profile-feedback" aria-live="polite">
              {controlLabels[control]} ready · {spec.profile.initialState}
            </small>
          )}
        </div>
      ))}
    </div>
  )
}

type VariantHarnessProps = {
  readonly spec: HbarAppUiVariantSpec
  readonly children: ReactNode
  readonly onAction: (event: HbarAppUiEvent) => void
}

/**
 * Preview-only inspector chrome. The component package receives only the
 * recreated surface; this harness owns labels, profile facts and test hooks.
 */
export function VariantHarness({ spec, children, onAction }: VariantHarnessProps) {
  const { profile } = spec
  return (
    <article
      className={`hbar-app-ui-preview-variant hbar-app-ui-surface-${profile.surface} hbar-app-ui-state-${profile.initialState} hbar-app-ui-visual-${profile.visualMode}`}
      data-hbar-app-ui-variant={spec.id}
      data-hbar-app-ui-profile={profile.key}
      data-hbar-app-ui-surface={profile.surface}
      data-hbar-app-ui-state={profile.initialState}
      data-hbar-app-ui-controls={profile.controls.join(',')}
    >
      <div className="hbar-app-ui-preview-variant-label">
        <span>{spec.title}</span>
        <small>{spec.description}</small>
      </div>
      <div className="hbar-app-ui-preview-profile-meta">
        <HbarAppUiStatus value={profile.initialState} tone={profileTone(profile.initialState)} />
        <span>{profile.surface}</span>
        <small>{profile.itemCount} seeded items</small>
        <code>{profile.key}</code>
      </div>
      <VariantProfileControls spec={spec} onAction={onAction} />
      <div className="hbar-app-ui-preview-component-slot">{children}</div>
    </article>
  )
}

function profileTone(state: HbarAppUiVariantSpec['profile']['initialState']): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (state === 'success') return 'positive'
  if (state === 'active' || state === 'warning' || state === 'review') return 'warning'
  if (state === 'error') return 'danger'
  return 'neutral'
}
