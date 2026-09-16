import {Copy, Eye, EyeOff, MoreHorizontal} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsApiKeysContent, HbarAppUiSettingsIntegration} from './SettingsContent'
import {SettingsButton, SettingsFrame, SettingsIcon, SettingsIconButton, SettingsToggle} from './SettingsPrimitives'

export function ApiKeysSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsApiKeysContent}) {
    const [revealed, setRevealed] = useState<Readonly<Record<string, boolean>>>({})
    const [integrations, setIntegrations] = useState<readonly HbarAppUiSettingsIntegration[]>(content.integrations)
    const toggleIntegration = (id: string) => {
        setIntegrations((current) => current.map((item) => item.id === id ? {...item, enabled: !item.enabled} : item))
        onAction?.({variantId: spec.id, actionId: 'toggle-integration', value: id})
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-api-surface">
        <div className="hbar-app-ui-settings-centered">
            <header className="hbar-app-ui-settings-topbar"><h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1><SettingsButton type="button" tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'create-key'})}>{content.labels.createKey}</SettingsButton></header>
            <section className="hbar-app-ui-settings-secret-card">
                <header className="hbar-app-ui-settings-panel-heading"><h2>{content.labels.secretsTitle}</h2><p>{content.labels.secretsDescription}</p></header>
                <div className="hbar-app-ui-settings-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    {content.secrets.map((secret) => {
                        const isRevealed = revealed[secret.id] ?? false
                        return <article className="hbar-app-ui-settings-secret-row" key={secret.id}>
                            <div className="hbar-app-ui-settings-secret-copy"><strong>{secret.name}</strong><small>{content.labels.secretMeta(secret.created, secret.lastUsed)}</small><div className="hbar-app-ui-settings-secret-token"><code>{isRevealed ? secret.token : secret.token.replace(/./g, '•')}</code><span className="hbar-app-ui-settings-secret-token-tools"><SettingsIconButton type="button" label={isRevealed ? content.labels.hide(secret.name) : content.labels.reveal(secret.name)} onClick={() => setRevealed((current) => ({...current, [secret.id]: !isRevealed}))}><SettingsIcon>{isRevealed ? <EyeOff /> : <Eye />}</SettingsIcon></SettingsIconButton><SettingsIconButton type="button" label={content.labels.copy(secret.name)} onClick={() => onAction?.({variantId: spec.id, actionId: 'copy-key', value: secret.id})}><SettingsIcon><Copy /></SettingsIcon></SettingsIconButton></span></div></div>
                            <SettingsIconButton type="button" label={content.labels.actions(secret.name)} onClick={() => onAction?.({variantId: spec.id, actionId: 'key-actions', value: secret.id})}><SettingsIcon><MoreHorizontal /></SettingsIcon></SettingsIconButton>
                        </article>
                    })}
                    {!content.secrets.length && <p className="hbar-app-ui-settings-empty">{content.labels.empty}</p>}
                </div>
            </section>
            <section className="hbar-app-ui-settings-integration-card">
                <header className="hbar-app-ui-settings-panel-heading"><h2>{content.labels.integrationsTitle}</h2><p>{content.labels.integrationsDescription}</p></header>
                <div className="hbar-app-ui-settings-list">
                    {integrations.map((integration) => <article className="hbar-app-ui-settings-integration-row" key={integration.id}>
                        <div className="hbar-app-ui-settings-integration-copy"><div className="hbar-app-ui-settings-control-heading"><strong>{integration.name}</strong><span className={`hbar-app-ui-settings-integration-state ${integration.status === 'connected' ? 'is-connected' : ''}`}>{integration.status === 'connected' ? content.labels.connected : content.labels.disconnected}</span></div><small>{integration.description}</small></div>
                        <SettingsToggle checked={integration.enabled} label={content.labels.toggle(integration.name)} onChange={() => toggleIntegration(integration.id)} />
                    </article>)}
                </div>
                <p className="hbar-app-ui-settings-danger-footer">{content.labels.auditNote}</p>
            </section>
        </div>
    </SettingsFrame>
}
