import { useEffect } from 'react'
import { useStore } from 'zustand'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarSchemaForm, type HbarSchemaFormLabels } from '@hbar/schema-react'
import type { StorageLocationController } from '@hbar/app-runtime/storage-locations'
import { createHbarSchemaComponents } from './lumen-schema-components'
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
  return (
    <LumenFrame as="section" className="hbar-storage-settings" aria-label={labels.title}>
      <LumenText as="h2" variant="heading">
        {labels.title}
      </LumenText>
      <LumenText as="p" tone="muted">
        {labels.description}
      </LumenText>
      {state.snapshot && (
        <LumenFrame className="hbar-storage-settings-pointer">
          <LumenText as="span" variant="label">
            {labels.pointer}
          </LumenText>
          <LumenText as="code">{state.snapshot.pointerFile}</LumenText>
        </LumenFrame>
      )}
      {form && state.snapshot && (
        <HbarSchemaForm
          schema={controller.schema}
          state={form}
          components={components}
          labels={labels.form}
          layout="stacked"
          disabled={!connected || state.loading}
          renderFieldContext={(field) => (
            <LumenText as="small" tone="muted">
              {labels.active(state.snapshot!.active[field.name as keyof typeof state.snapshot.active])}
            </LumenText>
          )}
          onIntent={(intent) => {
            if (intent.kind === 'set' && typeof intent.value === 'string') controller.edit(intent.field, intent.value)
            else if (intent.kind === 'reset') controller.reset(intent.field)
          }}
        />
      )}
      {state.loading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {state.error && (
        <LumenText as="p" role="alert">
          {labels.error(state.error)}
        </LumenText>
      )}
      {unknown && (
        <LumenText as="p" role="status">
          {labels.unknown}
        </LumenText>
      )}
      {state.snapshot?.restartRequired && (
        <LumenText as="p" role="status">
          {labels.pending}
        </LumenText>
      )}
      {form?.status === 'succeeded' && !state.snapshot?.restartRequired && (
        <LumenText as="p" role="status">
          {labels.saved}
        </LumenText>
      )}
      {state.restart === 'manual' && (
        <LumenText as="p" role="status">
          {labels.manualRestart}
        </LumenText>
      )}
      <LumenFrame className="hbar-storage-settings-actions">
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
