import {
  LumenPromptComposer,
  LumenPromptInput01,
  LumenPromptInput04,
  LumenPromptInput07,
  LumenText,
  type LumenPromptComposerProps,
} from '@lumen/app-ui'
import type { ReactNode } from 'react'
import {
  HbarComposerFeedback,
  HbarComposerFeedbackProvider,
  HbarComposerFeedbackTrigger,
  useHbarComposerFeedbackManaged,
  type HbarComposerFeedbackLabels,
} from './composer-feedback'
import './prompt-composer.css'

type HbarPromptComposerProps = LumenPromptComposerProps & {
  readonly backgroundAction?: ReactNode
  readonly variant?: 1 | 4 | 7
  readonly feedbackLabels?: HbarComposerFeedbackLabels
}

function ComposerContent(props: HbarPromptComposerProps) {
  const managed = useHbarComposerFeedbackManaged()
  return (
    <LumenPromptComposer
      {...props}
      className="hbar-prompt-composer"
      error={managed ? undefined : props.error}
      context={
        <>
          {props.context}
          {managed && props.error && (
            <HbarComposerFeedback tone="danger">
              <LumenText as="p" role="alert">
                {props.error}
              </LumenText>
            </HbarComposerFeedback>
          )}
        </>
      }
      controls={
        <>
          {props.controls}
          <HbarComposerFeedbackTrigger />
        </>
      }
    />
  )
}

export function HbarPromptComposer(props: HbarPromptComposerProps) {
  const composer = <ComposerContent {...props} />
  const controlled = { body: null, composer }
  const content =
    props.variant === 4 ? (
      <LumenPromptInput04 controlled={controlled} />
    ) : props.variant === 7 ? (
      <LumenPromptInput07 controlled={controlled} />
    ) : props.variant === 1 ? (
      <LumenPromptInput01 controlled={controlled} />
    ) : (
      composer
    )
  return props.feedbackLabels ? (
    <HbarComposerFeedbackProvider labels={props.feedbackLabels}>{content}</HbarComposerFeedbackProvider>
  ) : (
    content
  )
}
