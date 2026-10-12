import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import postcss, { type AtRule } from 'postcss'

export type ResponsiveRuleKind = 'media' | 'container'

const viewportBoundaries = new Set([40, 48, 64])
const widthCondition = /\(\s*width\s*(<=|>=|<|>)\s*([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)\s*\)/gi
const legacyWidthCondition = /\(\s*(?:max|min)-width\s*:/i
const cssImport = /(?:@import\s+|import\s+(?:[^'";]*?\s+from\s*)?)['"]([^'"]+\.css)['"]/g

export function validateResponsiveRule(kind: ResponsiveRuleKind, params: string): string[] {
  if (!/width/i.test(params)) return []
  const errors: string[] = []
  if (legacyWidthCondition.test(params)) errors.push('Use range syntax instead of max-width/min-width.')
  const matches = [...params.matchAll(widthCondition)]
  if (matches.length === 0) {
    errors.push('Width query must use a recognized width range condition.')
    return errors
  }
  for (const match of matches) {
    const operator = match[1]
    const value = Number(match[2])
    const unit = match[3]?.toLowerCase()
    if (unit !== 'rem' || !['<', '>='].includes(operator ?? '')) {
      errors.push(`Use strict half-open rem ranges (< or >=), found ${match[0]}.`)
      continue
    }
    if (kind === 'media' && !viewportBoundaries.has(value)) {
      errors.push(`Viewport media must use 40rem, 48rem, or 64rem, found ${value}rem.`)
    }
  }
  return errors
}

async function walkCss(root: string): Promise<string[]> {
  const files: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'react-bits') await visit(path)
      } else if (entry.isFile() && extname(path) === '.css' && entry.name !== 'gallery-theme.css') {
        files.push(path)
      }
    }
  }
  await visit(root)
  return files.sort()
}

export async function lumenProductionCss(root: string): Promise<string[]> {
  const source = resolve(root, 'packages/lumen-app-ui/src')
  const pending = [resolve(source, 'styles.css'), resolve(source, 'workbench-component-styles.ts')]
  const files = new Set<string>()
  while (pending.length > 0) {
    const path = pending.pop()
    if (!path || files.has(path)) continue
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      throw new Error(`Unable to read responsive production CSS entry/import ${relative(root, path)}.`, { cause: error })
    }
    files.add(path)
    for (const match of text.matchAll(cssImport)) {
      const importedPath = match[1]
      if (!importedPath) throw new Error(`Empty CSS import found in ${relative(root, path)}.`)
      const next = resolve(dirname(path), importedPath)
      const fromSource = relative(source, next)
      if (fromSource === '..' || fromSource.startsWith(`..${sep}`)) {
        throw new Error(`Production CSS import escapes its package source: ${relative(root, path)} -> ${importedPath}.`)
      }
      if (!files.has(next)) pending.push(next)
    }
  }
  return [...files].filter((path) => extname(path) === '.css').sort()
}

export interface ResponsiveAuditSummary {
  readonly cssFiles: number
  readonly widthQueries: number
  readonly mediaWidthQueries: number
  readonly containerWidthQueries: number
  readonly widthConditions: number
  readonly namedContainers: number
  readonly errors: readonly string[]
}

export async function auditResponsiveCss(root = process.cwd()): Promise<ResponsiveAuditSummary> {
  const files = new Set([
    ...(await walkCss(resolve(root, 'apps/web/src'))),
    ...(await walkCss(resolve(root, 'packages/app-react/src'))),
    ...(await lumenProductionCss(root)),
  ])
  const errors: string[] = []
  const namedContainers = new Set<string>()
  const namedContainerQueries: { readonly path: string; readonly name: string; readonly params: string }[] = []
  let widthQueries = 0
  let mediaWidthQueries = 0
  let containerWidthQueries = 0
  let widthConditions = 0
  for (const path of [...files].sort()) {
    const text = await readFile(path, 'utf8')
    const stylesheet = postcss.parse(text, { from: path })
    stylesheet.walkDecls((declaration) => {
      if (declaration.prop === 'container-name') {
        for (const name of declaration.value.split(/\s+/)) {
          if (name && name !== 'none' && name !== 'normal') namedContainers.add(name)
        }
      } else if (declaration.prop === 'container') {
        const name = declaration.value.split('/')[0]?.trim()
        if (name && name !== 'none' && name !== 'normal') namedContainers.add(name)
      }
    })
    stylesheet.walkAtRules(/^(media|container)$/i, (rule: AtRule) => {
      if (rule.name.toLowerCase() === 'container') {
        const name = rule.params.match(/^([\w-]+)\s*\(/)?.[1]
        if (name) namedContainerQueries.push({ path, name, params: rule.params })
      }
      if (!/width/i.test(rule.params)) return
      widthQueries += 1
      if (rule.name.toLowerCase() === 'media') mediaWidthQueries += 1
      else containerWidthQueries += 1
      const conditions = [...rule.params.matchAll(widthCondition)]
      widthConditions += conditions.length
      for (const message of validateResponsiveRule(rule.name.toLowerCase() as ResponsiveRuleKind, rule.params)) {
        errors.push(`${relative(root, path)}: ${message} @${rule.name} ${rule.params}`)
      }
    })
  }
  for (const query of namedContainerQueries) {
    if (!namedContainers.has(query.name)) {
      errors.push(`${relative(root, query.path)}: @container ${query.params} has no declared named container.`)
    }
  }
  return {
    cssFiles: files.size,
    widthQueries,
    mediaWidthQueries,
    containerWidthQueries,
    widthConditions,
    namedContainers: namedContainers.size,
    errors,
  }
}

if (import.meta.main) {
  const result = await auditResponsiveCss()
  console.log(
    `Responsive CSS: ${result.cssFiles} files, ${result.mediaWidthQueries} viewport media / ` +
      `${result.containerWidthQueries} container width queries, ` +
      `${result.widthConditions} conditions, ${result.errors.length} invalid`,
  )
  for (const error of result.errors) console.error(error)
  if (result.errors.length > 0) process.exitCode = 1
}
