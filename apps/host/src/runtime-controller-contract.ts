import { createHash } from 'node:crypto'
import { z } from 'zod'
import { rpcRequestSchema, rpcSchemas, type RpcMethod, type HostInfo } from '@hbar/contracts'
import { hostInfoSchema } from '@hbar/contracts/commands/system'
import { liveStreamSchema } from '@hbar/contracts/runtime-notifications'
import {
  commandMetadataSchema,
  commandExecutionExpectationSchema,
  invocationSchema,
  type CommandDescriptor,
} from '@hbar/commands'
import { runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import type { ControllerServerApplication } from './runtime-controller-services'
import { RUNTIME_COMMAND_JOB_SCHEMAS } from './runtime-command-job-contract'

export const runtimeControllerRequestSchema = rpcRequestSchema
  .extend({
    method: z.custom<RpcMethod>((value) => typeof value === 'string' && Object.hasOwn(rpcSchemas, value)),
  })
  .superRefine((request, context) => {
    const parsed = rpcSchemas[request.method].safeParse(request.params)
    if (!parsed.success)
      context.addIssue({ code: 'custom', message: 'RPC parameters do not satisfy the method contract' })
  })
export type RuntimeControllerRequest = z.infer<typeof runtimeControllerRequestSchema>
export const runtimeControllerDispatchSchema = z.strictObject({
  invocationId: z.string().min(1).max(160),
  payload: z.string().max(1_048_576),
})
export const runtimeControllerInvokeSchema = z.strictObject({
  invocationId: z.string().min(1).max(160),
  request: runtimeControllerRequestSchema,
})
export const runtimeControllerConfigurationSchema = z.strictObject({
  instanceId: z.string().min(1).max(160),
  demo: z.boolean(),
  noLocalExec: z.boolean().default(false),
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000),
  settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000),
  skillsRoot: z.string().min(1).max(4_000),
  identityRoot: z.string().min(1).max(4_000),
})
export const runtimeControllerScopeSchema = z.strictObject({
  invocationId: z.string().min(1).max(160),
  actorId: z.string().min(1).max(160),
  host: hostInfoSchema,
  kernel: runtimeKernelStateSchema,
  streams: z.array(liveStreamSchema).max(4_096),
})
export const runtimeControllerDescriptorSchema = z.custom<CommandDescriptor>(
  (value) =>
    z
      .strictObject({
        metadata: commandMetadataSchema,
        inputSchema: z.record(z.string(), z.unknown()),
        outputSchema: z.record(z.string(), z.unknown()),
      })
      .safeParse(value).success,
)
export const runtimeControllerCatalogSchema = z
  .array(
    z.strictObject({
      service: z.string().min(1).max(128),
      revision: z.number().int().nonnegative(),
      items: z.array(runtimeControllerDescriptorSchema).max(500),
    }),
  )
  .max(64)
export type RuntimeControllerScope = z.output<typeof runtimeControllerScopeSchema>
export const runtimeControllerCommandStartSchema = z.strictObject({
  scope: runtimeControllerScopeSchema,
  invocation: invocationSchema,
  expectation: commandExecutionExpectationSchema,
})
export type RuntimeControllerAuthorize = (
  request: RuntimeControllerRequest,
  signal: AbortSignal,
) => Promise<{ actorId: string; host: HostInfo }>
const controlRpc = new Set(['approval.resolve', 'run.cancel', 'schema.content.cancel'])
const controlCommands = new Set(['run.cancel', 'operation.cancel', 'approval.resolve', 'interaction.respond'])
export function isRuntimeControllerControl(request: RuntimeControllerRequest): boolean {
  return (
    controlRpc.has(request.method) ||
    (request.method === 'command.execute' &&
      controlCommands.has(z.object({ commandId: z.string() }).parse(request.params).commandId))
  )
}
export const CONTROLLER_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      'hbar.controller.v4.tracked-command-jobs',
      z.toJSONSchema(runtimeControllerCommandStartSchema, { unrepresentable: 'any' }),
      RUNTIME_COMMAND_JOB_SCHEMAS.map((schema) => z.toJSONSchema(schema)),
      z.toJSONSchema(commandExecutionExpectationSchema, { unrepresentable: 'any' }),
      z.toJSONSchema(runtimeControllerDispatchSchema),
      z.toJSONSchema(runtimeControllerConfigurationSchema),
      z.toJSONSchema(runtimeControllerScopeSchema),
      Object.entries(rpcSchemas).map(([method, schema]) => [method, z.toJSONSchema(schema, { io: 'input' })]),
    ]),
  )
  .digest('hex')
export interface RuntimeControllerPort {
  dispatch(
    payload: string,
    invoke: (request: RuntimeControllerRequest, signal: AbortSignal) => Promise<unknown>,
    authorize?: RuntimeControllerAuthorize,
  ): Promise<string>
  /** Stable native adapters invoke named services; executable command factories stay in the Controller owner. */
  readonly application?: ControllerServerApplication
}
