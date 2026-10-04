import { filterHbarAppUiCommentsComposerMentions, type HbarAppUiCommentsContent } from 'hbar-app-ui/catalog'
import { uniqueCommentsPreviewItems, type CommentsPreviewStoreApi } from './commentsPreviewModel'

/** Retain the active legacy contract but never initialize or project another rich workflow. */
export function projectCommentsPreview(
  input: HbarAppUiCommentsContent,
  store: CommentsPreviewStoreApi,
): HbarAppUiCommentsContent {
  const { flow, scope } = store.getState()
  const actions = store.getState()
  switch (scope.variant) {
    case 1: {
      const content = input.referenceDiscussion
      return {
        discussion: input.discussion,
        referenceDiscussion:
          content && flow.kind === 'discussion'
            ? {
                ...content,
                sortId: flow.sortId,
                draft: flow.draft,
                sortOptions: uniqueCommentsPreviewItems(content.sortOptions),
                messages: uniqueCommentsPreviewItems(content.messages).map((message) => {
                  const reaction = flow.reactions[message.id]
                  return reaction ? { ...message, reactionCount: reaction.count, reacted: reaction.pressed } : message
                }),
                onSortChange: (id) => {
                  actions.choose(scope, id)
                },
                onDraftChange: (value) => {
                  actions.draft(scope, value)
                },
                onReactionToggle: (id) => {
                  actions.react(scope, id)
                },
              }
            : undefined,
      }
    }
    case 2: {
      const content = input.referenceAnnotation
      return {
        annotation: input.annotation,
        referenceAnnotation:
          content && flow.kind === 'annotation'
            ? {
                ...content,
                activeId: flow.activeId,
                annotations: uniqueCommentsPreviewItems(content.annotations).map((item) => ({
                  ...item,
                  resolved: flow.resolvedIds.includes(item.id),
                })),
                onSelectionChange: (id) => {
                  actions.select(scope, id)
                },
                onResolveToggle: (id) => {
                  const current = store.getState().flow
                  if (current.kind === 'annotation') actions.resolve(scope, id, !current.resolvedIds.includes(id))
                },
              }
            : undefined,
      }
    }
    case 3: {
      const content = input.referenceReview
      return {
        review: input.review,
        referenceReview:
          content && flow.kind === 'review'
            ? {
                ...content,
                draft: flow.draft,
                resolved: flow.resolved,
                onDraftChange: (value) => {
                  actions.draft(scope, value)
                },
                onResolvedChange: (value) => {
                  actions.resolveReview(scope, value)
                },
              }
            : undefined,
      }
    }
    case 4: {
      const content = input.referenceComposer
      return {
        composer: input.composer,
        referenceComposer:
          content && flow.kind === 'composer'
            ? {
                ...content,
                draft: flow.draft,
                attachments: uniqueCommentsPreviewItems(content.attachments).filter((item) =>
                  flow.attachmentIds.includes(item.id),
                ),
                suggestions: filterHbarAppUiCommentsComposerMentions(
                  flow.draft,
                  uniqueCommentsPreviewItems(content.suggestions),
                ),
                onDraftChange: (value) => {
                  actions.draft(scope, value)
                },
                onAttachmentRemove: (id) => {
                  actions.removeAttachment(scope, id)
                },
                onMentionSelect: (id) => {
                  actions.mention(scope, id)
                },
              }
            : undefined,
      }
    }
    case 5: {
      const content = input.referenceInbox
      return {
        inbox: input.inbox,
        referenceInbox:
          content && flow.kind === 'inbox'
            ? {
                ...content,
                filterId: flow.filterId,
                filters: uniqueCommentsPreviewItems(content.filters),
                items: uniqueCommentsPreviewItems(content.items).map((item) => ({
                  ...item,
                  resolved: flow.resolvedIds.includes(item.id),
                })),
                onFilterChange: (id) => {
                  actions.choose(scope, id)
                },
                onResolvedChange: (id, value) => {
                  actions.resolve(scope, id, value)
                },
              }
            : undefined,
      }
    }
    case 6: {
      const content = input.referenceCanvas
      return {
        canvas: input.canvas,
        referenceCanvas:
          content && flow.kind === 'canvas'
            ? {
                ...content,
                activeId: flow.activeId,
                draft: flow.draft,
                pins: uniqueCommentsPreviewItems(content.pins).map((item) => ({
                  ...item,
                  resolved: flow.resolvedIds.includes(item.id),
                })),
                onSelectionChange: (id) => {
                  actions.select(scope, id)
                },
                onResolvedChange: (id, value) => {
                  actions.resolve(scope, id, value)
                },
                onDraftChange: (value) => {
                  actions.draft(scope, value, flow.activeId)
                },
              }
            : undefined,
      }
    }
  }
}
