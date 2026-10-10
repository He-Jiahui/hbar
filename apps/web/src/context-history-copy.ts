import type { HbarContextHistoryLabels } from '@hbar/app-react'
import type { ContextCompactionRecord } from '@hbar/contracts/context-history'
import type { SupportedLocale } from './locale'

export function contextHistoryCopy(locale: SupportedLocale): HbarContextHistoryLabels {
  const zh = locale === 'zh-CN'
  const choose = (cn: string, en: string) => (zh ? cn : en)
  const number = (value: number) => value.toLocaleString(locale)
  const unknown = choose('未知', 'Unknown')
  const duration = (ms: number | null) =>
    ms === null
      ? unknown
      : ms < 1000
        ? choose(`${number(Math.round(ms))} 毫秒`, `${number(Math.round(ms))} ms`)
        : choose(`${number(Number((ms / 1000).toFixed(2)))} 秒`, `${number(Number((ms / 1000).toFixed(2)))} s`)
  const occupancy = (tokens: number | null, capacity: number) =>
    tokens === null
      ? unknown
      : `${number(tokens)} / ${number(capacity)} token · ${number(Number(((tokens / capacity) * 100).toFixed(1)))}%`
  const status = (value: ContextCompactionRecord['status']) =>
    ({
      running: choose('正在压缩', 'Compacting'),
      completed: choose('已压缩', 'Compacted'),
      failed: choose('压缩失败', 'Compaction failed'),
      cancelled: choose('压缩已取消', 'Compaction cancelled'),
      interrupted: choose('压缩中断', 'Compaction interrupted'),
    })[value]
  return {
    notice: choose('正在压缩上下文', 'Compacting context'),
    offline: choose('连接中断，正在重新确认上下文压缩状态', 'Disconnected; confirming context compaction status'),
    title: choose('上下文窗口与压缩历史', 'Context windows and compaction history'),
    current: choose('当前窗口明细', 'Current window details'),
    empty: choose(
      '尚无压缩记录；第一次压缩后会归档窗口明细。',
      'No compaction recorded yet. Window details are archived after the first compaction.',
    ),
    estimates: choose(
      '上下文长度和占比由 Host 估算；传递长度包含系统指令、摘要和保留消息。',
      'Context lengths and occupancy are Host estimates. Carried context includes system instructions, the summary and retained messages.',
    ),
    accounting: choose(
      '累计 token 是模型返回的输入与输出之和，缓存 token 已包含在输入中。工具总数包含子调用；成功率 = 成功 /（成功 + 失败），取消、拒绝、未确认结果不计入分母。运行时长含等待，窗口跨度含空闲时间。压缩耗时已包含在窗口跨度中；失败或取消不切换窗口，重试仍属同一窗口。',
      'Total tokens are provider-reported input plus output; cached tokens are included in input. Tool totals include nested calls. Success rate = succeeded / (succeeded + failed), excluding cancelled, denied and unconfirmed outcomes. Run time includes waits; window span includes idle time and compaction. Failed or cancelled compactions keep the same window when retried.',
    ),
    fileAccounting: choose(
      '文件统计仅计成功的文件工具；编辑计为写入，文件数按请求路径去重。命令内部的读写和缺少元数据的旧记录不推测。',
      'File counts cover successful file tools; edits count as writes and paths are deduplicated as requested. Reads/writes inside commands and legacy records without metadata are not inferred.',
    ),
    older: choose('更早的窗口', 'Earlier windows'),
    latest: choose('返回最新窗口', 'Latest windows'),
    loading: choose('正在读取窗口历史…', 'Loading window history…'),
    retry: choose('重新读取', 'Retry'),
    error: (message) => choose(`窗口数据读取失败：${message}`, `Window data could not be loaded: ${message}`),
    record: (value) =>
      choose(
        `窗口 ${number(value.window)} · ${status(value.status)}`,
        `Window ${number(value.window)} · ${status(value.status)}`,
      ),
    summary: (value) =>
      value.status === 'running'
        ? occupancy(value.beforeTokens, value.contextWindow)
        : `${duration(value.durationMs)} · ${occupancy(value.afterTokens, value.contextWindow)}`,
    metrics: (value) => [
      {
        id: 'tokens',
        label: choose('累计 token', 'Total tokens'),
        value: number(value.usage.input + value.usage.output),
      },
      {
        id: 'input',
        label: choose('输入 / 输出', 'Input / output'),
        value: `${number(value.usage.input)} / ${number(value.usage.output)}`,
      },
      {
        id: 'cache',
        label: choose('缓存读取 / 写入', 'Cache read / write'),
        value: `${number(value.usage.cacheRead)} / ${number(value.usage.cacheWrite)}`,
      },
      {
        id: 'requests',
        label: choose('模型请求 / 用量记录', 'Model requests / usage records'),
        value: `${number(value.usage.requests)} / ${number(value.usage.recorded)}`,
      },
      {
        id: 'turns',
        label: choose('用户消息 / 运行数', 'User messages / runs'),
        value: `${number(value.turns)} / ${number(value.runs)}`,
      },
      {
        id: 'duration',
        label: choose('执行时长 / 窗口跨度', 'Execution time / window span'),
        value: `${duration(value.executionMs)} / ${duration(value.wallDurationMs)}`,
      },
      {
        id: 'tools',
        label: choose('工具调用 / 成功率', 'Tool calls / success rate'),
        value: `${number(value.tools.total)} / ${value.tools.successRate === null ? unknown : `${number(Number((value.tools.successRate * 100).toFixed(1)))}%`}`,
      },
      {
        id: 'results',
        label: choose('成功 / 失败', 'Succeeded / failed'),
        value: `${number(value.tools.succeeded)} / ${number(value.tools.failed)}`,
      },
      {
        id: 'cancelled',
        label: choose('取消 / 拒绝', 'Cancelled / denied'),
        value: `${number(value.tools.cancelled)} / ${number(value.tools.denied)}`,
      },
      {
        id: 'unknown',
        label: choose('中断 / 未知 / 待完成', 'Interrupted / unknown / pending'),
        value: `${number(value.tools.interrupted)} / ${number(value.tools.unknown)} / ${number(value.tools.pending)}`,
      },
      {
        id: 'reads',
        label: choose('读取次数 / 文件数', 'Read operations / files'),
        value: `${number(value.files.reads)} / ${number(value.files.readPaths)}`,
      },
      {
        id: 'writes',
        label: choose('写入次数 / 文件数', 'Write operations / files'),
        value: `${number(value.files.writes)} / ${number(value.files.writtenPaths)}`,
      },
    ],
    compactionMetrics: (value) => [
      {
        id: 'date',
        label: choose('压缩开始', 'Compaction started'),
        value: new Date(value.startedAt).toLocaleString(locale),
      },
      { id: 'model', label: choose('模型', 'Model'), value: value.modelId },
      {
        id: 'before',
        label: choose('压缩前占用（估算）', 'Before compaction (estimated)'),
        value: occupancy(value.beforeTokens, value.contextWindow),
      },
      {
        id: 'after',
        label: choose('传递到下一窗口（估算）', 'Carried to next window (estimated)'),
        value: occupancy(value.afterTokens, value.contextWindow),
      },
      {
        id: 'summary',
        label: choose('摘要 token / 保留消息', 'Summary tokens / retained messages'),
        value: `${value.summaryTokens === null ? unknown : number(value.summaryTokens)} / ${value.retainedMessages === null ? unknown : number(value.retainedMessages)}`,
      },
      { id: 'compaction-time', label: choose('压缩耗时', 'Compaction duration'), value: duration(value.durationMs) },
      {
        id: 'compaction-tokens',
        label: choose('压缩消耗 token', 'Compaction tokens'),
        value: number(value.compactionUsage.input + value.compactionUsage.output),
      },
      { id: 'chunks', label: choose('已完成摘要请求', 'Completed summary requests'), value: number(value.chunks) },
      ...(value.errorCode
        ? [{ id: 'error', label: choose('压缩结果代码', 'Compaction result code'), value: value.errorCode }]
        : []),
    ],
  }
}
