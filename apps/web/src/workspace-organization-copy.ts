import type { WorkspaceOrganizationLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function workspaceOrganizationCopy(locale: ShellLocale): WorkspaceOrganizationLabels {
  const zh = locale === 'zh-CN'
  const target = (name: string | null) => (name ? `“${name}”` : zh ? '项目' : 'Project')
  return {
    menu: zh ? '项目菜单' : 'Projects menu',
    hide: zh ? '从侧栏隐藏' : 'Hide from sidebar',
    restore: (count) => (zh ? `恢复隐藏项目（${count}）` : `Restore hidden projects (${count})`),
    refresh: zh ? '刷新侧栏显示' : 'Refresh sidebar visibility',
    reconcile: zh ? '核对隐藏或恢复结果' : 'Check visibility result',
    allHidden: zh
      ? '侧栏没有可见项目。可在项目菜单中恢复隐藏项目。'
      : 'No visible projects. Restore hidden projects from the projects menu.',
    loading: zh ? '正在读取侧栏显示…' : 'Reading sidebar visibility…',
    offline: zh ? '连接中断，保留上次确认的侧栏显示。' : 'Disconnected; keeping the last confirmed sidebar visibility.',
    initialOffline: zh
      ? '尚未连接，暂时无法读取侧栏显示设置。'
      : 'Not connected; sidebar visibility settings have not been read yet.',
    initialReadFailure: zh
      ? '无法读取侧栏显示设置。暂时显示已加载项目；请刷新后再修改隐藏状态。'
      : 'Sidebar visibility could not be read. Loaded projects are shown for now; refresh before changing hidden status.',
    hiding: (name) => (zh ? `正在隐藏${target(name)}…` : `Hiding ${target(name)}…`),
    revealing: (name) => (zh ? `正在恢复${target(name)}…` : `Restoring ${target(name)}…`),
    hidden: (name) =>
      zh
        ? `${target(name)}已从侧栏隐藏，会话和文件不变。`
        : `${target(name)} hidden from the sidebar. Sessions and files are unchanged.`,
    revealed: (name) => (zh ? `${target(name)}已恢复到侧栏。` : `${target(name)} restored to the sidebar.`),
    restoring: zh ? '正在恢复隐藏项目…' : 'Restoring hidden projects…',
    saved: zh ? '侧栏显示设置已保存。' : 'Sidebar visibility settings saved.',
    restored: zh
      ? '已清除全部隐藏标记，当前会话不变。'
      : 'All hidden markers cleared. Your current session is unchanged.',
    unknown: zh
      ? '结果尚未确认。请核对原操作，不要重复隐藏或恢复。'
      : 'The result is not confirmed. Check the original operation before another visibility change.',
    checking: zh ? '正在核对原操作…' : 'Checking the original operation…',
    waiting: zh
      ? '原请求仍在等待结果，结束后即可核对。请勿重复操作。'
      : 'The original request is still awaiting a result. Checking becomes available when it settles; do not repeat the operation.',
    failure: (code) =>
      ['COMMAND_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(code)
        ? zh
          ? '侧栏显示已发生变化，本次操作未提交。确认最新显示后重试。'
          : 'Sidebar visibility changed; this operation was not committed. Review the latest state and try again.'
        : code === 'INPUT_TOO_LARGE'
          ? zh
            ? '隐藏项目已达到容量上限。请先恢复隐藏项目。'
            : 'Hidden projects reached the storage limit. Restore hidden projects first.'
          : code === 'NOT_FOUND'
            ? zh
              ? '原项目已不存在，本次操作未提交。'
              : 'The original project no longer exists. This operation was not committed.'
            : zh
              ? '侧栏显示未更新。请刷新显示后重试。'
              : 'Sidebar visibility was not updated. Refresh visibility and try again.',
    readFailure: (code) =>
      ['INVALID_STATE', 'VERSION_MISMATCH', 'INVALID_OUTPUT'].includes(code)
        ? zh
          ? '无法验证服务端侧栏设置，已保留原显示。请检查服务端后重试。'
          : 'Host sidebar settings could not be verified. Previous visibility is kept; check the Host and retry.'
        : zh
          ? '无法读取最新侧栏显示，已保留上次确认的结果。'
          : 'Could not read the latest sidebar visibility. The last confirmed result is kept.',
  }
}
