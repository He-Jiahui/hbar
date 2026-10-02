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
  props: LumenPromptComposerProps & { readonly backgroundAction?: ReactNode; readonly variant?: 1 | 4 | 7 },
) {
  const composer = <LumenPromptComposer {...props} className="hbar-prompt-composer" />
  const controlled = { body: null, composer }
  if (props.variant === 4) return <LumenPromptInput04 controlled={controlled} />
  if (props.variant === 7) return <LumenPromptInput07 controlled={controlled} />
  return <LumenPromptInput01 controlled={controlled} />
}
