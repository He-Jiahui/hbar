import {
  LumenPromptComposer,
  LumenPromptInput01,
  LumenPromptInput04,
  LumenPromptInput07,
  type LumenPromptComposerProps,
} from '@lumen/app-ui'
import type { ReactNode } from 'react'
import './prompt-composer.css'

export function HbarPromptComposer(
  props: LumenPromptComposerProps & {
    readonly backgroundAction?: ReactNode
    readonly variant?: 1 | 4 | 7
    readonly adaptiveToolbar?: {
      readonly moreLabel: string
      readonly controlsLabel: string
      readonly modelLabel: string
      readonly revealModelRequest: number
    }
  },
) {
  const toolbar = props.adaptiveToolbar
    ? {
        moreLabel: props.adaptiveToolbar.moreLabel,
        items: [
          ...(props.controls
            ? [{ id: 'actions', label: props.adaptiveToolbar.controlsLabel, priority: 50, content: props.controls }]
            : []),
          ...(props.modelPicker
            ? [{ id: 'model', label: props.adaptiveToolbar.modelLabel, priority: 100, content: props.modelPicker }]
            : []),
        ],
        revealRequest: { id: 'model', revision: props.adaptiveToolbar.revealModelRequest },
      }
    : props.toolbar
  const composer = <LumenPromptComposer {...props} toolbar={toolbar} className="hbar-prompt-composer" />
  const controlled = { body: null, composer }
  if (props.variant === 4) return <LumenPromptInput04 controlled={controlled} />
  if (props.variant === 7) return <LumenPromptInput07 controlled={controlled} />
  if (props.variant === 1) return <LumenPromptInput01 controlled={controlled} />
  return composer
}
