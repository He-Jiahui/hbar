import {
  LumenButton,
  LumenFrame,
  LumenInput,
  LumenNavigationButton,
  LumenOption,
  LumenSelect,
  LumenText,
  LumenTextarea,
} from '@lumen/app-ui'
import { useState } from 'react'
import { HbarAppUiStatus } from 'hbar-app-ui'
import type { HbarAppUiEvent, HbarAppUiProfileControl, HbarAppUiVariantSpec } from 'hbar-app-ui/catalog'

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
    <LumenFrame className="hbar-app-ui-profile-controls" aria-label="Variant controls">
      {spec.profile.controls.map((control) => (
        <LumenFrame className="hbar-app-ui-profile-control" key={control}>
          <LumenNavigationButton
            size="s"
            selected={activated === control}
            indicatorEdge="bottom"
            data-hbar-app-ui-control={control}
            onClick={() => trigger(control)}
          >
            {controlLabels[control]}
          </LumenNavigationButton>
          {openControl === control && control === 'search' && (
            <LumenInput
              aria-label={`${spec.title} search`}
              placeholder="Search within this surface"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}
          {openControl === control && control === 'picker' && (
            <LumenSelect
              aria-label={`${spec.title} selection`}
              defaultValue="default"
              onChange={(event) => onAction({ variantId: spec.id, actionId: control, value: event.target.value })}
            >
              <LumenOption value="default">Default scope</LumenOption>
              <LumenOption value="local">Local workspace</LumenOption>
              <LumenOption value="shared">Shared workspace</LumenOption>
            </LumenSelect>
          )}
          {openControl === control && control === 'tabs' && (
            <LumenFrame className="hbar-app-ui-profile-subtabs" role="group" aria-label={`${spec.title} views`}>
              {['Overview', 'Details', 'Activity'].map((view) => (
                <LumenButton type="button" key={view} onClick={() => onAction({ variantId: spec.id, actionId: control, value: view })}>
                  {view}
                </LumenButton>
              ))}
            </LumenFrame>
          )}
          {openControl === control && control === 'compose' && (
            <LumenTextarea
              aria-label={`${spec.title} composer`}
              placeholder="Add a note"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}
          {openControl === control && feedbackControls.has(control) && (
            <LumenText as="small" className="hbar-app-ui-profile-feedback" aria-live="polite">
              {controlLabels[control]} ready · {spec.profile.initialState}
            </LumenText>
          )}
        </LumenFrame>
      ))}
    </LumenFrame>
  )
}

type VariantHarnessProps = {
  readonly spec: HbarAppUiVariantSpec
  readonly onAction: (event: HbarAppUiEvent) => void
}

/**
 * Preview-only inspector controls. The selected package component is mounted
 * in a separate canvas so catalog metadata never becomes part of its DOM.
 */
export function VariantHarness({ spec, onAction }: VariantHarnessProps) {
  const { profile } = spec
  return (
    <LumenFrame as="section"
      className="hbar-app-ui-preview-scenario"
      data-hbar-app-ui-harness={spec.id}
      data-hbar-app-ui-controls={profile.controls.join(',')}
      aria-label={`${spec.title} preview controls`}
    >
      <LumenFrame className="hbar-app-ui-preview-scenario-heading">
        <LumenText as="strong">Scenario controls</LumenText>
        <HbarAppUiStatus value={profile.initialState} tone={profileTone(profile.initialState)} />
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-preview-profile-meta">
        <LumenText as="span">{profile.surface}</LumenText>
        <LumenText as="small">{profile.itemCount} seeded items</LumenText>
        <LumenText as="code">{profile.key}</LumenText>
      </LumenFrame>
      <VariantProfileControls spec={spec} onAction={onAction} />
    </LumenFrame>
  )
}

function profileTone(state: HbarAppUiVariantSpec['profile']['initialState']): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (state === 'success') return 'positive'
  if (state === 'active' || state === 'warning' || state === 'review') return 'warning'
  if (state === 'error') return 'danger'
  return 'neutral'
}
