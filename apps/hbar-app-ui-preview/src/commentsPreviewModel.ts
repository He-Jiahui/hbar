import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  filterHbarAppUiCommentsComposerMentions,
  insertHbarAppUiCommentsComposerMention,
  type HbarAppUiCommentsContent,
} from 'hbar-app-ui/catalog'

export type CommentsPreviewVariant = 1 | 2 | 3 | 4 | 5 | 6
export interface CommentsPreviewScope {
  readonly ownerId: string
  readonly variant: CommentsPreviewVariant
  readonly fixtureId: string
}
export type CommentsPreviewFlow =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'discussion'
      readonly sortId: string
      readonly draft: string
      readonly reactions: Readonly<Record<string, { readonly count: number; readonly pressed: boolean }>>
    }
  | { readonly kind: 'annotation'; readonly activeId: string; readonly resolvedIds: readonly string[] }
  | { readonly kind: 'review'; readonly resolved: boolean; readonly draft: string }
  | { readonly kind: 'composer'; readonly draft: string; readonly attachmentIds: readonly string[] }
  | { readonly kind: 'inbox'; readonly filterId: string; readonly resolvedIds: readonly string[] }
  | {
      readonly kind: 'canvas'
      readonly activeId: string
      readonly resolvedIds: readonly string[]
      readonly draft: string
    }

export interface CommentsPreviewState {
  readonly scope: CommentsPreviewScope
  readonly flow: CommentsPreviewFlow
  readonly draft: (scope: CommentsPreviewScope, value: string, targetId?: string) => boolean
  readonly choose: (scope: CommentsPreviewScope, id: string) => boolean
  readonly select: (scope: CommentsPreviewScope, id: string) => boolean
  readonly resolve: (scope: CommentsPreviewScope, id: string, resolved: boolean) => boolean
  readonly resolveReview: (scope: CommentsPreviewScope, resolved: boolean) => boolean
  readonly react: (scope: CommentsPreviewScope, id: string) => boolean
  readonly removeAttachment: (scope: CommentsPreviewScope, id: string) => boolean
  readonly mention: (scope: CommentsPreviewScope, id: string) => boolean
}
export type CommentsPreviewStoreApi = StoreApi<CommentsPreviewState>

export function uniqueCommentsPreviewItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
function initialId(items: readonly { readonly id: string }[], id: string): string {
  const known = uniqueCommentsPreviewItems(items)
  return known.some((item) => item.id === id) ? id : (known[0]?.id ?? '')
}
function resolvedIds(items: readonly { readonly id: string; readonly resolved: boolean }[]): readonly string[] {
  return uniqueCommentsPreviewItems(items)
    .filter((item) => item.resolved)
    .map((item) => item.id)
}
function initialFlow(input: HbarAppUiCommentsContent, variant: CommentsPreviewVariant): CommentsPreviewFlow {
  switch (variant) {
    case 1: {
      const content = input.referenceDiscussion
      if (!content) return { kind: 'empty' }
      const reactions = Object.fromEntries(
        uniqueCommentsPreviewItems(content.messages).flatMap((message) => {
          if (message.reactionCount === undefined) return []
          return [
            [
              message.id,
              {
                count: Number.isFinite(message.reactionCount) ? Math.max(0, message.reactionCount) : 0,
                pressed: message.reacted ?? false,
              },
            ],
          ]
        }),
      )
      return {
        kind: 'discussion',
        sortId: initialId(content.sortOptions, content.sortId),
        draft: content.draft,
        reactions,
      }
    }
    case 2: {
      const content = input.referenceAnnotation
      return content
        ? {
            kind: 'annotation',
            activeId: initialId(content.annotations, content.activeId),
            resolvedIds: resolvedIds(content.annotations),
          }
        : { kind: 'empty' }
    }
    case 3: {
      const content = input.referenceReview
      return content ? { kind: 'review', resolved: content.resolved, draft: content.draft } : { kind: 'empty' }
    }
    case 4: {
      const content = input.referenceComposer
      return content
        ? {
            kind: 'composer',
            draft: content.draft,
            attachmentIds: uniqueCommentsPreviewItems(content.attachments).map((item) => item.id),
          }
        : { kind: 'empty' }
    }
    case 5: {
      const content = input.referenceInbox
      return content
        ? {
            kind: 'inbox',
            filterId: initialId(content.filters, content.filterId),
            resolvedIds: resolvedIds(content.items),
          }
        : { kind: 'empty' }
    }
    case 6: {
      const content = input.referenceCanvas
      return content
        ? {
            kind: 'canvas',
            activeId: initialId(content.pins, content.activeId),
            resolvedIds: resolvedIds(content.pins),
            draft: content.draft,
          }
        : { kind: 'empty' }
    }
  }
}

/** The input is a read-only domain seed. Mutable state contains only IDs, drafts and flags. */
export function createCommentsPreviewStore(
  input: HbarAppUiCommentsContent,
  scope: CommentsPreviewScope,
): CommentsPreviewStoreApi {
  return createStore<CommentsPreviewState>((set, get) => {
    const update = (
      target: CommentsPreviewScope,
      change: (flow: CommentsPreviewFlow) => CommentsPreviewFlow | undefined,
    ): boolean => {
      const current = get()
      if (current.scope !== target) return false
      const flow = change(current.flow)
      if (!flow || flow === current.flow) return false
      set({ flow })
      return true
    }
    return {
      scope,
      flow: initialFlow(input, scope.variant),
      draft: (target, value, targetId) =>
        update(target, (flow) => {
          if (!('draft' in flow) || flow.draft === value) return undefined
          if (flow.kind === 'canvas' && (!flow.activeId || flow.activeId !== targetId)) return undefined
          return { ...flow, draft: value }
        }),
      choose: (target, id) =>
        update(target, (flow) => {
          if (
            flow.kind === 'discussion' &&
            input.referenceDiscussion?.sortOptions.some((item) => item.id === id && item.id.trim()) &&
            flow.sortId !== id
          )
            return { ...flow, sortId: id }
          if (
            flow.kind === 'inbox' &&
            input.referenceInbox?.filters.some((item) => item.id === id && item.id.trim()) &&
            flow.filterId !== id
          )
            return { ...flow, filterId: id }
          return undefined
        }),
      select: (target, id) =>
        update(target, (flow) => {
          if (flow.kind !== 'annotation' && flow.kind !== 'canvas') return undefined
          const items =
            flow.kind === 'annotation' ? input.referenceAnnotation?.annotations : input.referenceCanvas?.pins
          return flow.activeId !== id && items?.some((item) => item.id === id && item.id.trim())
            ? { ...flow, activeId: id }
            : undefined
        }),
      resolve: (target, id, resolved) =>
        update(target, (flow) => {
          if (!('resolvedIds' in flow) || !id.trim() || flow.resolvedIds.includes(id) === resolved) return undefined
          const items =
            flow.kind === 'annotation'
              ? input.referenceAnnotation?.annotations
              : flow.kind === 'canvas'
                ? input.referenceCanvas?.pins
                : input.referenceInbox?.items
          if (!items?.some((item) => item.id === id)) return undefined
          if (flow.kind === 'inbox') {
            const item = input.referenceInbox?.items.find((item) => item.id === id)
            const kind = input.referenceInbox?.filters.find((filter) => filter.id === flow.filterId)?.kind ?? 'all'
            if ((kind === 'unresolved' && flow.resolvedIds.includes(id)) || (kind === 'mentions' && !item?.mentioned))
              return undefined
          }
          return {
            ...flow,
            resolvedIds: resolved ? [...flow.resolvedIds, id] : flow.resolvedIds.filter((item) => item !== id),
          }
        }),
      resolveReview: (target, resolved) =>
        update(target, (flow) =>
          flow.kind === 'review' && flow.resolved !== resolved ? { ...flow, resolved } : undefined,
        ),
      react: (target, id) =>
        update(target, (flow) => {
          if (
            flow.kind !== 'discussion' ||
            !input.referenceDiscussion?.messages.some(
              (message) => message.id === id && message.reactionCount !== undefined,
            )
          )
            return undefined
          const reaction = flow.reactions[id]
          if (!reaction) return undefined
          return {
            ...flow,
            reactions: {
              ...flow.reactions,
              [id]: { pressed: !reaction.pressed, count: Math.max(0, reaction.count + (reaction.pressed ? -1 : 1)) },
            },
          }
        }),
      removeAttachment: (target, id) =>
        update(target, (flow) =>
          flow.kind === 'composer' && flow.attachmentIds.includes(id)
            ? { ...flow, attachmentIds: flow.attachmentIds.filter((item) => item !== id) }
            : undefined,
        ),
      mention: (target, id) =>
        update(target, (flow) => {
          if (flow.kind !== 'composer' || !input.referenceComposer) return undefined
          const person = filterHbarAppUiCommentsComposerMentions(flow.draft, input.referenceComposer.suggestions).find(
            (item) => item.id === id && item.id.trim(),
          )
          if (!person) return undefined
          const draft = insertHbarAppUiCommentsComposerMention(flow.draft, person.handle)
          return draft === flow.draft ? undefined : { ...flow, draft }
        }),
    }
  })
}
