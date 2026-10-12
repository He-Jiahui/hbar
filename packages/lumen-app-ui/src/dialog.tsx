'use client'

import * as React from 'react'
import LumenDivider from './LumenDivider'
import LumenSurface from './LumenSurface'
import { LumenIconButton } from './primitives'
import { LumenContentText } from './content-text'
import { LumenFloatingSurface } from './floating-surface'
import './dialog.css'

export interface LumenDialogProps {
  open: boolean
  title: string
  closeLabel: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string | undefined
  /** Viewport width and height: large 80%, medium 60%, small 40%; compact viewports fill the window. */
  size?: 'large' | 'medium' | 'small' | undefined
  /** Solid, undecorated panel chrome is opt-in; glass preserves the existing lamp appearance. */
  appearance?: 'glass' | 'panel' | undefined
  chromeless?: boolean | undefined
  initialFocus?: React.RefObject<HTMLElement | null> | undefined
}

function CloseGlyph() {
  return (
    <svg className="lumen-dialog-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  )
}

/** Uses the shared top-layer surface while the host owns open state and copy. */
export function LumenDialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  className,
  size = 'medium',
  appearance = 'glass',
  chromeless = false,
  initialFocus,
}: LumenDialogProps) {
  return (
    <LumenFloatingSurface
      mode="modal"
      open={open}
      onClose={onClose}
      initialFocusRef={initialFocus}
      label={title}
      className={['lumen-dialog', 'hbar-app-ui-native-dialog', chromeless ? 'is-chromeless' : '', className]
        .filter(Boolean)
        .join(' ')}
      backdropClassName="hbar-app-ui-dialog-backdrop"
      data-open={open || undefined}
      data-dialog-size={size}
      data-appearance={appearance}
    >
      <LumenSurface
        boundary={appearance === 'panel' ? 'none' : 'horizontal'}
        className="lumen-dialog-surface"
        contentClassName="lumen-dialog-content"
        material={appearance === 'panel' ? 'solid' : 'glass'}
      >
        {!chromeless ? (
          <React.Fragment>
            <header>
              <LumenContentText context="dialog.title">{title}</LumenContentText>
              <LumenIconButton label={closeLabel} onClick={onClose}>
                <CloseGlyph />
              </LumenIconButton>
            </header>
            {appearance === 'glass' ? <LumenDivider /> : null}
          </React.Fragment>
        ) : null}
        <div className="lumen-dialog-body hbar-app-ui-native-dialog-body">{children}</div>
        {footer ? (
          <React.Fragment>
            {appearance === 'glass' ? <LumenDivider /> : null}
            <footer>{footer}</footer>
          </React.Fragment>
        ) : null}
      </LumenSurface>
    </LumenFloatingSurface>
  )
}
