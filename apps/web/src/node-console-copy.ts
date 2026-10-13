import type { ShellLocale } from './shell-copy'
import type { HbarNodeConsoleLabels } from '@hbar/app-react/node-console'

function createNodeConsoleCopy(locale: ShellLocale): HbarNodeConsoleLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    title: choose('工作区节点控制台', 'Workspace node console'),
    description: choose(
      '查看本机节点连接、共享根目录、隔离底线、运行任务、独立审计记录与绑定会话的只读对话。',
      'Inspect this workspace node’s link, shared roots, security floor, running work, independent audit records, and read-only conversations bound to this node.',
    ),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在读取节点…', 'Reading node…'),
    retry: choose('重试', 'Retry'),
    roleUnknown: choose(
      '尚未验证 B 控制台设备权限。重新配对或选择有效的本机 B 设备凭据后，写操作将保持禁用。',
      'B console device authority has not been verified. Re-pair or select valid B-local device credentials; write actions stay disabled.',
    ),
    role: (role) =>
      role === 'operator' ? choose('本机操作员', 'Local operator') : choose('只读观察者', 'Read-only observer'),
    linked: choose('已链接到对话节点 A', 'Linked to conversation node A'),
    unlinked: choose('未链接', 'Unlinked'),
    linkPending: choose('链接状态未知', 'Link state is unknown'),
    connection: choose('节点连接', 'Node connection'),
    node: choose('节点 ID', 'Node ID'),
    platform: choose('运行平台', 'Platform'),
    fingerprint: choose('本机节点指纹', 'Local node fingerprint'),
    roots: choose('共享根目录', 'Shared roots'),
    noRoots: choose('当前没有共享根目录', 'No roots are currently shared'),
    rootAccess: (access) => (access === 'write' ? choose('可写', 'Write access') : choose('只读', 'Read only')),
    securityFloor: choose('本机安全底线', 'Local security floor'),
    process: choose('允许启动进程', 'Allow process execution'),
    network: choose('允许网络访问', 'Allow network access'),
    terminal: choose('允许终端', 'Allow terminal'),
    confinement: choose('操作系统隔离', 'OS confinement'),
    confinementMode: (mode) =>
      mode === 'required'
        ? choose('必须启用', 'Required')
        : mode === 'preferred'
          ? choose('优先启用', 'Preferred')
          : choose('关闭', 'Off'),
    protectedPaths: choose('受保护路径', 'Protected paths'),
    protectedPathsValue: (paths) =>
      choose(`受保护路径：${paths.join(' · ') || '无'}`, `Protected paths: ${paths.join(' · ') || 'None'}`),
    maxConcurrent: choose('最大并发进程数', 'Maximum concurrent processes'),
    maxTimeout: choose('最大命令时长（毫秒）', 'Maximum command duration (ms)'),
    readOnly: choose(
      '此设备为只读观察者，或权限尚未确认；底线修改、暂停和终止操作均不可用。',
      'This device is read-only or its authority is unverified. Floor changes, pause, and terminate actions are disabled.',
    ),
    savePolicy: choose('保存本机底线', 'Save local floor'),
    policyFailure: (code) =>
      choose(
        `底线保存失败（${code}）。已保留服务端报告值，请重试。`,
        `Could not save the floor (${code}). The last server-reported value is retained; retry the save.`,
      ),
    policyConflict: choose(
      '底线已被另一位操作员更新。已刷新服务端值，保留当前草稿；再次保存会基于新版本提交。',
      'Another operator updated the floor. The latest server value is refreshed and your draft is preserved; save again to apply it to the new revision.',
    ),
    running: choose('实时运行', 'Live execution'),
    noRunning: choose('当前没有运行中的操作', 'No operations are currently running'),
    paused: choose('执行入口已暂停', 'Execution admission is paused'),
    active: choose('执行入口已启用', 'Execution admission is enabled'),
    pause: choose('暂停新执行', 'Pause new execution'),
    resume: choose('恢复执行', 'Resume execution'),
    terminate: choose('终止此操作', 'Terminate this operation'),
    actionFailure: (code) =>
      choose(
        `操作未完成（${code}）。刷新以核对节点当前状态后再重试。`,
        `The action did not complete (${code}). Refresh the node state before retrying.`,
      ),
    audit: choose('本机审计', 'Local audit'),
    noAudit: choose('没有审计记录', 'No audit records'),
    auditTime: (timestamp) =>
      new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'medium' }).format(timestamp),
    auditTool: (tool, decision, backend, code) => `${tool} · ${decision} · ${backend} · ${code ?? '—'}`,
    moreAudit: choose('读取下一页审计记录', 'Load next audit page'),
    conversations: choose('绑定会话', 'Bound conversations'),
    noSessions: choose('此节点没有可观察的绑定会话', 'No bound conversations are available for observation'),
    moreSessions: choose('读取更多会话', 'Load more conversations'),
    selectSession: choose('选择会话以查看只读快照', 'Select a conversation to view its read-only snapshot'),
    noMessages: choose('此快照中没有消息', 'This snapshot contains no messages'),
    messageRole: (role) => role,
    messageToolCall: (name, argumentsJson) => `${name} · ${argumentsJson}`,
    messageTime: (timestamp) =>
      new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp),
    truncated: choose('此快照未包含较早内容。', 'Earlier content is not included in this snapshot.'),
    snapshotUnavailable: choose(
      '当前没有可显示的节点数据。请刷新以重新读取服务端事实。',
      'No node data is available yet. Refresh to read the current server state.',
    ),
    error: (code) =>
      choose(
        `请求失败（${code}）。检查本机 B 控制台连接与设备权限后重试。`,
        `The request failed (${code}). Check the local B console connection and device authority, then retry.`,
      ),
    pairDevice: choose('配对此浏览器', 'Pair this browser'),
    pairingDescription: choose(
      '输入 B 控制台操作员生成的一次性八位配对码。设备密钥仅保存在此 B 节点的同源存储中。',
      'Enter the one-time eight-digit code created by a B-console operator. The device key is stored only in this node’s same-origin browser storage.',
    ),
    deviceName: choose('设备名称', 'Device name'),
    pairingCode: choose('八位配对码', 'Eight-digit pairing code'),
    pairingCodeHelp: choose(
      '配对码只可使用一次，并会在短时间后失效。',
      'The pairing code is single-use and expires shortly.',
    ),
    pairAction: choose('配对到此 B 节点', 'Pair with this B node'),
    pairing: choose('正在验证并保存 B 设备密钥…', 'Verifying and saving the B device key…'),
    forgetDevice: choose('移除此浏览器的设备密钥', 'Remove this browser device key'),
    forgetDeviceHelp: choose(
      '这只会移除当前浏览器的 B 设备凭据；如需撤销服务端设备，请由本机操作员撤销该设备。',
      'This removes the B device credential from this browser only. A local operator must revoke the server-side device to remove its authority.',
    ),
    pairFailure: (code) =>
      choose(
        `配对失败（${code}）。检查配对码仍有效后重试。`,
        `Pairing failed (${code}). Check that the pairing code is still valid and retry.`,
      ),
    credentialFailure: (code) =>
      choose(
        `B 已接受配对，但本机无法安全保存设备密钥（${code}）。请先检查浏览器存储，再使用新的配对码重新配对。`,
        `B accepted the pairing, but this browser could not securely store the device key (${code}). Check browser storage, then pair again with a new code.`,
      ),
    storageFailure: (code) =>
      choose(
        `无法读取或更新本机 B 设备凭据存储（${code}）。检查浏览器存储权限后重试。`,
        `Could not read or update the B device credential store (${code}). Check browser storage permission and retry.`,
      ),
    forgetFailure: (code) =>
      choose(
        `无法移除此浏览器凭据（${code}）。当前设备仍保持配对。`,
        `Could not remove this browser credential (${code}). This device remains paired.`,
      ),
  }
}

export function nodeConsoleCopy(locale: ShellLocale): HbarNodeConsoleLabels {
  return createNodeConsoleCopy(locale)
}
