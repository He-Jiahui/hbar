import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { SessionDraftState } from '@hbar/app-runtime'

type WorkspaceContext = NonNullable<SessionDraftState['workspaceContexts']>[number]

export function sessionWorkspaceContextCopy(
  choose: (chinese: string, english: string) => string,
): HbarSessionWorkspaceLabels['workspaceContexts'] {
  const lineRange = (context: WorkspaceContext) =>
    context.lineStart === context.lineEnd ? `L${context.lineStart}` : `L${context.lineStart}–L${context.lineEnd}`

  return {
    label: choose('工作区上下文', 'Workspace context'),
    kind: (context) => {
      switch (context.kind) {
        case 'source-selection':
          return choose('选中代码', 'Selected code')
        case 'source-comment':
          return choose('选区批注', 'Selection comment')
        case 'diff-comment':
          return choose('差异批注', 'Diff comment')
      }
    },
    location: (context) => {
      const range = lineRange(context)
      if (context.kind === 'diff-comment') {
        const side = context.diffSide === 'old' ? choose('旧版', 'Old') : choose('新版', 'New')
        return `${context.path} · ${side} · ${range}`
      }
      return `${context.path} · ${range}`
    },
    range: (context) =>
      context.kind === 'diff-comment'
        ? `${context.diffSide === 'old' ? choose('旧版', 'Old') : choose('新版', 'New')} · ${lineRange(context)}`
        : lineRange(context),
    remove: (context) =>
      choose(
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
