import { LumenComments, LumenCommentsProvider as HbarAppUiCommentsProvider, type LumenCommentsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'
export type HbarAppUiCommentsProps = HbarAppUiVariantProps & {
  readonly commentsContent?: LumenCommentsContent | undefined
}
export { HbarAppUiCommentsProvider }
export { projectLumenCommentsCanvas as projectHbarAppUiCommentsCanvas, normalizeLumenCommentsCanvasCoordinate as normalizeHbarAppUiCommentsCanvasCoordinate, projectLumenCommentsInbox as projectHbarAppUiCommentsInbox, filterLumenCommentsComposerMentions as filterHbarAppUiCommentsComposerMentions, insertLumenCommentsComposerMention as insertHbarAppUiCommentsComposerMention, selectLumenCommentsItem as selectHbarAppUiCommentsItem, uniqueLumenCommentsItems as uniqueHbarAppUiCommentsItems, useLumenCommentsContent as useHbarAppUiCommentsContent } from '@lumen/app-ui/catalog'
export type { LumenCommentsCanvasReferenceContent as HbarAppUiCommentsCanvasReferenceContent, LumenCommentsCanvasReferencePin as HbarAppUiCommentsCanvasReferencePin, LumenCommentsInboxReferenceContent as HbarAppUiCommentsInboxReferenceContent, LumenCommentsInboxReferenceItem as HbarAppUiCommentsInboxReferenceItem, LumenCommentsInboxFilter as HbarAppUiCommentsInboxFilter, LumenCommentsComposerReferenceContent as HbarAppUiCommentsComposerReferenceContent, LumenCommentsComposerAttachment as HbarAppUiCommentsComposerAttachment, LumenCommentsComposerMention as HbarAppUiCommentsComposerMention, LumenCommentsAction as HbarAppUiCommentsAction, LumenCommentsAnnotation as HbarAppUiCommentsAnnotation, LumenCommentsAnnotationContent as HbarAppUiCommentsAnnotationContent, LumenCommentsAnnotationReferenceContent as HbarAppUiCommentsAnnotationReferenceContent, LumenCommentsDocumentAnnotation as HbarAppUiCommentsDocumentAnnotation, LumenCommentsDocumentSegment as HbarAppUiCommentsDocumentSegment, LumenCommentsCanvasContent as HbarAppUiCommentsCanvasContent, LumenCommentsCanvasPin as HbarAppUiCommentsCanvasPin, LumenCommentsChoice as HbarAppUiCommentsChoice, LumenCommentsCodeLine as HbarAppUiCommentsCodeLine, LumenCommentsComposerContent as HbarAppUiCommentsComposerContent, LumenCommentsContent as HbarAppUiCommentsContent, LumenCommentsDiscussionContent as HbarAppUiCommentsDiscussionContent, LumenCommentsDiscussionReferenceContent as HbarAppUiCommentsDiscussionReferenceContent, LumenCommentsInboxContent as HbarAppUiCommentsInboxContent, LumenCommentsInboxItem as HbarAppUiCommentsInboxItem, LumenCommentsListStrategy as HbarAppUiCommentsListStrategy, LumenCommentsMention as HbarAppUiCommentsMention, LumenCommentsMessage as HbarAppUiCommentsMessage, LumenCommentsProviderProps as HbarAppUiCommentsProviderProps, LumenCommentsReviewContent as HbarAppUiCommentsReviewContent, LumenCommentsCodeReviewReferenceContent as HbarAppUiCommentsCodeReviewReferenceContent, LumenCommentsReviewLine as HbarAppUiCommentsReviewLine, LumenCommentsReviewMessage as HbarAppUiCommentsReviewMessage } from '@lumen/app-ui/catalog'
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
