import type { WorkspaceLocationPickerLabels } from '@hbar/app-react/workspace-location-picker'
import type { ShellLocale } from './shell-copy'

export function workspaceLocationPickerCopy(locale: ShellLocale): WorkspaceLocationPickerLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    title: choose('新建工作区', 'Create workspace'),
    description: choose(
      '选择工作区所在的位置。远程目录由所选节点共享。',
      'Choose where the workspace lives. Remote directories are shared by the selected node.',
    ),
    local: choose('本机', 'Local'),
    localDescription: choose('使用当前 Host 可访问的本机目录。', 'Use a directory available to the current Host.'),
    remote: choose('远程节点', 'Remote node'),
    remoteDescription: choose(
      '选择在线节点和该节点当前共享的根目录。',
      'Choose an online node and one of its currently shared roots.',
    ),
    name: choose('工作区名称', 'Workspace name'),
    namePlaceholder: choose('可留空以使用默认名称', 'Leave blank to use the default name'),
    localPath: choose('本机目录路径', 'Local directory path'),
    localPathHint: choose('可输入路径，或使用 Host 的文件夹选择器。', 'Enter a path or use the Host folder picker.'),
    browseLocal: choose('浏览本机目录', 'Browse local folders'),
    nodes: choose('执行节点', 'Execution nodes'),
    loading: choose('正在读取节点…', 'Loading nodes…'),
    emptyNodes: choose(
      '没有已配对的节点。请先在节点设置中配对一个工作区节点。',
      'No paired nodes are available. Pair a workspace node in Node settings first.',
    ),
    offline: choose('离线', 'Offline'),
    online: choose('在线', 'Online'),
    revoked: choose('已撤销', 'Revoked'),
    unavailable: choose(
      'Host 未连接，无法读取可用节点。',
      'The Host is disconnected, so available nodes cannot be loaded.',
    ),
    capabilitiesUnavailable: choose(
      '节点能力尚未验证，刷新节点状态后再选择。',
      'Node capabilities have not been verified. Refresh node status before selecting a root.',
    ),
    chooseRoot: choose('选择共享根目录', 'Choose a shared root'),
    noRoots: choose('此在线节点尚未共享任何根目录。', 'This online node has no shared roots.'),
    readOnlyRoot: choose('只读', 'Read only'),
    writeRoot: choose('可写', 'Writable'),
    more: choose('加载更多节点', 'Load more nodes'),
    retry: choose('刷新节点', 'Refresh nodes'),
    cancelLoading: choose('取消读取', 'Cancel loading'),
    cancel: choose('取消', 'Cancel'),
    create: choose('创建工作区', 'Create workspace'),
    creating: choose('正在创建…', 'Creating…'),
    error: (code) =>
      choose(
        `创建失败或结果待核对（${code}）。检查工作区列表后再试。`,
        `Creation failed or its result needs reconciliation (${code}). Check the workspace list before trying again.`,
      ),
    remoteWorkspace: (nodeName) => choose(`节点：${nodeName}`, `Node: ${nodeName}`),
  }
}
