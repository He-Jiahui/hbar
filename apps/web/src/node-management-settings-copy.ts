import type { SupportedLocale } from './locale'
import type { NodeManagementSettingsLabels } from '@hbar/app-react/node-management-settings'
import type { NodeCapabilities } from '@hbar/contracts/node'

export function nodeManagementSettingsCopy(locale: SupportedLocale): NodeManagementSettingsLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    title: choose('Nodes', 'Nodes'),
    description: choose(
      '管理已配对的执行节点及其可用工作区。配对码只显示一次，并在短时间后失效。',
      'Manage paired execution nodes and their available workspaces. Pairing codes are shown once and expire shortly.',
    ),
    inviteName: choose('节点名称', 'Node name'),
    inviteNamePlaceholder: choose('例如：Linux 构建机', 'For example, Linux build host'),
    invite: choose('生成配对码', 'Create pairing code'),
    inviteBusy: choose('正在生成…', 'Creating…'),
    refresh: choose('刷新节点', 'Refresh nodes'),
    cancel: choose('取消', 'Cancel'),
    loadMore: choose('加载更多节点', 'Load more nodes'),
    loading: choose('正在加载节点…', 'Loading nodes…'),
    empty: choose(
      '还没有配对节点。生成配对码后，在目标机器上使用该码和指纹加入。',
      'No nodes are paired yet. Create a pairing code, then use the code and fingerprint on the target machine.',
    ),
    listError: (code) =>
      choose(
        `无法加载节点（${code}）。重试以重新读取宿主状态。`,
        `Could not load nodes (${code}). Retry to read the Host state again.`,
      ),
    inviteError: (code) =>
      choose(`无法生成配对码（${code}）。请重试。`, `Could not create a pairing code (${code}). Retry the request.`),
    revokeError: (code) =>
      choose(
        `撤销失败（${code}）。节点仍按宿主当前记录显示。`,
        `Revocation failed (${code}). The node remains shown as recorded by the Host.`,
      ),
    retry: choose('重试', 'Retry'),
    offline: choose('离线', 'Offline'),
    online: choose('在线', 'Online'),
    lastSeen: (date) => choose(`最近连接：${date}`, `Last connected: ${date}`),
    formatDate: (timestamp) =>
      new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp),
    revoked: choose('已撤销', 'Revoked'),
    revoke: choose('撤销节点', 'Revoke node'),
    revokeConfirm: (name) =>
      choose(`永久撤销“${name}”的配对并断开其信任。`, `Permanently revoke “${name}” and remove its trust.`),
    unavailable: choose('能力摘要暂不可用', 'Capability summary unavailable'),
    capabilitySummary: (capability: NodeCapabilities) => {
      const floor = capability.floor
      const level = (enabled: boolean) => choose(enabled ? '启用' : '关闭', enabled ? 'enabled' : 'disabled')
      const summary = [
        choose(`进程 ${level(floor.process)}`, `Processes ${level(floor.process)}`),
        choose(`终端 ${level(floor.terminal)}`, `Terminal ${level(floor.terminal)}`),
        choose(`网络 ${level(floor.network)}`, `Network ${level(floor.network)}`),
        choose(`文件系统 ${capability.sandbox.filesystem}`, `Filesystem ${capability.sandbox.filesystem}`),
        choose(`后端 ${capability.sandbox.backends.join(', ')}`, `Backends ${capability.sandbox.backends.join(', ')}`),
      ].join(' · ')
      return choose(
        `平台：${capability.platform} · 安全底线：${summary}`,
        `Platform: ${capability.platform} · Security floor: ${summary}`,
      )
    },
    rootsSummary: (roots: NodeCapabilities['roots']) =>
      roots.length === 0
        ? choose('工作区：未公开工作区', 'Workspaces: No workspaces advertised')
        : choose(
            `工作区：${roots.map((root) => `${root.name} (${root.nodePath}, ${root.access})`).join(' · ')}`,
            `Workspaces: ${roots.map((root) => `${root.name} (${root.nodePath}, ${root.access})`).join(' · ')}`,
          ),
    inviteCreated: choose('配对邀请已创建', 'Pairing invitation created'),
    inviteExpires: (date) =>
      choose(`有效期至 ${date}；过期后请生成新邀请。`, `Expires at ${date}. Create a new invitation after it expires.`),
    inviteFingerprint: choose('宿主指纹', 'Host fingerprint'),
    copyCode: choose('复制配对码', 'Copy pairing code'),
    copyFingerprint: choose('复制指纹', 'Copy fingerprint'),
    copied: choose('已复制', 'Copied'),
    copyFailed: choose('剪贴板不可用，请手动复制上方内容。', 'Clipboard access failed. Copy the value above manually.'),
    nodeCount: (count) => choose(`当前已加载 ${count} 个节点`, `${count} ${count === 1 ? 'node' : 'nodes'} loaded`),
    readOnly: choose(
      '当前设备只有只读权限；生成邀请和撤销操作已禁用。',
      'This device has read-only access. Invitation and revocation actions are disabled.',
    ),
    accessUnknown: choose(
      '无法确认当前设备权限，写操作已禁用。重新连接以读取权限。',
      'Device access is unknown, so write actions are disabled. Reconnect to read the current access.',
    ),
    confirmRevoke: choose('确认撤销', 'Confirm revocation'),
  }
}
