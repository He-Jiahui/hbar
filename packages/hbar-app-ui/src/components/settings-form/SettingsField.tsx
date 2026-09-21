import { LumenInput, LumenTextarea, LumenSelect } from '@lumen/app-ui'
import type {HbarAppUiSettingsField} from './SettingsContent'
import {SettingsBadge} from './SettingsPrimitives'

export function SettingsField({field, value, changedLabel, onChange}: {readonly field: HbarAppUiSettingsField; readonly value: string; readonly changedLabel: string; readonly onChange: (value: string) => void}) {
    const controlId = `hbar-app-ui-settings-field-${field.id}`
    const describedBy = field.error ? `${controlId}-error` : field.note ? `${controlId}-note` : undefined
    const control = field.kind === 'select'
        ? <LumenSelect id={controlId} value={value} onChange={(event) => onChange(event.currentTarget.value)}
                  aria-label={field.label} aria-describedby={describedBy}>
            {(field.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </LumenSelect>
        : field.kind === 'textarea'
            ? <LumenTextarea id={controlId} value={value} maxLength={field.maxLength}
                        onChange={(event) => onChange(event.currentTarget.value)} aria-label={field.label}
                        aria-describedby={describedBy}/>
            : field.prefix
                ? <div className="hbar-app-ui-settings-prefix-control"><span>{field.prefix}</span><LumenInput id={controlId}
                                                                                                         type="text"
                                                                                                         value={value}
                                                                                                         onChange={(event) => onChange(event.currentTarget.value)}
                                                                                                         aria-label={field.label}
                                                                                                         aria-describedby={describedBy}/>
                </div>
                : <LumenInput id={controlId} type="text" value={value}
                         onChange={(event) => onChange(event.currentTarget.value)} aria-label={field.label}
                         aria-describedby={describedBy}/>

    return <div className="hbar-app-ui-settings-row">
        <div className="hbar-app-ui-settings-row-copy">
            <div><strong>{field.label}</strong>{field.changed && <SettingsBadge tone="warning">{changedLabel}</SettingsBadge>}</div>
            <p>{field.description}</p>
        </div>
        <div className="hbar-app-ui-settings-row-control">
            {control}
            {field.error && <small className="hbar-app-ui-settings-error" id={`${controlId}-error`}>{field.error}</small>}
            {!field.error && field.note && <small id={`${controlId}-note`}>{field.note}</small>}
            {field.kind === 'textarea' && field.maxLength !== undefined && <small>{`${value.length} / ${field.maxLength}`}</small>}
        </div>
    </div>
}
