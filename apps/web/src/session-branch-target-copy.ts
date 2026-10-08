import type { HbarSessionBranchTargetLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function sessionBranchTargetCopy(locale: ShellLocale): HbarSessionBranchTargetLabels {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  return {
    title: choose('选择目标分支', 'Choose target branch'),
    choose: choose('选择分支', 'Choose branch'),
    search: choose('搜索本地分支', 'Search local branches'),
    branches: choose('本地分支', 'Local branches'),
    current: choose('当前目标', 'Current target'),
    worktree: choose('本地 worktree', 'Local worktree'),
    checkout: choose('在当前目录切换分支', 'Switch branch in the current directory'),
    executionPath: choose('任务执行目录', 'Task directory'),
    newBranch: choose('新建分支', 'New branch'),
    newWorktree: choose('新建 worktree', 'New worktree'),
    branchName: choose('分支名称', 'Branch name'),
    branchNamePlaceholder: choose('例如 codex/my-change', 'For example, codex/my-change'),
    baseBranch: choose('基础分支', 'Base branch'),
    chooseBase: choose('选择基础分支', 'Choose base branch'),
    create: choose('创建并使用', 'Create and use'),
    creating: choose('正在创建…', 'Creating…'),
    switching: choose('正在切换任务目标…', 'Switching task target…'),
    loading: choose('正在读取分支…', 'Reading branches…'),
    empty: choose('没有匹配的本地分支', 'No matching local branches'),
    more: choose('加载更多分支', 'Load more branches'),
    narrowSearch: choose('请搜索分支名以缩小范围', 'Search by branch name to narrow the list'),
    retry: choose('刷新分支', 'Refresh branches'),
    unknown: choose(
      '切换结果尚未确认，请核对原操作后再继续。',
      'The switch is unconfirmed. Verify the original operation before continuing.',
    ),
    verify: choose('核对切换结果', 'Verify switch result'),
    busy: choose(
      '当前会话还有任务，结束后可切换目标分支。',
      'Finish the current session tasks before switching target branches.',
    ),
    aiHint: choose(
      '也可以在会话中指示 AI 创建并切换分支，任务结束后会自动识别。',
      'You can also ask AI to create and switch branches in this chat. The result is recognized when the task ends.',
    ),
    back: choose('返回', 'Back'),
    close: choose('关闭分支选择', 'Close branch picker'),
    error: (code) => {
      const messages: Readonly<Record<string, readonly [string, string]>> = {
        GIT_SWITCH_BLOCKED: [
          '本地修改与目标分支冲突，修改已保留。处理冲突后再试。',
          'Local changes conflict with the target branch and have been preserved. Resolve the conflict and try again.',
        ],
        INVALID_BRANCH_NAME: ['请输入有效的 Git 分支名称。', 'Enter a valid Git branch name.'],
        BRANCH_EXISTS: ['分支已经存在，请从列表中选择它。', 'This branch exists. Select it from the list.'],
        COMMAND_CONFLICT: [
          '分支或任务目标已变化，请刷新后再试。',
          'The branch or task target changed. Refresh before trying again.',
        ],
        STALE_CURSOR: ['分支列表已变化，请刷新。', 'The branch list changed. Refresh it.'],
        BUSY: [
          '该目录仍有任务，请等待任务结束后再切换。',
          'This directory still has tasks. Wait for them to finish before switching.',
        ],
        SESSION_LAUNCH_TARGET_INVALID_ROOT: [
          'worktree 存储目录必须位于源仓库之外，请在存储设置中调整。',
          'Worktree storage must be outside the source repository. Adjust the storage settings.',
        ],
        OPERATION_OTHER_ACTOR: [
          '另一个设备的切换尚未确认，请在发起设备上核对结果。',
          'A switch from another device is unconfirmed. Verify it on that device.',
        ],
        OPERATION_NOT_FOUND: [
          '原操作未被受理，可以重新选择目标。',
          'The original operation was not accepted. You can select the target again.',
        ],
      }
      const message = messages[code]
      return message
        ? choose(message[0], message[1])
        : choose(`无法切换目标：${code}`, `Target switch unavailable: ${code}`)
    },
  }
}
