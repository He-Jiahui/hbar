'use client'

import * as React from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { normalizeLumenGlow, type LumenAppearance, getLumenColorProperties } from './appearance'
import createLumenTheme from './theme'
import { LumenSurfaceRoleContext, type LumenSurfaceRole } from './LumenSurface'
import styles from './provider.module.css'
import './styles.css'

export interface LumenProviderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  appearance: Readonly<LumenAppearance>
  children: React.ReactNode
  withCssBaseline?: boolean | undefined
  /** Default hierarchy for contained surfaces; omission keeps reference rendering compatible. */
  surfaceRole?: LumenSurfaceRole | undefined
}

export default function LumenProvider({
  appearance,
  children,
  withCssBaseline = true,
  surfaceRole,
  className,
  style,
  ...other
}: LumenProviderProps) {
  const { mode, controlSize, textSize, cornerSize, shape, glow, motion, colors } = appearance
  const theme = React.useMemo(
    () => createLumenTheme(mode, { controlSize, textSize, cornerSize, shape, colors }),
    [controlSize, cornerSize, mode, shape, textSize, colors],
  )
  const providerStyle: React.CSSProperties & { '--lumen-glow': number } = {
    ...style,
    ...getLumenColorProperties(mode, colors),
    '--lumen-glow': normalizeLumenGlow(glow) / 100,
  }

  return (
    <ThemeProvider theme={theme}>
      {withCssBaseline ? <CssBaseline /> : null}
      <div
        {...other}
        className={[styles.provider, className].filter(Boolean).join(' ')}
        data-lumen-mode={mode}
        data-lumen-control-size={controlSize}
        data-lumen-text-size={textSize}
        data-lumen-corner-size={cornerSize}
        data-lumen-shape={shape}
        data-lumen-motion={motion ? 'on' : 'off'}
        style={providerStyle}
      >
        <LumenSurfaceRoleContext.Provider value={surfaceRole}>{children}</LumenSurfaceRoleContext.Provider>
      </div>
    </ThemeProvider>
  )
}
