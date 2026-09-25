import type { HbarFileWorkspaceLabels } from '@hbar/app-react'

export function fileWorkspaceCopy(
  zh: boolean,
): Pick<HbarFileWorkspaceLabels, 'changes' | 'preview' | 'edit' | 'textPreview'> {
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
  return {
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
      renamedFrom: (path) => choose(`原路径：${path}`, `Renamed from: ${path}`),
      error: (code) =>
        code === 'CAPABILITY_UNAVAILABLE'
          ? choose('Git 能力不可用；仍可查看所有文件。', 'Git is unavailable; you can still browse all files.')
          : code === 'CANCELLED'
            ? choose('读取已取消，请刷新重试。', 'Reading was cancelled. Refresh to try again.')
            : choose(`读取更改失败：${code}`, `Could not read changes: ${code}`),
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
  }
}
