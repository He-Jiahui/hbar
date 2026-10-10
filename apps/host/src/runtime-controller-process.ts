import { z } from 'zod'
import { HbarError, rpcRequestSchema, rpcSchemas } from '@hbar/contracts'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { procedure, runtimeDomainError, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { CONTROLLER_RUNTIME_FINGERPRINT, runtimeControllerDispatchSchema, runtimeControllerRequestSchema, isRuntimeControllerControl } from './runtime-controller-contract'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let requests = 0
  const dispatch = async (input: z.infer<typeof runtimeControllerDispatchSchema>, control: boolean): Promise<string> => {
    if (context.preparing()) throw new HbarError('RUNTIME_PREPARING', 'Controller preflight cannot invoke production requests')
    let id: string | number | null = null
    requests++
    try {
      const envelope = rpcRequestSchema.parse(JSON.parse(input.payload))
      id = envelope.id
      if (!Object.hasOwn(rpcSchemas, envelope.method)) throw new HbarError('METHOD_NOT_FOUND', 'RPC method is not registered')
      const request = runtimeControllerRequestSchema.parse(envelope)
      if (control && !isRuntimeControllerControl(request)) throw new HbarError('INVALID_INPUT', 'Reserved capacity only accepts control requests')
      const result = await context.peer.call('controller.invoke', { invocationId: input.invocationId, request }, z.unknown(), { timeoutMs: 120_000 })
      return JSON.stringify({ jsonrpc: '2.0', id, result })
    } catch (error) {
      const domain = runtimeDomainError(error)
      return JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000,
        data: domain?.code ?? 'INVALID_REQUEST',
        message: domain?.message ?? 'Request does not satisfy the RPC contract',
      } })
    } finally { requests-- }
  }
  context.peer.register('controller.handle', procedure(runtimeControllerDispatchSchema, z.string().max(33_554_432), input => dispatch(input, false)))
  context.peer.register('controller.control', procedure(runtimeControllerDispatchSchema, z.string().max(33_554_432), input => dispatch(input, true)))
  return {
    async prepare() { return { contractFingerprint: CONTROLLER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION, capabilities: ['controller.handle', 'controller.control'] } },
    async activate() {},
    async drain() { return { requests, runs: 0, resources: 0 } },
    async dispose() {},
  }
}
