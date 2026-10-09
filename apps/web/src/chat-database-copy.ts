import type { ChatDatabaseSettingsLabels, ChatDatabaseMetricId } from '@hbar/app-react/chat-database'
import type { ChatDatabaseSkipReason, ChatDatabaseOperation } from '@hbar/contracts/commands/chat-database'
import type { ShellLocale } from './shell-copy'

const skippedZh: Readonly<Record<ChatDatabaseSkipReason, string>> = {
  active: '正在运行',
  queued: '等待执行',
  approval: '等待审批',
  userInput: '等待用户输入',
  resume: '等待续跑',
  preparation: '正在准备执行目标',
  schedule: '仍有启用的定时任务',
  retainedChild: '子聊天或 Agent 需要保留',
  notArchived: '尚未归档',
  retention: '仍在保留期限内',
  autoDisabled: '此层已关闭自动清理',
  changed: '聊天发生变化',
  missing: '目标已经不存在',
  referenced: '仍有聊天、主题、任务或草稿引用',
  legacyInventory: '旧设备尚未确认草稿清单',
  legacyArtifact: '旧附件引用仍待核对',
  inUse: '资源正在使用或 Host 尚未空闲',
  unknownCategory: '未知或受保护的缓存类别',
  redirected: '路径包含链接、挂载或重定向',
  fileChanged: '文件在预览后发生变化',
  policyChanged: '已保存的规则发生变化',
  capacityUnreachable: '本次候选无法达到容量目标',
  capacityTarget: '固定容量候选集合之外，予以保留',
}
const skippedEn: Readonly<Record<ChatDatabaseSkipReason, string>> = {
  active: 'Running',
  queued: 'Queued',
  approval: 'Awaiting approval',
  userInput: 'Awaiting user input',
  resume: 'Awaiting continuation',
  preparation: 'Preparing execution target',
  schedule: 'Target of an enabled scheduled task',
  retainedChild: 'A child chat or Agent must be retained',
  notArchived: 'Not archived',
  retention: 'Within retention period',
  autoDisabled: 'Automatic cleanup disabled at this scope',
  changed: 'Chat changed',
  missing: 'Target no longer exists',
  referenced: 'Referenced by a chat, theme, task or draft',
  legacyInventory: 'An older device has not confirmed its draft inventory',
  legacyArtifact: 'Legacy attachment references require verification',
  inUse: 'Resource in use or Host is busy',
  unknownCategory: 'Unknown or protected cache category',
  redirected: 'Path includes a link, mount or redirection',
  fileChanged: 'File changed after preview',
  policyChanged: 'Saved rules changed',
  capacityUnreachable: 'Fixed candidates cannot reach the capacity target',
  capacityTarget: 'Retained outside this fixed capacity candidate set',
}
const names: readonly {
  readonly id: ChatDatabaseMetricId
  readonly zh: string
  readonly en: string
  readonly shared: boolean
  readonly kind: 'bytes' | 'count'
}[] = [
  { id: 'sessions', zh: '聊天数', en: 'Chats', shared: false, kind: 'count' },
  { id: 'archived', zh: '已归档聊天', en: 'Archived chats', shared: false, kind: 'count' },
  { id: 'messages', zh: '消息数', en: 'Messages', shared: false, kind: 'count' },
  { id: 'content', zh: '消息内容大小', en: 'Message content', shared: false, kind: 'bytes' },
  { id: 'logical', zh: '数据库历史负载', en: 'Database history payload', shared: false, kind: 'bytes' },
  { id: 'database', zh: 'SQLite 主文件', en: 'SQLite main file', shared: true, kind: 'bytes' },
  { id: 'wal', zh: '写入日志（WAL）', en: 'Write-ahead log (WAL)', shared: true, kind: 'bytes' },
  { id: 'shm', zh: '共享内存文件（SHM）', en: 'Shared-memory file (SHM)', shared: true, kind: 'bytes' },
  { id: 'freePages', zh: '数据库可复用空闲页', en: 'Reusable database pages', shared: true, kind: 'bytes' },
  { id: 'logs', zh: '会话日志', en: 'Session logs', shared: false, kind: 'bytes' },
  { id: 'attachments', zh: '原始附件', en: 'Original attachments', shared: false, kind: 'bytes' },
  { id: 'cache', zh: '磁盘缓存', en: 'Disk cache', shared: true, kind: 'bytes' },
]

export function chatDatabaseCopy(locale: ShellLocale): ChatDatabaseSettingsLabels {
  const zh = locale === 'zh-CN'
  const text = (chinese: string, english: string) => (zh ? chinese : english)
  const count = (value: number) => new Intl.NumberFormat(locale).format(value)
  const bytes = (value: number) => {
    const unit = value < 1024 ? 0 : value < 1_048_576 ? 1 : value < 1_073_741_824 ? 2 : 3
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 2 }).format(value / 1024 ** unit)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`
  }
  const date = (value: number | null) =>
    value === null
      ? text('尚无', 'None yet')
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
  const stages: Record<ChatDatabaseOperation['stage'], string> = {
    pending: text('已受理', 'Accepted'),
    scanning: text('正在统计候选', 'Scanning candidates'),
    deleting: text('正在清理', 'Cleaning'),
    checkpoint: text('正在归并写入日志', 'Checkpointing'),
    vacuum: text('正在回收数据库空间', 'Reclaiming database space'),
    finished: text('已结束', 'Finished'),
  }
  const statuses: Record<ChatDatabaseOperation['status'], string> = {
    accepted: text('已受理', 'Accepted'),
    running: text('执行中', 'Running'),
    cancelRequested: text('取消已请求，正在核实终态', 'Cancellation requested; awaiting verified completion'),
    completed: text('已完成', 'Completed'),
    cancelled: text('已取消', 'Cancelled'),
    failed: text('失败', 'Failed'),
    unknown: text('结果待核对', 'Result needs reconciliation'),
  }
  const kinds: Record<ChatDatabaseOperation['kind'], string> = {
    sessions: text('聊天历史', 'Chat history'),
    cache: text('磁盘缓存', 'Disk cache'),
    attachments: text('无引用附件', 'Unreferenced attachments'),
    database: text('数据库空间', 'Database space'),
  }
  const triggers: Record<ChatDatabaseOperation['trigger'], string> = {
    manual: text('手动', 'Manual'),
    schedule: text('定时', 'Scheduled'),
    capacity: text('容量', 'Capacity'),
  }
  return {
    title: text('聊天数据库', 'Chat database'),
    description: text(
      '监控当前 Host 的聊天历史和文件占用，配置保留规则，并预览和执行清理。',
      'Monitor this Host’s chat history and file usage, configure retention rules, and preview cleanup.',
    ),
    overview: text('占用概览', 'Storage overview'),
    attributable: text('此范围可归属数据量', 'Data attributable to this scope'),
    physical: text('实际文件总占用', 'Total physical file usage'),
    shared: text('共享数据库和缓存（全局信息）', 'Shared database and cache (global information)'),
    totalHelp: text(
      '总占用包含 SQLite 文件、会话日志、原始附件与缓存。消息内容包含在历史负载中，不重复加入总量。',
      'Total usage includes SQLite files, session logs, original attachments and cache. Message content is included in history payload and is not added again.',
    ),
    scopedHelp: text(
      '此范围合计为历史负载、会话日志与去重附件引用。共享附件可被多个范围引用，各范围的数值不能直接相加。',
      'Scope usage includes history payload, session logs and deduplicated attachment references. Shared attachments may belong to several scopes, so scope totals cannot be added together.',
    ),
    rules: text('清理规则', 'Cleanup rules'),
    rulesHelp: text(
      '规则遵循全局 → 项目 → 会话。修改后请保存；自动任务和手动预览使用已保存的值。',
      'Rules inherit from global to project to chat. Save edits to apply them; automatic tasks and manual previews use saved values.',
    ),
    savedRules: text(
      'Host 每分钟检查已保存规则。关闭此页不会停止已受理的任务；Host 关闭期间不执行，重启后合并补一次错过的定时任务。',
      'The Host checks saved rules every minute. Closing this page does not stop accepted jobs. While the Host is closed, tasks pause; startup coalesces missed scheduled runs into one.',
    ),
    automatic: text('自动任务', 'Automatic tasks'),
    manual: text('手动清理', 'Manual cleanup'),
    manualHelp: text(
      '先生成预览，再确认固定候选集合。运行中、等待执行和仍需保留的聊天及引用中的附件会跳过。',
      'Generate a preview, then confirm its fixed candidates. Active, queued or protected chats and referenced attachments are skipped.',
    ),
    records: text('执行记录', 'Execution history'),
    noRecords: text('此范围还没有清理记录。', 'No cleanup records for this scope yet.'),
    loading: text('正在统计和核对作业…', 'Scanning usage and reconciling jobs…'),
    incomplete: text(
      '统计尚不完整，容量任务暂不使用此结果。',
      'Statistics are incomplete. Capacity cleanup will wait for a complete result.',
    ),
    offline: text(
      'Host 已断开。显示上次结果，重新连接后核对原作业。',
      'Host disconnected. Showing the last result; original jobs will be reconciled after reconnecting.',
    ),
    refresh: text('刷新占用', 'Refresh usage'),
    generatePreview: text('生成预览', 'Generate preview'),
    review: text('查看预览并确认', 'Review and confirm'),
    previewTitle: text('确认清理预览', 'Confirm cleanup preview'),
    noCandidates: text('没有符合已保存规则的清理候选。', 'No cleanup candidates match the saved rules.'),
    confirm: text('确认清理', 'Confirm cleanup'),
    confirmHelp: text(
      '清理会永久删除符合条件的聊天或文件。仅执行本次预览中的候选；每项执行前会再次核对活动、引用和规则。',
      'Cleanup permanently removes eligible chats or files. Only this preview’s candidates are processed, with activity, references and rules checked again before each item.',
    ),
    close: text('返回', 'Back'),
    cancel: text('请求取消', 'Request cancellation'),
    reconcile: text('核对原作业', 'Reconcile original job'),
    retryOriginal: text('重试原请求', 'Retry original request'),
    unknown: text(
      '请求结果尚未确认，请核对或重试原请求。不要生成新的清理请求。',
      'The request outcome is unconfirmed. Reconcile or retry the original request before starting another cleanup.',
    ),
    firstPage: text('返回第一页', 'First page'),
    nextPage: text('下一页', 'Next page'),
    skipped: text('跳过原因', 'Skipped reasons'),
    lastRun: text('上次执行', 'Last execution'),
    nextRun: text('下次定时执行', 'Next scheduled execution'),
    cacheBreakdown: text('缓存类别', 'Cache categories'),
    cacheCategories: {
      models: text('模型缓存', 'Models'),
      pluginBuild: text('插件构建', 'Plugin builds'),
      pluginExtract: text('插件解包', 'Plugin extraction'),
      markdown: text('Markdown 渲染', 'Markdown rendering'),
      mermaid: text('Mermaid 渲染', 'Mermaid rendering'),
      attachments: text('附件派生缓存', 'Attachment derivatives'),
      tmp: text('临时缓存', 'Temporary cache'),
      protected: text('受保护或未知类别', 'Protected or unknown categories'),
    },
    metrics: names.map((item) => ({
      id: item.id,
      label: zh ? item.zh : item.en,
      kind: item.kind,
      shared: item.shared,
    })),
    actions: [
      {
        kind: 'sessions',
        title: text('按规则清理聊天', 'Clean chats using saved rules'),
        help: text(
          '按最后活动和归档状态筛选，按整条聊天清理。',
          'Filter by last activity and archive state, then remove whole chats.',
        ),
        globalOnly: false,
      },
      {
        kind: 'cache',
        title: text('清理缓存', 'Clean disk cache'),
        help: text(
          '仅清理已知的可重建类别，保留使用中、未知类别和挂载目录。',
          'Remove known rebuildable files, preserving resources in use, unknown categories and mounted directories.',
        ),
        globalOnly: true,
      },
      {
        kind: 'attachments',
        title: text('回收无引用附件', 'Reclaim unreferenced attachments'),
        help: text(
          '核对聊天、任务、主题和离线草稿引用；子范围只处理因自身清理而失去引用的附件。',
          'Check chats, tasks, themes and offline drafts. Child scopes process only attachments orphaned by their own cleanup.',
        ),
        globalOnly: false,
      },
      {
        kind: 'database',
        title: text('回收数据库空闲空间', 'Reclaim database free space'),
        help: text(
          '删除记录可能只增加空闲页。Host 空闲时回收文件空间；维护期间暂停数据库写入。',
          'Deleting records can leave reusable pages. Reclaim file space while the Host is idle; database writes pause during maintenance.',
        ),
        globalOnly: true,
      },
    ],
    count,
    bytes,
    date,
    sampledAt: (time) =>
      text(
        `采样时间：${date(time)} · 页面可见且已连接时每 30 秒刷新`,
        `Sampled ${date(time)} · Refreshes every 30 seconds while visible and connected`,
      ),
    previewSummary: (op) =>
      text(
        `${count(op.candidateCount)} 项候选，预计可回收 ${bytes(op.estimatedBytes)}。`,
        `${count(op.candidateCount)} candidates; estimated reclaim ${bytes(op.estimatedBytes)}.`,
      ),
    expiresAt: (time) =>
      text(`本次预览有效至 ${date(time)}（5 分钟）。`, `This preview expires ${date(time)} (5 minutes).`),
    operation: (op) =>
      `${date(op.createdAt)} · ${triggers[op.trigger]} · ${op.type === 'preview' ? text('预览', 'Preview') : kinds[op.kind]} · ${statuses[op.status]}${op.status === 'running' ? ` · ${stages[op.stage]}` : ''}`,
    outcome: (op) =>
      op.type === 'preview'
        ? text(
            `${count(op.candidateCount)} 项候选 · 预计 ${bytes(op.estimatedBytes)}`,
            `${count(op.candidateCount)} candidates · estimated ${bytes(op.estimatedBytes)}`,
          )
        : text(
            `已处理 ${count(op.processedCount)}/${count(op.totalCount)} 项，清理 ${count(op.deletedCount)} 项，实际回收 ${bytes(op.reclaimedBytes)}，新增可复用数据库空间 ${bytes(op.reusableDatabaseBytes)}。`,
            `Processed ${count(op.processedCount)}/${count(op.totalCount)} items; cleaned ${count(op.deletedCount)}; reclaimed ${bytes(op.reclaimedBytes)}; reusable database space ${bytes(op.reusableDatabaseBytes)}.`,
          ) +
          (op.targetBytes === null
            ? ''
            : text(
                ` 剩余占用 ${bytes(op.remainingBytes ?? 0)}，目标 ${bytes(op.targetBytes)}。`,
                ` Remaining ${bytes(op.remainingBytes ?? 0)}; target ${bytes(op.targetBytes)}.`,
              )),
    task: (task) =>
      !task.explicit
        ? text(
            '此范围使用上层任务，不创建重复计划。',
            'This scope uses its parent’s task without creating a duplicate plan.',
          )
        : task.autoEnabled
          ? text(
              '自动清理已启用；按已保存的定时和容量开关执行。',
              'Automatic cleanup is enabled and uses the saved scheduled and capacity triggers.',
            )
          : text('自动清理已关闭。', 'Automatic cleanup is disabled.'),
    scope: (scope) =>
      scope.kind === 'global'
        ? text('范围：当前 Host 全局', 'Scope: this Host globally')
        : scope.kind === 'workspace'
          ? text('范围：当前项目', 'Scope: current project')
          : text('范围：当前会话', 'Scope: current chat'),
    skipReason: (reason) => (zh ? skippedZh : skippedEn)[reason],
    error: (value) => {
      if (value === 'PREVIEW_EXPIRED')
        return text('预览已过期，请重新生成。', 'The preview expired. Generate a fresh preview.')
      if (value === 'POLICY_CHANGED')
        return text('已保存规则发生变化，请重新生成预览。', 'Saved rules changed. Generate a fresh preview.')
      if (value === 'BUSY')
        return text(
          '已有清理或维护作业，请等待它结束。',
          'Another cleanup or maintenance job is active. Wait for it to finish.',
        )
      if (value === 'NOT_FOUND' || value === 'SESSION_DELETED')
        return text(
          '此聊天或范围已经被清理。请选择另一个范围。',
          'This chat or scope was removed. Select another scope.',
        )
      if (value === 'UNKNOWN_RESULT')
        return text(
          '原请求结果待核对，重新连接后继续核对。',
          'The original request needs reconciliation. Reconnect to continue.',
        )
      if (value.startsWith('JOURNAL_'))
        return text(
          '本地作业记录不可用，暂时无法安全提交新清理。',
          'Local job records are unavailable. New cleanup requests are temporarily blocked.',
        )
      return text(
        `读取或执行失败（${value}），请刷新或核对原作业。`,
        `Read or execution failed (${value}). Refresh or reconcile the original job.`,
      )
    },
  }
}
