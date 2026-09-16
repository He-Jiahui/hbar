import { useId } from 'react'
import { uniqueItems } from '../../collection'
import { HbarAppUiButton } from '../../primitives'
import type { HbarAppUiSettingsChoice, HbarAppUiSettingsPreferencesContent } from './SettingsContent'
import './Preferences.css'

function Choice({
  label,
  choices,
  value,
  disabled,
  unavailable,
  onChange,
}: {
  readonly label: string
  readonly choices: readonly HbarAppUiSettingsChoice[]
  readonly value: string
  readonly disabled: boolean
  readonly unavailable: string
  readonly onChange: (id: string) => void
}) {
  const items = uniqueItems(choices),
    valid = items.some((item) => item.id === value)
  return (
    <select
      value={valid ? value : ''}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      <option value="" disabled hidden={valid}>
        {unavailable}
      </option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  )
}
/** Finite host-defined preferences grow with their content. No values are copied into component state. */
export function HbarAppUiPreferencesSettings(content: HbarAppUiSettingsPreferencesContent) {
  const groupName = useId(),
    labels = content.labels,
    mode = content.persistence
  const busy = mode.mode === 'explicit' && mode.busy
  const themes = uniqueItems(content.themeChoices)
  return (
    <div className="hbar-app-ui-preferences hbar-app-ui-settings-centered" aria-busy={busy}>
      <h1 className="hbar-app-ui-settings-page-title">{labels.pageTitle}</h1>
      <section className="hbar-app-ui-settings-panel" aria-label={labels.panelTitle}>
        <header className="hbar-app-ui-settings-panel-heading">
          <h2>{labels.panelTitle}</h2>
          <p>{labels.panelDescription}</p>
        </header>
        {!!themes.length && (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.themeLabel}</strong>
              <small>{labels.themeCurrent}</small>
              <p>{labels.themeDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-theme-choice" role="radiogroup" aria-label={labels.themeLabel}>
              {themes.map((theme) => (
                <label
                  className={`hbar-app-ui-settings-choice ${content.themeId === theme.id ? 'is-selected' : ''}`}
                  key={theme.id}
                >
                  <input
                    type="radio"
                    name={groupName}
                    checked={content.themeId === theme.id}
                    disabled={busy}
                    onChange={() => content.onChange({ type: 'theme', id: theme.id })}
                  />
                  <span>{theme.label}</span>
                </label>
              ))}
              {!themes.some((theme) => theme.id === content.themeId) && <p role="status">{labels.unavailableChoice}</p>}
            </div>
          </div>
        )}
        {!!content.densityChoices.length && (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.densityLabel}</strong>
              <p>{labels.densityDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-row-control">
              <Choice
                label={labels.densityLabel}
                choices={content.densityChoices}
                value={content.densityId}
                disabled={busy}
                unavailable={labels.unavailableChoice}
                onChange={(id) => content.onChange({ type: 'density', id })}
              />
            </div>
          </div>
        )}
        {!!content.languageChoices.length && (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.languageLabel}</strong>
              <p>{labels.languageDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-row-control">
              <Choice
                label={labels.languageLabel}
                choices={content.languageChoices}
                value={content.languageId}
                disabled={busy}
                unavailable={labels.unavailableChoice}
                onChange={(id) => content.onChange({ type: 'language', id })}
              />
            </div>
          </div>
        )}
        {(content.toggles.length > 0 || content.checkbox) && (
          <div className="hbar-app-ui-settings-list" aria-label={labels.toggleGroup}>
            {uniqueItems(content.toggles).map((item) => (
              <div className="hbar-app-ui-settings-row" key={item.id}>
                <div className="hbar-app-ui-settings-toggle-copy">
                  <strong>{item.label}</strong>
                  {item.recommended && <small>{labels.recommended}</small>}
                  {item.changed && <small>{labels.changed}</small>}
                  <small>{item.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={item.label}
                  aria-checked={item.enabled}
                  disabled={busy}
                  className={`hbar-app-ui-settings-toggle ${item.enabled ? 'is-on' : ''}`}
                  onClick={() => content.onChange({ type: 'toggle', id: item.id, enabled: !item.enabled })}
                >
                  <i aria-hidden="true" />
                </button>
              </div>
            ))}
            {content.checkbox && (
              <div className="hbar-app-ui-settings-row">
                <label className="hbar-app-ui-settings-toggle-copy">
                  <strong>{content.checkbox.label}</strong>
                  <small>{content.checkbox.description}</small>
                  <input
                    type="checkbox"
                    checked={content.checkbox.enabled}
                    disabled={busy}
                    aria-label={content.checkbox.label}
                    onChange={(event) => {
                      if (content.checkbox)
                        content.onChange({ type: 'checkbox', id: content.checkbox.id, enabled: event.target.checked })
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        )}
        {content.error && <p role="alert">{content.error}</p>}
        {mode.mode === 'explicit' && (
          <footer className="hbar-app-ui-settings-actions">
            {mode.dirty && <p className="hbar-app-ui-settings-unsaved">{labels.unsaved}</p>}
            <HbarAppUiButton type="button" disabled={busy} onClick={mode.onCancel}>
              {labels.cancel}
            </HbarAppUiButton>
            <HbarAppUiButton type="button" tone="accent" disabled={busy || !mode.dirty} onClick={mode.onSave}>
              {labels.save}
            </HbarAppUiButton>
          </footer>
        )}
      </section>
    </div>
  )
}
