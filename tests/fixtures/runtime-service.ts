import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { appendFile, readFile, writeFile } from 'node:fs/promises'

const settingsSchema = z.object({
  marker: z.string().optional(),
  prepareFail: z.boolean().optional(),
  incompatible: z.boolean().optional(),
  freeze: z.boolean().optional(),
  hangDispose: z.boolean().optional(),
  crashActivations: z.number().int().nonnegative().optional(),
})

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const settings = settingsSchema.parse(context.configuration)
  let active = false
  context.peer.register(
    'fixture.echo',
    procedure(z.string(), z.string(), (input) => {
      if (!active) throw new HbarError('RUNTIME_PREPARING', 'Fixture is not active')
      return input
    }),
  )
  context.peer.register(
    'fixture.crash',
    procedure(z.undefined(), z.undefined(), () => process.exit(23)),
  )
  context.peer.register(
    'fixture.freeze',
    procedure(z.undefined(), z.undefined(), () => {
      while (true) {
        Bun.sleepSync(100)
      }
    }),
  )
  return {
    async prepare(input) {
      if (settings.prepareFail) throw new HbarError('FIXTURE_PREPARE_FAILED', 'Injected candidate preparation failure')
      return {
        contractFingerprint: settings.incompatible ? 'b'.repeat(64) : input.descriptor.contractFingerprint,
        storageSchema: input.descriptor.storageSchema,
        capabilities: ['fixture.echo'],
      }
    },
    async activate(role) {
      active = true
      if (settings.marker) {
        await appendFile(`${settings.marker}.jsonl`, `${JSON.stringify({ pid: process.pid, active: true, role })}\n`)
        let activations = 0
        try {
          activations = z.number().parse(JSON.parse(await readFile(settings.marker, 'utf8')))
        } catch {
          /* First activation. */
        }
        await writeFile(settings.marker, JSON.stringify(activations + 1))
        if (settings.crashActivations && activations < settings.crashActivations) setTimeout(() => process.exit(23), 30)
      }
      if (settings.freeze)
        setTimeout(() => {
          while (true) {
            Bun.sleepSync(100)
          }
        }, 20)
    },
    async drain() {
      return { requests: 0, runs: 0, resources: 0 }
    },
    async dispose() {
      if (settings.hangDispose) await new Promise<void>(() => {})
      active = false
    },
  }
}
