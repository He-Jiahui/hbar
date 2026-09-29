import type { HbarFileWorkspaceLabels } from '@hbar/app-react'

export function fileWorkspaceErrorCopy(zh: boolean, code: string): string | null {
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  switch (code) {
    case 'SESSION_LAUNCH_TARGET_UNRESOLVED':
      return choose('请先运行此会话，再刷新“文件”面板。', 'Run this session first, then refresh Files.')
    case 'COMMAND_CONFLICT':
    case 'TARGET_CHANGED':
    case 'STALE_TARGET':
      return choose(
        '会话文件目标已变化；请先刷新“文件”面板。',
        'The session file target changed. Refresh Files before continuing.',
      )
    case 'INVALID_OUTPUT':
      return choose(
        'Host 返回的文件响应无效；请刷新“文件”面板或重新连接。',
        'Host returned an invalid Files response. Refresh Files or reconnect.',
      )
    case 'CAPABILITY_UNAVAILABLE':
      return choose(
        '所需的 Host 能力不可用；请重新连接后刷新“文件”面板。',
        'A required Host capability is unavailable. Reconnect, then refresh Files.',
      )
    default:
      return null
  }
}

export function fileWorkspaceCopy(
  zh: boolean,
): Pick<HbarFileWorkspaceLabels, 'changes' | 'tree' | 'preview' | 'edit' | 'textPreview' | 'previews'> {
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  const status = (value: string) => {
    const names: Record<string, string> = {
      M: choose('修改', 'Modified'),
      A: choose('新增', 'Added'),
      D: choose('删除', 'Deleted'),
      R: choose('重命名', 'Renamed'),
      C: choose('复制', 'Copied'),
      U: choose('冲突', 'Unmerged'),
      T: choose('类型更改', 'Type changed'),
      '?': choose('未跟踪', 'Untracked'),
      '!': choose('忽略', 'Ignored'),
    }
    return names[value] ?? value
  }
  const kinds = {
    document: choose('文件', 'File'),
    working: choose('工作区差异', 'Working tree diff'),
    staged: choose('暂存区差异', 'Staged diff'),
  }
  return {
    previews: {
      tabs: choose('已打开的文件预览', 'Open file previews'),
      kind: (kind) => kinds[kind],
      tab: (path, kind) => `${path} — ${kinds[kind]}`,
      close: (path, kind) => choose(`关闭 ${path} — ${kinds[kind]}`, `Close ${path} — ${kinds[kind]}`),
      menu: (path, kind) => choose(`${path} — ${kinds[kind]} 的操作`, `Actions for ${path} — ${kinds[kind]}`),
      action: (scope) =>
        ({
          current: choose('关闭', 'Close'),
          others: choose('关闭其他', 'Close others'),
          left: choose('关闭左侧', 'Close to the left'),
          right: choose('关闭右侧', 'Close to the right'),
          all: choose('全部关闭', 'Close all'),
        })[scope],
      status: (state) =>
        ({
          dirty: choose('有未保存的更改', 'Unsaved changes'),
          submitting: choose('正在保存', 'Saving'),
          unknown: choose('保存结果尚未确认', 'Save result unconfirmed'),
        })[state],
      blocked: (path, reason) =>
        reason === 'dirty'
          ? choose(
              `未关闭任何预览：${path} 有未保存的更改。请先保存或明确丢弃草稿。`,
              `No previews closed: ${path} has unsaved changes. Save or explicitly discard its draft first.`,
            )
          : reason === 'submitting'
            ? choose(
                `未关闭任何预览：${path} 正在保存。请等待保存结果。`,
                `No previews closed: ${path} is saving. Wait for its result.`,
              )
            : choose(
                `未关闭任何预览：${path} 的保存结果尚未确认。请先核对保存结果。`,
                `No previews closed: the save result for ${path} is unconfirmed. Reconcile it first.`,
              ),
      showBlocked: choose('打开受保护文件', 'Open protected file'),
      error: (code) => {
        const targetError = fileWorkspaceErrorCopy(zh, code)
        if (targetError) return targetError
        return code === 'BUSY'
          ? choose(
              '预览容量或读取并发已达上限。请关闭不用的预览，或等待读取完成后重试。',
              'The preview or read limit was reached. Close unused previews, or wait for a read to finish and try again.',
            )
          : choose(`无法更改文件预览：${code}`, `Could not change file previews: ${code}`)
      },
    },
    preview: choose('预览', 'Preview'),
    edit: choose('编辑', 'Edit'),
    textPreview: (path) => choose(`文本预览：${path}`, `Text preview: ${path}`),
    changes: {
      mode: choose('文件视图', 'File view'),
      all: choose('所有文件', 'All files'),
      changed: choose('更改的文件', 'Changed files'),
      filter: choose('筛选更改的路径…', 'Filter changed paths…'),
      loading: choose('正在读取更改…', 'Reading changes…'),
      refresh: choose('刷新更改', 'Refresh changes'),
      noChanges: choose('此工作区没有 Git 更改。', 'No Git changes in this workspace.'),
      noMatches: choose('没有匹配的更改路径。', 'No changed paths match your filter.'),
      notRepository: choose('此工作区不在 Git 仓库中。', 'This workspace is not in a Git repository.'),
      limit: choose(
        '已达到 5,000 条状态上限；此列表可能不完整。',
        'The 5,000-entry status limit was reached; this list may be incomplete.',
      ),
      previous: choose('上一页文件', 'Previous files'),
      next: choose('下一页文件', 'Next files'),
      page: (from, to, total) => choose(`${from}–${to} / ${total} 个文件`, `${from}–${to} of ${total} files`),
      status: (index, worktree) =>
        index === '?' && worktree === '?'
          ? status('?')
          : [
              index !== ' ' ? choose(`暂存：${status(index)}`, `Staged: ${status(index)}`) : '',
              worktree !== ' ' ? choose(`工作区：${status(worktree)}`, `Working: ${status(worktree)}`) : '',
            ]
              .filter(Boolean)
              .join(' · '),
      open: (path) => choose(`查看更改：${path}`, `View change: ${path}`),
      openFolder: (path) => choose(`打开未跟踪文件夹：${path}`, `Open untracked folder: ${path}`),
      renamedFrom: (path) => choose(`原路径：${path}`, `Renamed from: ${path}`),
      error: (code) => {
        const targetError = fileWorkspaceErrorCopy(zh, code)
        if (targetError) return targetError
        return code === 'CANCELLED'
          ? choose('读取已取消，请刷新重试。', 'Reading was cancelled. Refresh to try again.')
          : choose(`读取更改失败：${code}`, `Could not read changes: ${code}`)
      },
      workingTree: choose('工作区', 'Working tree'),
      staged: choose('暂存区', 'Staged'),
      readOnlyDiff: choose('只读 Git 差异；编辑请打开文件。', 'Read-only Git diff. Open the file to edit.'),
      noDiff: choose('此文件在所选比较范围内没有文本差异。', 'This file has no text diff in the selected comparison.'),
      truncated: choose(
        '差异超过 Host 返回上限，仅显示已返回的部分。',
        'The diff exceeded the Host limit. Only the returned portion is shown.',
      ),
      diffContent: (path) => choose(`差异：${path}`, `Diff: ${path}`),
      previousLines: choose('上一页差异', 'Previous diff lines'),
      nextLines: choose('下一页差异', 'Next diff lines'),
      linePage: (from, to, total) => choose(`${from}–${to} / ${total} 行`, `Lines ${from}–${to} of ${total}`),
      openFile: choose('打开文件', 'Open file'),
    },
    tree: {
      all: choose('所有文件', 'All files'),
      filter: choose('搜索工作区文件路径…', 'Search workspace file paths…'),
      filterScope: choose(
        '输入文件名或路径可搜索未展开的目录；不搜索文件正文。',
        'Find files in unopened folders by name or path; file contents are not searched.',
      ),
      searchScope: choose(
        '按工作区相对路径搜索文件，不搜索正文。',
        'Search workspace-relative file paths, not contents.',
      ),
      searching: choose('正在搜索文件…', 'Searching files…'),
      noMatches: choose('没有匹配的文件。', 'No matching files.'),
      searchLimit: choose('结果已达到上限；请缩小搜索范围。', 'Results reached the limit; narrow your search.'),
      searchError: (code) =>
        fileWorkspaceErrorCopy(zh, code) ?? choose(`搜索失败：${code}`, `Could not search files: ${code}`),
      searchResults: choose('文件搜索结果', 'File search results'),
      clearSearch: choose('清除搜索', 'Clear search'),
      refreshSearch: choose('重新搜索', 'Search again'),
      navigation: choose('当前文件夹路径', 'Current folder path'),
      root: choose('工作区根目录', 'Workspace root'),
      expand: (path) => choose(`展开文件夹：${path}`, `Expand folder: ${path}`),
      collapse: (path) => choose(`收起文件夹：${path}`, `Collapse folder: ${path}`),
      openFolder: (path) => choose(`进入文件夹：${path}`, `Open folder: ${path}`),
      loading: choose('正在读取文件夹…', 'Reading folder…'),
      empty: choose('此文件夹没有已加载的文件。', 'No loaded files in this folder.'),
      loadMore: choose('加载更多文件', 'Load more files'),
      rootLimit: choose(
        '已到达根目录 500 项上限；列表可能不完整。',
        'The 500-item root limit was reached; this list may be incomplete.',
      ),
      folderLimit: choose(
        '此文件夹已到达 500 项上限；列表可能不完整。',
        'The 500-item folder limit was reached; this list may be incomplete.',
      ),
      retry: choose('重试读取', 'Retry folder'),
      refresh: choose('刷新所有文件', 'Refresh all files'),
      error: (code) => {
        const targetError = fileWorkspaceErrorCopy(zh, code)
        if (targetError) return targetError
        return code === 'BUSY'
          ? choose('树视图容量已满；请收起其他文件夹后重试。', 'The tree is full. Collapse another folder and retry.')
          : code === 'CANCELLED'
            ? choose('读取已取消，请重试。', 'Reading was cancelled. Retry.')
            : choose(`文件夹读取失败：${code}`, `Could not read folder: ${code}`)
      },
    },
  }
}
