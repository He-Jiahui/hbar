import type { WorkspaceDisplayNamesLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function workspaceDisplayNamesCopy(locale: ShellLocale): WorkspaceDisplayNamesLabels {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '编辑项目' : 'Edit project',
    close: zh ? '关闭项目编辑' : 'Close project editor',
    name: zh ? '项目名称' : 'Project name',
    nameHint: zh
      ? '规范化空白后最多 80 个字符。仅更改此服务端的显示名称。'
      : 'Up to 80 characters after normalizing whitespace. Only the display name on this Host changes.',
    path: zh ? '真实路径' : 'Real path',
    pathHint: zh
      ? '项目真实路径固定，无法在这里修改。会话和文件不受影响。'
      : 'The real project path cannot be changed here. Sessions and files stay unchanged.',
    restore: zh ? '恢复文件夹名称' : 'Restore folder name',
    restoreHint: zh
      ? '立即保存恢复结果。之后取消不会撤销这次恢复。'
      : 'Restore is saved immediately. Cancel afterward does not undo it.',
    cancel: zh ? '取消' : 'Cancel',
    dismiss: zh ? '关闭' : 'Close',
    save: zh ? '保存' : 'Save',
    reopen: zh ? '查看项目名称操作' : 'Review project name change',
    refresh: zh ? '重新读取显示名称' : 'Reload display names',
    rebase: zh ? '读取最新值并保留输入' : 'Load latest values and keep draft',
    reconcile: zh ? '核对原保存结果' : 'Check original save result',
    loading: zh ? '正在读取项目显示名称…' : 'Loading project display names…',
    unavailable: zh
      ? '此连接不提供项目显示名称编辑。'
      : 'Project display name editing is not available on this connection.',
    offline: zh
      ? '连接已中断。输入会保留，重连后才能保存或核对。'
      : 'Disconnected. Your input is retained; reconnect to save or check the result.',
    saving: zh
      ? '正在保存项目显示名称…关闭不会取消原请求。'
      : 'Saving the project display name… Closing does not cancel the original request.',
    restoring: zh
      ? '正在恢复文件夹名称…关闭不会取消原请求。'
      : 'Restoring the folder name… Closing does not cancel the original request.',
    saved: zh ? '项目显示名称已保存。' : 'Project display name saved.',
    restored: zh ? '已恢复文件夹名称。' : 'Folder name restored.',
    acknowledged: zh
      ? '原更改已确认；当前显示以最新服务端状态为准。'
      : 'The original change is confirmed. The latest Host state determines the current name.',
    unknown: zh
      ? '原保存结果尚未确认。请核对原操作，不会重新保存；关闭后仍可继续核对。'
      : 'The original save is unconfirmed. Check that operation without saving again; you can close and return to it.',
    waiting: zh
      ? '原请求仍在等待结果。输入和请求会保留，请勿重复保存。'
      : 'The original request is still waiting for a result. Your input and request are retained; do not save again.',
    checking: zh ? '正在核对原保存结果…' : 'Checking the original save result…',
    conflict: zh
      ? '项目名称已被其他操作修改。请读取最新值，再决定是否保存当前输入；不会自动覆盖。'
      : 'Another operation changed the project name. Load the latest values, then decide whether to save your draft. Nothing is overwritten automatically.',
    actionFailure: (code) => {
      if (code === 'COMMAND_CONFLICT' || code === 'VERSION_CONFLICT')
        return zh
          ? '保存未生效：项目状态已改变，请先读取最新值。'
          : 'The save did not apply: the project state changed. Load the latest values first.'
      if (code === 'INPUT_TOO_LARGE')
        return zh
          ? '显示名称容量已满，未保存本次更改。请先释放已有别名的容量。'
          : 'Display name capacity is full. This change was not saved; remove an existing alias to free space.'
      if (code === 'NOT_FOUND')
        return zh
          ? '原项目已不存在，无法保存显示名称。'
          : 'The original project no longer exists, so its display name cannot be saved.'
      if (code === 'INVALID_INPUT')
        return zh
          ? '名称不符合要求，请检查输入后重试。'
          : 'The name does not meet the requirements. Check your input and try again.'
      if (code === 'BUSY')
        return zh
          ? '另一名称操作尚未结束，请先完成或核对原操作。'
          : 'Another name operation is still pending. Complete or check that operation first.'
      return zh
        ? '未能保存项目名称。原输入已保留，请检查当前状态后重试。'
        : 'The project name could not be saved. Your input is retained; check the current state and try again.'
    },
    readFailure: () =>
      zh
        ? '未能读取最新项目名称。已确认的保存不会因此撤销，请重新读取。'
        : 'The latest project names could not be read. This does not undo a confirmed save; reload them.',
    unexpectedFailure: zh
      ? '未能完成此操作。请查看当前状态后重试或核对原结果。'
      : 'The action could not finish. Review the current state, then retry or check the original result.',
    validation: {
      required: zh ? '请输入项目名称。' : 'Enter a project name.',
      tooLong: zh
        ? '规范化空白后的名称不能超过 80 个字符。'
        : 'The name must not exceed 80 characters after normalizing whitespace.',
      invalid: zh
        ? '名称必须是可见的单行文字，不能包含控制符或无效字符。'
        : 'Use visible, single-line text without control or invalid characters.',
    },
  }
}
