import type { SkillImportLabels } from '@hbar/app-react/skill-import'
import type { ShellLocale } from './shell-copy'
export function skillImportCopy(locale: ShellLocale): SkillImportLabels {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  return {
    open: choose('导入 Claude／Codex 技能', 'Import Claude / Codex skills'),
    close: choose('收起技能导入', 'Collapse skill import'),
    title: choose('转换并导入技能', 'Convert and import skills'),
    description: choose(
      '复制 SKILL.md 与附属文件到全局 Skills 目录，转换 Markdown 中的文档名与平台引用；同名目录跳过，来源保留。脚本和代码块保持原样，平台专属行为需人工检查。',
      'Copy SKILL.md and assets into global skills, adapting Markdown document names and platform references. Existing names are skipped and sources preserved. Scripts and code fences remain unchanged; review platform-specific behavior.',
    ),
    source: choose('技能来源', 'Skill source'),
    sources: { claude: 'Claude Code', codex: 'Codex' },
    sourceRoot: choose('来源目录（可选）', 'Source directory (optional)'),
    automaticSource: choose('留空自动查找用户技能目录', 'Leave empty to discover user skill directories'),
    preview: choose('预览转换', 'Preview conversion'),
    previewing: choose('正在扫描技能…', 'Scanning skills…'),
    convert: choose('转换并导入', 'Convert and import'),
    working: choose('正在导入…', 'Importing…'),
    check: choose('检查导入结果', 'Check import result'),
    retryOriginal: choose('重试原导入请求', 'Retry original import'),
    cancel: choose('停止导入', 'Stop import'),
    empty: choose(
      '未找到包含 SKILL.md 的技能目录，请检查来源。',
      'No skill directories containing SKILL.md were found. Check the source.',
    ),
    truncated: choose(
      '预览已达扫描上限，请指定更小的来源目录。',
      'The scan limit was reached. Choose a smaller source directory.',
    ),
    destination: (path) => choose(`导入到：${path}`, `Import into: ${path}`),
    sourcePaths: (paths) => choose(`扫描来源：${paths.join(' · ')}`, `Scanned sources: ${paths.join(' · ')}`),
    candidateStatus: {
      ready: choose('可以导入', 'Ready to import'),
      existing: choose('同名目录已存在，将跳过', 'Existing directory; will skip'),
      invalid: choose('需要调整，将跳过', 'Needs adjustment; will skip'),
    },
    warnings: {
      platform_metadata: choose(
        '平台专属 frontmatter 不会启用，仅保留名称与描述。',
        'Platform-specific frontmatter will not be enabled; only name and description are retained.',
      ),
      platform_references: choose(
        '包含平台专属工具或目录引用，请检查转换后的说明。',
        'Contains platform-specific tools or paths; review converted instructions.',
      ),
      duplicate_source: choose(
        '其他来源有同名技能，将跳过此项。',
        'Another source has the same skill name; this item will be skipped.',
      ),
      document_collision: choose(
        '文档转换后重名，请先调整来源文件名。',
        'Converted document names conflict. Rename source files first.',
      ),
      invalid_entry: choose(
        'SKILL.md 格式无法读取，请修正后重新预览。',
        'SKILL.md could not be parsed. Fix it and preview again.',
      ),
      file_limit: choose(
        '此技能超出文件数量、大小或目录深度上限。',
        'This skill exceeds file, size or nesting limits.',
      ),
      unsafe_file: choose(
        '此技能含链接、保留目录或不支持的文件类型。',
        'This skill contains links, reserved directories or unsupported file types.',
      ),
    },
    capacity: (files, bytes) =>
      choose(`${files} 个文件 · ${(bytes / 1024).toFixed(1)} KiB`, `${files} files · ${(bytes / 1024).toFixed(1)} KiB`),
    result: (job) => {
      const imported = job.items.filter((item) => item.status === 'imported').length
      const skipped = job.items.filter((item) => item.status !== 'imported').length
      const status =
        job.status === 'succeeded'
          ? choose('导入完成', 'Import complete')
          : job.status === 'cancelled'
            ? choose('导入已停止', 'Import stopped')
            : job.status === 'failed'
              ? choose('导入未完成', 'Import incomplete')
              : choose('正在导入', 'Importing')
      return choose(
        `${status}：已导入 ${imported} 项，跳过 ${skipped} 项。`,
        `${status}: ${imported} imported, ${skipped} skipped.`,
      )
    },
    unknown: choose(
      '导入是否受理尚未确认。先检查结果，重试使用原请求。',
      'Import acceptance is unconfirmed. Check the result; retries use the original request.',
    ),
    error: (code) => {
      if (code === 'SKILL_IMPORT_CANCELLED_BEFORE_START')
        return choose(
          '已停止尚未受理的导入，迟到的请求不会开始复制。',
          'The unaccepted import was stopped; late requests will not start copying.',
        )
      if (code === 'SKILL_SOURCE_CHANGED')
        return choose('来源文件已改变，请重新预览后导入。', 'Source files changed. Preview again before importing.')
      if (code === 'SKILL_SOURCE_INVALID')
        return choose(
          '请选择与全局 Skills 分开的绝对来源目录。',
          'Choose an absolute source directory separate from global skills.',
        )
      if (code === 'SKILL_IMPORT_BUSY')
        return choose(
          '有技能导入或扫描正在进行，请稍后检查。',
          'A skill import or scan is in progress. Check again shortly.',
        )
      if (code === 'SKILL_IMPORT_CHECK_PAUSED')
        return choose(
          '导入仍在后台运行。请检查结果继续查看进度。',
          'Import continues in the background. Check its result to resume progress updates.',
        )
      if (code === 'CANCELLED')
        return choose('导入已停止，完成的技能已保留。', 'Import stopped; completed skills are preserved.')
      return choose(
        `技能导入未完成（${code}），请检查来源后重试。`,
        `Skill import did not finish (${code}). Check the source and retry.`,
      )
    },
    previous: choose('上一页', 'Previous page'),
    next: choose('下一页', 'Next page'),
    page: (page, total) => choose(`第 ${page} / ${total} 页`, `Page ${page} of ${total}`),
  }
}
