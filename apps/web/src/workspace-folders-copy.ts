import type { WorkspaceFoldersLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function workspaceFoldersCopy(locale: ShellLocale): WorkspaceFoldersLabels {
  const zh = locale === 'zh-CN'
  const errors: Readonly<Record<string, string>> = zh
    ? {
        COMMAND_CONFLICT: '目录配置已被其他窗口修改。重新加载后再编辑；重新加载会丢弃当前未保存的修改。',
        WORKSPACE_EXISTS: '第一项目录已属于现有工作区。请在项目菜单中选择“管理工作区目录”。',
        DUPLICATE_FOLDER: '多个路径指向了同一个实际目录，请移除重复项。',
        DIRECTORY_UNAVAILABLE: '无法打开目录，请检查服务端路径和访问权限。',
        INVALID_WORKSPACE: '目录不存在或不是绝对路径，请检查后重试。',
        PATH_DENIED: '此目录属于宿主的受保护数据，不能加入工作区。',
        BUSY: '工作区仍有排队或运行中的任务，请结束任务后再修改根目录。',
        NAVIGATION_FAILED: '工作区已保存，但未能切换当前页面。请关闭此窗口后从项目列表打开它。',
      }
    : {
        COMMAND_CONFLICT:
          'Another window changed these folders. Reload before editing; reloading discards unsaved changes.',
        WORKSPACE_EXISTS:
          'The first folder already belongs to a workspace. Use Manage workspace folders in its project menu.',
        DUPLICATE_FOLDER: 'Multiple paths resolve to the same physical folder. Remove the duplicate.',
        DIRECTORY_UNAVAILABLE: 'Cannot open this folder. Check the server path and access permissions.',
        INVALID_WORKSPACE: 'The folder is missing or its path is not absolute. Check it and retry.',
        PATH_DENIED: 'This folder contains protected Host data and cannot be added.',
        BUSY: 'This workspace has queued or active tasks. Finish them before changing its root folders.',
        NAVIGATION_FAILED:
          'Workspace saved, but navigation failed. Close this window and open it from the project list.',
      }
  return {
    create: zh ? '添加多目录工作区' : 'Add multi-folder workspace',
    manage: zh ? '管理工作区目录' : 'Manage workspace folders',
    browse: zh ? '浏览服务端目录' : 'Browse server folders',
    description: zh
      ? '多个根目录归属于同一个工作区。按优先级排列，第一项作为默认工作目录。'
      : 'Keep multiple root folders in one workspace. The first folder is the default working directory.',
    browserHint: zh
      ? '浏览宿主所在电脑的文件夹，可跨目录多选。选择不会修改磁盘内容。'
      : 'Browse folders on the Host computer and select across locations. Selection does not modify disk contents.',
    alias: zh ? '虚拟目录名' : 'Virtual folder name',
    aliasHint: zh
      ? '通过短名称访问，例如 frontend/、backend/。名称须唯一，可使用文字、数字、点、短横线和下划线。'
      : 'Access roots with short names such as frontend/ or backend/. Use unique letters, digits, dots, hyphens or underscores.',
    folderCaption: (name) => `${name}/`,
    path: zh ? '服务端目录' : 'Server folder',
    pathHint: zh
      ? '输入绝对路径，或点击右侧按钮浏览。'
      : 'Enter an absolute path or browse with the button on the right.',
    addPath: zh ? '加入目录清单' : 'Add path to folder list',
    folders: zh ? '工作区根目录' : 'Workspace root folders',
    empty: zh
      ? '尚未选择目录。可手动添加，或浏览后多选。'
      : 'No folders selected. Add a path or browse to select folders.',
    primary: zh ? '默认目录' : 'Default folder',
    remove: zh ? '移除目录引用' : 'Remove folder reference',
    removeHint: zh
      ? '移除仅取消工作区引用，不会删除文件夹或文件。此虚拟映射不替代系统级沙盒。'
      : 'Removal only unregisters the reference; it does not delete folders or files. Virtual mapping does not replace OS sandboxing.',
    moveUp: zh ? '提高目录优先级' : 'Increase folder priority',
    moveDown: zh ? '降低目录优先级' : 'Decrease folder priority',
    openFolder: (name) => (zh ? `打开 ${name} 的子目录` : `Browse inside ${name}`),
    selectFolder: (name) => (zh ? `选择或取消选择 ${name}` : `Select or deselect ${name}`),
    quickLocations: zh ? '快速位置' : 'Quick locations',
    up: zh ? '上一级' : 'Parent folder',
    selectCurrent: zh ? '选择当前文件夹' : 'Select current folder',
    emptyDirectory: zh ? '此目录中没有可浏览的子文件夹。' : 'No browsable subfolders here.',
    loadMore: zh ? '加载更多目录' : 'Load more folders',
    scanTruncated: zh
      ? '此目录条目过多，已达到扫描上限。请输入更具体的路径。'
      : 'This directory reached the scan limit. Enter a more specific path.',
    selected: (count) => (zh ? `已选择 ${count} 个目录` : `${count} folders selected`),
    count: (count, limit) => (zh ? `${count} / ${limit} 个目录` : `${count} / ${limit} folders`),
    addSelected: zh ? '加入所选目录' : 'Add selected folders',
    back: zh ? '返回目录管理' : 'Back to folders',
    cancel: zh ? '取消' : 'Cancel',
    done: zh ? '完成' : 'Done',
    save: zh ? '保存工作区' : 'Save workspace',
    refresh: zh ? '丢弃修改并重新加载' : 'Discard changes and reload',
    refreshHint: zh
      ? '重新读取服务端配置，替换当前未保存的修改。'
      : 'Read server configuration and replace unsaved edits.',
    reconcile: zh ? '核对保存结果' : 'Check save result',
    retry: zh ? '重试原保存请求' : 'Retry original save',
    offline: zh ? '宿主已断开，连接恢复后再继续。' : 'Host disconnected. Continue after reconnecting.',
    unexpectedFailure: zh
      ? '操作未完成，请检查当前目录状态后重试。'
      : 'Action did not complete. Check the current folder state before retrying.',
    error: (code) => errors[code] ?? (zh ? `目录操作未完成（${code}）。` : `Folder action did not complete (${code}).`),
    status: zh
      ? {
          loading: '正在读取服务端目录…',
          saving: '正在保存目录配置…',
          checking: '正在核对原保存请求…',
          unknown: '保存结果尚未确认。请先核对结果；重试只会重发同一请求，不会创建重复工作区。',
          saved: '工作区目录已保存。',
        }
      : {
          loading: 'Reading server folders…',
          saving: 'Saving folder configuration…',
          checking: 'Checking the original save…',
          unknown:
            'Save result is unconfirmed. Check it first; retry resends the same request and does not create another workspace.',
          saved: 'Workspace folders saved.',
        },
    validation: zh
      ? {
          required: '至少需要一个根目录。',
          invalid: '请检查目录名和路径：目录名须有效且不重复，路径不能为空。',
          capacity: '一个工作区最多支持 32 个根目录。',
        }
      : {
          required: 'At least one root folder is required.',
          invalid: 'Check names and paths: names must be valid and unique, and paths cannot be empty.',
          capacity: 'A workspace supports at most 32 root folders.',
        },
  }
}
