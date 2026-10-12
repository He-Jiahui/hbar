import styles from './materials.module.css'

export type LumenState = 'idle' | 'selected' | 'running' | 'failed' | 'disabled'

export type LumenTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface LumenIndicatorProps {
  /** @deprecated Status is a compact dot; edge no longer changes its geometry. */
  edge?: 'top' | 'bottom' | 'left' | 'right' | undefined
  state?: LumenState | undefined
  tone?: LumenTone | undefined
  /** @deprecated All status markers use the same compact size. */
  length?: 'standard' | 'action' | 'area' | undefined
  visible?: boolean | undefined
}

export default function LumenIndicator({ state = 'idle', tone = 'neutral', visible = true }: LumenIndicatorProps) {
  return (
    <span
      className={['lumen-effect lumen-status-dot', styles.indicator].join(' ')}
      data-lumen-state={state}
      data-lumen-tone={state === 'failed' ? 'danger' : tone}
      data-state={state}
      data-tone={tone}
      data-visible={visible}
      aria-hidden="true"
    />
  )
}
