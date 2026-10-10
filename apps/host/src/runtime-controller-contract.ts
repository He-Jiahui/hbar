import { createHash } from 'node:crypto'
import { z } from 'zod'
import { rpcRequestSchema, rpcSchemas, type RpcMethod } from '@hbar/contracts'

export const runtimeControllerRequestSchema = rpcRequestSchema.extend({
  method: z.custom<RpcMethod>(value => typeof value === 'string' && Object.hasOwn(rpcSchemas, value)),
}).superRefine((request, context) => {
  const parsed = rpcSchemas[request.method].safeParse(request.params)
  if (!parsed.success) context.addIssue({ code: 'custom', message: 'RPC parameters do not satisfy the method contract' })
})
export type RuntimeControllerRequest = z.infer<typeof runtimeControllerRequestSchema>
export const runtimeControllerDispatchSchema = z.strictObject({
  invocationId: z.string().min(1).max(160), payload: z.string().max(1_048_576),
})
export const runtimeControllerInvokeSchema = z.strictObject({
  invocationId: z.string().min(1).max(160), request: runtimeControllerRequestSchema,
})
const controlRpc = new Set(['approval.resolve', 'run.cancel', 'schema.content.cancel'])
const controlCommands = new Set(['run.cancel', 'operation.cancel', 'approval.resolve', 'interaction.respond'])
export function isRuntimeControllerControl(request: RuntimeControllerRequest): boolean {
  return controlRpc.has(request.method) || (request.method === 'command.execute' &&
    controlCommands.has(z.object({ commandId: z.string() }).parse(request.params).commandId))
}
export const CONTROLLER_RUNTIME_FINGERPRINT = createHash('sha256').update(JSON.stringify([
  'hbar.controller.v1', z.toJSONSchema(runtimeControllerDispatchSchema),
  Object.entries(rpcSchemas).map(([method, schema]) => [method, z.toJSONSchema(schema, { io: 'input' })]),
])).digest('hex')
export interface RuntimeControllerPort {
  dispatch(payload: string, invoke: (request: RuntimeControllerRequest, signal: AbortSignal) => Promise<unknown>): Promise<string>
}
