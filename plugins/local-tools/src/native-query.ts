import { z } from 'zod'

export interface NativeCommonRequest {
  workspace: string
  path: string
  include: string[]
  exclude: string[]
  includeHidden: boolean
  blocked: string[]
  limit: number
}

export interface NativeSearchRequest extends NativeCommonRequest {
  pattern: string
  literal: boolean
  caseMode: 'sensitive' | 'insensitive' | 'smart'
  beforeContext: number
  afterContext: number
}

export interface NativeReadRequest {
  workspace: string
  path: string
  blocked: string[]
  startLine: number
  lineCount: number
}

const operationCacheStatsSchema = z.strictObject({
  contentHits: z.number().int().nonnegative(),
  contentMisses: z.number().int().nonnegative(),
  matchHits: z.number().int().nonnegative(),
  matchMisses: z.number().int().nonnegative(),
  bytesRead: z.number().int().nonnegative(),
})
const searchResponseSchema = z.strictObject({
  matches: z.array(
    z.strictObject({
      path: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      text: z.string(),
      before: z.array(z.string()),
      after: z.array(z.string()),
    }),
  ),
  truncated: z.boolean(),
  filesChecked: z.number().int().nonnegative(),
  cache: operationCacheStatsSchema,
})
const findResponseSchema = z.strictObject({
  paths: z.array(z.string()),
  truncated: z.boolean(),
  filesChecked: z.number().int().nonnegative(),
})
const readResponseSchema = z.strictObject({
  text: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  nextLine: z.number().int().positive().optional(),
  cacheHit: z.boolean(),
})
const cacheStatsSchema = operationCacheStatsSchema.extend({
  contentEntries: z.number().int().nonnegative(),
  matchEntries: z.number().int().nonnegative(),
  matcherEntries: z.number().int().nonnegative(),
  globEntries: z.number().int().nonnegative(),
  lineIndexEntries: z.number().int().nonnegative(),
  lineIndexBytes: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  maxBytes: z.number().int().nonnegative(),
})

export type NativeSearchResponse = z.infer<typeof searchResponseSchema>
export type NativeFindResponse = z.infer<typeof findResponseSchema>
export type NativeReadResponse = z.infer<typeof readResponseSchema>
export type NativeCacheStats = z.infer<typeof cacheStatsSchema>

interface NativeEngine {
  search(request: string, cancelId: string): Promise<string>
  find(request: string, cancelId: string): Promise<string>
  read(request: string, cancelId: string): Promise<string>
  cancel(cancelId: string): boolean
  invalidate(absolutePath: string): void
  clear(): void
  cacheStats(): string
}

interface NativeEngineConstructor {
  new (maxCacheBytes: number): NativeEngine
}

interface NativeModule {
  WorkspaceQueryEngine: NativeEngineConstructor
  nativeVersion(): string
}

function loadNativeModule(): NativeModule {
  let candidate: unknown
  try {
    candidate = require('../native/hbar_workspace_query.node')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Native workspace query module is unavailable. Run "bun run native:build" first. ${reason}`, {
      cause: error,
    })
  }
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('WorkspaceQueryEngine' in candidate) ||
    typeof candidate.WorkspaceQueryEngine !== 'function' ||
    !('nativeVersion' in candidate) ||
    typeof candidate.nativeVersion !== 'function'
  )
    throw new Error('Native workspace query module has an incompatible API')
  return candidate as NativeModule
}

function parseResult<Result>(schema: z.ZodType<Result>, value: string): Result {
  const decoded: unknown = JSON.parse(value)
  return schema.parse(decoded)
}

const native = loadNativeModule()

export const nativeWorkspaceQueryVersion = native.nativeVersion()

export class NativeWorkspaceQuery {
  readonly #engine: NativeEngine

  constructor(maxCacheBytes = 64 * 1024 * 1024) {
    this.#engine = new native.WorkspaceQueryEngine(maxCacheBytes)
  }

  async search(request: NativeSearchRequest, cancelId: string): Promise<NativeSearchResponse> {
    return parseResult(searchResponseSchema, await this.#engine.search(JSON.stringify(request), cancelId))
  }

  async find(request: NativeCommonRequest, cancelId: string): Promise<NativeFindResponse> {
    return parseResult(findResponseSchema, await this.#engine.find(JSON.stringify(request), cancelId))
  }

  async read(request: NativeReadRequest, cancelId: string): Promise<NativeReadResponse> {
    return parseResult(readResponseSchema, await this.#engine.read(JSON.stringify(request), cancelId))
  }

  cancel(cancelId: string): boolean {
    return this.#engine.cancel(cancelId)
  }

  invalidate(absolutePath: string): void {
    this.#engine.invalidate(absolutePath)
  }

  clear(): void {
    this.#engine.clear()
  }

  cacheStats(): NativeCacheStats {
    return parseResult(cacheStatsSchema, this.#engine.cacheStats())
  }
}
