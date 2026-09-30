import type { HbarPreSessionLaunchStatusLabels, HbarPreSessionLocationLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function preSessionLaunchCopy(locale: ShellLocale): {
  readonly location: HbarPreSessionLocationLabels
  readonly status: HbarPreSessionLaunchStatusLabels
} {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  return {
    location: {
      title: choose('工作位置', 'Location'),
      directory: choose('目录', 'Directory'),
      branch: choose('分支', 'Branch'),
      chooseDirectory: choose('选择项目', 'Choose project'),
      chooseBranch: choose('选择基准分支', 'Choose base branch'),
      searchDirectories: choose('搜索项目', 'Search projects'),
      searchBranches: choose('搜索分支', 'Search branches'),
      currentBranch: choose('当前分支', 'Current branch'),
      baseBranch: choose('本地基准分支', 'Local base branch'),
      detached: choose('分离的 HEAD', 'Detached HEAD'),
      noBranches: choose('没有匹配的本地分支。', 'No matching local branches.'),
      noDirectories: choose('没有匹配的项目。可在下方添加目录。', 'No matching projects. Add a directory below.'),
      shared: choose('当前工作树', 'Current worktree'),
      sharedHint: choose('直接在项目目录中工作。', 'Work directly in the project directory.'),
      isolated: choose('隔离工作树', 'Isolated worktree'),
      isolatedHint: choose(
        '首次发送时从所选分支创建独立工作树，不改动原项目。',
        'Create a separate worktree from the selected branch on first send, leaving the original project unchanged.',
      ),
      isolatedUnavailable: choose(
        '选择有提交的 Git 仓库根目录后可用。',
        'Available for a Git repository root with commits.',
      ),
      sharedBranchHint: choose(
        '当前工作树使用项目的现有分支。选择隔离工作树后可更换基准分支。',
        'Current worktree uses the project’s existing branch. Choose Isolated worktree to change the base branch.',
      ),
      loading: choose('正在读取分支…', 'Loading branches…'),
      retry: choose('重试', 'Retry'),
      more: choose('加载更多', 'Load more'),
      back: choose('返回工作位置', 'Back to Location'),
      close: choose('关闭', 'Close'),
      error: (code) => choose(`无法读取工作位置：${code}`, `Could not load Location: ${code}`),
      trigger: (directory, branch, isolated) =>
        choose(
          `工作位置：${directory ?? '选择项目'}${branch ? ` · ${branch}` : ''}${isolated ? ' · 隔离工作树' : ''}`,
          `Location: ${directory ?? 'Choose project'}${branch ? ` · ${branch}` : ''}${isolated ? ' · Isolated worktree' : ''}`,
        ),
    },
    status: {
      preparing: choose('正在准备首次发送…', 'Preparing first send…'),
      paused: choose(
        '首次发送已暂停。确认当前会话后继续。',
        'First send is paused. Confirm this session before continuing.',
      ),
      unknown: choose(
        '首次发送结果尚未确认，请核对后继续。',
        'First-send result is not confirmed. Check before continuing.',
      ),
      cancelled: choose('已取消首次发送，消息草稿已保留。', 'First send cancelled. Your message draft is preserved.'),
      cancelRequested: choose('正在取消首次发送…', 'Cancelling first send…'),
      continue: choose('继续发送', 'Continue first send'),
      cancel: choose('取消发送', 'Cancel first send'),
      check: choose('核对结果', 'Check result'),
      dismiss: choose('关闭提示', 'Dismiss'),
      error: (code) => choose(`首次发送未完成：${code}`, `First send did not complete: ${code}`),
    },
  }
}
