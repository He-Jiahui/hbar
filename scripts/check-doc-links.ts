import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface DocumentationLinkProblem {
  sourcePath: string
  target: string
  message: string
}

interface LocalTarget {
  path?: string
  problem?: string
}

const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g

export async function checkDocumentationLinks(root: string): Promise<DocumentationLinkProblem[]> {
  const absoluteRoot = resolve(root)
  const sources = await collectMarkdownSources(absoluteRoot)
  const problems: DocumentationLinkProblem[] = []

  for (const sourcePath of sources) {
    const content = await readFile(sourcePath, 'utf8')
    for (const target of collectLinkTargets(content)) {
      const localTarget = toLocalTarget(target)
      if (localTarget.problem) {
        problems.push({
          sourcePath: displayPath(absoluteRoot, sourcePath),
          target,
          message: localTarget.problem,
        })
        continue
      }
      if (!localTarget.path) continue

      const resolved = resolve(dirname(sourcePath), localTarget.path)
      if (!isInside(absoluteRoot, resolved)) {
        problems.push({
          sourcePath: displayPath(absoluteRoot, sourcePath),
          target,
          message: 'link resolves outside the repository',
        })
        continue
      }

      if (!(await hasMatchingFile(resolved))) {
        problems.push({
          sourcePath: displayPath(absoluteRoot, sourcePath),
          target,
          message: 'target does not exist',
        })
      }
    }
  }

  problems.push(...(await checkWikiNavigation(absoluteRoot)))

  return problems
}

async function checkWikiNavigation(root: string): Promise<DocumentationLinkProblem[]> {
  const wikiRoot = join(root, 'docs', 'wiki')
  if (!(await isFile(join(wikiRoot, 'Home.md')))) return []

  const [home, sidebar] = await Promise.all([
    readFile(join(wikiRoot, 'Home.md'), 'utf8'),
    readFile(join(wikiRoot, '_Sidebar.md'), 'utf8').catch(() => ''),
  ])
  const navigation = `${home}\n${sidebar}`
  const pages = (await collectMarkdownFiles(wikiRoot)).filter((path) => !path.endsWith(`${sep}_Sidebar.md`))
  const problems: DocumentationLinkProblem[] = []

  for (const page of pages) {
    const filename = page.slice(wikiRoot.length + 1)
    const stem = filename.replace(/\.md$/i, '')
    const linked = navigation.includes(`(${filename})`) || navigation.includes(`(${stem})`)
    if (!linked) {
      problems.push({
        sourcePath: displayPath(root, join(wikiRoot, '_Sidebar.md')),
        target: filename,
        message: 'Wiki page is not linked from Home.md or _Sidebar.md',
      })
    }
  }

  return problems
}

async function collectMarkdownSources(root: string): Promise<string[]> {
  const sources = [
    ...(await collectMarkdownFiles(join(root, 'docs'))),
    ...(await collectMarkdownFiles(join(root, '.github'))),
  ]
  for (const name of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
    const sourcePath = join(root, name)
    if (await isFile(sourcePath)) sources.push(sourcePath)
  }
  return sources.sort()
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }

  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(path)))
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(path)
    }
  }
  return files
}

function collectLinkTargets(content: string): string[] {
  const targets: string[] = []
  const prose = content.replace(/```[\s\S]*?```/g, '')
  for (const match of prose.matchAll(inlineLinkPattern)) {
    const target = match[1] ?? match[2]
    if (target) targets.push(target)
  }
  return targets
}

function toLocalTarget(target: string): LocalTarget {
  const trimmed = target.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return {}
  if (!/^[A-Za-z]:[\\/]/.test(trimmed) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return {}

  const path = trimmed.split(/[?#]/, 1)[0]
  if (!path) return {}
  try {
    return { path: decodeURIComponent(path) }
  } catch {
    return { problem: 'link contains invalid percent encoding' }
  }
}

async function hasMatchingFile(target: string): Promise<boolean> {
  const candidates = [target]
  if (!extname(target)) {
    candidates.push(`${target}.md`)
    candidates.push(join(target, 'README.md'))
  }
  for (const candidate of candidates) if (await isFile(candidate)) return true
  return false
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

function displayPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const problems = await checkDocumentationLinks(root)
  if (problems.length > 0) {
    console.error(`Documentation link check found ${problems.length} problem(s):`)
    for (const problem of problems) console.error(`- ${problem.sourcePath}: ${problem.message}: ${problem.target}`)
    process.exitCode = 1
  } else {
    console.log('Documentation link check passed.')
  }
}
