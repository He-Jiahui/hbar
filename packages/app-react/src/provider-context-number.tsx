import { useEffect, useRef, useState } from 'react'
import { LumenInput } from '@lumen/app-ui'

/** Only incomplete input text is local; complete values belong to the provider draft. */
export function HbarProviderContextNumber({
  id,
  value,
  required,
  integer,
  minimum,
  maximum,
  disabled,
  onCommit,
  field,
  tier,
}: {
  readonly id: string
  readonly value: number | undefined
  readonly required: boolean
  readonly integer: boolean
  readonly minimum: number
  readonly maximum?: number | undefined
  readonly disabled: boolean
  readonly onCommit: (value: number | null) => void
  readonly field: string
  readonly tier: string
}) {
  const confirmed = value === undefined ? '' : String(value)
  const [raw, setRaw] = useState(confirmed)
  const [focused, setFocused] = useState(false)
  const rawRef = useRef(raw)
  useEffect(() => {
    if (!focused) {
      setRaw(confirmed)
      rawRef.current = confirmed
    }
  }, [confirmed, focused])
  return (
    <LumenInput
      id={id}
      data-context-field={field}
      data-context-tier={tier}
      type="number"
      value={raw}
      min={minimum}
      max={maximum}
      step={integer ? 1 : 'any'}
      disabled={disabled}
      required={required}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.currentTarget.value
        rawRef.current = next
        setRaw(next)
        if (!next && !required) onCommit(null)
        else if (next && Number.isFinite(Number(next))) onCommit(Number(next))
      }}
      onBlur={() => {
        setFocused(false)
        if (!rawRef.current && required) {
          setRaw(confirmed)
          rawRef.current = confirmed
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setRaw(confirmed)
          rawRef.current = confirmed
          event.currentTarget.blur()
        }
      }}
    />
  )
}
