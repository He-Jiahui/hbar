import { type FormEvent } from 'react'
import { Palette } from 'lucide-react'
import { useStore } from 'zustand'
import {
  LumenButton,
  LumenFrame,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenOption,
  LumenSelect,
  LumenText,
  type LumenSize,
} from '@lumen/app-ui'
import { resolveWebTheme, type WebResolvedTheme, type WebThemePreference } from './theme'
import { hasWebAppearanceOverrides, sameWebAppearance } from './appearance'
import { partiallyApplied, type AppearanceEditor } from './appearance-editor'
import './AppearanceSettings.css'

type AppearanceDimension = 'controlSize' | 'textSize' | 'cornerSize'

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
  const busy = state.status === 'saving' || state.status === 'checking'
  const locked = busy || state.status === 'unknown' || state.status === 'conflict'
  const dirty = !sameWebAppearance(state.draft, state.baseline)
  const canReset = hasWebAppearanceOverrides(state.latestValues)
  const previewTheme: WebResolvedTheme = resolveWebTheme(state.draft.theme, systemPrefersDark)
  const progress = partiallyApplied(state)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || locked || !dirty) return
    void editor.save()
  }
  const sizeField = (
    dimension: AppearanceDimension,
    field: { readonly label: string; readonly description: string },
  ) => (
    <LumenFormField controlId={`hbar-appearance-${dimension}`} label={field.label} description={field.description}>
      <LumenSelect
        id={`hbar-appearance-${dimension}`}
        value={state.draft[dimension]}
        disabled={!ready || locked}
        onChange={(event) => editor.change(dimension, event.currentTarget.value as LumenSize)}
      >
        {(['s', 'm', 'l'] as const).map((size) => (
          <LumenOption key={size} value={size}>
            {labels.sizeOption(dimension, size)}
          </LumenOption>
        ))}
      </LumenSelect>
    </LumenFormField>
  )

  return (
    <LumenFrame as="form" className="hbar-web-appearance-settings" onSubmit={submit}>
      <LumenFrame as="header" className="hbar-web-appearance-heading">
        <LumenFrame>
          <LumenText as="h2">{labels.title}</LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.description}
          </LumenText>
        </LumenFrame>
        <LumenText as="p" className="hbar-web-appearance-scope" tone="subtle" variant="supporting">
          {labels.deviceScope}
        </LumenText>
      </LumenFrame>

      <LumenFrame className="hbar-web-appearance-fields">
        <LumenFormField
          controlId="hbar-appearance-theme"
          label={labels.theme.label}
          description={labels.theme.description}
        >
          <LumenSelect
            id="hbar-appearance-theme"
            value={state.draft.theme}
            disabled={!ready || locked}
            onChange={(event) => editor.change('theme', event.currentTarget.value as WebThemePreference)}
          >
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <LumenOption key={theme} value={theme}>
                {themeOptionLabel(labels, theme)}
              </LumenOption>
            ))}
          </LumenSelect>
        </LumenFormField>
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
          <LumenText as="h3">{labels.preview.title}</LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.preview.description}
          </LumenText>
        </LumenFrame>
        <LumenFrame className="hbar-web-appearance-preview-controls">
          <LumenFormField controlId="hbar-appearance-preview-input" label={labels.preview.label}>
            <LumenInput id="hbar-appearance-preview-input" readOnly value={labels.preview.input} />
          </LumenFormField>
          <LumenSelect aria-label={labels.preview.select} value="preview" onChange={() => undefined}>
            <LumenOption value="preview">{labels.preview.select}</LumenOption>
          </LumenSelect>
          <LumenButton type="button" tone="primary">
            {labels.preview.button}
          </LumenButton>
          <LumenIconButton type="button" label={labels.preview.iconButton}>
            <LumenIcon icon={Palette} tier="sm" />
          </LumenIconButton>
        </LumenFrame>
      </LumenFrame>

      <LumenFrame as="footer" className="hbar-web-appearance-actions">
        <LumenFrame className="hbar-web-appearance-feedback">
          <LumenText
            as="span"
            role={state.error ? 'alert' : 'status'}
            tone={state.error ? 'danger' : 'muted'}
            variant="supporting"
          >
            {!ready
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
          </LumenText>
          {state.status === 'conflict' && state.checked && (
            <LumenFrame className="hbar-web-appearance-recovery">
              {state.action?.kind === 'reset' && <LumenText as="p">{labels.resetConflict}</LumenText>}
              <LumenText as="p">
                {labels.latest(
                  themeOptionLabel(labels, state.latest.theme),
                  labels.sizeOption('controlSize', state.latest.controlSize),
                  labels.sizeOption('textSize', state.latest.textSize),
                  labels.sizeOption('cornerSize', state.latest.cornerSize),
                )}
              </LumenText>
              {progress.count > 0 && progress.count < progress.total && (
                <LumenText as="p">{labels.partial(progress.count, progress.total)}</LumenText>
              )}
              <LumenFrame>
                <LumenButton type="button" size="s" variant="outlined" onClick={editor.continueDraft}>
                  {state.action?.kind === 'reset' ? labels.continueAfterReset : labels.continueDraft}
                </LumenButton>
                <LumenButton type="button" size="s" variant="outlined" onClick={editor.discard}>
                  {state.action?.kind === 'reset' ? labels.acceptCurrent : labels.discard}
                </LumenButton>
              </LumenFrame>
            </LumenFrame>
          )}
          {(state.status === 'unknown' ||
            (state.status === 'conflict' && !state.checked) ||
            state.status === 'restore-error') && (
            <LumenButton type="button" size="s" variant="outlined" disabled={busy} onClick={() => void editor.check()}>
              {labels.check}
            </LumenButton>
          )}
          {dirty && state.status !== 'unknown' && state.status !== 'conflict' && !busy && ready && (
            <LumenButton type="button" size="s" variant="text" onClick={editor.discard}>
              {labels.discard}
            </LumenButton>
          )}
        </LumenFrame>
        <LumenFrame>
          <LumenButton
            type="button"
            variant="outlined"
            disabled={!ready || locked || !canReset}
            onClick={() => void editor.reset()}
          >
            {labels.reset}
          </LumenButton>
          <LumenButton
            type="submit"
            tone="primary"
            loading={state.status === 'saving'}
            disabled={!ready || locked || !dirty}
          >
            {labels.save}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
