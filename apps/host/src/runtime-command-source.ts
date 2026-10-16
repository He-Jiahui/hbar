import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { toolFileChangeSchema, MAX_RUN_CHANGE_BYTES, type ToolFileChange } from '@hbar/contracts/run-file-changes'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node-authority'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import { RUNTIME_APPLICATION_METHODS } from '@hbar/kernel/runtime-application'
import {
  osConfinementOptionsSchema,
  type ExecutionProvider,
  type GitService,
  type ToolContext,
  type BrowserUseService,
  type ComputerUseService,
} from '@hbar/plugin-sdk'
import { RuntimeValuePort, type IpcPeer } from '@hbar/runtime'
import type { HostSourceApplication } from './command-execution-scopes'
import { sessionCommandSourceSchema } from '@hbar/kernel/session-command-port'
import { createRuntimeGitSource } from './runtime-git-source'

type Target = 'execution' | 'workspaceQuery' | 'git' | 'launchTarget' | 'workspaceSandbox' | 'browser' | 'computer'
export type RuntimeCommandSourceMethod = Exclude<
  {
    [Name in Target]: `${Name}.${(typeof RUNTIME_APPLICATION_METHODS)[Name][number]}`
  }[Target],
  'git.forRun'
>
const declared = new Set<string>(
  (['execution', 'workspaceQuery', 'git', 'launchTarget', 'workspaceSandbox', 'browser', 'computer'] as const)
    .flatMap((target) => RUNTIME_APPLICATION_METHODS[target].map((method) => `${target}.${method}`))
    .filter((method) => method !== 'git.forRun'),
)
export const runtimeCommandSourceSchema = sessionCommandSourceSchema
export function isRuntimeCommandSourceMethod(value: unknown): value is RuntimeCommandSourceMethod {
  return typeof value === 'string' && declared.has(value)
}
export type RuntimeCommandSource = z.output<typeof runtimeCommandSourceSchema>
export interface RuntimeCommandSourceCapabilities {
  readonly execution: ExecutionProvider
  readonly git?: GitService
  readonly browser?: BrowserUseService
  readonly computer?: ComputerUseService
}
export interface OpenCommandSource {
  readonly descriptor: RuntimeCommandSource
  /** Versions returned by actual writes on this source port, never reconstructed from model input. */
  fileChanges(): readonly ToolFileChange[]
  /** Seal new calls and await at most sixteen already accepted operations before disposing the port. */
  close(): Promise<void>
}
const signalArgument: Readonly<Record<string, number>> = {
  'execution.exec': 2,
  'execution.restoreFiles': 2,
  'workspaceQuery.find': 2,
  'workspaceQuery.search': 2,
  'workspaceQuery.readRange': 4,
  'launchTarget.workspaceForRun': 2,
  'workspaceSandbox.prepare': 2,
  'git.info': 1,
  'git.status': 1,
  'git.diff': 2,
  'git.log': 2,
  'git.stats': 2,
  'git.commit': 2,
  'git.stage': 2,
  'git.unstage': 2,
  'git.branch': 2,
  'git.createLaunchBranch': 2,
  'git.worktree': 2,
  'git.launchBranchSnapshot': 1,
  'git.diffToRemote': 1,
  'browser.status': 1,
  'browser.navigate': 4,
  'browser.snapshot': 3,
  'browser.click': 4,
  'browser.type': 5,
  'browser.press': 5,
  'browser.screenshot': 4,
  'browser.evaluate': 4,
  'browser.close': 3,
  'browser.history': 2,
  'computer.status': 1,
  'computer.screenshot': 2,
  'computer.click': 4,
  'computer.doubleClick': 4,
  'computer.type': 3,
  'computer.key': 3,
  'computer.scroll': 4,
  'computer.move': 4,
  'computer.wait': 3,
  'computer.launch': 2,
}

/** Kernel composition: open only inside the admitted tool executor, never during read-only preparation. */
export class RuntimeCommandSources {
  private readonly active = new Set<OpenCommandSource>()
  constructor(private readonly peer: IpcPeer) {}

  open(
    context: ToolContext,
    methods: readonly RuntimeCommandSourceMethod[],
    capabilities: RuntimeCommandSourceCapabilities,
  ): OpenCommandSource {
    context.signal.throwIfAborted()
    if (this.peer.snapshot().failed) throw new HbarError('IPC_DISCONNECTED', 'Source Kernel channel is closed')
    if (this.active.size >= 64) throw new HbarError('BUSY', 'Source command capability capacity is full')
    const authority = nodeCallAuthoritySchema.parse(context.nodeAuthority)
    if (
      authority.sessionId !== context.session.id ||
      authority.runId !== context.run.id ||
      authority.callId !== context.callId
    )
      throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Source capability must belong to this admitted tool call')
    const allowed = z
      .array(z.string().refine((method) => declared.has(method)))
      .max(32)
      .parse(methods)
    if (new Set(allowed).size !== allowed.length)
      throw new HbarError('INVALID_INPUT', 'Source capability methods must be unique')
    const workspace = z.string().min(1).max(4_000).parse(context.workspace.path)
    const timeoutMs = z
      .number()
      .int()
      .min(1)
      .max(1_200_000)
      .parse(context.timeoutMs ?? 120_000)
    const environment = context.environment ? structuredClone(context.environment) : undefined
    const osConfinement = context.osConfinement ? osConfinementOptionsSchema.parse(context.osConfinement) : undefined
    const signal = context.signal
    const git = capabilities.git ? createRuntimeGitSource(capabilities.git, context) : undefined
    const captured = AsyncLocalStorage.snapshot()
    const sourceSessionId = context.session.id,
      sourceWorkspaceId = context.workspace.id
    const resolution = {
      workspaceForRun: async (sessionId: unknown) => {
        if (sessionId !== sourceSessionId)
          throw new HbarError(
            'COMMAND_SOURCE_WORKSPACE_MISMATCH',
            'Source workspace resolution belongs to another session',
          )
        return workspace
      },
      prepare: async (workspaceId: unknown, path: unknown) => {
        if (workspaceId !== sourceWorkspaceId || path !== workspace)
          throw new HbarError(
            'COMMAND_SOURCE_WORKSPACE_MISMATCH',
            'Source workspace mount is already pinned to this Run',
          )
        return workspace
      },
    }
    const descriptor = Object.freeze(
      runtimeCommandSourceSchema.parse({
        prefix: `kernel.command.${crypto.randomUUID()}`,
        sessionId: context.session.id,
        runId: context.run.id,
        callId: context.callId,
      }),
    )
    const values = new RuntimeValuePort(this.peer, {
      prefix: descriptor.prefix,
      callbackTimeoutMs: 1_325_000,
      callbackSettlement: 'physical',
    })
    const pending = new Set<Promise<unknown>>()
    const changes = new Map<string, ToolFileChange>()
    let changeBytes = 0
    let sealed = false,
      accepted = 0,
      closing: Promise<void> | undefined
    for (const name of allowed)
      values.register(name, (args, callSignal) => {
        if (sealed) throw new HbarError('COMMAND_SOURCE_CLOSED', 'This tool no longer admits source capability calls')
        signal.throwIfAborted()
        callSignal.throwIfAborted()
        if (pending.size >= 16 || accepted >= 128) throw new HbarError('BUSY', 'Source command call capacity is full')
        const [target, method] = name.split('.')
        const fileCapability = target === 'execution' || target === 'workspaceQuery' || target === 'git'
        const interaction = target === 'browser' || target === 'computer'
        if (interaction && args[0] !== sourceSessionId)
          throw new HbarError('COMMAND_SOURCE_MISMATCH', 'Interaction capability belongs to the admitted Session')
        if (interaction && (osConfinement || (environment && Object.keys(environment).length)))
          throw new HbarError(
            'COMMAND_SOURCE_CONFINEMENT_UNAVAILABLE',
            'The interaction provider cannot enforce the admitted process environment or OS confinement',
          )
        if (name === 'execution.write' && (changes.size >= 16 || changeBytes >= MAX_RUN_CHANGE_BYTES))
          throw new HbarError('FILE_LIMIT', 'This source command has reached its file change capacity')
        if (fileCapability && args[0] !== undefined && args[0] !== workspace)
          throw new HbarError(
            'COMMAND_SOURCE_WORKSPACE_MISMATCH',
            'Command capability belongs to another execution workspace',
          )
        const object =
          target === 'execution'
            ? capabilities.execution
            : target === 'workspaceQuery'
              ? capabilities.execution.workspaceQuery
              : target === 'git'
                ? git
                : target === 'browser'
                  ? capabilities.browser
                  : target === 'computer'
                    ? capabilities.computer
                    : resolution
        const implementation: unknown = object && method ? Reflect.get(object, method) : undefined
        if (typeof implementation !== 'function')
          throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'The source capability is unavailable')
        if (target === 'git' && (osConfinement || (environment && Object.keys(environment).length)))
          throw new HbarError(
            'COMMAND_SOURCE_CONFINEMENT_UNAVAILABLE',
            'This Git backend cannot enforce the admitted process environment or OS confinement',
          )
        const actual = [...args]
        if (fileCapability) actual[0] = workspace
        const actualSignal = AbortSignal.any([signal, callSignal])
        const position = signalArgument[name]
        if (position !== undefined) actual[position] = actualSignal
        if (name === 'execution.exec') {
          const requested = z
            .object({ timeoutMs: z.number().int().min(1).max(1_200_000).optional() })
            .parse(actual[3] ?? {})
          actual[3] = {
            timeoutMs: Math.min(timeoutMs, requested.timeoutMs ?? timeoutMs),
            environment: environment ? structuredClone(environment) : undefined,
            osConfinement: osConfinement ? structuredClone(osConfinement) : undefined,
            nodeAuthority: structuredClone(authority),
          }
        }
        accepted++
        const operation = Promise.resolve().then(() =>
          captured(async () => {
            signal.throwIfAborted()
            callSignal.throwIfAborted()
            const result: unknown = await Reflect.apply(implementation, object, actual)
            if (name === 'execution.write') {
              const details = z
                .object({ path: z.string(), before: z.string(), after: z.string(), created: z.boolean().optional() })
                .safeParse(result)
              if (details.success && details.data.created !== undefined) {
                const change = toolFileChangeSchema.safeParse({
                  path: details.data.path.replaceAll('\\', '/'),
                  before: details.data.created ? null : details.data.before,
                  after: details.data.after,
                })
                if (change.success) {
                  const prior = changes.get(change.data.path)
                  const next = prior ? { ...change.data, before: prior.before } : change.data
                  const size = (value: ToolFileChange) =>
                    Buffer.byteLength(value.before ?? '', 'utf8') + Buffer.byteLength(value.after ?? '', 'utf8')
                  changeBytes += size(next) - (prior ? size(prior) : 0)
                  changes.set(next.path, next)
                }
              }
            }
            return result
          }),
        )
        pending.add(operation)
        return operation.finally(() => pending.delete(operation))
      })
    const opened: OpenCommandSource = {
      descriptor,
      fileChanges: () => [...changes.values()].map((change) => ({ ...change })),
      close: () => {
        sealed = true
        closing ??= Promise.allSettled([...pending]).then(() => {
          values.dispose()
          this.active.delete(opened)
        })
        return closing
      },
    }
    this.active.add(opened)
    return opened
  }

  assertCanClose(): void {
    if (this.active.size)
      throw new HbarError('COMMAND_SOURCES_ACTIVE', 'Source command calls must finish before Kernel disposal')
  }
}

/** Stable Host: the captured peer fixes the Kernel incarnation; every response waits for its actual handler reply. */
export function connectRuntimeCommandSource(
  peer: IpcPeer,
  raw: RuntimeCommandSource,
  source: ExecutionOwnership,
  callId: string,
  signal: AbortSignal,
  timeoutMs: number,
): { readonly application: HostSourceApplication; close(): Promise<void> } {
  signal.throwIfAborted()
  if (peer.snapshot().failed) throw new HbarError('IPC_DISCONNECTED', 'Source Kernel channel is closed')
  const descriptor = runtimeCommandSourceSchema.parse(raw)
  const execution = executionOwnershipSchema.parse(source)
  if (
    descriptor.sessionId !== execution.sessionId ||
    descriptor.runId !== execution.runId ||
    descriptor.callId !== callId ||
    peer.remote.unitId !== execution.owner.unitId ||
    peer.remote.generation !== execution.owner.generation ||
    peer.remote.incarnation !== execution.owner.incarnation
  )
    throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Source capability belongs to another Kernel or admitted tool call')
  z.number().int().min(1).max(1_200_000).parse(timeoutMs)
  const values = new RuntimeValuePort(peer, {
    prefix: descriptor.prefix,
    callbackTimeoutMs: 1_325_000,
    callbackSettlement: 'physical',
  })
  const pending = new Set<Promise<unknown>>()
  let sealed = false,
    closing: Promise<void> | undefined
  return {
    application: {
      owner: execution.owner,
      callId,
      signal,
      timeoutMs,
      port: {
        call: <Result>(method: string, args: readonly unknown[], options = {}) => {
          if (sealed) return Promise.reject(new HbarError('COMMAND_SOURCE_CLOSED', 'Source capability port is closed'))
          signal.throwIfAborted()
          if (pending.size >= 16)
            return Promise.reject(new HbarError('BUSY', 'Source capability tracking capacity is full'))
          const operation = values.callTracked<Result>(method, args, options).settled
          pending.add(operation)
          return operation.finally(() => pending.delete(operation))
        },
      },
    },
    close: () => {
      sealed = true
      closing ??= Promise.allSettled([...pending]).then(() => values.dispose())
      return closing
    },
  }
}
