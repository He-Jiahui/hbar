import {
  LumenContentText,
  LumenPromptComposer,
  LumenPromptInput01,
  LumenPromptInput04,
  LumenPromptInput07,
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

export type HbarPromptComposerProps = LumenPromptComposerProps & {
  readonly backgroundAction?: ReactNode
  readonly variant?: 1 | 4 | 7
  readonly feedbackLabels?: HbarComposerFeedbackLabels
  /** Validation failures can remain visible without opening managed feedback. */
  readonly errorPresentation?: 'inline' | undefined
  readonly adaptiveToolbar?: {
    readonly moreLabel: string
    readonly controlsLabel: string
    readonly modelLabel: string
    readonly revealModelRequest: number
  }
}

function ComposerContent(props: HbarPromptComposerProps) {
  const managed = useHbarComposerFeedbackManaged()
  const managedError = managed && props.errorPresentation !== 'inline'
  const controls = (
    <>
      {props.controls}
      <HbarComposerFeedbackTrigger />
    </>
  )
  const toolbar = props.adaptiveToolbar
    ? {
        moreLabel: props.adaptiveToolbar.moreLabel,
        items: [
          ...(props.controls || managed
            ? [{ id: 'actions', label: props.adaptiveToolbar.controlsLabel, priority: 50, content: controls }]
            : []),
          ...(props.modelPicker
            ? [{ id: 'model', label: props.adaptiveToolbar.modelLabel, priority: 100, content: props.modelPicker }]
            : []),
        ],
        revealRequest: { id: 'model', revision: props.adaptiveToolbar.revealModelRequest },
      }
    : props.toolbar
      ? {
          ...props.toolbar,
          items: [
            ...props.toolbar.items,
            ...(managed && props.feedbackLabels
              ? [
                  {
                    id: 'feedback',
                    label: props.feedbackLabels.title,
                    priority: 80,
                    content: <HbarComposerFeedbackTrigger />,
                  },
                ]
              : []),
          ],
        }
      : undefined
  return (
    <LumenPromptComposer
      {...props}
      toolbar={toolbar}
      className="hbar-prompt-composer"
      error={managedError ? undefined : props.error}
      context={
        <>
          {props.context}
          {managedError && props.error && (
            <HbarComposerFeedback tone="danger">
              <LumenContentText context="feedback.message" role="alert">
                {props.error}
              </LumenContentText>
            </HbarComposerFeedback>
          )}
        </>
      }
      controls={controls}
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
