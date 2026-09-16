import {Upload} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsProfileContent} from './SettingsContent'
import {SettingsField} from './SettingsField'
import {SettingsButton, SettingsFrame, SettingsIcon} from './SettingsPrimitives'

export function ProfileSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsProfileContent}) {
    const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(content.fields.map((field) => [field.id, field.value])))
    const [dirty, setDirty] = useState(true)
    const hasErrors = content.fields.some((field) => Boolean(field.error))
    const reset = () => {
        setValues(Object.fromEntries(content.fields.map((field) => [field.id, field.value])))
        setDirty(false)
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-profile-surface">
        <div className="hbar-app-ui-settings-centered">
            <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
            <section className="hbar-app-ui-settings-panel">
                <header className="hbar-app-ui-settings-panel-heading">
                    <h2>{content.labels.panelTitle}</h2>
                    <p>{content.labels.panelDescription}</p>
                </header>
                <div className="hbar-app-ui-settings-row">
                    <div className="hbar-app-ui-settings-row-copy">
                        <div><strong>{content.labels.photoLabel}</strong></div>
                        <p>{content.labels.photoDescription}</p>
                    </div>
                    <div className="hbar-app-ui-settings-row-control hbar-app-ui-settings-photo">
                        <span className="hbar-app-ui-settings-photo-avatar" aria-label={content.labels.uploadPhoto}>{content.initials}</span>
                        <SettingsButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'upload-photo'})}><SettingsIcon><Upload /> </SettingsIcon>{content.labels.changePhoto}</SettingsButton>
                    </div>
                </div>
                {content.fields.map((field) => <SettingsField key={field.id} field={field} value={values[field.id] ?? field.value} changedLabel={content.labels.changed} onChange={(value) => { setValues((current) => ({...current, [field.id]: value})); setDirty(true) }} />)}
                <footer className="hbar-app-ui-settings-actions">
                    {dirty && <p className="hbar-app-ui-settings-unsaved">{content.labels.unsaved}</p>}
                    <SettingsButton type="button" onClick={reset}>{content.labels.cancel}</SettingsButton>
                    <SettingsButton type="button" tone="accent" disabled={hasErrors} onClick={() => { setDirty(false); onAction?.({variantId: spec.id, actionId: 'save'}) }}>{content.labels.save}</SettingsButton>
                </footer>
            </section>
        </div>
    </SettingsFrame>
}
