import type { HbarRunFileChangesLabels } from '@hbar/app-react'
import type { SupportedLocale } from './locale'

export function runFileChangesCopy(locale: SupportedLocale): HbarRunFileChangesLabels {
  const zh = locale === 'zh-CN',
    choose = (cn: string, en: string) => (zh ? cn : en)
  const number = (value: number | null) => (value === null ? choose('未知', 'Unknown') : value.toLocaleString(locale))
  return {
    edited: (count) =>
      choose(`修改了 ${number(count)} 个文件`, `Edited ${number(count)} ${count === 1 ? 'file' : 'files'}`),
    added: (lines) => `+${number(lines)}`,
    removed: (lines) => `−${number(lines)}`,
    delta: (added, removed) =>
      choose(
        `新增 ${number(added)} 行，删除 ${number(removed)} 行`,
        `${number(added)} lines added, ${number(removed)} lines removed`,
      ),
    undo: choose('撤销', 'Undo'),
    undoing: choose('正在撤销…', 'Undoing…'),
    undone: choose('已撤销', 'Undone'),
    undoUnavailable: choose(
      '这些修改的完整版本不可用，无法安全撤销',
      'Complete versions are unavailable for a safe undo',
    ),
    view: choose('查看更改', 'View changes'),
    hideDiff: choose('收起差异', 'Hide changes'),
    more: (count) =>
      choose(`展开另外 ${number(count)} 个文件`, `Show ${number(count)} more ${count === 1 ? 'file' : 'files'}`),
    less: choose('收起文件列表', 'Show fewer files'),
    loading: choose('正在读取修改记录…', 'Loading changes…'),
    incomplete: choose(
      '修改记录已达到容量上限；这里显示已记录的部分，撤销不可用。',
      'The change record reached its capacity. Recorded changes are shown; undo is unavailable.',
    ),
    retry: choose('重试', 'Retry'),
    error: (code, action) => {
      if (code === 'FILE_CONFLICT')
        return choose(
          '文件在此轮之后已被修改，无法撤销。请先查看差异。',
          'A file changed after this turn. Undo stopped; review the changes first.',
        )
      if (code === 'BUSY')
        return choose(
          '此工作区仍有任务运行，请在任务结束后重试。',
          'A task is still running in this workspace. Try again when it finishes.',
        )
      if (code === 'STALE_TARGET' || code === 'COMMAND_CONFLICT')
        return choose(
          '会话的工作目录已更改，无法在当前目录撤销此轮修改。',
          'The session working directory changed. These changes cannot be undone here.',
        )
      if (code === 'DIFF_LIMIT')
        return choose(
          '此文件的差异超过预览计算上限，请在文件编辑器中检查。',
          'This file exceeds the diff preview limit. Inspect it in a file editor.',
        )
      if (code === 'RESTORE_PARTIAL')
        return choose(
          '撤销未能完整恢复，请检查文件后再继续。',
          'Undo could not finish restoring all files. Inspect the files before continuing.',
        )
      if (code === 'CAPABILITY_UNAVAILABLE' || code === 'UNDO_UNAVAILABLE')
        return choose('当前环境无法执行此操作。', 'This operation is unavailable in the current environment.')
      return action === 'undo'
        ? choose(
            '撤销结果尚未确认，请检查连接后重试核对状态。',
            'Undo has not been confirmed. Check the connection and retry to verify its status.',
          )
        : choose('无法读取修改记录，请检查连接后重试。', 'Could not read the changes. Check the connection and retry.')
    },
    openFile: (path) => choose(`查看 ${path} 的差异`, `View changes to ${path}`),
    fileKind: (kind) =>
      ({
        created: choose('新建文件', 'Created file'),
        modified: choose('修改文件', 'Modified file'),
        deleted: choose('删除文件', 'Deleted file'),
      })[kind],
    previousFiles: choose('上一页文件', 'Previous files'),
    nextFiles: choose('下一页文件', 'Next files'),
    filePage: (from, to, total) =>
      choose(
        `${number(from)}–${number(to)} / ${number(total)} 个文件`,
        `${number(from)}–${number(to)} of ${number(total)} files`,
      ),
    diff: (path) => choose(`${path} 的文件差异`, `File difference for ${path}`),
    diffCaption: choose('此轮写入前与写入后的差异', 'Changes from before to after this turn'),
    noTextDiff: choose('没有可显示的文本行差异。', 'There are no text line changes to display.'),
    previousLines: choose('上一页差异', 'Previous diff page'),
    nextLines: choose('下一页差异', 'Next diff page'),
    linePage: (from, to, total) =>
      choose(
        `${number(from)}–${number(to)} / ${number(total)} 行差异`,
        `${number(from)}–${number(to)} of ${number(total)} diff lines`,
      ),
    lineNumber: (value) => (value === null ? '·' : number(value)),
    linePrefix: (kind) => ({ context: '  ', added: '+ ', removed: '− ' })[kind],
  }
}
