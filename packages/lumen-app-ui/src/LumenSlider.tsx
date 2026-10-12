'use client'

import * as React from 'react'
import Slider, { type SliderProps } from '@mui/material/Slider'

export interface LumenSliderProps extends Omit<SliderProps, 'value' | 'onChange'> {
  value: number
  onChange: (value: number) => void
}

export default function LumenSlider({ value, onChange, min = 0, max = 100, style, ...other }: LumenSliderProps) {
  const progress = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0
  const rangeStyle: React.CSSProperties & { '--lumen-range-progress': number } = {
    ...style,
    '--lumen-range-progress': progress,
  }

  return (
    <Slider
      {...other}
      min={min}
      max={max}
      value={value}
      style={rangeStyle}
      onChange={(_event, nextValue) => {
        if (typeof nextValue === 'number') {
          onChange(nextValue)
        }
      }}
    />
  )
}
