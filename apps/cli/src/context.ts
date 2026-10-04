import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { CommandError } from '@hbar/commands'

const contextSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1).max(128),
  hostRoot: z.string().min(1),
  owner: z.string().min(1),
  revision: z.number().int().positive(),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
})
export type NamedContext = z.infer<typeof contextSchema>

/** Files belong to this local Host root and OS user; server authority is checked again on use. */
export class NamedContextStore {
  private readonly directory: string
  private readonly hostRoot: string
  private readonly owner: string

  constructor(dataRoot: string) {
    this.hostRoot = resolve(dataRoot)
    this.directory = join(this.hostRoot, 'settings', 'cli-contexts')
    this.owner = userInfo().username
  }

  private path(name: string) {
    if (!name || name.length > 128 || [...name].some((character) => character.charCodeAt(0) < 32))
      throw new CommandError('INVALID_INPUT', 'Context name must contain 1–128 printable characters')
    return join(this.directory, createHash('sha256').update(name).digest('hex'))
  }

  async get(name: string): Promise<NamedContext | null> {
    const directory = this.path(name)
    for (let attempt = 0; attempt < 3; attempt++) {
      const versions = (
        await readdir(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return []
          throw error
        })
      )
        .filter((entry) => /^\d{12}\.json$/.test(entry))
        .sort()
      const latest = versions.at(-1)
      if (!latest) return null
      try {
        const parsed = contextSchema.safeParse(JSON.parse(await readFile(join(directory, latest), 'utf8')) as unknown)
        if (
          !parsed.success ||
          parsed.data.name !== name ||
          parsed.data.hostRoot !== this.hostRoot ||
          parsed.data.owner !== this.owner
        )
          throw new CommandError('INVALID_INPUT', 'Named context is invalid or belongs to another Host/user')
        return parsed.data
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    throw new CommandError('RESULT_UNKNOWN', 'Named context changed while it was being read')
  }

  async set(
    name: string,
    selection: { workspaceId: string; sessionId: string },
    expectedRevision: number | null,
  ): Promise<NamedContext> {
    const directory = this.path(name)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const current = await this.get(name)
    if ((current?.revision ?? null) !== expectedRevision)
      throw new CommandError('REVISION_CONFLICT', 'Named context changed; read its revision and retry')
    const next = contextSchema.parse({
      version: 1,
      name,
      hostRoot: this.hostRoot,
      owner: this.owner,
      revision: (current?.revision ?? 0) + 1,
      ...selection,
    })
    const temporary = join(directory, `.${randomUUID()}.tmp`)
    const destination = join(directory, `${String(next.revision).padStart(12, '0')}.json`)
    try {
      try {
        await writeFile(temporary, `${JSON.stringify(next)}\n`, { flag: 'wx', mode: 0o600 })
        await link(temporary, destination)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new CommandError('REVISION_CONFLICT', 'Named context changed; read its revision and retry')
        throw error
      } finally {
        await rm(temporary, { force: true })
      }
      const cutoff = next.revision - 64
      if (cutoff > 0) {
        const versions = await readdir(directory)
        await Promise.all(
          versions
            .filter((entry) => /^\d{12}\.json$/.test(entry) && Number(entry.slice(0, 12)) <= cutoff)
            .map((entry) => rm(join(directory, entry), { force: true })),
        )
      }
      return next
    } catch (error) {
      if (error instanceof CommandError) throw error
      throw new CommandError('RESULT_UNKNOWN', 'Named context commit requires reconciliation')
    }
  }
}
