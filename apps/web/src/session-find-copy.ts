import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function sessionFindCopy(locale: ShellLocale): HbarSessionWorkspaceLabels['find'] {
  const zh = locale === 'zh-CN'
  return {
    entry: zh ? '在此会话中查找' : 'Find in this conversation',
    title: zh ? '会话内查找' : 'Find in conversation',
    input: zh ? '查找会话正文' : 'Find conversation text',
    placeholder: zh ? '查找…' : 'Find…',
    previous: zh ? '上一处匹配（Shift+Enter）' : 'Previous match (Shift+Enter)',
    next: zh ? '下一处匹配（Enter）' : 'Next match (Enter)',
    close: zh ? '关闭会话查找（Esc）' : 'Close conversation find (Esc)',
    searching: zh ? '查找中…' : 'Finding…',
    scope: zh
      ? '仅查找已加载的用户与助手正文，不含工具、思考或输入草稿。'
      : 'Search loaded user and assistant text only, not tools, thinking or your draft.',
    older: zh
      ? '仅查找已加载的正文；可手动加载更早消息。'
      : 'Searching loaded text only. Load earlier messages to include them.',
    historyFailed: zh
      ? '部分历史未能读取；当前结果仅来自已加载正文。'
      : 'Some history could not be read. These results cover loaded text only.',
    limited: zh
      ? '结果或正文达到查找上限；未搜索全部内容。'
      : 'The result or text limit was reached. Not all content was searched.',
    queryLimit: zh ? '搜索词过长，请缩短后重试。' : 'The search query is too long. Shorten it and try again.',
    invalidSource: zh
      ? '当前正文尚不能可靠查找，请关闭后重试。'
      : 'This text cannot be searched reliably yet. Close find and try again.',
    highlightUnavailable: zh
      ? '当前正文无法准确高亮；请重新选择匹配项。'
      : 'The current text could not be highlighted precisely. Select the match again.',
    targetUnavailable: zh
      ? '此匹配项已变化或尚未显示，请重新选择。'
      : 'This match changed or is not visible yet. Select it again.',
    count: (position, total, truncated) => (total ? `${position} / ${total}${truncated ? '+' : ''}` : '0'),
  }
}
