import type { LumenChatListStrategy, LumenChatMessage } from '../chat'

export interface LumenChatDirectReferenceLayout {
  readonly labels: {
    readonly search: string
    readonly searchPlaceholder: string
    readonly emptySearch: string
    readonly day: string
    readonly voiceCall: string
    readonly videoCall: string
    readonly attachImage: string
    readonly read: string
    readonly inputLabel: (contact: string) => string
    readonly inputPlaceholder: string
  }
}

export interface LumenChatSocialNestedReply extends LumenChatMessage {
  readonly parentId: string
}

export interface LumenChatSocialReferenceLayout {
  readonly labels: {
    readonly inputLabel: string
    readonly visibility: string
    readonly relevant: string
    readonly recent: string
    readonly sortToggle: string
    readonly showMore: string
    readonly share: string
    readonly replyTo: (author: string) => string
    readonly replies: (count: number) => string
    readonly reposts: (count: number) => string
    readonly likes: (author: string, count: number) => string
  }
  readonly composerInitials: string
  readonly replyCount: number
  readonly repostCount: number
  readonly nestedReplies: readonly LumenChatSocialNestedReply[]
  readonly initialLikedIds: readonly string[]
}

export interface LumenChatSupportReferenceLayout {
  readonly labels: {
    readonly minimize: string
    readonly restore: string
    readonly started: string
    readonly helpful: string
    readonly notHelpful: string
    readonly ratingSummary: string
    readonly inputLabel: string
  }
  readonly messages: readonly LumenChatMessage[]
  readonly listStrategy: LumenChatListStrategy
}

export interface LumenChatGroupReaction {
  readonly id: string
  readonly messageId: string
  readonly symbol: string
  readonly count: number
  readonly selected: boolean
}

export interface LumenChatGroupReferenceAttachment {
  readonly id: string
  readonly messageId: string
  readonly name: string
  readonly detail: string
  readonly kind: 'image' | 'document'
}

export interface LumenChatGroupReferenceLayout {
  readonly labels: {
    readonly day: string
    readonly typing: string
    readonly addReaction: string
    readonly reaction: (symbol: string, count: number) => string
    readonly download: (name: string) => string
  }
  readonly attachments: readonly LumenChatGroupReferenceAttachment[]
  readonly reactions: readonly LumenChatGroupReaction[]
}

export interface LumenChatLiveReferenceLayout {
  readonly labels: {
    readonly follow: string
    readonly following: string
    readonly emoji: string
    readonly inputLabel: string
    readonly pinnedSeparator: string
    readonly messageSeparator: string
  }
}
