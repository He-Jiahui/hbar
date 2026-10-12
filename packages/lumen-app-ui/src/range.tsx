'use client'

import * as React from 'react'
import { LumenInput, type LumenInputProps } from './forms'
import './range.css'

export interface LumenRangeProps extends Omit<LumenInputProps, 'type' | 'variant'> {}

function rangePercentage(
  value: LumenInputProps['value'],
  min: LumenInputProps['min'],
  max: LumenInputProps['max'],
): string {
  const parsedMin = Number(min === '' ? 0 : (min ?? 0))
  const parsedMax = Number(max === '' ? 100 : (max ?? 100))
  const lower = Number.isFinite(parsedMin) ? parsedMin : 0
  const upper = Number.isFinite(parsedMax) ? parsedMax : 100
  if (upper <= lower) return '0%'
  const parsedValue = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  const actualValue = Number.isFinite(parsedValue) ? parsedValue : (lower + upper) / 2
  return `${Math.min(100, Math.max(0, ((actualValue - lower) / (upper - lower)) * 100))}%`
}

/** Native single-value slider, for controls whose visible track is also the input. */
export const LumenRange = React.forwardRef<HTMLInputElement, LumenRangeProps>(function LumenRange(
  { className, style, onInput, ...props },
  ref,
) {
  const rangeStyle: React.CSSProperties & { '--lumen-range-progress': string } = {
    ...style,
    '--lumen-range-progress': rangePercentage(props.value ?? props.defaultValue, props.min, props.max),
  }
  return (
    <LumenInput
      {...props}
      ref={ref}
      className={['lumen-range', className].filter(Boolean).join(' ')}
      style={rangeStyle}
      onInput={(event) => {
        if (props.value === undefined) {
          event.currentTarget.style.setProperty(
            '--lumen-range-progress',
            rangePercentage(event.currentTarget.value, event.currentTarget.min, event.currentTarget.max),
          )
        }
        onInput?.(event)
      }}
      type="range"
      variant="plain"
    />
  )
})
