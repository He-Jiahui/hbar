import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { HbarError, LOCAL_EXECUTION_ENABLED } from '@hbar/contracts'
import type { LocalExecutionPolicy } from '@hbar/contracts/local-execution-policy'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import { z } from 'zod'
import {
  canonicalSkillRoot,
  checkSkillSignal,
  readSkillText,
  SKILL_LIMITS,
  skillDirectoryEntries,
  skillResourceFiles,
  withinSkillRoot,
} from './files'
import { parseSkillImplicitPolicy, parseSkillMetadata } from './metadata'
import { rankSkills } from './ranking'

export interface RuntimeSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly scope: 'workspace' | 'global'
  readonly directory: string
  readonly entryPath: string
  readonly implicit: boolean
}
export interface SkillCatalogSnapshot {
  readonly skills: readonly RuntimeSkill[]
  readonly revision: string
  readonly warnings: readonly string[]
  readonly truncated: boolean
}
export const skillSearchInputSchema = z.strictObject({
  query: z.string().max(4_000).optional(),
  cursor: z.string().max(1_024).optional(),
  limit: z.number().int().min(1).max(20).optional(),
})
export const skillReadInputSchema = z.strictObject({
  name: z.string().min(1).max(160),
  path: z.string().min(1).max(4_000),
  offset: z.number().int().nonnegative().optional(),
  revision: z
    .string()
    .regex(/^[a-f0-9]{24}$/u)
    .optional(),
})
const cursorSchema = z.strictObject({ revision: z.string(), query: z.string(), offset: z.number().int().nonnegative() })
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export function createRuntimeSkillCatalog(
  globalRoot: string,
  localExecutionPolicy: LocalExecutionPolicy = LOCAL_EXECUTION_ENABLED,
) {
  const cache = new Map<string, { savedAt: number; snapshot: SkillCatalogSnapshot }>()
  let active = 0
  async function operation<T>(signal: AbortSignal | undefined, execute: () => Promise<T>): Promise<T> {
    checkSkillSignal(signal)
    if (active >= SKILL_LIMITS.concurrency) throw new HbarError('BUSY', 'Skill discovery capacity is exhausted')
    active++
    try {
      const result = await execute()
      checkSkillSignal(signal)
      return result
    } finally {
      active--
    }
  }
  async function discover(workspace: string, signal?: AbortSignal): Promise<SkillCatalogSnapshot> {
    const roots: { path: string; scope: RuntimeSkill['scope']; boundary: string | undefined }[] = []
    if (localExecutionPolicy.enabled) {
      const boundary = await realpath(workspace)
      for (const path of [
        '.hbar/skills',
        '.agents/skills',
        '.claude/skills',
        '.codex/skills',
        '.opencode/skills',
        '.opencode/skill',
      ])
        roots.push({ path: resolve(workspace, path), scope: 'workspace', boundary })
    }
    roots.push({ path: resolve(globalRoot), scope: 'global', boundary: undefined })
    const skills: RuntimeSkill[] = []
    const warnings: string[] = []
    const names = new Set<string>()
    const visited = new Set<string>()
    let scanned = 0
    let truncated = false
    async function visit(directory: string, scope: RuntimeSkill['scope'], depth: number): Promise<void> {
      checkSkillSignal(signal)
      if (scanned >= SKILL_LIMITS.entries || skills.length >= SKILL_LIMITS.skills || depth > SKILL_LIMITS.depth) {
        truncated = true
        return
      }
      const entries = await skillDirectoryEntries(directory, SKILL_LIMITS.entries - scanned, signal)
      scanned += entries.length
      const entry = entries.find((item) => item.name === 'SKILL.md' && item.isFile())
      if (entry) {
        try {
          const metadata = parseSkillMetadata(
            await readSkillText(directory, 'SKILL.md', signal, SKILL_LIMITS.metadataBytes),
            basename(directory),
          )
          let implicit = metadata.implicit
          if (entries.some((item) => item.name === 'agents' && item.isDirectory())) {
            try {
              implicit =
                implicit &&
                parseSkillImplicitPolicy(
                  await readSkillText(directory, 'agents/openai.yaml', signal, SKILL_LIMITS.metadataBytes),
                )
            } catch (error) {
              if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            }
          }
          const key = metadata.name.toLocaleLowerCase('en-US')
          if (!names.has(key)) {
            names.add(key)
            skills.push({
              ...metadata,
              implicit,
              id: `skill_${fingerprint(directory)}`,
              scope,
              directory,
              entryPath: join(directory, 'SKILL.md'),
            })
          }
        } catch (error) {
          checkSkillSignal(signal)
          const code = error instanceof HbarError ? error.code : 'SKILL_DISCOVERY_FAILED'
          if (warnings.length < 20) warnings.push(`${scope}:${basename(directory)}:${code}`)
        }
        return
      }
      for (const child of entries) {
        if (
          !child.isDirectory() ||
          child.name === 'node_modules' ||
          (child.name.startsWith('.') && child.name !== '.system')
        )
          continue
        const canonical = await canonicalSkillRoot(join(directory, child.name), directory)
        if (canonical) await visit(canonical, scope, depth + 1)
        if (truncated) break
      }
    }
    for (const root of roots) {
      try {
        const canonical = await canonicalSkillRoot(root.path, root.boundary)
        if (!canonical || visited.has(canonical)) continue
        visited.add(canonical)
        await visit(canonical, root.scope, 0)
      } catch (error) {
        checkSkillSignal(signal)
        if (warnings.length < 20)
          warnings.push(
            `${root.scope}:${basename(root.path)}:${error instanceof HbarError ? error.code : 'SKILL_DISCOVERY_FAILED'}`,
          )
      }
    }
    return { skills, warnings, truncated, revision: fingerprint(JSON.stringify(skills)) }
  }
  async function snapshot(workspace: string, signal?: AbortSignal, refresh = false): Promise<SkillCatalogSnapshot> {
    checkSkillSignal(signal)
    if (localExecutionPolicy.enabled) assertLocalWorkspace(workspace)
    const key = localExecutionPolicy.enabled ? resolve(workspace) : '<host-global-skills-only>'
    const saved = cache.get(key)
    if (!refresh && saved && Date.now() - saved.savedAt < SKILL_LIMITS.cacheMilliseconds) return saved.snapshot
    return operation(signal, async () => {
      const result = await discover(key, signal)
      cache.delete(key)
      if (cache.size >= SKILL_LIMITS.cachedWorkspaces) cache.delete(cache.keys().next().value ?? '')
      cache.set(key, { savedAt: Date.now(), snapshot: result })
      return result
    })
  }
  async function search(workspace: string, input: z.output<typeof skillSearchInputSchema>, signal?: AbortSignal) {
    const catalog = await snapshot(workspace, signal, true)
    const query = input.query ?? ''
    const matches = rankSkills(catalog.skills, query)
    let offset = 0
    if (input.cursor) {
      let cursor: z.output<typeof cursorSchema>
      try {
        cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
      } catch {
        throw new HbarError('INVALID_INPUT', 'Skill search cursor is invalid')
      }
      if (cursor.revision !== catalog.revision || cursor.query !== fingerprint(query))
        throw new HbarError('VERSION_CONFLICT', 'Skill catalog or search changed; restart discovery')
      offset = cursor.offset
    }
    const items: RuntimeSkill[] = []
    for (const item of matches.slice(offset, offset + (input.limit ?? 10))) {
      if (items.length && JSON.stringify([...items, item]).length > SKILL_LIMITS.pageCharacters - 2_000) break
      items.push(item)
    }
    const next = offset + items.length
    return {
      items,
      total: matches.length,
      warnings: catalog.warnings,
      truncated: catalog.truncated,
      nextCursor:
        next < matches.length
          ? Buffer.from(
              JSON.stringify({ revision: catalog.revision, query: fingerprint(query), offset: next }),
            ).toString('base64url')
          : null,
    }
  }
  async function read(workspace: string, input: z.output<typeof skillReadInputSchema>, signal?: AbortSignal) {
    const catalog = await snapshot(workspace, signal, true)
    const skill = catalog.skills.find((item) => item.id === input.name || item.name === input.name)
    if (!skill) throw new HbarError('SKILL_NOT_FOUND', 'Skill is unavailable; search the current catalog')
    return operation(signal, async () => {
      const current = await realpath(skill.directory)
      if (
        current !== skill.directory ||
        (skill.scope === 'workspace' && !withinSkillRoot(await realpath(workspace), current))
      )
        throw new HbarError('FORBIDDEN', 'Skill directory changed outside its discovery root')
      const text = await readSkillText(skill.directory, input.path, signal)
      const revision = fingerprint(text)
      if (input.revision && input.revision !== revision)
        throw new HbarError('VERSION_CONFLICT', 'Skill file changed; restart its read')
      const offset = input.offset ?? 0
      if (offset > 0 && !input.revision)
        throw new HbarError('INVALID_INPUT', 'Continued skill reads require the original file revision')
      if (offset > text.length || (offset > 0 && /[\uDC00-\uDFFF]/u.test(text[offset] ?? '')))
        throw new HbarError('INVALID_INPUT', 'Skill resource offset is outside a character boundary')
      let end = Math.min(text.length, offset + SKILL_LIMITS.pageCharacters)
      if (end < text.length && /[\uDC00-\uDFFF]/u.test(text[end] ?? '')) end--
      return {
        skill,
        path: input.path,
        text: text.slice(offset, end),
        revision,
        nextOffset: end < text.length ? end : null,
        totalCharacters: text.length,
      }
    })
  }
  return {
    snapshot,
    search,
    read,
    resources: (skillDirectory: string, signal?: AbortSignal) => {
      return skillResourceFiles(skillDirectory, signal)
    },
    dispose: () => cache.clear(),
  }
}
export type RuntimeSkillCatalog = ReturnType<typeof createRuntimeSkillCatalog>
