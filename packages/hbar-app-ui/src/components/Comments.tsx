import {
  LumenComments,
  LumenCommentsProvider as HbarAppUiCommentsProvider,
  type LumenCommentsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'
export type HbarAppUiCommentsProps = HbarAppUiVariantProps & {
  readonly commentsContent?: LumenCommentsContent | undefined
}
export { HbarAppUiCommentsProvider }
export {
  selectLumenCommentsItem as selectHbarAppUiCommentsItem,
  uniqueLumenCommentsItems as uniqueHbarAppUiCommentsItems,
  useLumenCommentsContent as useHbarAppUiCommentsContent,
} from '@lumen/app-ui'
export type {
  LumenCommentsAction as HbarAppUiCommentsAction,
  LumenCommentsAnnotation as HbarAppUiCommentsAnnotation,
  LumenCommentsAnnotationContent as HbarAppUiCommentsAnnotationContent,
  LumenCommentsCanvasContent as HbarAppUiCommentsCanvasContent,
  LumenCommentsCanvasPin as HbarAppUiCommentsCanvasPin,
  LumenCommentsChoice as HbarAppUiCommentsChoice,
  LumenCommentsCodeLine as HbarAppUiCommentsCodeLine,
  LumenCommentsComposerContent as HbarAppUiCommentsComposerContent,
  LumenCommentsContent as HbarAppUiCommentsContent,
  LumenCommentsDiscussionContent as HbarAppUiCommentsDiscussionContent,
  LumenCommentsInboxContent as HbarAppUiCommentsInboxContent,
  LumenCommentsInboxItem as HbarAppUiCommentsInboxItem,
  LumenCommentsListStrategy as HbarAppUiCommentsListStrategy,
  LumenCommentsMention as HbarAppUiCommentsMention,
  LumenCommentsMessage as HbarAppUiCommentsMessage,
  LumenCommentsProviderProps as HbarAppUiCommentsProviderProps,
  LumenCommentsReviewContent as HbarAppUiCommentsReviewContent,
} from '@lumen/app-ui'
export function Comments({ spec, onAction, commentsContent, className }: HbarAppUiCommentsProps) {
  return (
    <LumenComments
      variant={spec.variant}
      variantId={spec.id}
      content={commentsContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
