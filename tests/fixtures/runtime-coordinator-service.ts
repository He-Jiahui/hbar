import { z } from 'zod'
import { executionOwnershipSchema, runtimeResourceLeaseSchema, runtimeToolPermitSchema } from '@hbar/contracts/runtime'
import { RuntimeCoordinatorClient, procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const client = new RuntimeCoordinatorClient(context.peer)
  context.peer.register('fixture.claim', procedure(z.strictObject({ sessionId: z.string(), runId: z.string() }), executionOwnershipSchema.nullable(), input => client.claim(input.sessionId, input.runId)))
  context.peer.register('fixture.canIdle', procedure(z.string(), z.boolean(), input => client.canIdle(input)))
  context.peer.register('fixture.assert', procedure(executionOwnershipSchema, z.undefined(), input => client.assert(input)))
  context.peer.register('fixture.release', procedure(executionOwnershipSchema, z.undefined(), input => client.release(input)))
  context.peer.register('fixture.reserve', procedure(z.strictObject({ execution: executionOwnershipSchema, callId: z.string() }), runtimeToolPermitSchema, input => client.reserveTool(input.execution, input.callId)))
  context.peer.register('fixture.toolRelease', procedure(z.string(), z.undefined(), input => client.releaseTool(input)))
  context.peer.register('fixture.resource', procedure(z.string(), runtimeResourceLeaseSchema.nullable(), input => client.acquireResource(input)))
  context.peer.register('fixture.resourceRelease', procedure(z.string(), z.undefined(), input => client.releaseResource(input)))
  context.peer.register('fixture.lock', procedure(z.strictObject({ key: z.string(), timeoutMs: z.number().int().positive(), holdMs: z.number().int().nonnegative() }), z.number(), (input, call) =>
    client.withResource(input.key, async () => { const acquired = Date.now(); await Bun.sleep(input.holdMs); return acquired }, { signal: call.signal, timeoutMs: input.timeoutMs })))
  return {
    async prepare(input) { return { contractFingerprint: input.descriptor.contractFingerprint, storageSchema: input.descriptor.storageSchema, capabilities: ['fixture.claim'] } },
    async activate() {}, async drain() { return { runs: 0, resources: 0, requests: 0 } }, async dispose() {},
  }
}
