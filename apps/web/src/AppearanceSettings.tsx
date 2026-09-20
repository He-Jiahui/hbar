import { useEffect, useState, type FormEvent } from 'react'
import { Palette } from 'lucide-react'
import {
  LumenButton,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenSelect,
  LumenText,
  type LumenSize,
} from '@lumen/app-ui'
import { resolveWebTheme, type WebResolvedTheme, type WebThemePreference } from './theme'
import { DEFAULT_WEB_APPEARANCE_PREFERENCES, sameWebAppearance, type WebAppearancePreferences } from './appearance'
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
  readonly save: string
  readonly reset: string
  readonly error: (code: string) => string
}

export interface WebAppearanceSettingsProps {
  readonly labels: WebAppearanceSettingsLabels
  readonly value: WebAppearancePreferences
  readonly revision: number
  readonly ready: boolean
  readonly canReset: boolean
  readonly systemPrefersDark: boolean
  readonly onSave: (value: WebAppearancePreferences, expectedRevision: number) => Promise<{ readonly revision: number }>
  readonly onReset: (expectedRevision: number) => Promise<{ readonly revision: number }>
}

interface AppearanceEditorState {
  readonly baseline: WebAppearancePreferences
  readonly draft: WebAppearancePreferences
  readonly revision: number
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function themeOptionLabel(labels: WebAppearanceSettingsLabels, theme: WebThemePreference): string {
  return theme === 'system' ? labels.theme.system : theme === 'light' ? labels.theme.light : labels.theme.dark
}

export function WebAppearanceSettings({
  labels,
  value,
  revision,
  ready,
  canReset,
  systemPrefersDark,
  onSave,
  onReset,
}: WebAppearanceSettingsProps) {
  const [editor, setEditor] = useState<AppearanceEditorState>({ baseline: value, draft: value, revision })
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const busy = status === 'saving'
  const dirty = !sameWebAppearance(editor.draft, editor.baseline)
  const previewTheme: WebResolvedTheme = resolveWebTheme(editor.draft.theme, systemPrefersDark)

  useEffect(() => {
    setEditor((current) => {
      if (!sameWebAppearance(current.draft, current.baseline)) return current
      if (current.revision === revision && sameWebAppearance(current.baseline, value)) return current
      return { baseline: value, draft: value, revision }
    })
    setStatus((current) => (current === 'saving' ? current : 'idle'))
    setError(null)
  }, [revision, value])

  const change = <Key extends keyof WebAppearancePreferences>(key: Key, next: WebAppearancePreferences[Key]) => {
    setEditor((current) => ({ ...current, draft: { ...current.draft, [key]: next } }))
    setStatus('idle')
    setError(null)
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || busy || !dirty) return
    const target = editor.draft
    const expectedRevision = editor.revision
    setStatus('saving')
    setError(null)
    void onSave(target, expectedRevision)
      .then((result) => {
        setEditor({ baseline: target, draft: target, revision: result.revision })
        setStatus('saved')
      })
      .catch((reason: unknown) => {
        setStatus('error')
        setError(errorCode(reason))
      })
  }
  const reset = () => {
    if (!ready || busy || !canReset) return
    const expectedRevision = editor.revision
    setStatus('saving')
    setError(null)
    void onReset(expectedRevision)
      .then((result) => {
        setEditor({
          baseline: DEFAULT_WEB_APPEARANCE_PREFERENCES,
          draft: DEFAULT_WEB_APPEARANCE_PREFERENCES,
          revision: result.revision,
        })
        setStatus('saved')
      })
      .catch((reason: unknown) => {
        setStatus('error')
        setError(errorCode(reason))
      })
  }
  const sizeField = (
    dimension: AppearanceDimension,
    field: { readonly label: string; readonly description: string },
  ) => (
    <LumenFormField controlId={`hbar-appearance-${dimension}`} label={field.label} description={field.description}>
      <LumenSelect
        id={`hbar-appearance-${dimension}`}
        value={editor.draft[dimension]}
        disabled={!ready || busy}
        onChange={(event) => change(dimension, event.currentTarget.value as LumenSize)}
      >
        {(['s', 'm', 'l'] as const).map((size) => (
          <option key={size} value={size}>
            {labels.sizeOption(dimension, size)}
          </option>
        ))}
      </LumenSelect>
    </LumenFormField>
  )

  return (
    <form className="hbar-web-appearance-settings" onSubmit={submit}>
      <header className="hbar-web-appearance-heading">
        <div>
          <h2>{labels.title}</h2>
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.description}
          </LumenText>
        </div>
        <LumenText as="p" className="hbar-web-appearance-scope" tone="subtle" variant="supporting">
          {labels.deviceScope}
        </LumenText>
      </header>

      <div className="hbar-web-appearance-fields">
        <LumenFormField
          controlId="hbar-appearance-theme"
          label={labels.theme.label}
          description={labels.theme.description}
        >
          <LumenSelect
            id="hbar-appearance-theme"
            value={editor.draft.theme}
            disabled={!ready || busy}
            onChange={(event) => change('theme', event.currentTarget.value as WebThemePreference)}
          >
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <option key={theme} value={theme}>
                {themeOptionLabel(labels, theme)}
              </option>
            ))}
          </LumenSelect>
        </LumenFormField>
        {sizeField('controlSize', labels.controlSize)}
        {sizeField('textSize', labels.textSize)}
        {sizeField('cornerSize', labels.cornerSize)}
      </div>

      <section
        className="hbar-web-appearance-preview"
        aria-label={labels.preview.title}
        data-lumen-mode={previewTheme}
        data-lumen-control-size={editor.draft.controlSize}
        data-lumen-text-size={editor.draft.textSize}
        data-lumen-corner-size={editor.draft.cornerSize}
        data-lumen-shape="rounded"
        style={{ colorScheme: previewTheme }}
      >
        <header>
          <h3>{labels.preview.title}</h3>
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.preview.description}
          </LumenText>
        </header>
        <div className="hbar-web-appearance-preview-controls">
          <LumenFormField controlId="hbar-appearance-preview-input" label={labels.preview.label}>
            <LumenInput id="hbar-appearance-preview-input" readOnly value={labels.preview.input} />
          </LumenFormField>
          <LumenSelect aria-label={labels.preview.select} value="preview" onChange={() => undefined}>
            <option value="preview">{labels.preview.select}</option>
          </LumenSelect>
          <LumenButton type="button" tone="primary">
            {labels.preview.button}
          </LumenButton>
          <LumenIconButton type="button" label={labels.preview.iconButton}>
            <LumenIcon icon={Palette} tier="sm" />
          </LumenIconButton>
        </div>
      </section>

      <footer className="hbar-web-appearance-actions">
        <LumenText as="span" role={error ? 'alert' : 'status'} tone={error ? 'danger' : 'muted'} variant="supporting">
          {!ready
            ? labels.loading
            : error
              ? labels.error(error)
              : dirty
                ? labels.unsaved
                : status === 'saved'
                  ? labels.saved
                  : null}
        </LumenText>
        <div>
          <LumenButton type="button" variant="outlined" disabled={!ready || busy || !canReset} onClick={reset}>
            {labels.reset}
          </LumenButton>
          <LumenButton type="submit" tone="primary" loading={busy} disabled={!ready || !dirty}>
            {labels.save}
          </LumenButton>
        </div>
      </footer>
    </form>
  )
}
