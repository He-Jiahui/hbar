import { useEffect } from 'react'
import { useStore } from 'zustand'
import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import { HbarSchemaForm, type HbarSchemaFormLabels } from '@hbar/schema-react'
import type { StorageLocationController } from '@hbar/app-runtime/storage-locations'
import { createHbarSchemaComponents } from './lumen-schema-components'
import { lumenSchemaFormPresentation } from './lumen-schema-presentation'
import './storage-location-settings.css'

const components = createHbarSchemaComponents()
export interface StorageLocationLabels {
  readonly title: string
  readonly description: string
  readonly pointer: string
  readonly active: (path: string) => string
  readonly saved: string
  readonly pending: string
  readonly loading: string
  readonly save: string
  readonly discard: string
  readonly reload: string
  readonly reconcile: string
  readonly retryOriginal: string
  readonly unknown: string
  readonly restart: string
  readonly restarting: string
  readonly manualRestart: string
  readonly error: (code: string) => string
  readonly form: HbarSchemaFormLabels
}
export function HbarStorageLocationSettings({
  controller,
  labels,
  connected,
}: {
  readonly controller: StorageLocationController
  readonly labels: StorageLocationLabels
  readonly connected: boolean
}) {
  const state = useStore(controller.store)
  useEffect(() => {
    if (connected) void controller.read()
  }, [controller, connected])
  const form = state.form
  const busy = state.loading || form?.status === 'submitting'
  const unknown = form?.status === 'unknown'
  const activeRoots = state.snapshot ? new Map(Object.entries(state.snapshot.active)) : new Map<string, string>()
  return (
    <LumenFrame as="section" className="hbar-storage-settings" aria-label={labels.title}>
      <LumenFrame className="hbar-storage-settings-title" role="region" aria-label={labels.title} tabIndex={0}>
        <LumenContentText context="section.title">{labels.title}</LumenContentText>
      </LumenFrame>
      <LumenContentText context="section.description" tone="muted">
        {labels.description}
      </LumenContentText>
      {state.snapshot && (
        <LumenFrame className="hbar-storage-settings-pointer" role="region" aria-label={labels.pointer} tabIndex={0}>
          <LumenContentText context="form.label">{labels.pointer}</LumenContentText>
          <LumenContentText context="resource.path">{state.snapshot.pointerFile}</LumenContentText>
        </LumenFrame>
      )}
      {form && state.snapshot && (
        <HbarSchemaForm
          schema={controller.schema}
          state={form}
          components={components}
          presentation={lumenSchemaFormPresentation}
          labels={labels.form}
          layout="stacked"
          disabled={!connected || state.loading}
          renderFieldContext={(field) => {
            const active = activeRoots.get(field.name)
            return active === undefined ? null : (
              <LumenContentText context="form.help" tone="muted">
                {labels.active(active)}
              </LumenContentText>
            )
          }}
          onIntent={(intent) => {
            if (intent.kind === 'set' && typeof intent.value === 'string') controller.edit(intent.field, intent.value)
            else if (intent.kind === 'reset') controller.reset(intent.field)
          }}
        />
      )}
      {state.loading && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {state.error && (
        <LumenContentText context="feedback.paragraph" role="alert">
          {labels.error(state.error)}
        </LumenContentText>
      )}
      {unknown && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.unknown}
        </LumenContentText>
      )}
      {state.snapshot?.restartRequired && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.pending}
        </LumenContentText>
      )}
      {form?.status === 'succeeded' && !state.snapshot?.restartRequired && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.saved}
        </LumenContentText>
      )}
      {state.restart === 'manual' && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.manualRestart}
        </LumenContentText>
      )}
      <LumenFrame className="hbar-storage-settings-actions" role="toolbar" aria-label={labels.title} tabIndex={0}>
        {unknown && (
          <LumenButton disabled={!connected || busy} onClick={() => void controller.retryOriginal()}>
            {labels.retryOriginal}
          </LumenButton>
        )}
        <LumenButton
          disabled={!connected || busy || unknown || !form?.dirty.length || Boolean(form.issues.length)}
          onClick={() => void controller.save()}
        >
          {labels.save}
        </LumenButton>
        <LumenButton
          variant="text"
          disabled={busy || unknown || !form?.dirty.length}
          onClick={() => controller.discard()}
        >
          {labels.discard}
        </LumenButton>
        <LumenButton variant="text" disabled={!connected || busy} onClick={() => void controller.read()}>
          {unknown ? labels.reconcile : labels.reload}
        </LumenButton>
        {state.snapshot?.restartRequired && (
          <LumenButton
            variant="text"
            disabled={
              !connected ||
              busy ||
              unknown ||
              state.restart === 'pending' ||
              state.restart === 'accepted' ||
              Boolean(form?.dirty.length)
            }
            onClick={() => void controller.restart()}
          >
            {state.restart === 'pending' || state.restart === 'accepted' ? labels.restarting : labels.restart}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
