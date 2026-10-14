import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import { RUNTIME_LIMITS, runtimeOwnerSchema } from '@hbar/contracts/runtime'
import { IpcPeer, procedure } from './ipc'
import {
  runtimeDrainSchema,
  runtimePrepareSchema,
  runtimeReadySchema,
  type RuntimeProcessModule,
  type RuntimeProcessService,
  RUNTIME_CONTROL_METHODS,
} from './lifecycle'

export async function runRuntimeProcess(options: { readonly exit?: (code: number) => never } = {}): Promise<void> {
  const exit = options.exit ?? ((code: number) => process.exit(code))
  const owner = runtimeOwnerSchema.parse(JSON.parse(process.env.HBAR_RUNTIME_SELF ?? 'null'))
  const remote = runtimeOwnerSchema.parse(JSON.parse(process.env.HBAR_RUNTIME_PARENT ?? 'null'))
  const modulePath = process.env.HBAR_RUNTIME_MODULE
  if (!modulePath || !process.send) throw new Error('Runtime process boot descriptor is missing')
  let service: RuntimeProcessService | undefined
  let phase: 'boot' | 'preparing' | 'ready' | 'serving' | 'draining' | 'disposed' = 'boot'
  let exiting = false
  const stop = (code: number) => {
    if (exiting) return
    exiting = true
    const deadline = setTimeout(() => exit(code), RUNTIME_LIMITS.shutdownMs)
    void Promise.resolve()
      .then(() => service?.dispose())
      .catch(() => {
        console.error('[hbar runtime] process resource release failed')
      })
      .finally(() => {
        clearTimeout(deadline)
        exit(code)
      })
  }
  const peer = new IpcPeer({
    owner,
    remote,
    controlMethods: z.array(z.string().min(1).max(128)).max(128).parse(JSON.parse(process.env.HBAR_RUNTIME_CONTROL_METHODS ?? JSON.stringify(RUNTIME_CONTROL_METHODS))),
    transport: {
      send(frame) {
        if (!process.send) throw new Error('Runtime parent has exited')
        process.send(frame)
      },
    },
    onFailure: () => stop(76),
    onTimeout: () => stop(76),
  })
  process.on('message', (message: unknown) => peer.receive(message))
  process.on('uncaughtException', () => stop(76))
  process.on('unhandledRejection', () => stop(76))
  process.on('disconnect', () => stop(0))
  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))
  peer.register(
    'runtime.prepare',
    procedure(runtimePrepareSchema, runtimeReadySchema, async (input) => {
      if (phase !== 'boot') throw new HbarError('RUNTIME_LIFECYCLE', 'Runtime process preparation already began')
      phase = 'preparing'
      const imported: unknown = await import(pathToFileURL(modulePath).href)
      if (
        typeof imported !== 'object' ||
        imported === null ||
        !('create' in imported) ||
        typeof imported.create !== 'function'
      )
        throw new HbarError('RUNTIME_MODULE_INVALID', 'Runtime module does not export its typed factory')
      // The trusted registered artifact is built against RuntimeProcessModule. Its wire values are still validated.
      const module = imported as RuntimeProcessModule
      service = await module.create({
        purpose: z.enum(['startup', 'candidate', 'recovery']).parse(process.env.HBAR_RUNTIME_PREPARATION ?? 'candidate'),
        peer,
        configuration: input.configuration,
        preparing: () => phase === 'preparing' || phase === 'ready',
      })
      const ready = await service.prepare(input)
      phase = 'ready'
      return ready
    }),
  )
  peer.register(
    'runtime.activate',
    procedure(z.strictObject({ role: z.enum(['default', 'draining']) }), z.undefined(), async (input) => {
      if (phase !== 'ready' || !service) throw new HbarError('RUNTIME_LIFECYCLE', 'Runtime process is not prepared')
      await service.activate(input.role)
      phase = input.role === 'draining' ? 'draining' : 'serving'
    }),
  )
  peer.register(
    'runtime.drain',
    procedure(z.undefined(), runtimeDrainSchema, async () => {
      if ((phase !== 'serving' && phase !== 'draining') || !service)
        throw new HbarError('RUNTIME_LIFECYCLE', 'Runtime process is not serving')
      phase = 'draining'
      return service.drain()
    }),
  )
  peer.register(
    'runtime.dispose',
    procedure(z.undefined(), z.undefined(), async () => {
      phase = 'disposed'
      if (service) {
        await service.dispose()
        service = undefined
      }
    }),
  )
  peer.register(
    'runtime.exit',
    procedure(z.undefined(), z.undefined(), () => {
      setTimeout(() => stop(0), 20)
    }),
  )
  const heartbeat = setInterval(
    () => {
      void peer.notify('runtime.heartbeat', { time: Date.now() }).catch(() => stop(76))
    },
    Number(process.env.HBAR_RUNTIME_HEARTBEAT_MS ?? RUNTIME_LIMITS.heartbeatMs),
  )
  heartbeat.unref()
}

if (import.meta.main) await runRuntimeProcess()
