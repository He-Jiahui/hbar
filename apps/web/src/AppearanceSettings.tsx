import { type FormEvent } from 'react'
import { Palette } from 'lucide-react'
import { useStore } from 'zustand'
import {
  LumenContentText,
  LumenButton,
  LumenFrame,
  LumenFormField,
  LumenIcon,
  LumenInput,
  LumenPopupSelect,
  LumenToggleGroup,
  LumenText,
  type LumenSize,
} from '@lumen/app-ui'
import { resolveWebTheme, type WebResolvedTheme, type WebThemePreference } from './theme'
import { hasWebAppearanceOverrides, sameWebAppearance } from './appearance'
import { partiallyApplied, type AppearanceEditor } from './appearance-editor'
import './AppearanceSettings.css'

type AppearanceDimension = 'controlSize' | 'textSize' | 'cornerSize'
const THEME_CHOICES = ['system', 'light', 'dark'] as const

export interface WebAppearanceSettingsLabels {
  readonly group: string
  readonly title: string
  readonly description: string
  readonly deviceScope: string
  readonly theme: {
    readonly label: string
    readonly description: string
    readonly system: string
    readonly light: string
    readonly dark: string
  }
  readonly controlSize: { readonly label: string; readonly description: string }
  readonly textSize: { readonly label: string; readonly description: string }
  readonly cornerSize: { readonly label: string; readonly description: string }
  readonly sizeOption: (dimension: AppearanceDimension, size: LumenSize) => string
  readonly preview: {
    readonly title: string
    readonly description: string
    readonly label: string
    readonly input: string
    readonly select: string
    readonly button: string
    readonly iconButton: string
  }
  readonly loading: string
  readonly identityPending: string
  readonly unsaved: string
  readonly saved: string
  readonly volatile: string
  readonly save: string
  readonly reset: string
  readonly discard: string
  readonly check: string
  readonly checking: string
  readonly continueDraft: string
  readonly continueAfterReset: string
  readonly acceptCurrent: string
  readonly resetConflict: string
  readonly conflict: string
  readonly unknown: string
  readonly restoreError: (code: string) => string
  readonly partial: (count: number, total: number) => string
  readonly latest: (theme: string, control: string, text: string, corner: string) => string
  readonly error: (code: string) => string
}

export interface WebAppearanceSettingsProps {
  readonly labels: WebAppearanceSettingsLabels
  readonly editor: AppearanceEditor
  readonly systemPrefersDark: boolean
}

function themeOptionLabel(labels: WebAppearanceSettingsLabels, theme: WebThemePreference): string {
  return theme === 'system' ? labels.theme.system : theme === 'light' ? labels.theme.light : labels.theme.dark
}

export function WebAppearanceSettings({ labels, editor, systemPrefersDark }: WebAppearanceSettingsProps) {
  const state = useStore(editor.store)
  const ready = state.available
  const pendingIdentity = state.binding?.hostId === null
  const busy = state.status === 'saving' || state.status === 'checking'
  const locked = busy || state.status === 'unknown' || state.status === 'conflict'
  const dirty = !sameWebAppearance(state.draft, state.baseline)
  const canReset = hasWebAppearanceOverrides(state.latestValues)
  const previewTheme: WebResolvedTheme = resolveWebTheme(state.draft.theme, systemPrefersDark)
  const progress = partiallyApplied(state)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!state.writable || locked || !dirty) return
    void editor.save()
  }
  const sizeField = (
    dimension: AppearanceDimension,
    field: { readonly label: string; readonly description: string },
  ) => (
    <LumenFormField controlId={`hbar-appearance-${dimension}`} label={field.label} description={field.description}>
      <LumenPopupSelect
        id={`hbar-appearance-${dimension}`}
        className="hbar-web-appearance-control"
        variant="plain"
        value={state.draft[dimension]}
        options={(['s', 'm', 'l'] as const).map((size) => ({
          id: size,
          label: labels.sizeOption(dimension, size),
        }))}
        disabled={!state.editable || locked}
        onValueChange={(value) => editor.change(dimension, value as LumenSize)}
      />
    </LumenFormField>
  )

  return (
    <LumenFrame as="form" className="hbar-web-appearance-settings" onSubmit={submit}>
      <LumenFrame as="header" className="hbar-web-appearance-heading">
        <LumenFrame>
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {labels.description}
          </LumenContentText>
        </LumenFrame>
        <LumenContentText context="section.description" className="hbar-web-appearance-scope" tone="subtle">
          {labels.deviceScope}
        </LumenContentText>
      </LumenFrame>

      <LumenFrame className="hbar-web-appearance-fields">
        <LumenFrame as="fieldset" className="hbar-web-appearance-theme">
          <LumenText as="legend" id="hbar-appearance-theme-label" variant="label">
            {labels.theme.label}
          </LumenText>
          <LumenContentText context="section.description" id="hbar-appearance-theme-description" tone="muted">
            {labels.theme.description}
          </LumenContentText>
          <LumenFrame className="hbar-web-appearance-theme-choices">
            <LumenToggleGroup
              id="hbar-appearance-theme"
              type="single"
              value={state.draft.theme}
              options={THEME_CHOICES.map((theme) => ({ id: theme, label: themeOptionLabel(labels, theme) }))}
              disabled={!state.editable || locked}
              aria-labelledby="hbar-appearance-theme-label"
              aria-describedby="hbar-appearance-theme-description"
              onValueChange={(value) => editor.change('theme', value as WebThemePreference)}
            />
          </LumenFrame>
        </LumenFrame>
        {sizeField('controlSize', labels.controlSize)}
        {sizeField('textSize', labels.textSize)}
        {sizeField('cornerSize', labels.cornerSize)}
      </LumenFrame>

      <LumenFrame
        as="section"
        className="hbar-web-appearance-preview"
        aria-label={labels.preview.title}
        data-lumen-mode={previewTheme}
        data-lumen-control-size={state.draft.controlSize}
        data-lumen-text-size={state.draft.textSize}
        data-lumen-corner-size={state.draft.cornerSize}
        data-lumen-shape="rounded"
        style={{ colorScheme: previewTheme }}
      >
        <LumenFrame as="header">
          <LumenContentText context="section.subtitle">{labels.preview.title}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {labels.preview.description}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-web-appearance-preview-controls">
          <LumenFormField controlId="hbar-appearance-preview-input" label={labels.preview.label}>
            <LumenInput
              id="hbar-appearance-preview-input"
              className="hbar-web-appearance-control"
              variant="plain"
              readOnly
              value={labels.preview.input}
            />
          </LumenFormField>
          <LumenPopupSelect
            id="hbar-appearance-preview-select"
            className="hbar-web-appearance-control"
            variant="plain"
            aria-label={labels.preview.select}
            value="preview"
            options={[{ id: 'preview', label: labels.preview.select }]}
            onValueChange={() => undefined}
          />
          <LumenButton type="button" tone="primary" indicator="none">
            {labels.preview.button}
          </LumenButton>
          <LumenButton
            type="button"
            variant="text"
            indicator="none"
            aria-label={labels.preview.iconButton}
            title={labels.preview.iconButton}
          >
            <LumenIcon icon={Palette} tier="sm" />
          </LumenButton>
        </LumenFrame>
      </LumenFrame>

      <LumenFrame as="footer" className="hbar-web-appearance-actions">
        <LumenFrame className="hbar-web-appearance-feedback">
          <LumenContentText
            context="message.inline"
            role={state.error ? 'alert' : 'status'}
            tone={state.error ? 'danger' : 'muted'}
          >
            {pendingIdentity
              ? labels.identityPending
              : !ready
                ? state.restoreError
                  ? labels.restoreError(state.restoreError)
                  : labels.loading
                : state.status === 'checking'
                  ? labels.checking
                  : state.status === 'unknown'
                    ? labels.unknown
                    : state.status === 'conflict'
                      ? labels.conflict
                      : state.error
                        ? labels.error(state.error)
                        : dirty
                          ? labels.unsaved
                          : state.status === 'saved' || state.status === 'volatile'
                            ? state.status === 'saved'
                              ? labels.saved
                              : labels.volatile
                            : null}
          </LumenContentText>
          {state.status === 'conflict' && state.checked && (
            <LumenFrame className="hbar-web-appearance-recovery">
              {state.action?.kind === 'reset' && (
                <LumenContentText context="section.description">{labels.resetConflict}</LumenContentText>
              )}
              <LumenContentText context="section.description">
                {labels.latest(
                  themeOptionLabel(labels, state.latest.theme),
                  labels.sizeOption('controlSize', state.latest.controlSize),
                  labels.sizeOption('textSize', state.latest.textSize),
                  labels.sizeOption('cornerSize', state.latest.cornerSize),
                )}
              </LumenContentText>
              {progress.count > 0 && progress.count < progress.total && (
                <LumenContentText context="section.description">
                  {labels.partial(progress.count, progress.total)}
                </LumenContentText>
              )}
              <LumenFrame>
                <LumenButton type="button" size="s" variant="outlined" indicator="none" onClick={editor.continueDraft}>
                  {state.action?.kind === 'reset' ? labels.continueAfterReset : labels.continueDraft}
                </LumenButton>
                <LumenButton type="button" size="s" variant="outlined" indicator="none" onClick={editor.discard}>
                  {state.action?.kind === 'reset' ? labels.acceptCurrent : labels.discard}
                </LumenButton>
              </LumenFrame>
            </LumenFrame>
          )}
          {(state.status === 'unknown' ||
            (state.status === 'conflict' && !state.checked) ||
            state.status === 'restore-error') && (
            <LumenButton
              type="button"
              size="s"
              variant="outlined"
              indicator="none"
              disabled={busy || pendingIdentity}
              onClick={() => void editor.check()}
            >
              {labels.check}
            </LumenButton>
          )}
          {dirty &&
            state.status !== 'unknown' &&
            state.status !== 'conflict' &&
            !busy &&
            (ready || pendingIdentity) && (
              <LumenButton type="button" size="s" variant="text" indicator="none" onClick={editor.discard}>
                {labels.discard}
              </LumenButton>
            )}
        </LumenFrame>
        <LumenFrame>
          <LumenButton
            type="button"
            variant="outlined"
            indicator="none"
            disabled={!state.writable || locked || !canReset}
            onClick={() => void editor.reset()}
          >
            {labels.reset}
          </LumenButton>
          <LumenButton
            type="submit"
            tone="primary"
            indicator={state.status === 'saving' ? 'lamp' : 'none'}
            loading={state.status === 'saving'}
            disabled={!state.writable || locked || !dirty}
          >
            {labels.save}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
