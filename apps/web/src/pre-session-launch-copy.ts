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
      chooseBranch: choose('选择分支', 'Choose branch'),
      searchDirectories: choose('搜索项目', 'Search projects'),
      searchBranches: choose('搜索分支', 'Search branches'),
      currentBranch: choose('当前分支', 'Current branch'),
      baseBranch: choose('本地基准分支', 'Local base branch'),
      detached: choose('分离的 HEAD', 'Detached HEAD'),
      noBranches: choose('没有匹配的本地分支。', 'No matching local branches.'),
      noDirectories: choose('没有匹配的项目。可在下方添加目录。', 'No matching projects. Add a directory below.'),
      shared: choose('当前工作树', 'Current worktree'),
      sharedHint: choose(
        '直接在当前工作树中工作；所选分支会在首次发送时生效。',
        'Work in the current worktree; a selected branch takes effect on first send.',
      ),
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
        '所选分支会在首次发送时应用到当前工作树；此处不会立即切换。',
        'The selected branch applies to the current worktree on first send; it is not switched here.',
      ),
      sharedBranch: choose('共享分支', 'Shared branch'),
      sharedBranchUnavailable: (reason) =>
        reason === 'checked-out-elsewhere'
          ? choose('该分支正由其他工作树使用。', 'This branch is in use by another worktree.')
          : choose('暂时无法确认该分支的工作树状态。', 'Worktree availability for this branch is unknown.'),
      newBranch: choose('新建分支', 'New branch'),
      branchName: choose('分支名称', 'Branch name'),
      branchNamePlaceholder: choose('feature/我的更改', 'feature/my-change'),
      startsFrom: (branch) => choose(`从 ${branch} 开始`, `Starts from ${branch}`),
      create: choose('创建', 'Create'),
      creating: choose('正在创建分支…', 'Creating branch…'),
      cancel: choose('取消', 'Cancel'),
      backToBranches: choose('返回分支列表', 'Back to branches'),
      captureBase: choose('正在确认所选基准分支…', 'Confirming selected base branch…'),
      verifyBranch: choose('核对分支', 'Check branch'),
      useCreatedBranch: choose('使用此分支', 'Use this branch'),
      branchCreateUnavailable: choose('此主机暂不支持创建分支。', 'Branch creation is unavailable on this Host.'),
      branchCreateBaseUnavailable: choose('先选择一个有提交的本地分支。', 'Select a committed local branch first.'),
      branchCreateError: (code) => {
        const message =
          code === 'GIT_BRANCH_EXISTS'
            ? choose('同名分支已存在，请换一个名称。', 'That branch name already exists; choose another name.')
            : code === 'GIT_INVALID_BRANCH'
              ? choose('分支名称无效，请检查后重试。', 'The branch name is invalid; check it and try again.')
              : code === 'GIT_BRANCH_BASE_CHANGED'
                ? choose(
                    '基准分支已变化，请返回列表重新选择。',
                    'The base branch changed; return to the list and choose it again.',
                  )
                : code === 'GIT_BRANCH_BASE_NOT_FOUND'
                  ? choose(
                      '找不到基准分支，请返回列表重新选择。',
                      'The base branch is unavailable; return to the list and choose it again.',
                    )
                  : choose('创建分支失败。', 'Could not create the branch.')
        return `${message} (${code})`
      },
      branchCreateUnknown: choose(
        '创建结果尚未确认。只读核对后，再明确选择是否使用该分支。',
        'The result is not confirmed. Check the ref, then explicitly choose whether to use it.',
      ),
      branchCreateNotFound: choose(
        '尚未找到完全匹配的分支；不会自动重试创建。可以再次核对。',
        'No exact branch match was found. Creation will not be retried automatically; check again if needed.',
      ),
      branchCreateDifferentOid: choose(
        '同名分支的提交与本次基准不符，不能自动采用。',
        'The branch name exists at a different commit, so it cannot be adopted automatically.',
      ),
      branchCreateIncomplete: choose(
        '分支列表不完整，尚不能确认创建结果。可以再次核对。',
        'The branch list is incomplete, so the result cannot be confirmed yet. Check again.',
      ),
      branchCreateVerified: choose(
        '已核对完全匹配的本地分支。点击“使用此分支”确认选择。',
        'An exact local ref and commit match. Choose “Use this branch” to confirm it.',
      ),
      branchCreateCreatedNotSelected: choose(
        '分支已创建，但当前工作位置已更改。请从分支列表中检查并选择。',
        'The branch was created, but the selected location changed. Review and select it from the branch list.',
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
