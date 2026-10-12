import type { HbarSessionObservabilityLabels, HbarSessionMonitoringLabels } from '@hbar/app-react'

export function sessionObservabilityCopy(
  locale: 'zh-CN' | 'en-US',
  base: Omit<HbarSessionMonitoringLabels, 'observability'>,
): HbarSessionObservabilityLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    ...base,
    list: (items) => items.join(' · '),
    scopeTitle: choose('统计范围', 'Statistics scope'),
    scopes: {
      session: choose('整个会话', 'Session'),
      turn: choose('单次对话', 'Turn'),
      window: choose('上下文窗口', 'Context window'),
    },
    sections: {
      skills: choose('技能使用', 'Skills'),
      tools: choose('工具调用', 'Tools'),
      files: choose('文件读写', 'Files'),
      terminal: choose('终端执行', 'Terminal'),
      compactions: choose('上下文压缩', 'Compactions'),
      requests: choose('模型请求', 'Model requests'),
      models: base.models,
    },
    fields: {
      outputRate: choose('输出速率', 'Output rate'),
      cacheShare: choose('缓存读取占输入', 'Cached input share'),
      tokenShare: choose('词元占比', 'Token share'),
      knownCost: choose('已知费用', 'Known cost'),
      successRate: choose('成功率', 'Success rate'),
      duration: choose('累计耗时', 'Total duration'),
      average: choose('平均耗时', 'Average duration'),
      p95: choose('耗时 p95', 'Duration p95'),
      maximum: choose('最长耗时', 'Longest duration'),
      usedSkills: choose('已使用技能', 'Skills used'),
      skillUses: choose('完整加载次数', 'Complete loads'),
      skillLoads: choose('说明读取次数', 'Instruction reads'),
      resources: choose('引用资源读取', 'Resource reads'),
      reads: choose('读取次数', 'Reads'),
      writes: choose('写入次数', 'Writes'),
      readPaths: choose('读取文件数', 'Files read'),
      writtenPaths: choose('写入文件数', 'Files written'),
      readLines: choose('读取文本行', 'Text lines read'),
      patches: choose('补丁片段', 'Patch fragments'),
      addedLines: choose('新增行', 'Lines added'),
      removedLines: choose('删除行', 'Lines removed'),
      before: choose('压缩前词元', 'Tokens before'),
      after: choose('压缩后词元', 'Tokens after'),
      reduction: choose('压缩率', 'Reduction'),
      removedTokens: choose('减少词元', 'Tokens removed'),
      completed: choose('已完成', 'Completed'),
      failed: choose('失败', 'Failed'),
      count: choose('调用次数', 'Calls'),
      pricing: choose('价格快照', 'Price snapshot'),
      revision: choose('说明版本', 'Instruction revision'),
    },
    outcomes: {
      succeeded: choose('成功', 'Succeeded'),
      failed: choose('失败', 'Failed'),
      denied: choose('已拒绝', 'Denied'),
      cancelled: choose('已取消', 'Cancelled'),
      interrupted: choose('意外中断', 'Interrupted'),
      unknown: choose('结果未知', 'Unknown'),
      pending: choose('未结算', 'Pending'),
      running: choose('进行中', 'Running'),
      completed: choose('已完成', 'Completed'),
    },
    loading: choose('正在读取会话统计…', 'Reading session statistics…'),
    emptyRecords: choose('这个范围还没有相关记录。', 'No records in this scope yet.'),
    refresh: choose('刷新统计', 'Refresh statistics'),
    previous: choose('上一个范围', 'Previous scope'),
    next: choose('下一个范围', 'Next scope'),
    latest: choose('回到最新', 'Latest'),
    previousPage: choose('上一页记录', 'Previous records'),
    nextPage: choose('下一页记录', 'Next records'),
    details: choose('活动记录', 'Activity records'),
    measurementNote: choose(
      '未提供的测量显示为不可用；费用沿用请求时的价格。',
      'Missing measurements remain unavailable; costs use request-time prices.',
    ),
    rateNote: choose(
      '速率按已记账请求的实际总耗时计算。',
      'Rates use the total measured duration of accounted requests.',
    ),
    skillNote: choose(
      '完整加载表示说明已读完并提供给模型；重复页不增加次数。',
      'Complete loads mean instructions were fully read and supplied to the model; duplicate pages do not add uses.',
    ),
    fileNote: choose(
      '累计读写与补丁行数；后续修改继续累加，区别于最终 Git diff。',
      'Cumulative I/O and patch lines; later edits add to these totals, independently of the final Git diff.',
    ),
    error: (code) =>
      choose(
        `暂时无法读取统计（${code}），可以重试。`,
        `Statistics are temporarily unavailable (${code}); retry to refresh.`,
      ),
    range: (scope, ordinal, label) =>
      scope === 'session'
        ? choose('当前 Session 的全部记录', 'All records in this session')
        : scope === 'window'
          ? choose(
              `上下文窗口 ${base.number(ordinal)} · 成功压缩之间的执行区间`,
              `Context window ${base.number(ordinal)} · between successful compactions`,
            )
          : ordinal === 0
            ? choose('会话启动阶段', 'Session startup')
            : choose(
                `第 ${base.number(ordinal)} 次对话${label ? ` · ${label}` : ''}`,
                `Turn ${base.number(ordinal)}${label ? ` · ${label}` : ''}`,
              ),
    coverage: (recorded, total) =>
      choose(
        `已记账 ${base.number(recorded)} / ${base.number(total)} 个请求`,
        `${base.number(recorded)} / ${base.number(total)} requests accounted`,
      ),
    page: (page) => choose(`第 ${base.number(page)} 页`, `Page ${base.number(page)}`),
    timestamp: (time) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(time),
    price: (pricing) => {
      if (!pricing.available)
        return choose(`价格未提供；价格版本 ${pricing.version}`, `Price unavailable; price version ${pricing.version}`)
      const price = (value: number | null) => (value === null ? base.unavailable : base.currency(value))
      return choose(
        `每百万词元：输入 ${price(pricing.inputPerMillion)} · 输出 ${price(pricing.outputPerMillion)} · 缓存读取 ${price(pricing.cacheReadPerMillion)} · 缓存写入 ${price(pricing.cacheWritePerMillion)}；价格版本 ${pricing.version}`,
        `Per million tokens: input ${price(pricing.inputPerMillion)} · output ${price(pricing.outputPerMillion)} · cache read ${price(pricing.cacheReadPerMillion)} · cache write ${price(pricing.cacheWritePerMillion)}; price version ${pricing.version}`,
      )
    },
  }
}
