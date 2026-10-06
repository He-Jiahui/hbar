import { copyFile, lstat, mkdir, open, opendir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  skillImportJobSchema,
  skillImportStartSchema,
  type SkillImportJob,
  type SkillImportPreview,
  type SkillImportRequest,
  type SkillImportStart,
  type SkillImportWarning,
} from '@hbar/contracts/commands/skill-import'

const MAX_FILES = 256
const MAX_BYTES = 32 * 1024 ** 2
const MAX_TOTAL_BYTES = 128 * 1024 ** 2
const MAX_ENTRY_BYTES = 256 * 1024
interface FilePlan {
  path: string
  target: string
  size: number
  modified: number
}
interface SkillPlan {
  id: string
  name: string
  path: string
  files: FilePlan[]
  warnings: SkillImportWarning[]
  invalid: boolean
}
const journalSchema = z.strictObject({
  owner: z.string().max(160),
  input: skillImportStartSchema,
  fingerprint: z.string().max(128),
  job: skillImportJobSchema,
})
type Journal = z.output<typeof journalSchema>
const markerSchema = z.strictObject({ operationId: z.string().max(160), fingerprint: z.string().max(128) })
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function within(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}
function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new HbarError('CANCELLED', 'Skill import cancelled')
}
function reason(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'SKILL_IMPORT_FAILED'
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (reason(error) === 'ENOENT') return false
    throw error
  }
}
async function json(path: string): Promise<unknown | null> {
  try {
    if ((await lstat(path)).size > 1024 ** 2) throw new HbarError('SKILL_IMPORT_LIMIT', 'Import journal is too large')
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    if (reason(error) === 'ENOENT') return null
    throw error
  }
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify(value))
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
function entry(
  text: string,
  folder: string,
): { name: string; description: string; body: string; warnings: SkillImportWarning[] } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  const warnings: SkillImportWarning[] = []
  let name = folder
  let description = ''
  if (match) {
    const parsed: unknown = Bun.YAML.parse(match[1]!)
    const data = z.record(z.string(), z.unknown()).parse(parsed)
    if (typeof data.name === 'string' && data.name.trim()) name = data.name.trim().slice(0, 256)
    if (typeof data.description === 'string') description = data.description.trim().slice(0, 8_000)
    if (Object.keys(data).some((key) => key !== 'name' && key !== 'description')) warnings.push('platform_metadata')
  }
  const body = match ? text.slice(match[0].length) : text
  if (!description)
    description =
      body
        .split(/\r?\n/)
        .find((line) => line.trim() && !line.startsWith('#'))
        ?.trim()
        .slice(0, 8_000) ?? name
  if (/\b(?:CODEX_HOME|TodoWrite|AskUserQuestion|Claude Agent SDK)\b|mcp__|\.claude|\.codex|functions\.exec/.test(body))
    warnings.push('platform_references')
  return { name, description, body, warnings }
}
/** Rewrite Markdown documentation only. Code fences, scripts and binaries keep their original content. */
export function convertSkillMarkdown(text: string, destination: string): string {
  let fence: string | null = null
  return text
    .split(/(?<=\n)/)
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (marker) {
        if (fence === null) fence = marker[0]!
        else if (fence === marker[0]) fence = null
        return line
      }
      if (fence) return line
      return line
        .replace(/\bCLAUDE\.md\b/gi, 'AGENTS.md')
        .replace(/(?<![\w./-])(?:Claude Code|Codex(?: CLI)?)(?![\w/-])/gi, 'hbar')
        .replace(/(?:~\/\.claude\/skills|~\/\.codex\/skills|~\/\.agents\/skills|\$CODEX_HOME\/skills)/g, () =>
          destination.replaceAll('\\', '/'),
        )
    })
    .join('')
}
export interface SkillImportServiceOptions {
  readonly destination: string
  readonly journalRoot: string
  readonly sources?: Partial<Record<SkillImportRequest['source'], readonly string[]>>
}
export function createSkillImportService(options: SkillImportServiceOptions) {
  const destination = resolve(options.destination)
  const journalRoot = resolve(options.journalRoot)
  const active = new Map<string, { controller: AbortController; work: Promise<void> }>()
  let starting = false
  let acceptance: Promise<void> | null = null
  let disposed = false
  let previews = 0
  const journalPath = (id: string) => join(journalRoot, `${digest(id)}.json`)
  const latestPath = (owner: string) => join(journalRoot, `latest-${digest(owner)}.json`)
  const cancelPath = (id: string) => join(journalRoot, `cancel-${digest(id)}.json`)
  const rootsFor = (request: SkillImportRequest): readonly string[] => {
    if (request.sourceRoot) {
      if (!isAbsolute(request.sourceRoot) || request.sourceRoot.includes('\0'))
        throw new HbarError('SKILL_SOURCE_INVALID', 'Use an absolute source directory')
      return [resolve(request.sourceRoot)]
    }
    return (
      options.sources?.[request.source] ??
      (request.source === 'claude'
        ? [join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'skills')]
        : [join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'skills'), join(homedir(), '.agents', 'skills')])
    )
  }
  const scan = async (
    request: SkillImportRequest,
    signal?: AbortSignal,
  ): Promise<{ preview: SkillImportPreview; plans: SkillPlan[] }> => {
    if (previews >= 2 || disposed) throw new HbarError('SKILL_IMPORT_BUSY', 'Skill discovery is busy')
    previews++
    try {
      const roots = rootsFor(request)
      const plans: SkillPlan[] = []
      const names = new Set<string>()
      let truncated = false
      let totalBytes = 0
      let scanned = 0
      for (const source of roots) {
        check(signal)
        if (!(await exists(source))) continue
        const root = await realpath(source)
        const target = await realpath(destination)
        if (within(root, target) || within(target, root))
          throw new HbarError('SKILL_SOURCE_INVALID', 'Source and destination must be separate')
        for await (const directory of await opendir(root)) {
          if (++scanned > 4_096) {
            truncated = true
            break
          }
          check(signal)
          if (directory.name.startsWith('.') || !directory.isDirectory()) continue
          if (plans.length >= 128) {
            truncated = true
            break
          }
          const id = directory.name
          const path = join(root, id)
          if (!(await exists(join(path, 'SKILL.md')))) continue
          const plan: SkillPlan = { id, name: id, path, files: [], warnings: [], invalid: false }
          try {
            if (
              id.length > 128 ||
              /[<>:"/\\|?*]/u.test(id) ||
              [...id].some((character) => character.charCodeAt(0) < 0x20) ||
              /[. ]$/.test(id) ||
              /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id)
            )
              throw new HbarError('unsafe_file', 'Invalid skill directory name')
            const key = process.platform === 'win32' ? id.toLowerCase() : id
            if (names.has(key)) {
              plan.invalid = true
              plan.warnings.push('duplicate_source')
            }
            names.add(key)
            let size = 0
            let entries = 0
            const walk = async (folder: string, depth: number): Promise<void> => {
              if (depth > 16) throw new HbarError('file_limit', 'Skill nesting limit exceeded')
              for await (const file of await opendir(folder)) {
                if (++entries > 1_024) throw new HbarError('file_limit', 'Too many skill directories')
                check(signal)
                if (file.name === '.git' || file.name === 'node_modules' || file.name === '.hbar-import.json')
                  throw new HbarError('unsafe_file', 'Reserved skill asset directory')
                const child = join(folder, file.name)
                const info = await lstat(child)
                if (info.isSymbolicLink()) throw new HbarError('unsafe_file', 'Skill assets cannot be links')
                if (info.isDirectory()) await walk(child, depth + 1)
                else if (info.isFile()) {
                  if (++size > MAX_FILES) throw new HbarError('file_limit', 'Too many skill files')
                  const relativePath = relative(path, child)
                  const output =
                    relativePath.toLowerCase() === 'skill.md'
                      ? 'SKILL.md'
                      : basename(relativePath).toLowerCase() === 'claude.md'
                        ? join(dirname(relativePath), 'AGENTS.md')
                        : relativePath
                  if (plan.files.some((item) => item.target.toLowerCase() === output.toLowerCase()))
                    throw new HbarError('document_collision', 'Converted document names collide')
                  plan.files.push({ path: relativePath, target: output, size: info.size, modified: info.mtimeMs })
                } else throw new HbarError('unsafe_file', 'Skill assets require regular files')
              }
            }
            await walk(path, 0)
            plan.files.sort((left, right) => left.path.localeCompare(right.path))
            const bytes = plan.files.reduce((sum, file) => sum + file.size, 0)
            totalBytes += bytes
            if (
              bytes > MAX_BYTES ||
              totalBytes > MAX_TOTAL_BYTES ||
              (await lstat(join(path, 'SKILL.md'))).size > MAX_ENTRY_BYTES
            )
              throw new HbarError('file_limit', 'Skill size limit exceeded')
            const parsed = entry(await readFile(join(path, 'SKILL.md'), 'utf8'), id)
            plan.name = parsed.name
            plan.warnings.push(...parsed.warnings)
          } catch (error) {
            if (reason(error) === 'CANCELLED') throw error
            plan.invalid = true
            const warning = reason(error)
            plan.warnings.push(
              warning === 'unsafe_file' || warning === 'file_limit' || warning === 'document_collision'
                ? warning
                : 'invalid_entry',
            )
          }
          plans.push(plan)
        }
      }
      plans.sort((a, b) => a.path.localeCompare(b.path))
      const candidates: SkillImportPreview['candidates'] = []
      for (const plan of plans)
        candidates.push({
          id: plan.id,
          name: plan.name,
          sourcePath: plan.path,
          status: plan.invalid ? 'invalid' : (await exists(join(destination, plan.id))) ? 'existing' : 'ready',
          warnings: [...new Set(plan.warnings)],
          files: plan.files.length,
          bytes: plan.files.reduce((sum, file) => sum + file.size, 0),
        })
      return {
        preview: { request, sourceRoots: [...roots], destination, revision: digest(plans), candidates, truncated },
        plans,
      }
    } finally {
      previews--
    }
  }
  const readJournal = async (id: string, owner: string): Promise<Journal | null> => {
    const value = await json(journalPath(id))
    if (value === null) return null
    const journal = journalSchema.parse(value)
    if (journal.owner !== owner || journal.input.operationId !== id)
      throw new HbarError('FORBIDDEN', 'Import belongs to another device')
    journal.job.destination = destination
    return journal
  }
  const run = async (journal: Journal, signal: AbortSignal): Promise<void> => {
    let staging: string | null = null
    try {
      const { preview, plans } = await scan(journal.input.request, signal)
      if (preview.revision !== journal.input.expectedRevision)
        throw new HbarError('SKILL_SOURCE_CHANGED', 'Source skills changed; preview again')
      for (const plan of plans) {
        check(signal)
        if (journal.job.items.some((item) => item.id === plan.id)) continue
        const target = join(destination, plan.id)
        let status: SkillImportJob['items'][number]['status'] = 'invalid'
        if (!plan.invalid && (await exists(target))) {
          const targetInfo = await lstat(target)
          const marker =
            targetInfo.isDirectory() && !targetInfo.isSymbolicLink()
              ? await json(join(target, '.hbar-import.json')).catch(() => null)
              : null
          const parsed = markerSchema.safeParse(marker)
          status =
            parsed.success &&
            parsed.data.operationId === journal.input.operationId &&
            parsed.data.fingerprint === journal.fingerprint
              ? 'imported'
              : 'skipped'
        } else if (!plan.invalid) {
          staging = join(
            destination,
            `.hbar-import-${digest(journal.input.operationId).slice(0, 16)}-${crypto.randomUUID()}`,
          )
          await mkdir(staging)
          for (const file of plan.files) {
            check(signal)
            const source = join(plan.path, file.path)
            const info = await lstat(source)
            if (
              !info.isFile() ||
              info.isSymbolicLink() ||
              info.size !== file.size ||
              info.mtimeMs !== file.modified ||
              !within(plan.path, await realpath(source))
            )
              throw new HbarError('SKILL_SOURCE_CHANGED', 'Skill assets changed during import')
            const output = join(staging, file.target)
            await mkdir(dirname(output), { recursive: true })
            if (file.path.toLowerCase() === 'skill.md') {
              const parsed = entry(await readFile(source, 'utf8'), plan.id)
              await writeFile(
                output,
                `---\nname: ${JSON.stringify(parsed.name)}\ndescription: ${JSON.stringify(parsed.description)}\n---\n\n${convertSkillMarkdown(parsed.body, destination)}`,
                { flag: 'wx', mode: info.mode & 0o777 },
              )
            } else if (file.path.toLowerCase().endsWith('.md') && file.size <= MAX_ENTRY_BYTES)
              await writeFile(output, convertSkillMarkdown(await readFile(source, 'utf8'), destination), {
                flag: 'wx',
                mode: info.mode & 0o777,
              })
            else await copyFile(source, output, constants.COPYFILE_EXCL)
          }
          await writeFile(
            join(staging, '.hbar-import.json'),
            JSON.stringify({ operationId: journal.input.operationId, fingerprint: journal.fingerprint }),
            { flag: 'wx', mode: 0o600 },
          )
          check(signal)
          if (await exists(target)) status = 'skipped'
          else {
            await rename(staging, target)
            staging = null
            status = 'imported'
          }
        }
        if (staging) {
          await removeStaging(staging)
          staging = null
        }
        journal.job.items.push({ id: plan.id, status, warnings: [...new Set(plan.warnings)] })
        await atomicJson(journalPath(journal.input.operationId), journal)
      }
      journal.job.status = 'succeeded'
    } catch (error) {
      if (disposed && signal.aborted) return
      journal.job.status = reason(error) === 'CANCELLED' ? 'cancelled' : 'failed'
      journal.job.error = reason(error).slice(0, 128)
    } finally {
      if (staging) await removeStaging(staging)
    }
    await atomicJson(journalPath(journal.input.operationId), journal)
  }
  const removeStaging = async (path: string) => {
    const normalized = resolve(path)
    if (dirname(normalized) !== destination || !basename(normalized).startsWith('.hbar-import-'))
      throw new HbarError('FORBIDDEN', 'Invalid import staging path')
    await rm(normalized, { recursive: true, force: true })
  }
  const launch = (journal: Journal) => {
    if (active.has(journal.input.operationId) || disposed) return
    if (active.size) throw new HbarError('SKILL_IMPORT_BUSY', 'Another skill import is running')
    const controller = new AbortController()
    const work = run(journal, controller.signal)
      .catch(async (error: unknown) => {
        journal.job.status = 'failed'
        journal.job.error = reason(error).slice(0, 128)
        try {
          await atomicJson(journalPath(journal.input.operationId), journal)
        } catch {
          /* A read will recover the persisted running intent. */
        }
      })
      .finally(() => active.delete(journal.input.operationId))
    active.set(journal.input.operationId, { controller, work })
  }
  const get = async (operationId: string, owner: string) => {
    const journal = await readJournal(operationId, owner)
    if (!journal) return null
    if (journal.job.status === 'running' && !active.has(operationId)) launch(journal)
    return journal.job
  }
  return {
    async preview(request: SkillImportRequest, signal?: AbortSignal) {
      await mkdir(destination, { recursive: true })
      return (await scan(request, signal)).preview
    },
    async start(input: SkillImportStart, owner: string): Promise<SkillImportJob> {
      if (starting || disposed) throw new HbarError('SKILL_IMPORT_BUSY', 'Skill import is busy')
      starting = true
      let accepted = () => {}
      acceptance = new Promise<void>((settle) => {
        accepted = settle
      })
      try {
        const existing = await readJournal(input.operationId, owner)
        const fingerprint = digest({ input, owner })
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Operation ID has different input')
          return (await get(input.operationId, owner))!
        }
        if (active.size) throw new HbarError('SKILL_IMPORT_BUSY', 'Another skill import is running')
        const journal: Journal = {
          owner,
          input,
          fingerprint,
          job: {
            operationId: input.operationId,
            request: input.request,
            destination,
            status: 'running',
            items: [],
            error: null,
          },
        }
        const cancellation = await json(cancelPath(input.operationId))
        if (cancellation === owner) {
          journal.job.status = 'cancelled'
          journal.job.error = 'CANCELLED'
        }
        await mkdir(destination, { recursive: true })
        await atomicJson(journalPath(input.operationId), journal)
        await atomicJson(latestPath(owner), input.operationId)
        if (journal.job.status === 'running') launch(journal)
        return journal.job
      } finally {
        starting = false
        accepted()
        acceptance = null
      }
    },
    get,
    async latest(owner: string) {
      const id = await json(latestPath(owner))
      return typeof id === 'string' ? get(id, owner) : null
    },
    async cancel(operationId: string, owner: string) {
      if (acceptance) await acceptance
      const journal = await readJournal(operationId, owner)
      await atomicJson(cancelPath(operationId), owner)
      if (!journal || journal.job.status !== 'running') return journal?.job ?? null
      const task = active.get(operationId)
      if (task) {
        task.controller.abort()
        await task.work
      } else {
        journal.job.status = 'cancelled'
        journal.job.error = 'CANCELLED'
        await atomicJson(journalPath(operationId), journal)
      }
      return (await readJournal(operationId, owner))?.job ?? null
    },
    async dispose() {
      disposed = true
      for (const task of active.values()) task.controller.abort()
      await Promise.allSettled([...active.values()].map((task) => task.work))
    },
  }
}
export type SkillImportService = ReturnType<typeof createSkillImportService>
