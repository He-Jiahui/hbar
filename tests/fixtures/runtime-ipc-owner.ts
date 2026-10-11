import { IpcPeer, procedure } from '@hbar/runtime'
import { runtimeOwnerSchema } from '@hbar/contracts/runtime'
import { z } from 'zod'

const owner = runtimeOwnerSchema.parse(JSON.parse(process.env.HBAR_RUNTIME_SELF ?? 'null'))
const remote = runtimeOwnerSchema.parse(JSON.parse(process.env.HBAR_RUNTIME_PARENT ?? 'null'))
const peer = new IpcPeer({
  owner,
  remote,
  transport: {
    send(frame) {
      if (!process.send) throw new Error('Missing owner port')
      process.send(frame)
    },
  },
})
peer.register(
  'echo',
  procedure(z.string(), z.string(), (input) => input),
)
peer.register(
  'crash',
  procedure(z.undefined(), z.undefined(), () => process.exit(23)),
)
process.on('message', (message: unknown) => peer.receive(message))
process.on('disconnect', () => process.exit(0))
