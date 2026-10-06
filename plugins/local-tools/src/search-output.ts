import type { WorkspaceSearchResult } from '@hbar/contracts/workspace-query'
import { displayedSearchPagination, type SearchPagination } from './search-pagination'

const OUTPUT_BYTES = 64 * 1024
const BODY_BYTES = 60 * 1024
const SHORT_PATH_LENGTH = 72

function boundedPrefix(text: string, bytes: number): string {
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(text.slice(0, middle)) <= bytes) low = middle
    else high = middle - 1
  }
  if (low && /[\uD800-\uDBFF]/.test(text[low - 1] ?? '')) low--
  return text.slice(0, low)
}

function pathLabel(path: string): string {
  const safe = path.replace(/[\r\n\t]/g, ' ')
  const chars = [...safe]
  return chars.length <= SHORT_PATH_LENGTH ? safe : `${chars.slice(0, 30).join('')}…${chars.slice(-30).join('')}`
}

function footer(page: SearchPagination | undefined, shown: number, shortened: boolean, folded: boolean): string {
  const lines: string[] = []
  if (folded) {
    lines.push(
      page?.scanComplete && page.remainingMatches === 0 && shortened
        ? `折叠了剩余内容：本页显示 ${shown} 条命中，没有剩余条目；过长的原文或上下文已折叠。`
        : page?.scanComplete && page.totalMatches !== undefined
          ? `折叠了剩余内容：共 ${page.totalMatches} 条命中，本页显示 ${shown} 条，剩余 ${page.remainingMatches ?? 0} 条。`
          : `折叠了剩余内容：本页显示 ${shown} 条；达到条目或文本上限后停止，剩余数量未知（未完整扫描）。`,
    )
  } else if (page && (page.fromIndex > 0 || page.cacheStored || page.cacheLimited)) {
    lines.push(
      `本页显示 ${shown} 条；${page.scanComplete ? `完整搜索共 ${page.totalMatches ?? 0} 条命中` : '剩余数量未知'}。`,
    )
  }
  if (shortened) lines.push('部分命中行或上下文过长，已截短；请用 read_file 按 path 和 line 读取原文。')
  if (page?.scanComplete && (page.folders.length || page.otherMatches)) {
    const groups = page.folders.map((folder) => `${pathLabel(folder.path)}/ ${folder.matches} 条`)
    if (page.otherMatches) groups.push(`其他目录 ${page.otherMatches} 条`)
    lines.push(`剩余分布：${groups.join('；')}${page.foldersCompressed ? '（目录已压缩）' : ''}。`)
  }
  if (page?.cacheStored) lines.push(page.cacheHit ? '完整搜索缓存已复用。' : '完整搜索缓存已保存（有界、临时缓存）。')
  else if (page?.cacheLimited) lines.push('完整扫描已完成，但索引超出缓存容量或无法可靠验证，未保存完整缓存。')
  if (page?.nextIndex !== undefined) {
    lines.push(`继续搜索：保持其余搜索参数不变，设置 from_index=${page.nextIndex}。`)
    if (!page.scanComplete) lines.push('需要精确剩余数量和完整缓存时，设置 fully_scan=true。')
  }
  return lines.length ? `\n[${lines.join('\n')}]\n` : ''
}

/** Host-owned tool copy; pagination details and the short footer agree on displayed hits. */
export function formatSearchText(result: WorkspaceSearchResult) {
  let text = ''
  let bytes = 0
  let shownMatches = 0
  let shortened = false
  for (const match of result.matches) {
    const lines = [
      ...match.before.map((line, index) => `${match.path}-${match.line - match.before.length + index}-${line}\n`),
      `${match.path}:${match.line}:${match.column}:${match.text}\n`,
      ...match.after.map((line, index) => `${match.path}-${match.line + index + 1}-${line}\n`),
    ].join('')
    const cost = Buffer.byteLength(lines)
    if (cost > BODY_BYTES - bytes) {
      if (!shownMatches) {
        // Keep the hit's path/line before optional context when a single row is oversized.
        text = boundedPrefix(`${match.path}:${match.line}:${match.column}:${match.text}\n`, BODY_BYTES)
        shownMatches = 1
        shortened = true
      }
      break
    }
    text += lines
    bytes += cost
    shownMatches++
    shortened ||= Boolean(match.textTruncated)
  }
  const pagination = displayedSearchPagination(result, shownMatches)
  const hidden = shownMatches < result.matches.length
  const folded = hidden || result.truncated || pagination?.nextIndex !== undefined
  if (shortened) text += '\n[tool output truncated]\n'
  if (!shownMatches) text = pagination?.fromIndex ? 'No matches on this page.\n' : 'No matches found.\n'
  const summary = footer(pagination, shownMatches, shortened, folded)
  // Six compact directory groups and numeric metadata cannot exceed this reserved budget.
  const output = text + boundedPrefix(summary, OUTPUT_BYTES - Buffer.byteLength(text))
  return { text: output, truncated: folded || shortened, shownMatches, pagination }
}
