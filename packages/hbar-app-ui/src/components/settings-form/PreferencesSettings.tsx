import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsPreferencesContent, HbarAppUiSettingsPreferenceToggle} from './SettingsContent'
import {SettingsBadge, SettingsButton, SettingsFrame, SettingsToggle} from './SettingsPrimitives'

function ChoiceGroup({name, choices, value, onChange}: {readonly name: string; readonly choices: readonly {readonly id: string; readonly label: string}[]; readonly value: string; readonly onChange: (id: string) => void}) {
    return <div className="hbar-app-ui-settings-theme-choice">
        {choices.map((choice) => <label className={`hbar-app-ui-settings-choice ${value === choice.id ? 'is-selected' : ''}`} key={choice.id}>
            <input type="radio" name={name} checked={value === choice.id} onChange={() => onChange(choice.id)} />
            <span>{choice.label}</span>
        </label>)}
    </div>
}

function PreferenceToggleRow({item, changedLabel, recommendedLabel, checked, onChange}: {readonly item: HbarAppUiSettingsPreferenceToggle; readonly changedLabel: string; readonly recommendedLabel: string; readonly checked: boolean; readonly onChange: () => void}) {
    return <div className="hbar-app-ui-settings-row">
        <div className="hbar-app-ui-settings-toggle-copy">
            <div className="hbar-app-ui-settings-control-heading"><strong>{item.label}</strong>{item.recommended && <SettingsBadge>{recommendedLabel}</SettingsBadge>}{item.changed && <SettingsBadge tone="warning">{changedLabel}</SettingsBadge>}</div>
            <small>{item.description}</small>
        </div>
        <SettingsToggle checked={checked} label={item.label} onChange={onChange} />
    </div>
}

export function PreferencesSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsPreferencesContent}) {
    const [themeId, setThemeId] = useState(content.initialThemeId)
    const [densityId, setDensityId] = useState(content.initialDensityId)
    const [languageId, setLanguageId] = useState(content.initialLanguageId)
    const [toggleValues, setToggleValues] = useState<Record<string, boolean>>(() => Object.fromEntries(content.toggles.map((item) => [item.id, item.enabled])))
    const [checkboxValue, setCheckboxValue] = useState(content.checkbox.enabled)
    const [dirty, setDirty] = useState(true)
    const update = <T,>(setter: (value: T) => void, value: T) => { setter(value); setDirty(true) }
    const reset = () => {
        setThemeId(content.initialThemeId)
        setDensityId(content.initialDensityId)
        setLanguageId(content.initialLanguageId)
        setToggleValues(Object.fromEntries(content.toggles.map((item) => [item.id, item.enabled])))
        setCheckboxValue(content.checkbox.enabled)
        setDirty(false)
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-preferences-surface">
        <div className="hbar-app-ui-settings-centered">
            <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
            <section className="hbar-app-ui-settings-panel">
                <header className="hbar-app-ui-settings-panel-heading"><h2>{content.labels.panelTitle}</h2><p>{content.labels.panelDescription}</p></header>
                <div className="hbar-app-ui-settings-row">
                    <div className="hbar-app-ui-settings-row-copy"><div className="hbar-app-ui-settings-control-heading"><strong>{content.labels.themeLabel}</strong><SettingsBadge>{content.labels.themeCurrent}</SettingsBadge><SettingsBadge tone="warning">{content.labels.changed}</SettingsBadge></div><p>{content.labels.themeDescription}</p></div>
                    <ChoiceGroup name={`${spec.id}-theme`} choices={content.themeChoices} value={themeId} onChange={(value) => update(setThemeId, value)} />
                </div>
                <div className="hbar-app-ui-settings-row">
                    <div className="hbar-app-ui-settings-row-copy"><div className="hbar-app-ui-settings-control-heading"><strong>{content.labels.densityLabel}</strong><SettingsBadge>{content.labels.recommended}</SettingsBadge></div><p>{content.labels.densityDescription}</p></div>
                    <div className="hbar-app-ui-settings-row-control"><select value={densityId} onChange={(event) => update(setDensityId, event.currentTarget.value)} aria-label={content.labels.densityLabel}>{content.densityChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></div>
                </div>
                <div className="hbar-app-ui-settings-row">
                    <div className="hbar-app-ui-settings-row-copy"><strong>{content.labels.languageLabel}</strong><p>{content.labels.languageDescription}</p></div>
                    <div className="hbar-app-ui-settings-row-control"><select value={languageId} onChange={(event) => update(setLanguageId, event.currentTarget.value)} aria-label={content.labels.languageLabel}>{content.languageChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></div>
                </div>
                <div className="hbar-app-ui-settings-list" aria-label={content.labels.toggleGroup}>
                    {content.toggles.map((item) => <PreferenceToggleRow key={item.id} item={item} changedLabel={content.labels.changed} recommendedLabel={content.labels.recommended} checked={toggleValues[item.id] ?? false} onChange={() => update(setToggleValues, {...toggleValues, [item.id]: !(toggleValues[item.id] ?? false)})} />)}
                    <div className="hbar-app-ui-settings-row">
                        <label className="hbar-app-ui-settings-toggle-copy"><div className="hbar-app-ui-settings-control-heading"><strong>{content.checkbox.label}</strong></div><small>{content.checkbox.description}</small></label>
                        <input type="checkbox" checked={checkboxValue} onChange={(event) => update(setCheckboxValue, event.currentTarget.checked)} aria-label={content.checkbox.label} />
                    </div>
                </div>
                <footer className="hbar-app-ui-settings-actions">
                    {dirty && <p className="hbar-app-ui-settings-unsaved">{content.labels.unsaved}</p>}
                    <SettingsButton type="button" onClick={reset}>{content.labels.cancel}</SettingsButton>
                    <SettingsButton type="button" tone="accent" onClick={() => { setDirty(false); onAction?.({variantId: spec.id, actionId: 'save', value: `${themeId}:${densityId}:${languageId}`}) }}>{content.labels.save}</SettingsButton>
                </footer>
            </section>
        </div>
    </SettingsFrame>
}
