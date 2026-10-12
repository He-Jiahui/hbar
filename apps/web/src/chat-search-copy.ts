import type { HbarChatSearchLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function chatSearchCopy(locale: ShellLocale): HbarChatSearchLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const sources = {
    title: choose('标题', 'Title'),
    conversation: choose('对话', 'Dialogue'),
    file: choose('文件', 'File'),
    patch: choose('补丁', 'Patch'),
    tool: choose('工具', 'Tool'),
  }
  return {
    category: choose('搜索来源', 'Search source'),
    enterQuery: choose('输入关键词搜索此分类。', 'Enter a query to search this source.'),
    scopes: {
      all: choose('全部', 'All'),
      title: choose('会话标题', 'Session titles'),
      conversation: choose('对话内容', 'Dialogue'),
      file: choose('修改的文件名', 'Changed file names'),
      patch: choose('补丁内容', 'Patch content'),
      tool: choose('工具命令', 'Tool commands'),
    },
    sources,
    openResult: (source, title, workspaceName, preview) =>
      choose(
        `打开${sources[source]}匹配「${title}」（${workspaceName}）${preview ? `：${preview}` : ''}`,
        `Open ${sources[source]} match in ${title} (${workspaceName})${preview ? `: ${preview}` : ''}`,
      ),
    search: choose('搜索所有聊天…', 'Search all chats…'),
    close: choose('关闭聊天搜索', 'Close chat search'),
    recent: choose('最近的聊天', 'Recent chats'),
    loading: choose('正在搜索聊天…', 'Searching chats…'),
    indexing: choose('正在建立已保存聊天的搜索索引。请稍后重试。', 'Indexing saved chats. Try again shortly.'),
    searchFailed: choose('聊天搜索失败。', 'Chat search failed.'),
    empty: choose('没有匹配的聊天。', 'No chats match.'),
    noRecent: choose('还没有最近的聊天。', 'No recent chats yet.'),
    disconnected: choose('连接到宿主后才能搜索聊天。', 'Connect to the Host to search chats.'),
    retry: choose('重试搜索', 'Try again'),
    truncated: choose('只显示部分结果；请缩小搜索范围。', 'Only part of the results are shown; refine your search.'),
    navigateKey: '↑↓',
    navigate: choose('导航', 'navigate'),
    selectKey: 'Enter',
    select: choose('打开', 'open'),
    closeKey: 'Esc',
    closeHint: choose('关闭', 'close'),
    role: (role) =>
      role === 'user' ? choose('你', 'You') : role === 'tool' ? sources.tool : choose('助手', 'Assistant'),
    time: (updatedAt) => {
      if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) return choose('时间未知', 'Time unavailable')
      const age = Math.max(0, Date.now() - updatedAt)
      if (age < 60_000) return choose('刚刚', 'just now')
      if (age < 3_600_000) return relative.format(-Math.floor(age / 60_000), 'minute')
      if (age < 86_400_000) return relative.format(-Math.floor(age / 3_600_000), 'hour')
      if (age < 604_800_000) return relative.format(-Math.floor(age / 86_400_000), 'day')
      return date.format(updatedAt)
    },
    matches: (count, capped) =>
      choose(
        `${count}${capped ? '+' : ''} 处匹配`,
        `${count}${capped ? '+' : ''} ${count === 1 && !capped ? 'match' : 'matches'}`,
      ),
    openSession: (title, workspaceName) =>
      choose(`打开「${title}」（${workspaceName}）`, `Open ${title} in ${workspaceName}`),
    opening: (title) => choose(`正在打开「${title}」…`, `Opening ${title}…`),
  }
}

/** Only public stable error codes are shown; private transport messages never become visible copy. */
export function chatSearchErrorCopy(locale: ShellLocale, code: string): string {
  const zh = locale === 'zh-CN'
  if (code === 'QUERY_LIMIT')
    return zh ? '搜索词过长，请缩短后重试。' : 'The search is too long. Shorten it and try again.'
  if (code === 'SESSION_ARCHIVED' || code === 'SESSION_NOT_FOUND' || code === 'NOT_FOUND')
    return zh ? '这段聊天已不可打开。请重新搜索。' : 'This chat is no longer available. Search again.'
  if (code === 'DISCONNECTED')
    return zh ? '宿主已断开连接。请重连后重试。' : 'Host disconnected. Reconnect and try again.'
  if (code === 'BUSY') return zh ? '搜索正在处理中，请稍后重试。' : 'Search is busy. Try again shortly.'
  return zh ? '聊天搜索失败，请重试。' : 'Chat search failed. Try again.'
}
