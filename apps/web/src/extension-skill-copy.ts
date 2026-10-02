import type { ExtensionSkillDetailLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function extensionSkillCopy(locale: ShellLocale): ExtensionSkillDetailLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const bytes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return {
    title: choose('技能详情', 'Skill details'),
    back: choose('返回技能列表', 'Back to skills'),
    overview: choose('概览', 'Overview'),
    files: choose('文件', 'Files'),
    tabs: choose('技能详情视图', 'Skill detail views'),
    retry: choose('重新加载技能', 'Reload skill'),
    loading: choose('正在加载技能详情…', 'Loading skill details…'),
    missing: choose(
      '此技能已不在当前 Host 中。返回列表并刷新以查看最新状态。',
      'This skill is no longer on the current Host. Return to the list and refresh to see the current state.',
    ),
    noOverview: choose('此技能没有可显示的正文。', 'This skill has no overview body.'),
    noFiles: choose('此技能没有可读取的文件。', 'This skill has no readable files.'),
    noSelectedFile: choose('选择文件以查看其内容。', 'Select a file to view its contents.'),
    path: choose('路径', 'Path'),
    scope: choose('作用域', 'Scope'),
    scopeValue: { global: choose('全局', 'Global') },
    fileCount: (count) =>
      choose(`${number.format(count)} 个文件`, `${number.format(count)} ${count === 1 ? 'file' : 'files'}`),
    fileSize: (size) => `${bytes.format(size)} B`,
    filesTruncated: choose(
      '文件列表已达到 Host 返回上限，未显示更多文件。',
      'The Host returned a capped file list; more files are not shown.',
    ),
    missingEntry: choose('此技能没有可读取的 SKILL.md 正文。', 'This skill has no readable SKILL.md entry.'),
    entryTruncated: choose(
      '技能正文已截断，以下内容可能不完整。',
      'The skill body was truncated and may be incomplete.',
    ),
    fileLoading: choose('正在读取文件…', 'Reading file…'),
    fileMissing: choose('此文件已不在技能目录中。', 'This file is no longer in the skill directory.'),
    fileRetry: choose('重新读取文件', 'Read file again'),
    fileTruncated: choose(
      '文件内容已截断，以下内容可能不完整。',
      'The file content was truncated and may be incomplete.',
    ),
    error: (code) =>
      choose(`无法加载技能详情（${code}）。请重试。`, `Could not load skill details (${code}). Try again.`),
    fileError: (code) => choose(`无法读取文件（${code}）。请重试。`, `Could not read the file (${code}). Try again.`),
    pagination: {
      previous: choose('上一页', 'Previous page'),
      next: choose('下一页', 'Next page'),
      page: (page, pages, count) =>
        choose(
          `第 ${number.format(page)} / ${number.format(pages)} 页 · ${number.format(count)} 项`,
          `Page ${number.format(page)} of ${number.format(pages)} · ${number.format(count)} items`,
        ),
    },
  }
}
