import { LumenButton } from '@lumen/app-ui'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsWorkspaceContent} from './SettingsContent'
import {SettingsField} from './SettingsField'
import {SettingsButton, SettingsFrame} from './SettingsPrimitives'

export function WorkspaceSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsWorkspaceContent}) {
    const [activeNavigationId, setActiveNavigationId] = useState(content.activeNavigationId ?? content.navigation[0]?.id)
    const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(content.fields.map((field) => [field.id, field.value])))
    const [dirty, setDirty] = useState(true)
    const selectedNavigation = useMemo(() => content.navigation.find((item) => item.id === activeNavigationId) ?? content.navigation[0], [activeNavigationId, content.navigation])
    const reset = () => {
        setValues(Object.fromEntries(content.fields.map((field) => [field.id, field.value])))
        setDirty(false)
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-workspace-surface">
        <div className="hbar-app-ui-settings-workspace">
            <aside className="hbar-app-ui-settings-sidebar">
                <div className="hbar-app-ui-settings-sidebar-heading">
                    <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
                    <p className="hbar-app-ui-settings-subtle">{content.labels.accountName}</p>
                </div>
                <nav className="hbar-app-ui-settings-sidebar-nav" aria-label={content.labels.navigation}>
                    {content.navigation.map((item) => <LumenButton type="button" key={item.id}
                                                              className={selectedNavigation?.id === item.id ? 'is-selected' : ''}
                                                              onClick={() => setActiveNavigationId(item.id)}>{item.label}</LumenButton>)}
                </nav>
            </aside>
            <main className="hbar-app-ui-settings-workspace-main">
                <div className="hbar-app-ui-settings-centered">
                    <section className="hbar-app-ui-settings-panel">
                        <header className="hbar-app-ui-settings-panel-heading">
                            <h2>{selectedNavigation?.label ?? content.labels.panelTitle}</h2>
                            <p>{content.labels.panelDescription}</p>
                        </header>
                        {content.fields.map((field) => <SettingsField key={field.id} field={field} value={values[field.id] ?? field.value} changedLabel={content.labels.changed} onChange={(value) => { setValues((current) => ({...current, [field.id]: value})); setDirty(true) }} />)}
                        <footer className="hbar-app-ui-settings-actions">
                            {dirty && <p className="hbar-app-ui-settings-unsaved">{content.labels.unsaved}</p>}
                            <SettingsButton type="button" onClick={reset}>{content.labels.cancel}</SettingsButton>
                            <SettingsButton type="button" tone="accent" onClick={() => { setDirty(false); onAction?.({variantId: spec.id, actionId: 'save'}) }}>{content.labels.save}</SettingsButton>
                        </footer>
                    </section>
                </div>
            </main>
        </div>
    </SettingsFrame>
}
