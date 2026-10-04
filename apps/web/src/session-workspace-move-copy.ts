import type { HbarSessionLaunchLocationProps } from '@hbar/app-react'
import type { SessionWorkspaceMovePhase } from '@hbar/app-runtime'
import type { ShellLocale } from './shell-copy'

export function sessionWorkspaceMoveCopy(locale: ShellLocale): HbarSessionLaunchLocationProps['moveLabels'] {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  const phases: Readonly<Record<SessionWorkspaceMovePhase, string>> = {
    preflight: choose('正在核对草稿与工作位置…', 'Checking the draft and workspace…'),
    create: choose('正在目标项目中创建新会话…', 'Creating a new conversation in the target project…'),
    'seed-draft': choose('正在迁移草稿与会话选项…', 'Moving the draft and conversation settings…'),
    'select-target': choose('正在打开目标会话…', 'Opening the target conversation…'),
    settings: choose('正在确认目标会话选项…', 'Confirming settings in the target conversation…'),
    'replace-tab': choose('正在替换当前会话页签…', 'Replacing the current conversation tab…'),
    'archive-source': choose('正在归档原会话…', 'Archiving the source conversation…'),
    complete: choose('工作位置已更改。', 'Workspace changed.'),
    cancelled: choose('工作位置迁移已取消。', 'Workspace move cancelled.'),
  }
  return {
    phases,
    unavailable: choose(
      '此主机暂不支持在空会话中更改工作位置。',
      'Changing the workspace from an empty conversation is unavailable on this Host.',
    ),
    unknown: choose(
      '迁移结果尚未确认。请继续核对，不要修改这份草稿。',
      'The move result is unconfirmed. Continue checking it before editing this draft.',
    ),
    paused: choose(
      '迁移因会话导航变化而暂停。选择源会话或目标会话后继续。',
      'The move paused after navigation changed. Select the source or target conversation to continue.',
    ),
    cancelled: choose(
      '迁移已取消，原草稿已保留；已创建的目标会话不会删除，可以继续恢复。',
      'The move was cancelled. The original draft is preserved; any created target conversation remains available to continue recovery.',
    ),
    succeeded: (workspace) => choose('已切换到 ' + workspace + '。', 'Moved to ' + workspace + '.'),
    error: (code) => {
      const known =
        code === 'BUSY'
          ? choose(
              '请先完成或核对当前上传及待处理操作，再重试。',
              'Complete or check the current upload and pending actions before retrying.',
            )
          : code === 'VERSION_CONFLICT'
            ? choose(
                '草稿或会话选项已变化。请重新核对后重试。',
                'The draft or conversation settings changed. Review them and retry.',
              )
            : code === 'MODEL_NOT_READY'
              ? choose(
                  '目标会话的模型设置尚未确认。继续核对或重试。',
                  'The target model setting is not confirmed. Continue checking or retry.',
                )
              : code === 'CAPABILITY_UNAVAILABLE'
                ? choose('此主机暂不支持完成这项迁移。', 'This Host cannot complete this move.')
                : null
      return known ?? choose('工作位置迁移未完成：' + code, 'Workspace move did not complete: ' + code)
    },
    allowConfirmation: choose(
      '此草稿使用“允许”权限模式，需要你明确确认后才会迁移。',
      'This draft uses Allow permission mode. Confirm explicitly before moving it.',
    ),
    confirmAllow: choose('确认允许并继续', 'Confirm Allow and continue'),
    unresolvedMentions: (count) =>
      choose(
        count + ' 个文件提及无法在目标项目中解析。确认后将保留可见文本，不迁移为文件提及。',
        count +
          ' file mention' +
          (count === 1 ? '' : 's') +
          ' cannot be resolved in the target project. Confirm to keep the visible text as plain text.',
      ),
    confirmUnresolvedMentions: choose('保留文本并继续', 'Keep text and continue'),
    continue: choose('继续迁移', 'Continue move'),
    retry: choose('重试迁移', 'Retry move'),
    cancel: choose('取消迁移', 'Cancel move'),
    retryDirectories: choose('重试读取项目', 'Retry loading projects'),
  }
}
