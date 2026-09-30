import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { SessionDraftState } from '@hbar/app-runtime'

type WorkspaceContext = NonNullable<SessionDraftState['workspaceContexts']>[number]
type FileContext = Exclude<WorkspaceContext, { readonly kind: 'chat-selection' }>

export function sessionWorkspaceContextCopy(
  choose: (chinese: string, english: string) => string,
): HbarSessionWorkspaceLabels['workspaceContexts'] {
  const lineRange = (context: FileContext) =>
    context.lineStart === context.lineEnd ? `L${context.lineStart}` : `L${context.lineStart}–L${context.lineEnd}`
  const messageName = (role: 'user' | 'assistant') =>
    role === 'user' ? choose('用户消息', 'User message') : choose('AI 回复', 'Assistant reply')

  return {
    label: choose('引用上下文', 'Referenced context'),
    kind: (context) => {
      switch (context.kind) {
        case 'source-selection':
          return choose('选中代码', 'Selected code')
        case 'source-comment':
          return choose('选区批注', 'Selection comment')
        case 'diff-comment':
          return choose('差异批注', 'Diff comment')
        case 'chat-selection':
          return choose('消息引用', 'Message reference')
      }
    },
    name: (context) =>
      context.kind === 'chat-selection'
        ? messageName(context.sourceRole)
        : (context.path.split('/').at(-1) ?? context.path),
    location: (context) => {
      if (context.kind === 'chat-selection')
        return `${messageName(context.sourceRole)} · ${context.sourceSessionId} · ${context.messageId}`
      const range = lineRange(context)
      if (context.kind === 'diff-comment') {
        const side = context.diffSide === 'old' ? choose('旧版', 'Old') : choose('新版', 'New')
        return `${context.path} · ${side} · ${range}`
      }
      return `${context.path} · ${range}`
    },
    range: (context) =>
      context.kind === 'chat-selection'
        ? ''
        : context.kind === 'diff-comment'
          ? `${context.diffSide === 'old' ? choose('旧版', 'Old') : choose('新版', 'New')} · ${lineRange(context)}`
          : lineRange(context),
    remove: (context) =>
      context.kind === 'chat-selection'
        ? choose(`移除${messageName(context.sourceRole)}引用`, `Remove ${messageName(context.sourceRole)} reference`)
        : choose(
            `移除上下文 ${context.path} ${lineRange(context)}`,
            `Remove context ${context.path} ${lineRange(context)}`,
          ),
    quoteDisclosure: choose('查看引用内容', 'Show selected text'),
    removeError: choose(
      '无法移除该上下文，草稿可能已变化。请重试。',
      'Could not remove this context; the draft may have changed. Try again.',
    ),
  }
}
