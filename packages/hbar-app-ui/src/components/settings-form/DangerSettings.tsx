import { LumenInput } from '@lumen/app-ui'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsDangerContent} from './SettingsContent'
import {SettingsButton, SettingsFrame} from './SettingsPrimitives'

export function DangerSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsDangerContent}) {
    const [confirmation, setConfirmation] = useState('')
    const [notice, setNotice] = useState<string | undefined>(undefined)
    const matches = confirmation.trim() === content.workspaceName
    const action = (actionId: string, message: string) => {
        setNotice(message)
        onAction?.({variantId: spec.id, actionId})
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-danger-surface">
        <div className="hbar-app-ui-settings-centered">
            <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
            <section className="hbar-app-ui-settings-panel">
                <header className="hbar-app-ui-settings-panel-heading"><h2>{content.labels.panelTitle}</h2><p>{content.labels.panelDescription}</p></header>
                <div className="hbar-app-ui-settings-danger-row"><div className="hbar-app-ui-settings-danger-copy"><strong>{content.labels.transferTitle}</strong><p>{content.labels.transferDescription}</p></div><SettingsButton type="button" onClick={() => action('transfer', content.labels.transferNotice)}>{content.labels.transferAction}</SettingsButton></div>
                <div className="hbar-app-ui-settings-danger-row"><div className="hbar-app-ui-settings-danger-copy"><strong>{content.labels.archiveTitle}</strong><p>{content.labels.archiveDescription}</p></div><SettingsButton type="button" onClick={() => action('archive', content.labels.archiveNotice)}>{content.labels.archiveAction}</SettingsButton></div>
                <section className="hbar-app-ui-settings-danger-card">
                    <header><strong>{content.labels.deleteTitle}</strong><p>{content.labels.deleteDescription}</p></header>
                    <strong>{content.labels.deleteSummary.replace('{count}', String(content.memberCount))}</strong>
                    <ul>{content.consequences.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                    <label
                        className="hbar-app-ui-settings-danger-copy"><strong>{content.labels.typePrompt.replace('{workspace}', content.workspaceName)}</strong><LumenInput
                        value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)}
                        aria-label={content.labels.confirmationLabel}/></label>
                    <div className="hbar-app-ui-settings-actions"><SettingsButton type="button" onClick={() => {
                        setConfirmation('');
                        setNotice(undefined)
                    }}>{content.labels.cancel}</SettingsButton><SettingsButton type="button" tone="danger"
                                                                               disabled={!matches}
                                                                               onClick={() => action('delete', content.labels.deleteSuccess)}>{content.labels.deleteAction}</SettingsButton>
                    </div>
                </section>
                {notice && <p className="hbar-app-ui-settings-danger-footer" role="status">{notice}</p>}
                <p className="hbar-app-ui-settings-danger-footer">{content.labels.footerNote}</p>
            </section>
        </div>
    </SettingsFrame>
}
