import { encodePath, type SchemaPath } from './path'

export type OptionValue = string | number | boolean
export type LocalizedText =
  { readonly kind: 'i18n'; readonly key: string } | { readonly kind: 'literal'; readonly text: string }
export type OptionContentReport =
  | { readonly kind: 'options'; readonly status: 'unavailable'; readonly reasonCode: string }
  | {
      readonly kind: 'options'
      readonly status: 'ready'
      readonly options: readonly {
        readonly value: OptionValue
        readonly label: LocalizedText
        readonly disabled: boolean
        readonly reason?: LocalizedText
      }[]
      readonly dependencyFingerprint: string
      readonly capabilityRevision: string
      readonly nextCursor?: string
    }

export interface DynamicFieldDescription {
  readonly path: SchemaPath
  readonly valueType: 'string' | 'number' | 'boolean'
  readonly callback?: {
    readonly id: string
    readonly version: number
    readonly dependsOn: readonly SchemaPath[]
  }
}
export interface CompiledContentNode {
  readonly path: string
  readonly valueType: DynamicFieldDescription['valueType']
  readonly callbackId: string
  readonly callbackVersion: number
  readonly dependencies: readonly string[]
}
export interface CompiledContentGraph {
  readonly fields: readonly string[]
  readonly nodes: Readonly<Record<string, CompiledContentNode>>
}
export interface SchemaContentRequest {
  readonly schemaId: string
  readonly schemaVersion: number
  readonly scope: { readonly kind: string; readonly id?: string | undefined }
  readonly formId: string
  readonly formRevision: number
  readonly path: string
  readonly callbackVersion: number
  readonly valueType: DynamicFieldDescription['valueType']
  readonly dependencies: Readonly<Record<string, unknown>>
  readonly dependencyFingerprint: string
  readonly search?: string | undefined
  readonly cursor?: string | undefined
}
export interface SchemaCallbackPort {
  query(
    callbackId: string,
    request: SchemaContentRequest,
    context: { readonly signal: AbortSignal },
  ): Promise<OptionContentReport>
}

export class SchemaContentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SchemaContentError'
  }
}

function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function canonical(value: unknown, seen = new Set<object>()): string {
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint' ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    throw new SchemaContentError('INVALID_INPUT', 'Dynamic content values must be finite JSON data')
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (seen.has(value)) throw new SchemaContentError('INVALID_INPUT', 'Dynamic content values cannot contain cycles')
  seen.add(value)
  if (Array.isArray(value)) {
    const result = '[' + value.map((item) => canonical(item, seen)).join(',') + ']'
    seen.delete(value)
    return result
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new SchemaContentError('INVALID_INPUT', 'Dynamic content values must use plain objects')
  const result =
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key], seen))
      .join(',') +
    '}'
  seen.delete(value)
  return result
}
function fingerprint(value: unknown): string {
  const source = canonical(value)
  if (source.length > 65_536) throw new SchemaContentError('INPUT_TOO_LARGE', 'Dynamic dependencies exceed the limit')
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0')
}

export function compileContentGraph(fields: readonly DynamicFieldDescription[]): CompiledContentGraph {
  if (!fields.length || fields.length > 2_000)
    throw new SchemaContentError('INVALID_SCHEMA', 'Dynamic field count is outside the supported range')
  const paths = fields.map((field) => encodePath(field.path))
  if (new Set(paths).size !== paths.length) throw new SchemaContentError('INVALID_SCHEMA', 'Field paths must be unique')
  const known = new Set(paths)
  const nodes: Record<string, CompiledContentNode> = {}
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!
    const path = paths[index]!
    if (!field.callback) continue
    if (!/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/.test(field.callback.id) || field.callback.version < 1)
      throw new SchemaContentError('INVALID_SCHEMA', 'Callback identity is invalid')
    const dependencies = field.callback.dependsOn.map(encodePath)
    if (dependencies.length > 64 || new Set(dependencies).size !== dependencies.length)
      throw new SchemaContentError('INVALID_SCHEMA', 'Callback dependencies must be bounded and unique')
    const missing = dependencies.find((dependency) => !known.has(dependency))
    if (missing) throw new SchemaContentError('INVALID_SCHEMA', 'Callback dependency does not exist: ' + missing)
    nodes[path] = freeze({
      path,
      valueType: field.valueType,
      callbackId: field.callback.id,
      callbackVersion: field.callback.version,
      dependencies,
    })
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (path: string): void => {
    if (visiting.has(path))
      throw new SchemaContentError('DEPENDENCY_CYCLE', 'Dynamic dependency cycle includes ' + path)
    if (visited.has(path)) return
    visiting.add(path)
    for (const dependency of nodes[path]?.dependencies ?? []) if (nodes[dependency]) visit(dependency)
    visiting.delete(path)
    visited.add(path)
  }
  for (const path of Object.keys(nodes)) visit(path)
  return freeze({ fields: paths, nodes })
}

export interface CallbackRegistration {
  readonly version: number
  readonly valueType: DynamicFieldDescription['valueType']
  execute(request: SchemaContentRequest, context: { readonly signal: AbortSignal }): Promise<OptionContentReport>
}
export function createSchemaCallbackRegistry(): SchemaCallbackPort & {
  registerQuery(id: string, registration: CallbackRegistration): () => void
  list(): readonly { readonly id: string; readonly version: number; readonly valueType: string }[]
  dispose(): void
} {
  const registrations = new Map<string, CallbackRegistration>()
  let disposed = false
  return {
    registerQuery(id, registration) {
      if (disposed) throw new SchemaContentError('DISPOSED', 'Callback registry is disposed')
      if (!/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/.test(id) || registration.version < 1)
        throw new SchemaContentError('INVALID_CALLBACK', 'Callback identity is invalid')
      if (registrations.has(id))
        throw new SchemaContentError('CALLBACK_CONFLICT', 'Callback is already registered: ' + id)
      registrations.set(id, registration)
      return () => {
        if (registrations.get(id) === registration) registrations.delete(id)
      }
    },
    list: () =>
      freeze(
        [...registrations]
          .map(([id, value]) => ({ id, version: value.version, valueType: value.valueType }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    async query(callbackId, request, context) {
      if (disposed) throw new SchemaContentError('DISPOSED', 'Callback registry is disposed')
      const registration = registrations.get(callbackId)
      if (!registration)
        throw new SchemaContentError('CALLBACK_UNAVAILABLE', 'Callback is not registered: ' + callbackId)
      if (registration.version !== request.callbackVersion)
        throw new SchemaContentError('VERSION_MISMATCH', 'Callback version does not match the compiled schema')
      if (registration.valueType !== request.valueType)
        throw new SchemaContentError('INVALID_CALLBACK', 'Callback value type does not match the compiled field')
      context.signal.throwIfAborted()
      return registration.execute(freeze(structuredClone(request)), context)
    },
    dispose() {
      disposed = true
      registrations.clear()
    },
  }
}

function text(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    (item.kind === 'i18n' && typeof item.key === 'string' && item.key.length > 0 && item.key.length <= 256) ||
    (item.kind === 'literal' && typeof item.text === 'string' && item.text.length <= 500)
  )
}
function validateReport(
  report: OptionContentReport,
  node: CompiledContentNode,
  expectedFingerprint: string,
): OptionContentReport {
  if (report.kind !== 'options')
    throw new SchemaContentError('INVALID_OUTPUT', 'Callback returned another content kind')
  if (report.status === 'unavailable') {
    if (!report.reasonCode || report.reasonCode.length > 128)
      throw new SchemaContentError('INVALID_OUTPUT', 'Unavailable reports need a bounded reason code')
    return freeze(structuredClone(report))
  }
  if (
    report.dependencyFingerprint !== expectedFingerprint ||
    !report.capabilityRevision ||
    report.capabilityRevision.length > 256 ||
    report.options.length > 500 ||
    (report.nextCursor !== undefined && report.nextCursor.length > 500)
  )
    throw new SchemaContentError('INVALID_OUTPUT', 'Callback report metadata is invalid or stale')
  const seen = new Set<string>()
  for (const option of report.options) {
    if (
      typeof option.value !== node.valueType ||
      !text(option.label) ||
      (option.reason !== undefined && !text(option.reason))
    )
      throw new SchemaContentError('INVALID_OUTPUT', 'Callback option does not match its field type')
    const key = typeof option.value + ':' + String(option.value)
    if (seen.has(key)) throw new SchemaContentError('INVALID_OUTPUT', 'Callback options contain duplicate values')
    seen.add(key)
  }
  const copy = structuredClone(report)
  if (JSON.stringify(copy).length > 256_000)
    throw new SchemaContentError('INVALID_OUTPUT', 'Callback report exceeds the limit')
  return freeze(copy)
}

export interface ContentResolverOptions {
  readonly graph: CompiledContentGraph
  readonly port: SchemaCallbackPort
  readonly hostId: string
  readonly identityId: string
  readonly maxConcurrent?: number
  readonly cacheCapacity?: number
  readonly cacheTtlMs?: number
}
export interface ResolveContentInput {
  readonly schemaId: string
  readonly schemaVersion: number
  readonly scope: { readonly kind: string; readonly id?: string }
  readonly formId: string
  readonly formRevision: number
  readonly path: SchemaPath
  readonly data: Readonly<Record<string, unknown>>
  readonly search?: string
  readonly cursor?: string
  readonly signal?: AbortSignal
}

export function createContentResolver(options: ContentResolverOptions) {
  if (!options.hostId || !options.identityId)
    throw new SchemaContentError('INVALID_INPUT', 'Host and identity are required')
  const maxConcurrent = options.maxConcurrent ?? 4
  const cacheCapacity = options.cacheCapacity ?? 100
  const cacheTtlMs = options.cacheTtlMs ?? 30_000
  if (
    maxConcurrent < 1 ||
    maxConcurrent > 32 ||
    cacheCapacity < 1 ||
    cacheCapacity > 1_000 ||
    cacheTtlMs < 0 ||
    cacheTtlMs > 300_000
  )
    throw new SchemaContentError('INVALID_INPUT', 'Resolver limits are invalid')
  const active = new Map<string, { generation: number; controller: AbortController }>()
  const cache = new Map<string, { expiresAt: number; report: OptionContentReport }>()
  const waiters: (() => void)[] = []
  let running = 0
  let generation = 0
  let disposed = false
  const acquire = async (signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted()
    if (running < maxConcurrent) {
      running++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        signal.removeEventListener('abort', abort)
        running++
        resolve()
      }
      const abort = () => {
        const index = waiters.indexOf(ready)
        if (index >= 0) waiters.splice(index, 1)
        reject(new SchemaContentError('CANCELLED', 'Content query was cancelled while queued'))
      }
      waiters.push(ready)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  const release = (): void => {
    running--
    waiters.shift()?.()
  }
  return {
    async resolve(input: ResolveContentInput): Promise<OptionContentReport> {
      if (disposed) throw new SchemaContentError('DISPOSED', 'Content resolver is disposed')
      const path = encodePath(input.path)
      const node = options.graph.nodes[path]
      if (!node) throw new SchemaContentError('CONTENT_UNAVAILABLE', 'Field has no dynamic callback: ' + path)
      if (
        !input.formId ||
        input.formRevision < 0 ||
        (input.search !== undefined && input.search.length > 500) ||
        (input.cursor !== undefined && input.cursor.length > 500)
      )
        throw new SchemaContentError('INVALID_INPUT', 'Content request identity or paging input is invalid')
      const slot = input.formId + ':' + path
      active.get(slot)?.controller.abort()
      active.delete(slot)
      const dependencies: Record<string, unknown> = {}
      for (const dependency of node.dependencies) {
        if (!Object.hasOwn(input.data, dependency))
          return freeze({ kind: 'options', status: 'unavailable', reasonCode: 'missing_dependency' })
        dependencies[dependency] = structuredClone(input.data[dependency])
      }
      const dependencyFingerprint = fingerprint(dependencies)
      const request: SchemaContentRequest = freeze({
        schemaId: input.schemaId,
        schemaVersion: input.schemaVersion,
        scope: structuredClone(input.scope),
        formId: input.formId,
        formRevision: input.formRevision,
        path,
        callbackVersion: node.callbackVersion,
        valueType: node.valueType,
        dependencies,
        dependencyFingerprint,
        ...(input.search !== undefined ? { search: input.search } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      const cacheKey = canonical({
        hostId: options.hostId,
        identityId: options.identityId,
        callbackId: node.callbackId,
        callbackVersion: node.callbackVersion,
        valueType: node.valueType,
        schemaId: request.schemaId,
        schemaVersion: request.schemaVersion,
        scope: request.scope,
        path: request.path,
        dependencies: request.dependencies,
        search: request.search ?? null,
        cursor: request.cursor ?? null,
      })
      const cached = cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) return cached.report
      if (cached) cache.delete(cacheKey)
      const controller = new AbortController()
      const current = ++generation
      active.set(slot, { generation: current, controller })
      const abort = () => controller.abort()
      if (input.signal?.aborted) controller.abort()
      else input.signal?.addEventListener('abort', abort, { once: true })
      try {
        await acquire(controller.signal)
        let raw: OptionContentReport
        try {
          raw = await options.port.query(node.callbackId, request, { signal: controller.signal })
        } finally {
          release()
        }
        if (disposed || active.get(slot)?.generation !== current)
          throw new SchemaContentError('CONTENT_SUPERSEDED', 'A newer dependency generation replaced this result')
        controller.signal.throwIfAborted()
        const report = validateReport(raw, node, dependencyFingerprint)
        cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, report })
        while (cache.size > cacheCapacity) cache.delete(cache.keys().next().value!)
        return report
      } catch (error) {
        if (error instanceof SchemaContentError) {
          if (controller.signal.aborted && active.get(slot)?.generation !== current)
            throw new SchemaContentError('CONTENT_SUPERSEDED', 'A newer dependency generation replaced this result')
          throw error
        }
        if (controller.signal.aborted)
          throw new SchemaContentError(
            active.get(slot)?.generation === current ? 'CANCELLED' : 'CONTENT_SUPERSEDED',
            'Content query was cancelled',
          )
        throw new SchemaContentError('CALLBACK_FAILED', error instanceof Error ? error.message : String(error))
      } finally {
        input.signal?.removeEventListener('abort', abort)
        if (active.get(slot)?.generation === current) active.delete(slot)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const request of active.values()) request.controller.abort()
      active.clear()
      cache.clear()
      for (const ready of waiters.splice(0)) ready()
    },
  }
}
