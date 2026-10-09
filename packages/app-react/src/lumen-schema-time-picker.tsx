import type { SchemaFieldRendererProps } from '@hbar/schema-react'
import { LumenFrame, LumenInput, LumenText } from '@lumen/app-ui'

/** The native clock picker supplies keyboard/touch selection without number-entry fields. */
export function SchemaTimePicker(props: SchemaFieldRendererProps) {
  const time = props.time
  if (!time) return null
  const hour = typeof props.value === 'number' ? props.value : 0
  const minute = typeof time.minute.value === 'number' ? time.minute.value : 0
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return (
    <LumenFrame className="hbar-schema-time-picker">
      <LumenInput
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        type="time"
        step={60}
        value={value}
        readOnly={props.field.readOnly}
        disabled={props.disabled}
        aria-label={props.labels.label}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={`${props.field.name}-timezone${props.issue ? ` ${props.field.name}-issue` : ''}`}
        onClick={(event) => {
          if (props.disabled || props.field.readOnly || typeof event.currentTarget.showPicker !== 'function') return
          try {
            event.currentTarget.showPicker()
          } catch {
            /* Native keyboard/time controls remain available. */
          }
        }}
        onChange={(event) => {
          const selected = /^(\d{2}):(\d{2})$/.exec(event.currentTarget.value)
          if (!selected) return
          props.onIntent({
            kind: 'setFields',
            values: [
              { field: props.field.name, value: Number(selected[1]) },
              { field: time.minute.field.name, value: Number(selected[2]) },
              { field: time.timezone.field.name, value: Intl.DateTimeFormat().resolvedOptions().timeZone },
            ],
          })
        }}
      />
      <LumenText as="small" id={`${props.field.name}-timezone`}>
        {time.timezone.label}
        <LumenText as="span" className="hbar-schema-timezone-value">
          {typeof time.timezone.value === 'string' ? time.timezone.value : null}
        </LumenText>
      </LumenText>
    </LumenFrame>
  )
}
